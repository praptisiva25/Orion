from __future__ import annotations

import asyncio

import httpx
import pytest

from app.api.routes.tickets import get_provider
from app.core.config import get_settings
from app.main import app


class FakeProvider:
    def __init__(self, result: str) -> None:
        self.result = result
        self.prompts: list[str] = []

    async def generate(self, *, system_prompt: str, user_prompt: str) -> str:
        self.prompts.extend([system_prompt, user_prompt])
        return self.result

    async def close(self) -> None:
        return None


class ASGITestClient:
    """Small sync adapter around ASGITransport, avoiding framework TestClient logging."""

    def post(self, path: str, *, headers: dict[str, str] | None = None, json: dict | None = None) -> httpx.Response:
        async def send() -> httpx.Response:
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app), base_url="http://testserver"
                ) as client:
                    return await client.post(path, headers=headers, json=json)

        return asyncio.run(send())

    def get(self, path: str) -> httpx.Response:
        async def send() -> httpx.Response:
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app), base_url="http://testserver"
                ) as client:
                    return await client.get(path)

        return asyncio.run(send())


@pytest.fixture
def configured_client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-internal-key-0123456789-abcdef")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key-that-is-distinct")
    monkeypatch.setenv("GROQ_MODEL", "test-model")
    get_settings.cache_clear()
    yield ASGITestClient()
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-internal-key-0123456789-abcdef"}


def ticket_payload() -> dict:
    return {
        "subject": "Card payment query",
        "description": "The customer reports that a card payment is not visible in recent activity and asks for help checking the transaction.",
        "messages": [
            {"sender_role": "customer", "message": "I checked again today and still cannot identify the payment."},
            {"sender_role": "officer", "message": "Could you share its date and approximate amount?"},
        ],
    }


def test_summary_endpoint_returns_at_least_twenty_words(configured_client: ASGITestClient) -> None:
    summary = "The customer cannot identify a card payment in recent activity and contacted support for help. The Officer requested its approximate date and amount so the inquiry can be understood more clearly."
    fake = FakeProvider(summary)
    app.dependency_overrides[get_provider] = lambda: fake

    response = configured_client.post("/v1/tickets/summary", headers=auth_headers(), json=ticket_payload())

    assert response.status_code == 200
    assert response.json() == {"result": summary}
    assert len(summary.split()) >= 20
    assert "Do not infer causes" in fake.prompts[0]


def test_short_summary_is_retried_and_rejected(configured_client: ASGITestClient) -> None:
    fake = FakeProvider("Too short.")
    app.dependency_overrides[get_provider] = lambda: fake

    response = configured_client.post("/v1/tickets/summary", headers=auth_headers(), json=ticket_payload())

    assert response.status_code == 502
    assert len(fake.prompts) == 4
    assert "minimum length" in response.json()["detail"]


def test_suggested_response_endpoint_returns_editable_draft(configured_client: ASGITestClient) -> None:
    draft = "Thank you for explaining the issue. Could you share the transaction date and approximate amount so the support team can review your query?"
    fake = FakeProvider(draft)
    app.dependency_overrides[get_provider] = lambda: fake

    response = configured_client.post("/v1/tickets/suggested-response", headers=auth_headers(), json=ticket_payload())

    assert response.status_code == 200
    assert response.json() == {"result": draft}
    assert "Never invent" in fake.prompts[0]
    assert "will not be sent automatically" in fake.prompts[0]


def test_both_routes_require_internal_key(configured_client: ASGITestClient) -> None:
    for route in ("/v1/tickets/summary", "/v1/tickets/suggested-response"):
        response = configured_client.post(route, json=ticket_payload())
        assert response.status_code == 401


def test_validation_rejects_unsupported_roles_and_never_echoes_input(configured_client: ASGITestClient) -> None:
    payload = ticket_payload()
    payload["messages"][0]["sender_role"] = "attacker"
    payload["messages"][0]["message"] = "secret ticket text that must not be echoed"

    response = configured_client.post("/v1/tickets/summary", headers=auth_headers(), json=payload)

    assert response.status_code == 422
    assert "secret ticket text" not in response.text
    assert response.json() == {"detail": "Invalid ticket AI request."}


def test_validation_rejects_oversized_conversation(configured_client: ASGITestClient) -> None:
    payload = ticket_payload()
    payload["messages"] = [
        {"sender_role": "customer", "message": "x"} for _ in range(101)
    ]

    response = configured_client.post("/v1/tickets/suggested-response", headers=auth_headers(), json=payload)

    assert response.status_code == 422


def test_sensitive_identifiers_are_redacted_before_provider_call(configured_client: ASGITestClient) -> None:
    fake = FakeProvider("Please contact the support team for help.")
    app.dependency_overrides[get_provider] = lambda: fake
    payload = ticket_payload()
    payload["description"] = "PAN ABCDE1234F, Aadhaar 1234 5678 9012, email bank.user@example.com, account 1234567890123456"

    response = configured_client.post("/v1/tickets/suggested-response", headers=auth_headers(), json=payload)

    assert response.status_code == 200
    sent_content = " ".join(fake.prompts)
    for sensitive_value in ("ABCDE1234F", "1234 5678 9012", "bank.user@example.com", "1234567890123456"):
        assert sensitive_value not in sent_content


def test_unknown_paths_are_also_protected(configured_client: ASGITestClient) -> None:
    response = configured_client.get("/not-a-route")
    assert response.status_code == 401


def test_provider_response_limit_is_enforced(configured_client: ASGITestClient) -> None:
    app.dependency_overrides[get_provider] = lambda: FakeProvider("x" * 3001)

    response = configured_client.post("/v1/tickets/suggested-response", headers=auth_headers(), json=ticket_payload())

    assert response.status_code == 502
    assert "exceeds the message limit" in response.json()["detail"]


def test_provider_and_internal_credentials_must_be_distinct(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "same-test-key-0123456789-abcdef-0123456789")
    monkeypatch.setenv("GROQ_API_KEY", "same-test-key-0123456789-abcdef-0123456789")
    monkeypatch.setenv("GROQ_MODEL", "test-model")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="must be different"):
        get_settings()
    get_settings.cache_clear()


def test_ticket_and_generated_content_are_not_logged(
    configured_client: ASGITestClient, caplog: pytest.LogCaptureFixture
) -> None:
    marker_input = "private-ticket-content-marker"
    marker_output = "private-generated-response-marker"
    app.dependency_overrides[get_provider] = lambda: FakeProvider(marker_output)
    payload = ticket_payload()
    payload["description"] = marker_input

    response = configured_client.post(
        "/v1/tickets/suggested-response", headers=auth_headers(), json=payload
    )

    assert response.status_code == 200
    assert marker_input not in caplog.text
    assert marker_output not in caplog.text
