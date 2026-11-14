
from __future__ import annotations

import logging

import httpx

from app.core.config import Settings
from app.providers.base import ProviderError

logger = logging.getLogger(__name__)


class GroqProvider:
    """Groq's OpenAI-compatible chat completions adapter."""

    endpoint = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(
            timeout=settings.groq_timeout_seconds
        )

    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        reasoning_effort: str | None = None,
        json_mode: bool = False,
    ) -> str:
        model = self._settings.groq_model.lower()
        is_gpt_oss = model in {
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
        }

        payload = {
            "model": self._settings.groq_model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

            if is_gpt_oss:
                payload["reasoning_format"] = "hidden"

        if max_tokens is not None and not 1 <= max_tokens <= 65_536:
            raise ValueError("max_tokens is outside the supported range.")

        if is_gpt_oss and (
            max_tokens is not None or reasoning_effort is not None
        ):
            payload["max_completion_tokens"] = max_tokens or 800

            if reasoning_effort is not None:
                if reasoning_effort not in {"low", "medium", "high"}:
                    raise ValueError(
                        "reasoning_effort is invalid for GPT-OSS."
                    )

                payload["reasoning_effort"] = reasoning_effort
        else:
            payload["max_tokens"] = max_tokens or 800

        try:
            response = await self._client.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self._settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if not response.is_success:
                logger.warning(
                    "Groq request failed; stage=upstream_http status_code=%d",
                    response.status_code,
                )
                raise ProviderError(
                    "AI provider request failed.",
                    stage="groq_upstream_http",
                    upstream_status_code=response.status_code,
                )

            try:
                response_payload = response.json()
                choice = response_payload["choices"][0]
                message = choice["message"]
                content = message["content"]

            except (ValueError, KeyError, IndexError, TypeError):
                logger.warning(
                    "Groq response could not be parsed; "
                    "stage=upstream_response status_code=%d",
                    response.status_code,
                )
                raise ProviderError(
                    "AI provider returned an invalid response.",
                    stage="groq_upstream_response",
                    upstream_status_code=response.status_code,
                ) from None

            if not isinstance(content, str) or not content.strip():
                finish_reason = choice.get("finish_reason")

                safe_finish_reason = (
                    finish_reason
                    if finish_reason
                    in {"stop", "length", "tool_calls", "content_filter"}
                    else "other"
                )

                tool_calls = message.get("tool_calls")

                logger.warning(
                    "Groq response had no text; "
                    "stage=upstream_response status_code=%d "
                    "content_type=%s finish_reason=%s "
                    "tool_call_count=%d refusal_present=%s",
                    response.status_code,
                    type(content).__name__,
                    safe_finish_reason,
                    len(tool_calls) if isinstance(tool_calls, list) else 0,
                    bool(message.get("refusal")),
                )

                raise ProviderError(
                    "AI provider returned an empty result.",
                    stage="groq_upstream_response",
                    upstream_status_code=response.status_code,
                )

            return content.strip()

        except ProviderError:
            raise

        except httpx.TimeoutException as exc:
            logger.warning(
                "Groq request failed; stage=transport error_type=%s",
                type(exc).__name__,
            )
            raise ProviderError(
                "AI provider request timed out.",
                stage="groq_transport_timeout",
            ) from None

        except httpx.HTTPError as exc:
            logger.warning(
                "Groq request failed; stage=transport error_type=%s",
                type(exc).__name__,
            )
            raise ProviderError(
                "AI provider request failed.",
                stage="groq_transport",
            ) from None

        except (ValueError, KeyError, IndexError, TypeError):
            logger.warning(
                "Groq response could not be processed; "
                "stage=upstream_response"
            )
            raise ProviderError(
                "AI provider returned an invalid response.",
                stage="groq_upstream_response",
            ) from None

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            # Provider cleanup must not emit a traceback that could expose request context.
            return
