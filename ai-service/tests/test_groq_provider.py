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


def test_groq_provider_hides_upstream_error_details() -> None:
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
