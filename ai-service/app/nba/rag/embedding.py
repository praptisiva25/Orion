from __future__ import annotations

import math
import threading
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from app.nba.rag.config import NbaRagSettings


class EmbeddingProviderError(RuntimeError):
    """Safe, content-free failure from local embedding model loading or inference."""


class BgeSmallEmbeddingProvider:
    """Lazy CPU adapter for the BGE SentenceTransformers model."""

    def __init__(
        self,
        settings: NbaRagSettings | None = None,
        *,
        model_loader: Callable[[], Any] | None = None,
    ) -> None:
        self._settings = settings or NbaRagSettings.from_environment()
        self._model_loader = model_loader or self._load_model
        self._model: Any | None = None
        self._model_version: str | None = None
        self._load_lock = threading.Lock()

    @property
    def model_id(self) -> str:
        return self._settings.embedding_model

    @property
    def model_version(self) -> str:
        # Until first inference, this is the configured revision. After loading,
        # use the immutable Hub commit hash when SentenceTransformers exposes it.
        return self._model_version or self._settings.embedding_revision

    def _load_model(self) -> Any:
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(
            self._settings.embedding_model,
            revision=self._settings.embedding_revision,
            device="cpu",
        )

    @staticmethod
    def _resolved_revision(model: Any, model_id: str) -> str | None:
        try:
            first_module = model._first_module()
            auto_model = getattr(first_module, "auto_model", None)
            model_config = getattr(auto_model, "config", None)
            revision = getattr(model_config, "_commit_hash", None)
            if isinstance(revision, str) and revision:
                return revision
        except Exception:
            pass
        try:
            from huggingface_hub.constants import HF_HUB_CACHE

            repo_folder = "models--" + model_id.replace("/", "--")
            snapshots = Path(HF_HUB_CACHE) / repo_folder / "snapshots"
            refs = Path(HF_HUB_CACHE) / repo_folder / "refs" / "main"
            if refs.is_file():
                revision = refs.read_text(encoding="utf-8").strip()
                if revision and (snapshots / revision).is_dir():
                    return revision
            candidates = [item.name for item in snapshots.iterdir() if item.is_dir()] if snapshots.is_dir() else []
            if len(candidates) == 1:
                return candidates[0]
        except Exception:
            return None
        return None

    def _ensure_model(self) -> Any:
        if self._model is None:
            with self._load_lock:
                if self._model is None:
                    try:
                        model = self._model_loader()
                        get_dimension = getattr(model, "get_embedding_dimension", None)
                        if get_dimension is None:
                            get_dimension = model.get_sentence_embedding_dimension
                        dimension = get_dimension()
                        if dimension != self._settings.embedding_dimension:
                            raise ValueError("Unexpected embedding dimension")
                        self._model_version = self._resolved_revision(model, self._settings.embedding_model) or self._settings.embedding_revision
                        self._model = model
                    except Exception:
                        raise EmbeddingProviderError("Embedding model could not be loaded.") from None
        return self._model

    def ensure_loaded(self) -> None:
        """Load and validate the configured model without generating an embedding."""
        self._ensure_model()

    def _encode(self, texts: Sequence[str], *, is_query: bool) -> list[list[float]]:
        if not texts:
            return []
        if any(not isinstance(text, str) or not text.strip() for text in texts):
            raise ValueError("Embedding input must contain non-blank text.")

        model = self._ensure_model()
        input_texts = [
            f"{self._settings.query_instruction}{text.strip()}" if is_query else text.strip()
            for text in texts
        ]
        try:
            vectors = model.encode(
                input_texts,
                batch_size=self._settings.embedding_batch_size,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
                device="cpu",
            )
            matrix = np.asarray(vectors, dtype=np.float32)
            if matrix.ndim == 1 and len(texts) == 1:
                matrix = matrix.reshape(1, -1)
            if matrix.shape != (len(texts), self._settings.embedding_dimension):
                raise ValueError("Unexpected embedding tensor shape")
            if not np.isfinite(matrix).all():
                raise ValueError("Embedding tensor contains non-finite values")
            norms = np.linalg.norm(matrix, axis=1)
            if np.any(norms <= 0):
                raise ValueError("Embedding tensor contains zero vectors")
            # Normalize defensively even if a provider/version ignores the flag.
            matrix = matrix / norms[:, None]
            return matrix.tolist()
        except EmbeddingProviderError:
            raise
        except Exception:
            raise EmbeddingProviderError("Embedding generation failed.") from None

    def embed_query(self, text: str) -> list[float]:
        vectors = self._encode([text], is_query=True)
        return vectors[0]

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._encode(texts, is_query=False)
