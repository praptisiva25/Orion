"""Constants for the isolated, local sentiment classifier."""

SENTIMENT_TOKENIZER_ID = "distilbert-base-uncased"
SENTIMENT_MODEL_ID = "satishmachine/sentiment-model"
SENTIMENT_MAX_INPUT_CHARS = 10_000
SENTIMENT_MAX_TOKENS = 128
SENTIMENT_LABELS = frozenset({"negative", "neutral", "positive"})
