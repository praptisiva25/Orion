from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Sequence
from urllib.parse import urlparse

import httpx

from app.nba.rag.chunking import chunk_passages
from app.nba.rag.config import NbaRagSettings
from app.nba.rag.embedding import EmbeddingProviderError
from app.nba.rag.extraction import extract_document
from app.nba.rag.interfaces import EmbeddingProvider, VectorStore
from app.nba.schemas.documents import KnowledgeChunk
from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus, SourceManifest


class DocumentIngestionError(ValueError):
    """Safe ingestion error without document text or remote response details."""


class DocumentVersionConflict(DocumentIngestionError):
    pass


@dataclass(frozen=True)
class PreparedDocument:
    manifest: SourceManifest
    chunks: tuple[KnowledgeChunk, ...]
    duplicate: bool = False


@dataclass(frozen=True)
class IngestionResult:
    document_id: str
    document_version: str
    content_hash: str
    chunk_count: int
    indexed_count: int
    duplicate: bool
    review_status: ReviewStatus


class OfficialDocumentFetcher:
    """HTTPS-only downloader restricted to known RBI web hosts."""

    def __init__(
        self,
        *,
        maximum_bytes: int = 25_000_000,
        client: httpx.AsyncClient | None = None,
        allowed_hosts: frozenset[str] = frozenset({"rbi.org.in", "www.rbi.org.in", "m.rbi.org.in"}),
    ) -> None:
        self._maximum_bytes = maximum_bytes
        self._client = client
        self._allowed_hosts = allowed_hosts

    def _validate_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in self._allowed_hosts:
            raise DocumentIngestionError("Official source URL is outside the HTTPS host allowlist.")

    async def fetch(self, url: str) -> tuple[bytes, str, str]:
        self._validate_url(url)
        client = self._client or httpx.AsyncClient(timeout=30.0, follow_redirects=True, max_redirects=3)
        owns_client = self._client is None
        try:
            async with client.stream("GET", url, headers={"Accept": "application/pdf,text/html"}) as response:
                response.raise_for_status()
                final_url = str(response.url)
                self._validate_url(final_url)
                declared_size = response.headers.get("content-length")
                if declared_size and declared_size.isdigit() and int(declared_size) > self._maximum_bytes:
                    raise DocumentIngestionError("Official source exceeds the supported size limit.")
                body = bytearray()
                async for block in response.aiter_bytes():
                    body.extend(block)
                    if len(body) > self._maximum_bytes:
                        raise DocumentIngestionError("Official source exceeds the supported size limit.")
                if not body:
                    raise DocumentIngestionError("Official source is empty.")
                media_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
                return bytes(body), media_type, final_url
        except DocumentIngestionError:
            raise
        except (httpx.HTTPError, OSError):
            raise DocumentIngestionError("Official source could not be downloaded.") from None
        finally:
            if owns_client:
                await client.aclose()


