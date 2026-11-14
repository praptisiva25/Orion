from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.core.config import Settings
from app.providers.base import ProviderError
from app.providers.groq_provider import GroqProvider


def test_groq_provider_uses_configured_model_and_chat_completions_api() -> None:
    captured: dict[str, object] = {}
    settings = Settings(
        internal_service_key="internal-key-is-separate-and-long-enough",
        groq_api_key="private-groq-key",
        groq_model="configured-model",
        groq_timeout_seconds=10,
        max_concurrent_generations=2,
    )

    async def handle(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("Authorization")
        captured["body"] = request.read().decode()
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Generated draft."}}]},
            request=request,
        )

    async def run() -> str:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handle))
        provider = GroqProvider(settings, client=client)
        try:
            return await provider.generate(system_prompt="system", user_prompt="private prompt")
        finally:
            await provider.close()

    result = asyncio.run(run())

    assert result == "Generated draft."
    assert captured["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert captured["authorization"] == "Bearer private-groq-key"
    assert json.loads(str(captured["body"]))["model"] == "configured-model"
    assert json.loads(str(captured["body"]))["max_tokens"] == 800


def test_gpt_oss_nba_request_caps_reasoning_and_reserves_completion_budget() -> None:
    settings = Settings(
        internal_service_key="internal-key-is-separate-and-long-enough",
        groq_api_key="private-groq-key",
        groq_model="openai/gpt-oss-20b",
        groq_timeout_seconds=10,
        max_concurrent_generations=2,
    )
    captured: dict[str, object] = {}

    async def handle(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.read().decode()
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]}, request=request)

    async def run() -> None:
        provider = GroqProvider(settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        try:
            await provider.generate(
                system_prompt="system",
                user_prompt="synthetic user",
                max_tokens=2400,
                reasoning_effort="low",
                json_mode=True,
            )
        finally:
            await provider.close()

    asyncio.run(run())
    payload = json.loads(str(captured["body"]))
    assert payload["max_completion_tokens"] == 2400
    assert payload["reasoning_effort"] == "low"
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["reasoning_format"] == "hidden"
    assert "max_tokens" not in payload


def test_non_gpt_oss_json_mode_does_not_send_reasoning_format() -> None:
    settings = Settings(
        internal_service_key="internal-key-is-separate-and-long-enough",
        groq_api_key="private-groq-key",
        groq_model="configured-non-reasoning-model",
        groq_timeout_seconds=10,
        max_concurrent_generations=2,
    )
    captured: dict[str, object] = {}

    async def handle(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.read().decode()
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]}, request=request)

    async def run() -> None:
        provider = GroqProvider(settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        try:
            await provider.generate(
                system_prompt="system",
                user_prompt="synthetic user",
                max_tokens=2400,
                reasoning_effort="low",
                json_mode=True,
            )
        finally:
            await provider.close()

    asyncio.run(run())
    payload = json.loads(str(captured["body"]))
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["max_tokens"] == 2400
    assert "reasoning_format" not in payload
    assert "reasoning_effort" not in payload


def test_gpt_oss_non_nba_call_keeps_existing_default_token_parameter() -> None:
    settings = Settings(
        internal_service_key="internal-key-is-separate-and-long-enough",
        groq_api_key="private-groq-key",
        groq_model="openai/gpt-oss-20b",
        groq_timeout_seconds=10,
        max_concurrent_generations=2,
    )
    captured: dict[str, object] = {}

    async def handle(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.read().decode()
        return httpx.Response(200, json={"choices": [{"message": {"content": "Generated draft."}}]}, request=request)

    async def run() -> None:
        provider = GroqProvider(settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        try:
            await provider.generate(system_prompt="system", user_prompt="synthetic summary context")
        finally:
            await provider.close()

    asyncio.run(run())
    payload = json.loads(str(captured["body"]))
    assert payload["max_tokens"] == 800
    assert "max_completion_tokens" not in payload
    assert "reasoning_effort" not in payload
    assert "response_format" not in payload
    assert "reasoning_format" not in payload


def test_groq_provider_keeps_other_models_on_legacy_default_when_reasoning_option_is_passed() -> None:
    settings = Settings(
        internal_service_key="internal-key-is-separate-and-long-enough",
        groq_api_key="private-groq-key",
        groq_model="configured-non-reasoning-model",
        groq_timeout_seconds=10,
        max_concurrent_generations=2,
    )
    captured: dict[str, object] = {}

    async def handle(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.read().decode()
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]}, request=request)

    async def run() -> None:
        provider = GroqProvider(settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        try:
            await provider.generate(system_prompt="system", user_prompt="synthetic", max_tokens=2400, reasoning_effort="low")
        finally:
            await provider.close()

    asyncio.run(run())
    payload = json.loads(str(captured["body"]))
    assert payload["max_tokens"] == 2400
    assert "reasoning_effort" not in payload
    assert "max_completion_tokens" not in payload


def test_groq_provider_hides_upstream_error_details_and_logs_only_status(
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = Settings(
        internal_service_key="internal-key-is-separate-and-long-enough",
        groq_api_key="private-groq-key",
        groq_model="configured-model",
        groq_timeout_seconds=10,
        max_concurrent_generations=2,
    )

    async def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": "private-groq-key rejected private prompt"},
            request=request,
        )

    async def run() -> str:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handle))
        provider = GroqProvider(settings, client=client)
        try:
            return await provider.generate(system_prompt="system", user_prompt="private prompt")
        finally:
            await provider.close()

    with pytest.raises(ProviderError) as error:
        asyncio.run(run())
    assert "private-groq-key" not in str(error.value)
    assert "private prompt" not in str(error.value)
    assert error.value.stage == "groq_upstream_http"
    assert error.value.upstream_status_code == 401
    assert "status_code=401" in caplog.text
    assert "private-groq-key" not in caplog.text
    assert "private prompt" not in caplog.text
    assert "rejected private prompt" not in caplog.text
