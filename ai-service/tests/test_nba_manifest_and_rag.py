from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.nba.rag.config import NbaRagSettings
from app.nba.rag.interfaces import DocumentChunker, EmbeddingProvider, VectorStore
from app.nba.rag.review import SourceReviewError, approve_manifest, is_manifest_retrieval_eligible
from app.nba.schemas.manifest import ReviewStatus, SourceManifest
from app.nba.schemas.rulebook import SourceType


def _manifest(**overrides: object) -> dict:
    data: dict = {
        "document_id": "demo-procedure-v1",
        "title": "ORION demonstration procedure",
        "issuing_organization": "ORION demonstration team",
        "canonical_url": None,
        "applicability": "Illustrative test fixture only.",
        "jurisdiction": "IN",
        "language": "en",
        "source_type": "illustrative_internal",
        "regulatory_status": "unknown",
        "scenario_tags": [],
        "publication_date": None,
        "updated_date": None,
        "effective_date": None,
        "expiry_date": None,
        "version": "1.0.0",
        "content_hash": "a" * 64,
        "review_status": "draft",
        "reviewer": None,
        "approval_date": None,
    }
    data.update(overrides)
    return data


def test_manifest_distinguishes_illustrative_internal_source() -> None:
    manifest = SourceManifest.model_validate(_manifest())

    assert manifest.source_type == SourceType.ILLUSTRATIVE_INTERNAL
    assert manifest.review_status == ReviewStatus.DRAFT


def test_manifest_distinguishes_approved_official_public_source() -> None:
    manifest = SourceManifest.model_validate(
        _manifest(
            document_id="official-document-v1",
            source_type="official_public",
            regulatory_status="current",
            canonical_url="https://example.gov.in/document",
            review_status="approved",
            reviewer="Knowledge reviewer",
            approval_date=date(2026, 1, 2),
            content_hash="b" * 64,
        )
    )

    assert manifest.source_type == SourceType.OFFICIAL_PUBLIC
    assert manifest.review_status == ReviewStatus.APPROVED


def test_source_review_approval_requires_exact_hash_explicit_reviewer_and_date() -> None:
    draft = SourceManifest.model_validate(_manifest(content_hash="b" * 64, regulatory_status="not_applicable"))
    approved = approve_manifest(
        draft,
        reviewer="Named reviewer",
        approval_date=date(2026, 1, 2),
        reviewed_content_hash="b" * 64,
        as_of=date(2026, 1, 3),
    )

    assert approved.review_status == ReviewStatus.APPROVED
    assert approved.reviewer == "Named reviewer"
    assert is_manifest_retrieval_eligible(approved, as_of=date(2026, 1, 3))
    with pytest.raises(SourceReviewError, match="exact manifest content hash"):
        approve_manifest(
            draft,
            reviewer="Named reviewer",
            approval_date=date(2026, 1, 2),
            reviewed_content_hash="c" * 64,
            as_of=date(2026, 1, 3),
        )


def test_unknown_official_and_in_review_manifests_are_never_retrieval_eligible() -> None:
    unknown_official = SourceManifest.model_validate(_manifest(
        document_id="unknown-official-v1",
        source_type="official_public",
        canonical_url="https://example.gov.in/document",
        regulatory_status="unknown",
        review_status="in_review",
    ))
    assert not is_manifest_retrieval_eligible(unknown_official)

    with pytest.raises(SourceReviewError, match="Unknown source status"):
        approve_manifest(
            unknown_official,
            reviewer="Named reviewer",
            approval_date=date.today(),
            reviewed_content_hash="a" * 64,
        )


def test_official_manifest_requires_secure_canonical_source() -> None:
    with pytest.raises(ValidationError, match="official_public sources require"):
        SourceManifest.model_validate(_manifest(source_type="official_public"))


def test_approved_manifest_requires_reviewer_and_date() -> None:
    with pytest.raises(ValidationError, match="approved sources require"):
        SourceManifest.model_validate(_manifest(review_status="approved"))


def test_manifest_rejects_expiry_before_effective_date() -> None:
    with pytest.raises(ValidationError, match="expiry_date"):
        SourceManifest.model_validate(
            _manifest(
                effective_date=date(2026, 2, 1),
                expiry_date=date(2026, 1, 1),
            )
        )


def test_manifest_requires_explicit_nullable_metadata_fields() -> None:
    data = _manifest()
    del data["publication_date"]

    with pytest.raises(ValidationError, match="publication_date"):
        SourceManifest.model_validate(data)


def test_rag_settings_are_configuration_only_and_do_not_create_index(tmp_path, monkeypatch) -> None:
    index_path = tmp_path / "not-created"
    monkeypatch.setenv("NBA_FAISS_INDEX_PATH", str(index_path))

    settings = NbaRagSettings.from_environment()

    assert settings.embedding_model == "BAAI/bge-small-en-v1.5"
    assert settings.vector_store == "faiss"
    assert settings.faiss_index_path == index_path
    assert not index_path.exists()


def test_rag_settings_reject_invalid_chunk_configuration(monkeypatch) -> None:
    monkeypatch.setenv("NBA_CHUNK_SIZE_CHARS", "100")
    monkeypatch.setenv("NBA_CHUNK_OVERLAP_CHARS", "100")

    with pytest.raises(ValueError, match="outside the allowed range"):
        NbaRagSettings.from_environment()


def test_rag_interfaces_are_protocols_without_loading_model_or_index() -> None:
    assert getattr(EmbeddingProvider, "_is_protocol", False)
    assert getattr(DocumentChunker, "_is_protocol", False)
    assert getattr(VectorStore, "_is_protocol", False)
