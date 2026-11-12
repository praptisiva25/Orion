from __future__ import annotations

import asyncio

from app.schemas.tickets import TicketContext
from app.services.response_generation import SuggestedResponseService


class FakeProvider:
    def __init__(self, result: str) -> None:
        self.result = result
        self.system_prompt = ""
        self.user_prompt = ""

    async def generate(self, *, system_prompt: str, user_prompt: str) -> str:
        self.system_prompt = system_prompt
        self.user_prompt = user_prompt
        return self.result

    async def close(self) -> None:
        return None


def ticket() -> TicketContext:
    return TicketContext(
        subject="Card payment query",
        description="A card payment is not visible in recent activity.",
        messages=[],
    )


def test_suggestion_is_clean_plain_text_and_keeps_message_content() -> None:
    provider = FakeProvider(
        "## Suggested Response\n\n**Thank you for explaining the issue.**\n\n---\n"
        "Could you share the transaction date? [Customer Name] [Bank Name] [Your Name]"
    )

    result = asyncio.run(SuggestedResponseService(provider).generate(ticket()))

    assert result == "Thank you for explaining the issue.\n\nCould you share the transaction date?"
    assert not any(marker in result for marker in ("**", "__", "##", "---"))
    assert not any(placeholder in result for placeholder in ("[Customer Name]", "[Bank Name]", "[Your Name]"))
    assert "Suggested Response" in provider.system_prompt
    assert "plain text" in provider.system_prompt


def test_suggestion_preserves_pii_redaction_and_safety_instructions() -> None:
    provider = FakeProvider(
        "Please confirm the card number 1234 5678 9012 3456. "
        "We have not taken any action yet."
    )

    result = asyncio.run(SuggestedResponseService(provider).generate(ticket()))

    assert "1234 5678 9012 3456" not in result
    assert "[REDACTED" in result
    assert "Never invent" in provider.system_prompt
    assert "Do not claim that anything has been done" in provider.system_prompt
    assert "Do not request passwords, PINs, OTPs, CVVs" in provider.system_prompt
    assert "will not be sent automatically" in provider.system_prompt
