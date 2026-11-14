from __future__ import annotations

from typing import Protocol, Sequence

from app.nba.schemas.manifest import SourceManifest
from app.nba.schemas.documents import KnowledgeChunk, RetrievedPassage
from app.nba.schemas.rulebook import SourceType


class EmbeddingProvider(Protocol):
    """Future adapter for a separately configured embedding model (not Groq)."""

    @property
    def model_id(self) -> str: ...

    def embed_query(self, text: str) -> Sequence[float]: ...

    def embed_documents(self, texts: Sequence[str]) -> Sequence[Sequence[float]]: ...


class DocumentChunker(Protocol):
    """Future deterministic chunker that preserves source locators."""

    def chunk(self, text: str, manifest: SourceManifest) -> Sequence[KnowledgeChunk]: ...


class VectorStore(Protocol):
    """Future FAISS adapter; implementations must persist metadata beside vectors."""

    def add(self, chunks: Sequence[KnowledgeChunk], vectors: Sequence[Sequence[float]]) -> None: ...

    def search(
        self,
        query_vector: Sequence[float],
        *,
        top_k: int,
        source_type: SourceType | None = None,
        scenario: str | None = None,
    ) -> Sequence[RetrievedPassage]: ...
