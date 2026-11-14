from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from app.nba.rag.config import NbaRagSettings
from app.nba.rag.embedding import EmbeddingProviderError
from app.nba.rag.interfaces import EmbeddingProvider, VectorStore
from app.nba.schemas.documents import RetrievedPassage
from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus
from app.nba.schemas.rulebook import SourceType


class KnowledgeRetriever:
    """Evidence-only retrieval. It does not call Groq or create citations."""

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore,
        settings: NbaRagSettings | None = None,
    ) -> None:
        self._embedding_provider = embedding_provider
        self._vector_store = vector_store
        self._settings = settings or NbaRagSettings.from_environment()

    @property
    def has_published_index(self) -> bool:
        return bool(getattr(self._vector_store, "has_published_index", True))

    def retrieve(
        self,
        query: str,
        *,
        scenario: str | None = None,
        source_type: SourceType | None = None,
        top_k: int | None = None,
    ) -> list[RetrievedPassage]:
        results, _ = self.retrieve_with_status(
            query,
            scenario=scenario,
            source_type=source_type,
            top_k=top_k,
        )
        return results

    def retrieve_with_status(
        self,
        query: str,
        *,
        scenario: str | None = None,
        source_type: SourceType | None = None,
        top_k: int | None = None,
    ) -> tuple[list[RetrievedPassage], str]:
        if not isinstance(query, str) or not query.strip():
            return [], "no_matching_evidence"
        count = self._settings.retrieval_top_k if top_k is None else top_k
        if not 1 <= count <= 50:
            raise ValueError("top_k must be between 1 and 50")
        if not self.has_published_index:
            return [], "no_approved_sources"
        try:
            query_vector = self._embedding_provider.embed_query(query.strip())
            passages: Sequence[RetrievedPassage] = self._vector_store.search(
                query_vector,
                top_k=count,
                source_type=source_type,
                scenario=scenario,
            )
        except EmbeddingProviderError:
            return [], "unavailable"
        except Exception:
            # Search failures return no evidence and never echo the query/content.
            return [], "unavailable"

        results: list[RetrievedPassage] = []
        current_date = date.today()
        for passage in passages:
            source = passage.source
            if source.review_status != ReviewStatus.APPROVED:
                continue
            if source.regulatory_status == RegulatoryStatus.UNKNOWN:
                continue
            if not source.reviewer or not source.approval_date or source.approval_date > current_date:
                continue
            if source.regulatory_status in {RegulatoryStatus.SUPERSEDED, RegulatoryStatus.WITHDRAWN}:
                continue
            if source_type is not None and source.source_type != source_type:
                continue
            if (
                source.source_type == SourceType.OFFICIAL_PUBLIC
                and source.regulatory_status not in {RegulatoryStatus.CURRENT, RegulatoryStatus.CURRENT_AS_AMENDED}
            ):
                continue
            if source.effective_date and source.effective_date > current_date:
                continue
            if source.expiry_date and source.expiry_date < current_date:
                continue
            if scenario is not None and scenario not in source.scenario_tags:
                continue
            if passage.score < self._settings.retrieval_minimum_score:
                continue
            results.append(passage)
            if len(results) == count:
                break
        return results, "evidence_available" if results else "no_matching_evidence"
