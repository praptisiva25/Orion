from __future__ import annotations

import contextlib
from dataclasses import dataclass
import sys
from types import SimpleNamespace

import pytest

from app.api.routes.sentiment import get_sentiment_service
from app.core.config import get_settings
from app.main import app
from app.services.sentiment_analysis import (
    SentimentAnalysisError,
    SentimentAnalysisService,
    SentimentInputError,
    SentimentPrediction,
    _TransformersRunner,
    validate_label_mapping,
)
from tests.test_api import ASGITestClient, auth_headers


@dataclass
class FakeRunner:
    prediction: SentimentPrediction
    error: Exception | None = None
    texts: list[str] | None = None

    def predict(self, text: str) -> SentimentPrediction:
        if self.texts is None:
            self.texts = []
        self.texts.append(text)
        if self.error:
            raise self.error
        return self.prediction


def test_label_mapping_uses_and_normalizes_model_configuration() -> None:
    mapping = validate_label_mapping(
        {"0": "NEGATIVE", "1": "Neutral", "2": "positive"},
        num_labels=3,
    )

    assert mapping == {0: "negative", 1: "neutral", 2: "positive"}


def test_transformers_runner_uses_independent_model_ids_cpu_and_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: dict[str, object] = {}

    class Scalar:
        def __init__(self, value: float) -> None:
            self.value = value

        def item(self) -> float:
            return self.value

    class FakeModel:
        config = SimpleNamespace(
            id2label={"0": "negative", "1": "neutral", "2": "positive"},
            num_labels=3,
            _commit_hash="model-revision",
        )

        def to(self, device):
            observed["device"] = device
            return self

        def eval(self):
            observed["eval"] = True

        def __call__(self, **encoded):
            observed["encoded"] = encoded
            return SimpleNamespace(logits="fake-logits")

    class FakeTokenizer:
        def __call__(self, text: str, **kwargs):
            observed["text"] = text
            observed["tokenizer_options"] = kwargs
            return {"input_ids": "fake-input"}

    fake_torch = SimpleNamespace(
        device=lambda name: name,
        inference_mode=contextlib.nullcontext,
        softmax=lambda logits, dim: "fake-probabilities",
        max=lambda probabilities, dim: (Scalar(0.8), Scalar(2)),
    )
    fake_transformers = SimpleNamespace(
        AutoTokenizer=SimpleNamespace(
            from_pretrained=lambda model_id: (observed.__setitem__("tokenizer_model_id", model_id) or FakeTokenizer())
        ),
        AutoModelForSequenceClassification=SimpleNamespace(
            from_pretrained=lambda model_id, **kwargs: (
                observed.update(classifier_model_id=model_id, model_load_options=kwargs) or FakeModel()
            )
        ),
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "transformers", fake_transformers)

    runner = _TransformersRunner(
        tokenizer_model_id="verified/tokenizer",
        classifier_model_id="verified/classifier",
    )
    prediction = runner.predict("synthetic message")

    assert observed["device"] == "cpu"
    assert observed["eval"] is True
    assert observed["tokenizer_model_id"] == "verified/tokenizer"
    assert observed["classifier_model_id"] == "verified/classifier"
    assert observed["model_load_options"] == {"use_safetensors": True}
    assert observed["tokenizer_options"] == {
        "truncation": True,
        "max_length": 128,
        "return_tensors": "pt",
    }
    assert prediction.label == "positive"
    assert prediction.confidence == pytest.approx(0.8)
    assert prediction.model_name == "verified/classifier"
    assert prediction.model_version == "model-revision"


def test_settings_configure_tokenizer_and_classifier_independently(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-internal-key-0123456789-abcdef")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key-that-is-distinct")
    monkeypatch.setenv("GROQ_MODEL", "test-model")
    monkeypatch.setenv("SENTIMENT_TOKENIZER_ID", "custom/tokenizer")
    monkeypatch.setenv("SENTIMENT_MODEL_ID", "custom/classifier")
    get_settings.cache_clear()
    try:
        settings = get_settings()
    finally:
        get_settings.cache_clear()

    assert settings.sentiment_tokenizer_id == "custom/tokenizer"
    assert settings.sentiment_model_id == "custom/classifier"


def test_settings_use_verified_sentiment_model_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-internal-key-0123456789-abcdef")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key-that-is-distinct")
    monkeypatch.setenv("GROQ_MODEL", "test-model")
    monkeypatch.delenv("SENTIMENT_TOKENIZER_ID", raising=False)
    monkeypatch.delenv("SENTIMENT_MODEL_ID", raising=False)
    get_settings.cache_clear()
    try:
        settings = get_settings()
    finally:
        get_settings.cache_clear()

    assert settings.sentiment_tokenizer_id == "distilbert-base-uncased"
    assert settings.sentiment_model_id == "satishmachine/sentiment-model"


@pytest.mark.parametrize(
    ("id2label", "num_labels"),
    [
        ({"0": "negative", "1": "neutral"}, 2),
        ({"0": "LABEL_0", "1": "LABEL_1", "2": "LABEL_2"}, 3),
        ({"0": "negative", "1": "neutral", "2": "positive", "3": "other"}, 4),
    ],
)
def test_label_mapping_rejects_unknown_or_non_three_class_configs(id2label, num_labels) -> None:
    with pytest.raises(SentimentAnalysisError, match="must provide"):
        validate_label_mapping(id2label, num_labels)


