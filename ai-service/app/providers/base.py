from __future__ import annotations

from typing import Protocol


class ProviderError(Exception):
    """Safe, content-free provider failure."""

    def __init__(
        self,
        message: str,
        *,
        stage: str = "provider",
        upstream_status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.stage = stage
        self.upstream_status_code = upstream_status_code


class LLMProvider(Protocol):
    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        reasoning_effort: str | None = None,
        json_mode: bool = False,
    ) -> str:
        """Generate text without logging prompts, completions, or credentials."""

    async def close(self) -> None:
        """Release provider resources."""
