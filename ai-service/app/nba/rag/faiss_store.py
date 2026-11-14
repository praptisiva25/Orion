from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import uuid
from datetime import date
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from app.nba.rag.config import NbaRagSettings
from app.nba.schemas.documents import KnowledgeChunk, RetrievedPassage
from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus
from app.nba.schemas.rulebook import SourceType


FAISS_INDEX_FORMAT_VERSION = 1
_FORMAT_VERSION = FAISS_INDEX_FORMAT_VERSION
_GENERATION_PATTERN = re.compile(r"^[0-9a-f]{32}$")


class VectorStoreError(RuntimeError):
    """Safe base error for local vector-store operations."""


class VectorStoreCompatibilityError(VectorStoreError):
    pass


class VectorStoreIntegrityError(VectorStoreError):
    pass


class DocumentVersionConflictError(VectorStoreError):
    pass


class FaissVectorStore:
    """Exact cosine search via normalized vectors and IndexIDMap2(IndexFlatIP).

    A generation directory contains the FAISS index and JSON metadata together.
    The CURRENT pointer is atomically replaced only after both are durable, so a
    crash cannot publish a new index with old/missing source metadata.
    """

    def __init__(
        self,
        index_path: Path | None = None,
        *,
        settings: NbaRagSettings | None = None,
        model_id: str | None = None,
        model_version: str | None = None,
        as_of: date | None = None,
    ) -> None:
        self._settings = settings or NbaRagSettings.from_environment()
        self._root = index_path or self._settings.faiss_index_path
        self._model_id = model_id or self._settings.embedding_model
        self._model_version = model_version or self._settings.embedding_revision
        self._dimension = self._settings.embedding_dimension
        self._as_of = as_of or date.today()
        self._faiss: Any | None = None
        self._index: Any | None = None
        self._records: dict[int, KnowledgeChunk] = {}
        self._next_id = 0
        self._loaded = False

    def _load_faiss(self) -> Any:
        if self._faiss is None:
            try:
                import faiss
            except Exception:
                raise VectorStoreError("FAISS is unavailable in this environment.") from None
            self._faiss = faiss
        return self._faiss

    @property
    def has_published_index(self) -> bool:
        return (self._root / "CURRENT").is_file()

    def _empty_index(self) -> Any:
        faiss = self._load_faiss()
        return faiss.IndexIDMap2(faiss.IndexFlatIP(self._dimension))

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        current_path = self._root / "CURRENT"
        if not current_path.exists():
            self._index = self._empty_index()
            return

        try:
            generation = current_path.read_text(encoding="ascii").strip()
            if not _GENERATION_PATTERN.fullmatch(generation):
                raise ValueError("Invalid generation marker")
            directory = self._root / "generations" / generation
            index_path = directory / "index.faiss"
            metadata_path = directory / "metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if metadata.get("format_version") != _FORMAT_VERSION:
                raise VectorStoreCompatibilityError("FAISS metadata format is unsupported.")
            if metadata.get("model_id") != self._model_id or metadata.get("model_version") != self._model_version:
                raise VectorStoreCompatibilityError("FAISS index uses a different embedding model revision.")
            if metadata.get("dimension") != self._dimension:
                raise VectorStoreCompatibilityError("FAISS index embedding dimension is incompatible.")

            index = self._load_faiss().read_index(str(index_path))
            if index.d != self._dimension:
                raise VectorStoreCompatibilityError("FAISS index embedding dimension is incompatible.")
            record_map: dict[int, KnowledgeChunk] = {}
            for item in metadata.get("records", []):
                vector_id = int(item["vector_id"])
                if vector_id in record_map:
                    raise ValueError("Duplicate vector metadata")
                record_map[vector_id] = KnowledgeChunk.model_validate(item["chunk"])
            ids = set(int(item) for item in self._load_faiss().vector_to_array(index.id_map).tolist())
            if ids != set(record_map) or index.ntotal != len(record_map):
                raise VectorStoreIntegrityError("FAISS index and metadata are not synchronized.")

            self._index = index
            self._records = record_map
            self._next_id = max(record_map, default=-1) + 1
        except VectorStoreError:
            self._loaded = False
            raise
        except Exception:
            self._loaded = False
            raise VectorStoreIntegrityError("FAISS index could not be loaded safely.") from None

    def _validate_vectors(self, vectors: Sequence[Sequence[float]], count: int) -> np.ndarray:
        if len(vectors) != count:
            raise VectorStoreIntegrityError("Chunk and vector counts do not match.")
        try:
            matrix = np.asarray(vectors, dtype=np.float32)
        except (TypeError, ValueError):
            raise VectorStoreIntegrityError("Embedding vectors are invalid.") from None
        if count == 0:
            return np.empty((0, self._dimension), dtype=np.float32)
        if matrix.shape != (count, self._dimension) or not np.isfinite(matrix).all():
            raise VectorStoreCompatibilityError("Embedding dimensions do not match the FAISS index.")
        if count:
            norms = np.linalg.norm(matrix, axis=1)
            if np.any(norms <= 0) or not np.allclose(norms, 1.0, atol=1e-3):
                raise VectorStoreIntegrityError("FAISS vectors must be normalized before insertion.")
        return np.ascontiguousarray(matrix, dtype=np.float32)

    def _validate_chunks(self, chunks: Sequence[KnowledgeChunk]) -> None:
        for chunk in chunks:
            if chunk.review_status != ReviewStatus.APPROVED:
                raise VectorStoreIntegrityError("Only approved documents can be indexed.")
            if chunk.regulatory_status == RegulatoryStatus.UNKNOWN:
                raise VectorStoreIntegrityError("Unknown source status cannot be indexed.")
            if not chunk.reviewer or not chunk.approval_date:
                raise VectorStoreIntegrityError("Approved documents require reviewer and approval date metadata.")
            if chunk.approval_date > self._as_of:
                raise VectorStoreIntegrityError("Future-dated approvals cannot be indexed.")
            if chunk.regulatory_status in {RegulatoryStatus.WITHDRAWN, RegulatoryStatus.SUPERSEDED}:
                raise VectorStoreIntegrityError("Withdrawn or superseded documents cannot be indexed.")
            if (
                chunk.source_type == SourceType.OFFICIAL_PUBLIC
                and chunk.regulatory_status not in {RegulatoryStatus.CURRENT, RegulatoryStatus.CURRENT_AS_AMENDED}
            ):
                raise VectorStoreIntegrityError("Official document status must be verified before indexing.")
            if chunk.effective_date and chunk.effective_date > self._as_of:
                raise VectorStoreIntegrityError("Not-yet-effective documents cannot be indexed.")
            if chunk.expiry_date and chunk.expiry_date < self._as_of:
                raise VectorStoreIntegrityError("Expired documents cannot be indexed.")

    @staticmethod
    def _chunk_key(chunk: KnowledgeChunk) -> tuple[str, str, str]:
        return chunk.document_id, chunk.document_version, chunk.chunk_id

    def _check_document_versions(self, chunks: Sequence[KnowledgeChunk]) -> None:
        hashes_by_version: dict[tuple[str, str], str] = {}
        for existing in self._records.values():
            hashes_by_version[(existing.document_id, existing.document_version)] = existing.content_hash
        for chunk in chunks:
            key = (chunk.document_id, chunk.document_version)
            previous_hash = hashes_by_version.get(key)
            if previous_hash is not None and previous_hash != chunk.content_hash:
                raise DocumentVersionConflictError("Document content changed without a version update.")
            hashes_by_version[key] = chunk.content_hash

    def _publish_generation(self, index: Any, records: dict[int, KnowledgeChunk]) -> None:
        generation = uuid.uuid4().hex
        generations_dir = self._root / "generations"
        generations_dir.mkdir(parents=True, exist_ok=True)
        temp_dir = Path(tempfile.mkdtemp(prefix=".pending-", dir=generations_dir))
        final_dir = generations_dir / generation
        try:
            self._load_faiss().write_index(index, str(temp_dir / "index.faiss"))
            metadata = {
                "format_version": _FORMAT_VERSION,
                "model_id": self._model_id,
                "model_version": self._model_version,
                "dimension": self._dimension,
                "similarity_metric": "cosine_similarity_normalized_inner_product",
                "records": [
                    {"vector_id": vector_id, "chunk": chunk.model_dump(mode="json")}
                    for vector_id, chunk in sorted(records.items())
                ],
            }
            metadata_tmp = temp_dir / "metadata.json.tmp"
            with metadata_tmp.open("w", encoding="utf-8", newline="\n") as handle:
                json.dump(metadata, handle, ensure_ascii=False, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            metadata_tmp.replace(temp_dir / "metadata.json")
            temp_dir.replace(final_dir)

            current_tmp = self._root / f"CURRENT.{uuid.uuid4().hex}.tmp"
            with current_tmp.open("w", encoding="ascii", newline="\n") as handle:
                handle.write(generation)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(current_tmp, self._root / "CURRENT")
        except Exception:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise VectorStoreError("FAISS index generation could not be persisted.") from None

    def add(self, chunks: Sequence[KnowledgeChunk], vectors: Sequence[Sequence[float]]) -> int:
        self._ensure_loaded()
        if not chunks:
            return 0
        self._validate_chunks(chunks)
        matrix = self._validate_vectors(vectors, len(chunks))
        self._check_document_versions(chunks)

        existing_keys = {self._chunk_key(chunk) for chunk in self._records.values()}
        new_items = [(chunk, matrix[index]) for index, chunk in enumerate(chunks)
                     if self._chunk_key(chunk) not in existing_keys]
        if not new_items:
            return 0
        if len({self._chunk_key(chunk) for chunk, _ in new_items}) != len(new_items):
            raise VectorStoreIntegrityError("Duplicate chunks were supplied in one batch.")

        new_index = self._load_faiss().clone_index(self._index)
        new_records = dict(self._records)
        ids: list[int] = []
        for chunk, _ in new_items:
            ids.append(self._next_id + len(ids))
        new_matrix = np.ascontiguousarray(np.stack([vector for _, vector in new_items]), dtype=np.float32)
        new_index.add_with_ids(new_matrix, np.asarray(ids, dtype=np.int64))
        for vector_id, (chunk, _) in zip(ids, new_items, strict=True):
            new_records[vector_id] = chunk
        self._publish_generation(new_index, new_records)
        self._index, self._records = new_index, new_records
        self._next_id += len(ids)
        return len(ids)

    def rebuild(self, chunks: Sequence[KnowledgeChunk], vectors: Sequence[Sequence[float]]) -> int:
        self._validate_chunks(chunks)
        matrix = self._validate_vectors(vectors, len(chunks))
        if len({self._chunk_key(chunk) for chunk in chunks}) != len(chunks):
            raise VectorStoreIntegrityError("Rebuild input contains duplicate chunks.")
        seen_versions: dict[tuple[str, str], str] = {}
        for chunk in chunks:
            key = (chunk.document_id, chunk.document_version)
            old_hash = seen_versions.get(key)
            if old_hash and old_hash != chunk.content_hash:
                raise DocumentVersionConflictError("Document content changed without a version update.")
            seen_versions[key] = chunk.content_hash

        new_index = self._empty_index()
        new_records: dict[int, KnowledgeChunk] = {}
        if chunks:
            ids = np.arange(len(chunks), dtype=np.int64)
            new_index.add_with_ids(matrix, ids)
            new_records = {index: chunk for index, chunk in enumerate(chunks)}
        self._publish_generation(new_index, new_records)
        self._index, self._records = new_index, new_records
        self._next_id = len(chunks)
        self._loaded = True
        return len(chunks)

    def search(
        self,
        query_vector: Sequence[float],
        *,
        top_k: int,
        source_type: SourceType | None = None,
        scenario: str | None = None,
    ) -> list[RetrievedPassage]:
        self._ensure_loaded()
        if top_k <= 0 or self._index.ntotal == 0:
            return []
        query = self._validate_vectors([query_vector], 1)
        scores, ids = self._index.search(query, self._index.ntotal)
        results: list[RetrievedPassage] = []
        for score, vector_id in zip(scores[0], ids[0], strict=True):
            if vector_id < 0:
                continue
            chunk = self._records.get(int(vector_id))
            if chunk is None:
                # Missing metadata is never emitted as a citation.
                continue
            if not self._is_retrievable(chunk):
                continue
            if source_type is not None and chunk.source_type != source_type:
                continue
            if scenario is not None and scenario not in chunk.scenario_tags:
                continue
            results.append(RetrievedPassage(text=chunk.text, score=float(score), source=chunk))
            if len(results) >= top_k:
                break
        return results

    def _is_retrievable(self, chunk: KnowledgeChunk) -> bool:
        if chunk.review_status != ReviewStatus.APPROVED:
            return False
        if chunk.regulatory_status == RegulatoryStatus.UNKNOWN:
            return False
        if not chunk.reviewer or not chunk.approval_date or chunk.approval_date > self._as_of:
            return False
        if chunk.regulatory_status in {RegulatoryStatus.WITHDRAWN, RegulatoryStatus.SUPERSEDED}:
            return False
        if chunk.effective_date and chunk.effective_date > self._as_of:
            return False
        if chunk.expiry_date and chunk.expiry_date < self._as_of:
            return False
        if (
            chunk.source_type == SourceType.OFFICIAL_PUBLIC
            and chunk.regulatory_status not in {RegulatoryStatus.CURRENT, RegulatoryStatus.CURRENT_AS_AMENDED}
        ):
            return False
        return True
