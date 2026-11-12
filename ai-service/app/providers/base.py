from __future__ import annotations

from typing import Protocol


class ProviderError(Exception):
    """Safe, content-free provider failure."""


class LLMProvider(Protocol):
    async def generate(self, *, system_prompt: str, user_prompt: str) -> str:
        """Generate text without logging prompts, completions, or credentials."""

    async def close(self) -> None:
        """Release provider resources."""
