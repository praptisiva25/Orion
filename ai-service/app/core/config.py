from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from app.core.sentiment_config import SENTIMENT_MODEL_ID, SENTIMENT_TOKENIZER_ID

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)


@dataclass(frozen=True)
class Settings:
    internal_service_key: str
    groq_api_key: str
    groq_model: str
    groq_timeout_seconds: float
    max_concurrent_generations: int
    sentiment_tokenizer_id: str = SENTIMENT_TOKENIZER_ID
    sentiment_model_id: str = SENTIMENT_MODEL_ID


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    internal_key = os.getenv("INTERNAL_SERVICE_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    groq_model = os.getenv("GROQ_MODEL", "").strip()
    sentiment_tokenizer_id = os.getenv("SENTIMENT_TOKENIZER_ID", SENTIMENT_TOKENIZER_ID).strip()
    sentiment_model_id = os.getenv("SENTIMENT_MODEL_ID", SENTIMENT_MODEL_ID).strip()
    if len(internal_key) < 32:
        raise RuntimeError("INTERNAL_SERVICE_KEY must contain at least 32 characters.")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY is required.")
    if not groq_model:
        raise RuntimeError("GROQ_MODEL is required.")
    if not sentiment_tokenizer_id or not sentiment_model_id:
        raise RuntimeError("Sentiment tokenizer and model IDs must not be blank.")
    if internal_key == groq_key:
        raise RuntimeError("INTERNAL_SERVICE_KEY and GROQ_API_KEY must be different.")

    try:
        timeout = float(os.getenv("GROQ_TIMEOUT_SECONDS", "30"))
        concurrency = int(os.getenv("MAX_CONCURRENT_GENERATIONS", "8"))
    except ValueError as exc:
        raise RuntimeError("AI service numeric settings are invalid.") from exc
    if not 1 <= timeout <= 120 or not 1 <= concurrency <= 100:
        raise RuntimeError("AI service numeric settings are outside the allowed range.")

    return Settings(
        internal_service_key=internal_key,
        groq_api_key=groq_key,
        groq_model=groq_model,
        groq_timeout_seconds=timeout,
        max_concurrent_generations=concurrency,
        sentiment_tokenizer_id=sentiment_tokenizer_id,
        sentiment_model_id=sentiment_model_id,
    )
