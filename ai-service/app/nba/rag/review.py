from __future__ import annotations

from datetime import date

from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus, SourceManifest
from app.nba.schemas.rulebook import SourceType


class SourceReviewError(ValueError):
    """Safe validation error for explicit source approval actions."""


def is_manifest_retrieval_eligible(manifest: SourceManifest, *, as_of: date | None = None) -> bool:
    current_date = as_of or date.today()
    if manifest.review_status != ReviewStatus.APPROVED:
        return False
    if manifest.regulatory_status in {RegulatoryStatus.SUPERSEDED, RegulatoryStatus.WITHDRAWN}:
        return False
    if manifest.regulatory_status == RegulatoryStatus.UNKNOWN:
        return False
    if manifest.source_type == SourceType.OFFICIAL_PUBLIC and manifest.regulatory_status not in {
        RegulatoryStatus.CURRENT,
        RegulatoryStatus.CURRENT_AS_AMENDED,
    }:
        return False
    if manifest.effective_date and manifest.effective_date > current_date:
        return False
    if manifest.expiry_date and manifest.expiry_date < current_date:
        return False
    return bool(manifest.reviewer and manifest.approval_date and manifest.content_hash)


def approve_manifest(
    manifest: SourceManifest,
    *,
    reviewer: str,
    approval_date: date,
    reviewed_content_hash: str,
    as_of: date | None = None,
) -> SourceManifest:
    """Return an approved copy only after an explicit human review assertion.

    This helper does not approve sources on its own: the caller must supply the
    reviewer, date, and hash of the exact content they reviewed.
    """
    current_date = as_of or date.today()
    normalized_reviewer = reviewer.strip() if isinstance(reviewer, str) else ""
    if manifest.review_status == ReviewStatus.RETIRED:
        raise SourceReviewError("Retired sources cannot be approved.")
    if not normalized_reviewer:
        raise SourceReviewError("A named reviewer is required.")
    if approval_date > current_date:
        raise SourceReviewError("Approval date cannot be in the future.")
    if not manifest.content_hash or reviewed_content_hash.lower() != manifest.content_hash.lower():
        raise SourceReviewError("Approval must reference the exact manifest content hash.")
    if manifest.effective_date and manifest.effective_date > current_date:
        raise SourceReviewError("A not-yet-effective source cannot be approved for retrieval.")
    if manifest.expiry_date and manifest.expiry_date < current_date:
        raise SourceReviewError("An expired source cannot be approved for retrieval.")
    if manifest.regulatory_status == RegulatoryStatus.UNKNOWN:
        raise SourceReviewError("Unknown source status must be resolved before approval.")
    if manifest.source_type == SourceType.OFFICIAL_PUBLIC and manifest.regulatory_status not in {
        RegulatoryStatus.CURRENT,
        RegulatoryStatus.CURRENT_AS_AMENDED,
    }:
        raise SourceReviewError("An official source must be verified as current before approval.")

    values = manifest.model_dump(mode="python")
    values.update(
        review_status=ReviewStatus.APPROVED,
        reviewer=normalized_reviewer,
        approval_date=approval_date,
    )
    return SourceManifest.model_validate(values)
