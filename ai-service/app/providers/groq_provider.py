from __future__ import annotations

import httpx

from app.core.config import Settings
from app.providers.base import ProviderError


class GroqProvider:
    """Groq's OpenAI-compatible chat completions adapter."""

    endpoint = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(timeout=settings.groq_timeout_seconds)

    async def generate(self, *, system_prompt: str, user_prompt: str) -> str:
        payload = {
            "model": self._settings.groq_model,
            "temperature": 0.2,
            "max_tokens": 800,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        try:
            response = await self._client.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self._settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ProviderError("AI provider returned an empty result.")
            return content.strip()
        except ProviderError:
            raise
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            # Do not log or propagate the provider exception; it can contain request details.
            raise ProviderError("AI provider request failed.") from None

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            # Provider cleanup must not emit a traceback that could expose request context.
            return