@pytest.mark.parametrize("label", ["positive", "neutral", "negative"])
def test_sentiment_classes_and_confidence_are_returned(label: str) -> None:
    runner = FakeRunner(
        SentimentPrediction(
            label=label,
            confidence=0.873,
            model_name="satishmachine/sentiment-model",
            model_version="abc123",
        )
    )
    service = SentimentAnalysisService(runner_loader=lambda: runner)

    result = service.analyze("A representative customer message.")

    assert result.label == label
    assert result.confidence == pytest.approx(0.873)
    assert 0 <= result.confidence <= 1
    assert result.model_name == "satishmachine/sentiment-model"
    assert result.model_version == "abc123"


def test_model_is_loaded_once_and_input_is_trimmed() -> None:
    runner = FakeRunner(SentimentPrediction("neutral", 0.7, "model", None))
    loads = 0

    def load_runner() -> FakeRunner:
        nonlocal loads
        loads += 1
        return runner

    service = SentimentAnalysisService(runner_loader=load_runner)
    service.analyze("  First message  ")
    service.analyze("Second message")

    assert loads == 1
    assert runner.texts == ["First message", "Second message"]


@pytest.mark.parametrize("text", ["", "   ", None])
def test_empty_input_is_rejected_before_loading(text: str | None) -> None:
    service = SentimentAnalysisService(runner_loader=lambda: pytest.fail("model should not load"))

    with pytest.raises(SentimentInputError, match="must not be blank"):
        service.analyze(text)  # type: ignore[arg-type]


def test_excessively_long_input_is_rejected_before_loading() -> None:
    service = SentimentAnalysisService(runner_loader=lambda: pytest.fail("model should not load"))

    with pytest.raises(SentimentInputError, match="maximum supported length"):
        service.analyze("x" * 10_001)


def test_model_loading_failure_is_safe_and_retryable() -> None:
    def failed_load() -> FakeRunner:
        raise RuntimeError("private filesystem path and message contents")

    service = SentimentAnalysisService(runner_loader=failed_load)

    with pytest.raises(SentimentAnalysisError, match="could not be loaded") as error:
        service.analyze("synthetic input")

    assert "private filesystem" not in str(error.value)


def test_inference_failure_is_safe_and_does_not_include_input() -> None:
    private_text = "synthetic private customer message"
    runner = FakeRunner(
        SentimentPrediction("neutral", 0.5, "model", None),
        error=RuntimeError(private_text),
    )
    service = SentimentAnalysisService(runner_loader=lambda: runner)

    with pytest.raises(SentimentAnalysisError, match="inference failed") as error:
        service.analyze(private_text)

    assert private_text not in str(error.value)


@pytest.mark.parametrize("confidence", [-0.01, 1.01, float("nan"), float("inf")])
def test_invalid_model_confidence_is_rejected(confidence: float) -> None:
    runner = FakeRunner(SentimentPrediction("positive", confidence, "model", None))
    service = SentimentAnalysisService(runner_loader=lambda: runner)

    with pytest.raises(SentimentAnalysisError, match="invalid prediction"):
        service.analyze("synthetic input")


def test_api_returns_structured_result_and_requires_internal_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-internal-key-0123456789-abcdef")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key-that-is-distinct")
    monkeypatch.setenv("GROQ_MODEL", "test-model")
    get_settings.cache_clear()
    runner = FakeRunner(SentimentPrediction("positive", 0.91, "model", "revision-1"))
    app.dependency_overrides[get_sentiment_service] = lambda: SentimentAnalysisService(
        runner_loader=lambda: runner
    )
    client = ASGITestClient()
    try:
        response = client.post(
            "/v1/sentiment/analyze",
            headers=auth_headers(),
            json={"text": "The support was helpful."},
        )
        unauthenticated = client.post(
            "/v1/sentiment/analyze",
            json={"text": "The support was helpful."},
        )
    finally:
        app.dependency_overrides.pop(get_sentiment_service, None)
        get_settings.cache_clear()

    assert response.status_code == 200
    assert response.json() == {
        "label": "positive",
        "confidence": 0.91,
        "model_name": "model",
        "model_version": "revision-1",
    }
    assert unauthenticated.status_code == 401


def test_api_rejects_empty_oversized_text_without_echoing_it(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-internal-key-0123456789-abcdef")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key-that-is-distinct")
    monkeypatch.setenv("GROQ_MODEL", "test-model")
    get_settings.cache_clear()
    client = ASGITestClient()
    try:
        empty = client.post(
            "/v1/sentiment/analyze", headers=auth_headers(), json={"text": "   "}
        )
        marker = "private-sentiment-text"
        oversized = client.post(
            "/v1/sentiment/analyze",
            headers=auth_headers(),
            json={"text": marker + ("x" * 10_000)},
        )
    finally:
        get_settings.cache_clear()

    assert empty.status_code == 422
    assert oversized.status_code == 422
    assert marker not in oversized.text