class DocumentIngestionPipeline:
    def __init__(self, settings: NbaRagSettings | None = None) -> None:
        self._settings = settings or NbaRagSettings.from_environment()

    def prepare(
        self,
        content: bytes,
        media_type: str,
        manifest: SourceManifest,
        *,
        duplicate_hashes: set[str] | None = None,
    ) -> PreparedDocument:
        if len(content) > self._settings.maximum_document_bytes:
            raise DocumentIngestionError("Document exceeds the supported size limit.")
        digest = hashlib.sha256(content).hexdigest()
        if manifest.content_hash and manifest.content_hash.lower() != digest:
            raise DocumentIngestionError("Document content hash does not match its manifest.")

        duplicate = digest in (duplicate_hashes or set())
        normalized_manifest = manifest.model_copy(update={"content_hash": digest})
        if duplicate:
            return PreparedDocument(manifest=normalized_manifest, chunks=(), duplicate=True)

        try:
            passages = extract_document(
                content,
                media_type,
                maximum_bytes=self._settings.maximum_document_bytes,
            )
            chunks = chunk_passages(passages, normalized_manifest, self._settings)
        except Exception as exc:
            if isinstance(exc, DocumentIngestionError):
                raise
            # Extraction errors are content-free already; do not expose parser data.
            raise DocumentIngestionError("Document could not be prepared for indexing.") from None
        if not chunks:
            raise DocumentIngestionError("Document contains no extractable text.")
        return PreparedDocument(manifest=normalized_manifest, chunks=tuple(chunks))

    def index_prepared(
        self,
        prepared: PreparedDocument,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore,
        *,
        as_of: date | None = None,
    ) -> IngestionResult:
        manifest = prepared.manifest
        if prepared.duplicate:
            return IngestionResult(
                manifest.document_id, manifest.version, manifest.content_hash or "",
                0, 0, True, manifest.review_status,
            )
        if manifest.review_status != ReviewStatus.APPROVED:
            return IngestionResult(
                manifest.document_id, manifest.version, manifest.content_hash or "",
                len(prepared.chunks), 0, False, manifest.review_status,
            )
        if manifest.source_type.value == "official_public":
            if manifest.regulatory_status not in {RegulatoryStatus.CURRENT, RegulatoryStatus.CURRENT_AS_AMENDED}:
                raise DocumentIngestionError("Official source is not verified as current.")
        current_date = as_of or date.today()
        if manifest.effective_date and manifest.effective_date > current_date:
            raise DocumentIngestionError("Source is not yet effective.")
        if manifest.expiry_date and manifest.expiry_date < current_date:
            raise DocumentIngestionError("Source has expired.")

        try:
            vectors = embedding_provider.embed_documents([chunk.text for chunk in prepared.chunks])
            indexed_count = vector_store.add(prepared.chunks, vectors)
        except EmbeddingProviderError:
            raise DocumentIngestionError("Embedding model is temporarily unavailable.") from None
        except Exception:
            # No response body, chunk text, or exception from a provider/store is exposed.
            raise DocumentIngestionError("Document could not be added to the knowledge index.") from None
        return IngestionResult(
            manifest.document_id,
            manifest.version,
            manifest.content_hash or "",
            len(prepared.chunks),
            indexed_count,
            indexed_count == 0,
            manifest.review_status,
        )


class LocalDocumentRepository:
    """Persist versioned source bytes locally and safe metadata as JSON."""

    def __init__(self, documents_path: Path, manifests_path: Path) -> None:
        self._documents_path = documents_path
        self._manifests_path = manifests_path

    def save_source(self, content: bytes, media_type: str, manifest: SourceManifest) -> Path:
        digest = hashlib.sha256(content).hexdigest()
        if manifest.content_hash and manifest.content_hash.lower() != digest:
            raise DocumentIngestionError("Document content hash does not match its manifest.")
        extension = {
            "application/pdf": ".pdf",
            "text/html": ".html",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        }.get(media_type.split(";", 1)[0].lower())
        if extension is None:
            raise DocumentIngestionError("Only PDF and HTML source files can be stored.")
        target_dir = self._documents_path / manifest.document_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{manifest.version}{extension}"
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise DocumentVersionConflict("Document changed without a version update.")
            return target
        fd, temporary_name = tempfile.mkstemp(prefix=".download-", dir=target_dir)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, target)
        except Exception:
            try:
                os.unlink(temporary_name)
            except OSError:
                pass
            raise DocumentIngestionError("Source document could not be saved.") from None
        return target

    def save_manifest(self, manifest: SourceManifest) -> Path:
        self._manifests_path.mkdir(parents=True, exist_ok=True)
        safe_version = re.sub(r"[^a-zA-Z0-9._-]", "_", manifest.version)
        filename = f"{manifest.document_id}__{safe_version}.json"
        target = self._manifests_path / filename
        temporary = target.with_suffix(".json.tmp")
        if target.exists():
            try:
                existing = SourceManifest.model_validate_json(target.read_text(encoding="utf-8"))
            except Exception:
                raise DocumentIngestionError("Existing source manifest is invalid and was not replaced.") from None
            if existing.content_hash and manifest.content_hash and existing.content_hash != manifest.content_hash:
                raise DocumentVersionConflict("Document content changed without a version update.")
        try:
            temporary.write_text(
                json.dumps(manifest.model_dump(mode="json"), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            os.replace(temporary, target)
        except OSError:
            raise DocumentIngestionError("Source manifest could not be saved.") from None
        return target
