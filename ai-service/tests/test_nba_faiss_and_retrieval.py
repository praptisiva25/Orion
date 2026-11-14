from __future__ import annotations

import hashlib
from datetime import date

import pytest

from app.nba.rag.config import NbaRagSettings
from app.nba.rag.embedding import EmbeddingProviderError
from app.nba.rag.evaluation import RetrievalCase, evaluate_retrieval
from app.nba.rag.faiss_store import (
    DocumentVersionConflictError,
    FaissVectorStore,
    VectorStoreCompatibilityError,
    VectorStoreIntegrityError,
)
from app.nba.rag.retriever import KnowledgeRetriever
from app.nba.schemas.documents import KnowledgeChunk, RetrievedPassage
from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus
from app.nba.schemas.rulebook import SourceType


def _chunk(
    document_id: str,
    chunk_id: str,
    *,
    source_type: SourceType = SourceType.OFFICIAL_PUBLIC,
    status: RegulatoryStatus = RegulatoryStatus.CURRENT,
    review: ReviewStatus = ReviewStatus.APPROVED,
    tags: tuple[str, ...] = ("failed_atm_withdrawal",),
    version: str = "1.0.0",
    digest: str = "a" * 64,
    effective: date | None = date(2025, 1, 1),
    expiry: date | None = None,
    text: str | None = None,
) -> KnowledgeChunk:
    return KnowledgeChunk(
        document_id=document_id,
        document_version=version,
        content_hash=digest,
        chunk_id=chunk_id,
        source_type=source_type,
        title=f"Synthetic {document_id}",
        canonical_url="https://rbi.org.in/synthetic" if source_type == SourceType.OFFICIAL_PUBLIC else None,
        page_number=2,
        section_heading="Synthetic heading",
        jurisdiction="IN",
        effective_date=effective,
        expiry_date=expiry,
        review_status=review,
        reviewer="Synthetic test reviewer",
        approval_date=date(2025, 1, 2),
        regulatory_status=status,
        scenario_tags=tags,
        text=text or f"Synthetic evidence for {chunk_id}",
    )


def _settings(path, *, threshold: float = 0.75) -> NbaRagSettings:
    return NbaRagSettings(
        embedding_dimension=3,
        faiss_index_path=path,
        retrieval_minimum_score=threshold,
    )


def _require_faiss() -> None:
    pytest.importorskip("faiss", reason="faiss-cpu is an optional test/runtime dependency")


