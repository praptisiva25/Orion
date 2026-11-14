from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from app.nba.rag.config import NbaRagSettings  # noqa: E402
from app.nba.rag.embedding import BgeSmallEmbeddingProvider  # noqa: E402
from app.nba.rag.ingestion import DocumentIngestionError, DocumentIngestionPipeline  # noqa: E402
from app.nba.rag.review import is_manifest_retrieval_eligible  # noqa: E402
from app.nba.rag.faiss_store import FAISS_INDEX_FORMAT_VERSION  # noqa: E402
from app.nba.schemas.manifest import SourceManifest  # noqa: E402


def _source_file(manifest: SourceManifest, documents_root: Path) -> Path | None:
    directory = documents_root / manifest.document_id
    candidates = [directory / f"{manifest.version}{suffix}" for suffix in (".pdf", ".html", ".docx")]
    return next((candidate for candidate in candidates if candidate.is_file()), None)


def build_index(service_root: Path = SERVICE_ROOT, *, as_of: date | None = None) -> dict[str, object]:
    current_date = as_of or date.today()
    manifests_root = service_root / "knowledge_base" / "manifests"
    documents_root = service_root / "knowledge_base" / "documents"
    settings = NbaRagSettings.from_environment()
    pipeline = DocumentIngestionPipeline(settings)
    prepared_chunks = []
    approved_documents: list[str] = []
    skipped_documents: list[str] = []
    seen_hashes: set[str] = set()

    # Prepare every eligible source before touching the index pointer. An error
    # aborts the operation and leaves any currently published generation intact.
    for manifest_path in sorted(manifests_root.glob("*.json")):
        try:
            manifest = SourceManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            raise RuntimeError("A source manifest is invalid; index rebuild aborted.") from None
        if not is_manifest_retrieval_eligible(manifest, as_of=current_date):
            skipped_documents.append(manifest.document_id)
            continue
        source_path = _source_file(manifest, documents_root)
        if source_path is None:
            raise RuntimeError("An approved source file is missing; index rebuild aborted.")
        media_type = {
            ".pdf": "application/pdf",
            ".html": "text/html",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }[source_path.suffix.lower()]
        try:
            prepared = pipeline.prepare(
                source_path.read_bytes(),
                media_type,
                manifest,
                duplicate_hashes=seen_hashes,
            )
        except DocumentIngestionError:
            raise RuntimeError("An approved source could not be validated; index rebuild aborted.") from None
        if prepared.duplicate:
            skipped_documents.append(manifest.document_id)
            continue
        seen_hashes.add(prepared.manifest.content_hash or "")
        if not prepared.chunks:
            raise RuntimeError("An approved source produced no chunks; index rebuild aborted.")
        prepared_chunks.extend(prepared.chunks)
        approved_documents.append(manifest.document_id)

    # Never publish an empty index: that could erase a previously valid one.
    if not prepared_chunks:
        return {
            "indexed_documents": [],
            "indexed_chunks": 0,
            "skipped_documents": skipped_documents,
            "published": False,
            "reason": "No eligible approved local documents; existing index was not changed.",
        }

    provider = BgeSmallEmbeddingProvider(settings)
    try:
        vectors = provider.embed_documents([chunk.text for chunk in prepared_chunks])
    except Exception:
        raise RuntimeError("Embedding generation failed; existing index was not changed.") from None

    from app.nba.rag.faiss_store import FaissVectorStore

    store = FaissVectorStore(
        settings=settings,
        model_id=provider.model_id,
        model_version=provider.model_version,
        as_of=current_date,
    )
    try:
        indexed_count = store.rebuild(prepared_chunks, vectors)
    except Exception:
        raise RuntimeError("FAISS rebuild failed; existing index was not changed.") from None
    return {
        "indexed_documents": approved_documents,
        "indexed_chunks": indexed_count,
        "skipped_documents": skipped_documents,
        "model_id": provider.model_id,
        "model_version": provider.model_version,
        "dimension": settings.embedding_dimension,
        "index_type": "IndexIDMap2(IndexFlatIP)",
        "index_format_version": FAISS_INDEX_FORMAT_VERSION,
        "published": True,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(build_index(), ensure_ascii=False, separators=(",", ":")))
    except Exception as error:
        # Exception text from parsers, models and storage is intentionally not emitted.
        print(json.dumps({"published": False, "error": str(error)}, separators=(",", ":")), file=sys.stderr)
        raise SystemExit(1) from None
