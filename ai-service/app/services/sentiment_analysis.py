from __future__ import annotations

import math
import os
import threading
from dataclasses import dataclass
from typing import Callable, Protocol

from app.core.sentiment_config import (
    SENTIMENT_LABELS,
    SENTIMENT_MAX_INPUT_CHARS,
    SENTIMENT_MAX_TOKENS,
    SENTIMENT_MODEL_ID,
    SENTIMENT_TOKENIZER_ID,
)


class SentimentInputError(ValueError):
    """Raised when caller-provided text is invalid for sentiment analysis."""


class SentimentAnalysisError(Exception):
    """Content-free failure from local sentiment model loading or inference."""


@dataclass(frozen=True)
class SentimentPrediction:
    label: str
    confidence: float
    model_name: str
    model_version: str | None


class _SentimentRunner(Protocol):
    def predict(self, text: str) -> SentimentPrediction:
        """Run local inference without logging the supplied text."""


def validate_label_mapping(id2label: dict[object, object], num_labels: int) -> dict[int, str]:
    """Validate and normalize the model's own label map; never infer index order."""
    try:
        mapping = {int(index): str(label).strip().casefold() for index, label in id2label.items()}
    except (AttributeError, TypeError, ValueError):
        raise SentimentAnalysisError("Sentiment model label mapping is invalid.") from None

    if num_labels != 3 or len(mapping) != 3 or set(mapping.values()) != SENTIMENT_LABELS:
        raise SentimentAnalysisError("Sentiment model must provide negative, neutral, and positive labels.")
    return mapping


class _TransformersRunner:
    def __init__(
        self,
        tokenizer_model_id: str = SENTIMENT_TOKENIZER_ID,
        classifier_model_id: str = SENTIMENT_MODEL_ID,
    ) -> None:
        try:
            import torch

            # This service uses the PyTorch backend only; avoid importing an unrelated
            # TensorFlow runtime that may be installed but unavailable on this host.
            os.environ.setdefault("USE_TF", "0")
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            self._torch = torch
            self._tokenizer = AutoTokenizer.from_pretrained(tokenizer_model_id)
            self._model = AutoModelForSequenceClassification.from_pretrained(
                classifier_model_id,
                use_safetensors=True,
            )
            self._model.to(torch.device("cpu"))
            self._model.eval()
            config = self._model.config
            self._labels = validate_label_mapping(config.id2label, config.num_labels)
            self._version = getattr(config, "_commit_hash", None)
            self._classifier_model_id = classifier_model_id
        except SentimentAnalysisError:
            raise
        except Exception:
            # Loading errors may include paths or remote request details; keep them private.
            raise SentimentAnalysisError("Local sentiment model could not be loaded.") from None

    def predict(self, text: str) -> SentimentPrediction:
        try:
            encoded = self._tokenizer(
                text,
                truncation=True,
                max_length=SENTIMENT_MAX_TOKENS,
                return_tensors="pt",
            )
            with self._torch.inference_mode():
                logits = self._model(**encoded).logits[0]
                probabilities = self._torch.softmax(logits, dim=-1)
                confidence, class_index = self._torch.max(probabilities, dim=-1)

            index = int(class_index.item())
            return SentimentPrediction(
                label=self._labels[index],
                confidence=float(confidence.item()),
                model_name=self._classifier_model_id,
                model_version=self._version,
            )
        except Exception:
            # Never attach the analyzed text or framework details to API failures.
            raise SentimentAnalysisError("Local sentiment inference failed.") from None


class SentimentAnalysisService:
    """Lazy, reusable CPU classifier; Hugging Face caches downloaded model files."""

    def __init__(
        self,
        runner_loader: Callable[[], _SentimentRunner] | None = None,
        *,
        tokenizer_model_id: str = SENTIMENT_TOKENIZER_ID,
        classifier_model_id: str = SENTIMENT_MODEL_ID,
    ) -> None:
        self._runner_loader = runner_loader or (
            lambda: _TransformersRunner(tokenizer_model_id, classifier_model_id)
        )
        self._runner: _SentimentRunner | None = None
        self._load_lock = threading.Lock()

    def _get_runner(self) -> _SentimentRunner:
        if self._runner is None:
            with self._load_lock:
                if self._runner is None:
                    try:
                        self._runner = self._runner_loader()
                    except SentimentAnalysisError:
                        raise
                    except Exception:
                        raise SentimentAnalysisError("Local sentiment model could not be loaded.") from None
        return self._runner

    def analyze(self, text: str) -> SentimentPrediction:
        if not isinstance(text, str) or not text.strip():
            raise SentimentInputError("Text must not be blank.")
        normalized_text = text.strip()
        if len(normalized_text) > SENTIMENT_MAX_INPUT_CHARS:
            raise SentimentInputError("Text exceeds the maximum supported length.")

        try:
            prediction = self._get_runner().predict(normalized_text)
        except SentimentAnalysisError:
            raise
        except Exception:
            raise SentimentAnalysisError("Local sentiment inference failed.") from None

        if (
            prediction.label not in SENTIMENT_LABELS
            or not math.isfinite(prediction.confidence)
            or not 0.0 <= prediction.confidence <= 1.0
        ):
            raise SentimentAnalysisError("Local sentiment model returned an invalid prediction.")
        return prediction