def test_faiss_insertion_exact_cosine_search_and_source_filter(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    store = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a", as_of=date(2026, 1, 1))
    official = _chunk("rbi-atm", "atm-1")
    internal = _chunk(
        "orion-demo",
        "demo-1",
        source_type=SourceType.ILLUSTRATIVE_INTERNAL,
        status=RegulatoryStatus.NOT_APPLICABLE,
    )

    assert store.add([official, internal], [[1, 0, 0], [0, 1, 0]]) == 2
    results = store.search([1, 0, 0], top_k=5, source_type=SourceType.OFFICIAL_PUBLIC)

    assert len(results) == 1
    assert results[0].source.document_id == "rbi-atm"
    assert results[0].score == pytest.approx(1.0)
    assert results[0].source.page_number == 2
    assert results[0].source.section_heading == "Synthetic heading"


def test_faiss_similarity_results_are_sorted_descending(tmp_path) -> None:
    _require_faiss()
    store = FaissVectorStore(settings=_settings(tmp_path), model_id="test-embedder", model_version="rev-a")
    store.add(
        [_chunk("source-a", "exact"), _chunk("source-b", "near"), _chunk("source-c", "weak")],
        [[1, 0, 0], [0.8, 0.6, 0], [0, 1, 0]],
    )

    results = store.search([1, 0, 0], top_k=3)

    assert [result.source.chunk_id for result in results] == ["exact", "near", "weak"]
    assert [result.score for result in results] == sorted((result.score for result in results), reverse=True)


def test_faiss_save_reload_preserves_mapping_and_vectors(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    chunk = _chunk("rbi-atm", "atm-1")
    first = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")
    first.add([chunk], [[0.6, 0.8, 0]])

    reloaded = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")
    results = reloaded.search([0.6, 0.8, 0], top_k=1)

    assert len(results) == 1
    assert results[0].source.chunk_id == chunk.chunk_id
    assert results[0].source.content_hash == chunk.content_hash


def test_faiss_duplicate_chunks_are_idempotent_and_version_conflicts_rejected(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    store = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")
    original = _chunk("rbi-atm", "atm-1")

    assert store.add([original], [[1, 0, 0]]) == 1
    assert store.add([original], [[1, 0, 0]]) == 0
    with pytest.raises(DocumentVersionConflictError, match="version update"):
        store.add([_chunk("rbi-atm", "atm-2", digest="b" * 64)], [[0, 1, 0]])


def test_faiss_requires_normalized_vectors_and_approved_documents(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    store = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")

    with pytest.raises(VectorStoreIntegrityError, match="normalized"):
        store.add([_chunk("rbi-atm", "atm-1")], [[2, 0, 0]])
    with pytest.raises(VectorStoreIntegrityError, match="approved"):
        store.add([_chunk("rbi-atm", "draft", review=ReviewStatus.IN_REVIEW)], [[1, 0, 0]])
    with pytest.raises(VectorStoreIntegrityError, match="reviewer and approval date"):
        store.add([_chunk("rbi-atm", "missing-approval", review=ReviewStatus.APPROVED).model_copy(
            update={"reviewer": None, "approval_date": None}
        )], [[1, 0, 0]])


def test_faiss_rejects_superseded_withdrawn_or_expired_sources(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    store = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a", as_of=date(2026, 1, 1))

    for chunk in (
        _chunk("withdrawn", "w", status=RegulatoryStatus.WITHDRAWN),
        _chunk("superseded", "s", status=RegulatoryStatus.SUPERSEDED),
        _chunk("expired", "e", expiry=date(2025, 12, 31)),
    ):
        with pytest.raises(VectorStoreIntegrityError):
            store.add([chunk], [[1, 0, 0]])


def test_faiss_omits_results_when_metadata_is_missing(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    store = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")
    store.add([_chunk("rbi-atm", "atm-1")], [[1, 0, 0]])
    store._records.clear()  # simulate a missing vector-to-source metadata entry

    assert store.search([1, 0, 0], top_k=1) == []


def test_faiss_detects_persisted_metadata_index_mismatch(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    store = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")
    store.add([_chunk("rbi-atm", "atm-1")], [[1, 0, 0]])
    store._records.clear()
    store._publish_generation(store._index, store._records)

    with pytest.raises(VectorStoreIntegrityError, match="synchronized"):
        FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a").search([1, 0, 0], top_k=1)


def test_faiss_rejects_different_model_revision(tmp_path) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a").add(
        [_chunk("rbi-atm", "atm-1")], [[1, 0, 0]]
    )

    with pytest.raises(VectorStoreCompatibilityError, match="different embedding"):
        FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-b").search([1, 0, 0], top_k=1)


def test_faiss_rejects_index_with_wrong_dimension(tmp_path) -> None:
    _require_faiss()
    first_settings = _settings(tmp_path)
    FaissVectorStore(settings=first_settings, model_id="test-embedder", model_version="rev-a").add(
        [_chunk("rbi-atm", "atm-1")], [[1, 0, 0]]
    )
    wrong_settings = NbaRagSettings(embedding_dimension=4, faiss_index_path=tmp_path)

    with pytest.raises(VectorStoreCompatibilityError, match="dimension"):
        FaissVectorStore(settings=wrong_settings, model_id="test-embedder", model_version="rev-a").search([1, 0, 0, 0], top_k=1)


def test_interrupted_rebuild_keeps_previously_published_generation(tmp_path, monkeypatch) -> None:
    _require_faiss()
    settings = _settings(tmp_path)
    store = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")
    original = _chunk("rbi-atm", "original")
    store.add([original], [[1, 0, 0]])
    current_pointer = (tmp_path / "CURRENT").read_text(encoding="ascii")

    def interrupt(*_args, **_kwargs):
        raise RuntimeError("simulated interrupted generation")

    monkeypatch.setattr(store, "_publish_generation", interrupt)
    with pytest.raises(RuntimeError, match="interrupted"):
        store.rebuild([_chunk("rbi-upi", "replacement")], [[0, 1, 0]])

    assert (tmp_path / "CURRENT").read_text(encoding="ascii") == current_pointer
    reloaded = FaissVectorStore(settings=settings, model_id="test-embedder", model_version="rev-a")
    assert reloaded.search([1, 0, 0], top_k=1)[0].source.chunk_id == "original"


class _QueryEmbedder:
    model_id = "synthetic"
    model_version = "synthetic-v1"

    def __init__(self, vector: list[float] | None = None, fail: bool = False) -> None:
        self.vector = vector or [1, 0, 0]
        self.fail = fail

    def embed_query(self, text: str) -> list[float]:
        if self.fail:
            raise EmbeddingProviderError("private embedding error")
        return self.vector

    def embed_documents(self, texts):
        return [self.vector for _ in texts]


class _FakeStore:
    def __init__(self, passages: list[RetrievedPassage]) -> None:
        self.passages = passages
        self.options = None

    def search(self, query_vector, *, top_k, source_type=None, scenario=None):
        self.options = (top_k, source_type, scenario)
        return self.passages


def test_retriever_filters_source_scenario_status_and_low_scores() -> None:
    current = _chunk("rbi-atm", "current")
    internal = _chunk(
        "orion-demo", "internal", source_type=SourceType.ILLUSTRATIVE_INTERNAL,
        status=RegulatoryStatus.UNKNOWN, tags=("complaint_escalation",),
    )
    stale = _chunk("old-rbi", "old", status=RegulatoryStatus.SUPERSEDED)
    passages = [
        RetrievedPassage(text=current.text, score=0.92, source=current),
        RetrievedPassage(text=internal.text, score=0.91, source=internal),
        RetrievedPassage(text=stale.text, score=0.99, source=stale),
    ]
    store = _FakeStore(passages)
    retriever = KnowledgeRetriever(_QueryEmbedder(), store, _settings("unused"))

    results = retriever.retrieve("ATM cash not dispensed", scenario="failed_atm_withdrawal", source_type=SourceType.OFFICIAL_PUBLIC)

    assert [result.source.document_id for result in results] == ["rbi-atm"]
    assert store.options == (5, SourceType.OFFICIAL_PUBLIC, "failed_atm_withdrawal")


def test_retriever_returns_no_results_for_low_score_missing_review_or_embed_failure() -> None:
    low_score = RetrievedPassage(text="weak", score=0.2, source=_chunk("rbi-atm", "weak"))
    unreviewed = RetrievedPassage(
        text="unreviewed", score=0.99,
        source=_chunk("rbi-atm", "draft", review=ReviewStatus.IN_REVIEW),
    )
    retriever = KnowledgeRetriever(_QueryEmbedder(), _FakeStore([low_score, unreviewed]), _settings("unused"))
    assert retriever.retrieve("synthetic question") == []
    assert KnowledgeRetriever(_QueryEmbedder(fail=True), _FakeStore([]), _settings("unused")).retrieve("question") == []


def test_retriever_excludes_unknown_official_and_future_or_expired_documents() -> None:
    sources = [
        _chunk("unknown-rbi", "unknown", status=RegulatoryStatus.UNKNOWN),
        _chunk("future-rbi", "future", effective=date(2027, 1, 1)),
        _chunk("expired-rbi", "expired", expiry=date(2025, 12, 31)),
    ]
    passages = [RetrievedPassage(text=item.text, score=0.99, source=item) for item in sources]
    retriever = KnowledgeRetriever(_QueryEmbedder(), _FakeStore(passages), _settings("unused"))

    assert retriever.retrieve("synthetic question") == []


def test_synthetic_retrieval_evaluation_reports_relevance_and_locator_metrics() -> None:
    matching = _chunk("synthetic-atm-evidence", "atm-match")
    passage = RetrievedPassage(text=matching.text, score=0.93, source=matching)
    retriever = KnowledgeRetriever(_QueryEmbedder(), _FakeStore([passage]), _settings("unused"))
    report = evaluate_retrieval(
        [
            RetrievalCase("atm", "synthetic ATM query", "synthetic-atm-evidence", 2),
            RetrievalCase("no-match", "synthetic unmatched query", None),
        ],
        retriever,
        top_k=3,
    )

    assert report["hit_rate_at_3"] == 1.0
    assert report["mrr_at_3"] == 1.0
    assert report["page_locator_accuracy"] == 1.0
    assert report["no_result_accuracy"] == 0.0
