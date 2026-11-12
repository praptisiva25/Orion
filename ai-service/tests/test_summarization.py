from __future__ import annotations

import asyncio

import pytest

from app.providers.base import ProviderError
from app.schemas.tickets import ConversationMessage, TicketContext
from app.services.summarization import TicketSummarizationService


class FakeProvider:
    def __init__(self, results: list[str]) -> None:
        self.results = results
        self.prompts: list[tuple[str, str]] = []

    async def generate(self, *, system_prompt: str, user_prompt: str) -> str:
        self.prompts.append((system_prompt, user_prompt))
        return self.results.pop(0)

    async def close(self) -> None:
        return None


def ticket() -> TicketContext:
    return TicketContext(
        subject="Card payment query",
        description="A card payment is not visible in recent activity and the customer requests help.",
        messages=[
            ConversationMessage(sender_role="customer", message="I checked again today."),
            ConversationMessage(sender_role="officer", message="Please share the transaction date."),
        ],
    )


def test_summary_uses_subject_description_and_chronological_conversation() -> None:
    result = (
        "The customer reports a card payment is missing from recent activity and requests help. "
        "They checked again today, and the Officer asked them to provide the transaction date."
    )
    provider = FakeProvider([result])

    generated = asyncio.run(TicketSummarizationService(provider).summarize(ticket()))

    assert generated == result
    assert len(generated.split()) >= 20
    prompt = provider.prompts[0][1]
    assert "Card payment query" in prompt
    assert "not visible in recent activity" in prompt
    assert "I checked again today" in prompt
    assert "Please share the transaction date" in prompt
    assert "Do not infer causes" in provider.prompts[0][0]


def test_summary_retries_short_output_and_redacts_identifiers() -> None:
    grounded_summary = (
        "The customer reports a card payment is missing from recent activity and requests assistance. "
        "The conversation records that they checked again today and were asked to provide its transaction date."
    )
    provider = FakeProvider(["Too short.", grounded_summary + " Reference 1234567890123456."])

    generated = asyncio.run(TicketSummarizationService(provider).summarize(ticket()))

    assert len(provider.prompts) == 2
    assert "1234567890123456" not in generated
    assert "[REDACTED" in generated
    assert len(generated.split()) >= 20


def test_summary_fails_safely_when_provider_cannot_meet_minimum() -> None:
    provider = FakeProvider(["Too short.", "Still too short."])

    with pytest.raises(ProviderError, match="minimum length"):
        asyncio.run(TicketSummarizationService(provider).summarize(ticket()))

    assert len(provider.prompts) == 2
