from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class NbaRagSettings:
    embedding_provider: str = "local_sentence_transformers"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_revision: str = "main"
    embedding_dimension: int = 384
    embedding_batch_size: int = 32
    query_instruction: str = "Represent this sentence for searching relevant passages: "
    vector_store: str = "faiss"
    faiss_index_path: Path = Path("storage/faiss_index")
    chunk_size_chars: int = 1200
    chunk_overlap_chars: int = 150
    retrieval_top_k: int = 5
    retrieval_minimum_score: float = 0.70
    maximum_document_bytes: int = 25_000_000

    @classmethod
    def from_environment(cls) -> NbaRagSettings:
        try:
            settings = cls(
                embedding_provider=os.getenv("NBA_EMBEDDING_PROVIDER", cls.embedding_provider),
                embedding_model=os.getenv("NBA_EMBEDDING_MODEL", cls.embedding_model),
                embedding_revision=os.getenv("NBA_EMBEDDING_REVISION", cls.embedding_revision),
                embedding_dimension=int(os.getenv("NBA_EMBEDDING_DIMENSION", str(cls.embedding_dimension))),
                embedding_batch_size=int(os.getenv("NBA_EMBEDDING_BATCH_SIZE", str(cls.embedding_batch_size))),
                query_instruction=os.getenv("NBA_QUERY_INSTRUCTION", cls.query_instruction),
                vector_store=os.getenv("NBA_VECTOR_STORE", cls.vector_store),
                faiss_index_path=Path(os.getenv("NBA_FAISS_INDEX_PATH", str(cls.faiss_index_path))),
                chunk_size_chars=int(os.getenv("NBA_CHUNK_SIZE_CHARS", str(cls.chunk_size_chars))),
                chunk_overlap_chars=int(os.getenv("NBA_CHUNK_OVERLAP_CHARS", str(cls.chunk_overlap_chars))),
                retrieval_top_k=int(os.getenv("NBA_RETRIEVAL_TOP_K", str(cls.retrieval_top_k))),
                retrieval_minimum_score=float(os.getenv("NBA_RETRIEVAL_MINIMUM_SCORE", str(cls.retrieval_minimum_score))),
                maximum_document_bytes=int(os.getenv("NBA_MAXIMUM_DOCUMENT_BYTES", str(cls.maximum_document_bytes))),
            )
        except (TypeError, ValueError):
            raise ValueError("NBA RAG numeric configuration is invalid.") from None

        if settings.embedding_provider != "local_sentence_transformers":
            raise ValueError("NBA_EMBEDDING_PROVIDER is not supported by the Batch 1 foundation.")
        if not settings.embedding_model.strip():
            raise ValueError("NBA_EMBEDDING_MODEL must not be blank.")
        if not settings.embedding_revision.strip() or settings.embedding_dimension < 1:
            raise ValueError("NBA embedding revision or dimension is invalid.")
        if not 1 <= settings.embedding_batch_size <= 512:
            raise ValueError("NBA_EMBEDDING_BATCH_SIZE is outside the allowed range.")
        if not settings.query_instruction:
            raise ValueError("NBA_QUERY_INSTRUCTION must not be blank.")
        if settings.vector_store != "faiss":
            raise ValueError("NBA_VECTOR_STORE must be 'faiss'.")
        if (
            settings.chunk_size_chars < 100
            or settings.chunk_size_chars > 20_000
            or settings.chunk_overlap_chars < 0
            or settings.chunk_overlap_chars >= settings.chunk_size_chars
            or not 1 <= settings.retrieval_top_k <= 50
            or not 0.0 <= settings.retrieval_minimum_score <= 1.0
            or not 1 <= settings.maximum_document_bytes <= 100_000_000
        ):
            raise ValueError("NBA RAG chunking or retrieval settings are outside the allowed range.")
        return settings
