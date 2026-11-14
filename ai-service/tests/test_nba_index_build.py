from __future__ import annotations

from datetime import date

from app.nba.schemas.manifest import SourceManifest
from scripts.build_nba_index import build_index


def test_index_build_skips_existing_in_review_sources_without_publishing(tmp_path, monkeypatch) -> None:
    root = tmp_path / "service"
    manifests = root / "knowledge_base" / "manifests"
    documents = root / "knowledge_base" / "documents"
    manifests.mkdir(parents=True)
    documents.mkdir(parents=True)
    monkeypatch.setenv("NBA_FAISS_INDEX_PATH", str(tmp_path / "index"))
    manifest = SourceManifest(
        document_id="pending-rbi-source",
        title="Synthetic pending source",
        issuing_organization="Synthetic fixture",
        canonical_url="https://rbi.org.in/source",
        applicability="Test fixture only.",
        jurisdiction="IN",
        language="en",
        source_type="official_public",
        regulatory_status="current",
        scenario_tags=[],
        publication_date=None,
        updated_date=None,
        effective_date=None,
        expiry_date=None,
        version="v1",
        content_hash="a" * 64,
        review_status="in_review",
        reviewer=None,
        approval_date=None,
    )
    (manifests / "pending.json").write_text(manifest.model_dump_json(), encoding="utf-8")

    result = build_index(root, as_of=date(2026, 11, 13))

    assert result["indexed_documents"] == []
    assert result["indexed_chunks"] == 0
    assert result["published"] is False
    assert "pending-rbi-source" in result["skipped_documents"]
    assert not (tmp_path / "index" / "CURRENT").exists()
