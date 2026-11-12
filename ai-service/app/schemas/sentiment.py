from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.sentiment_config import SENTIMENT_MAX_INPUT_CHARS


class SentimentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=SENTIMENT_MAX_INPUT_CHARS)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Text must not be blank.")
        return normalized


class SentimentResponse(BaseModel):
    label: Literal["negative", "neutral", "positive"]
    confidence: float = Field(ge=0.0, le=1.0)
    model_name: str
    model_version: str | None = None
