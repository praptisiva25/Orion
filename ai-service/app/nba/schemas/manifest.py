from __future__ import annotations

from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from app.nba.schemas.rulebook import SourceType


class ReviewStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    RETIRED = "retired"


class RegulatoryStatus(StrEnum):
    CURRENT = "current"
    CURRENT_AS_AMENDED = "current_as_amended"
    SUPERSEDED = "superseded"
    WITHDRAWN = "withdrawn"
    UNKNOWN = "unknown"
    NOT_APPLICABLE = "not_applicable"


class SourceManifest(BaseModel):
    """Metadata for a source document; it does not itself approve or ingest content."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    document_id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{1,119}$")
    title: str = Field(min_length=1, max_length=300)
    issuing_organization: str = Field(min_length=1, max_length=200)
    canonical_url: HttpUrl | None
    applicability: str = Field(min_length=1, max_length=1000)
    jurisdiction: str = Field(min_length=1, max_length=100)
    language: str = Field(min_length=2, max_length=35)
    source_type: SourceType
    regulatory_status: RegulatoryStatus = RegulatoryStatus.UNKNOWN
    scenario_tags: list[str] = Field(default_factory=list, max_length=20)
    publication_date: date | None
    updated_date: date | None = None
    effective_date: date | None
    expiry_date: date | None
    version: str = Field(min_length=1, max_length=80)
    content_hash: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    review_status: ReviewStatus
    approval_scope: str | None = Field(default=None, max_length=500)
    reviewer: str | None = Field(max_length=200)
    approval_date: date | None

    @model_validator(mode="after")
    def validate_source_lifecycle(self) -> SourceManifest:
        if self.canonical_url is not None and self.canonical_url.scheme != "https":
            raise ValueError("canonical_url must use HTTPS")
        if self.source_type == SourceType.OFFICIAL_PUBLIC and self.canonical_url is None:
            raise ValueError("official_public sources require a canonical HTTPS URL")
        if self.source_type == SourceType.OFFICIAL_PUBLIC and self.regulatory_status == RegulatoryStatus.NOT_APPLICABLE:
            raise ValueError("official_public sources require a verified regulatory status")
        if self.effective_date and self.expiry_date and self.expiry_date < self.effective_date:
            raise ValueError("expiry_date must be on or after effective_date")
        if self.review_status == ReviewStatus.APPROVED:
            if not self.reviewer or not self.approval_date:
                raise ValueError("approved sources require reviewer and approval_date")
            if not self.content_hash:
                raise ValueError("approved sources require a content_hash")
            if self.source_type == SourceType.OFFICIAL_PUBLIC and self.canonical_url is None:
                raise ValueError("official_public sources require a canonical HTTPS URL")
            if (
                self.source_type == SourceType.OFFICIAL_PUBLIC
                and self.regulatory_status not in {RegulatoryStatus.CURRENT, RegulatoryStatus.CURRENT_AS_AMENDED}
            ):
                raise ValueError("approved official sources must be verified as current")
        elif self.approval_date is not None:
            raise ValueError("approval_date is only allowed for approved sources")
        return self
