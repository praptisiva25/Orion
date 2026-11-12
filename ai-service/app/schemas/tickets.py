from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sender_role: str = Field(min_length=1, max_length=20)
    message: str = Field(min_length=1, max_length=3000)

    @field_validator("sender_role")
    @classmethod
    def validate_sender_role(cls, value: str) -> str:
        normalized = value.strip()
        if normalized.lower() not in {"customer", "officer", "admin"}:
            raise ValueError("Sender role is not supported.")
        return normalized

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Message must not be blank.")
        return value.strip()


class TicketContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=3000)
    messages: list[ConversationMessage] = Field(default_factory=list, max_length=100)

    @field_validator("subject", "description")
    @classmethod
    def validate_nonblank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Ticket text must not be blank.")
        return value.strip()


class GeneratedText(BaseModel):
    result: str
