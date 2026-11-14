from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus
from app.nba.schemas.rulebook import SourceType


class ExtractedPassage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    text: str = Field(min_length=1)
    page_number: int | None = Field(default=None, ge=1)
    section_heading: str | None = None
    paragraph: str | None = None


class KnowledgeChunk(BaseModel):
    """Persisted passage and provenance; retrieval must cite this stored metadata."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    document_id: str
    document_version: str
    content_hash: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    chunk_id: str
    source_type: SourceType
    title: str
    canonical_url: str | None
    page_number: int | None
    section_heading: str | None
    jurisdiction: str
    effective_date: date | None
    expiry_date: date | None
    review_status: ReviewStatus
    reviewer: str | None = None
    approval_date: date | None = None
    regulatory_status: RegulatoryStatus
    scenario_tags: tuple[str, ...] = ()
    text: str = Field(min_length=1)


class RetrievedPassage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    text: str
    score: float = Field(ge=-1.0, le=1.0)
    source: KnowledgeChunk
