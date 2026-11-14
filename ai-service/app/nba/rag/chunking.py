from __future__ import annotations

import hashlib
from collections.abc import Sequence

from app.nba.rag.config import NbaRagSettings
from app.nba.schemas.documents import ExtractedPassage, KnowledgeChunk
from app.nba.schemas.manifest import SourceManifest


def _window_chunks(text: str, size: int, overlap: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = text.rfind(" ", start + max(1, size // 2), end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        next_start = max(start + 1, end - overlap)
        while next_start < end and text[next_start].isspace():
            next_start += 1
        start = next_start
    return chunks


def chunk_passages(
    passages: Sequence[ExtractedPassage],
    manifest: SourceManifest,
    settings: NbaRagSettings,
) -> list[KnowledgeChunk]:
    """Chunk extracted text while copying the complete source manifest locator."""
    if not manifest.content_hash:
        raise ValueError("A computed document content hash is required before chunking.")
    chunks: list[KnowledgeChunk] = []
    ordinal = 0
    for passage in passages:
        prefix = f"{passage.section_heading}\n" if passage.section_heading else ""
        source_text = (prefix + passage.text).strip()
        for body in _window_chunks(source_text, settings.chunk_size_chars, settings.chunk_overlap_chars):
            chunk_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
            stable_key = "\0".join((
                manifest.document_id,
                manifest.version,
                str(passage.page_number or ""),
                passage.section_heading or "",
                str(ordinal),
                chunk_hash,
            ))
            chunks.append(KnowledgeChunk(
                document_id=manifest.document_id,
                document_version=manifest.version,
                content_hash=manifest.content_hash,
                chunk_id=hashlib.sha256(stable_key.encode("utf-8")).hexdigest(),
                source_type=manifest.source_type,
                title=manifest.title,
                canonical_url=str(manifest.canonical_url) if manifest.canonical_url else None,
                page_number=passage.page_number,
                section_heading=passage.section_heading,
                jurisdiction=manifest.jurisdiction,
                effective_date=manifest.effective_date,
                expiry_date=manifest.expiry_date,
                review_status=manifest.review_status,
                reviewer=manifest.reviewer,
                approval_date=manifest.approval_date,
                regulatory_status=manifest.regulatory_status,
                scenario_tags=tuple(manifest.scenario_tags),
                text=body,
            ))
            ordinal += 1
    return chunks
