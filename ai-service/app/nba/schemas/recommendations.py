from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NbaCustomerMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sender_role: Literal["customer"]
    message: str = Field(min_length=1, max_length=3000)

    @field_validator("message")
    @classmethod
    def nonblank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Customer message must not be blank.")
        return value.strip()


class LatestSentiment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Literal["positive", "neutral", "negative"]
    confidence: float = Field(ge=0.0, le=1.0)


class NextBestActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket_id: int = Field(gt=0)
    subject: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=3000)
    status: str = Field(min_length=1, max_length=30)
    priority: str = Field(min_length=1, max_length=20)
    messages: list[NbaCustomerMessage] = Field(default_factory=list, max_length=100)
    latest_sentiment: LatestSentiment | None = None

    @field_validator("subject", "description", "status", "priority")
    @classmethod
    def nonblank_fields(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Ticket context fields must not be blank.")
        return value.strip()


class NbaEvidenceReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evidence_id: str
    document_id: str
    title: str
    source_type: Literal["illustrative_internal", "official_public"]
    source_label: str
    canonical_url: str | None = None
    page_number: int | None = None
    section_heading: str | None = None
    excerpt: str = Field(min_length=1, max_length=600)


class NbaRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=3, max_length=180)
    rationale: str = Field(min_length=10, max_length=1200)
    evidence_supported_guidance: list[str] = Field(default_factory=list, max_length=8)
    additional_suggestions: list[str] = Field(default_factory=list, max_length=8)
    suggested_actions: list[str] = Field(min_length=1, max_length=8)
    missing_information: list[str] = Field(default_factory=list, max_length=8)
    escalation_conditions: list[str] = Field(default_factory=list, max_length=8)
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    evidence_references: list[NbaEvidenceReference] = Field(default_factory=list, max_length=8)
    requires_officer_review: Literal[True] = True


class NextBestActionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recommendation_mode: Literal["knowledge_backed", "general_guidance"]
    evidence_available: bool
    recommendations: list[NbaRecommendation] = Field(min_length=1, max_length=5)
    disclaimer: str | None = None
    advisory_only: Literal[True] = True

    @model_validator(mode="after")
    def validate_mode(self) -> NextBestActionResponse:
        if self.recommendation_mode == "knowledge_backed":
            if not self.evidence_available or self.disclaimer is not None:
                raise ValueError("Knowledge-backed responses require evidence and no general disclaimer.")
            if any(not item.evidence_references for item in self.recommendations):
                raise ValueError("Knowledge-backed recommendations require evidence references.")
            if any(not item.evidence_supported_guidance for item in self.recommendations):
                raise ValueError("Knowledge-backed recommendations require source-supported guidance.")
        else:
            expected = (
                "General AI guidance — These suggestions are generated using general AI knowledge. "
                "They have not been verified against Orion's internal policies or approved banking procedures."
            )
            if self.evidence_available or self.disclaimer != expected:
                raise ValueError("General guidance requires the mandatory disclaimer and no evidence.")
            if any(item.evidence_references for item in self.recommendations):
                raise ValueError("General guidance cannot include evidence references.")
            if any(item.evidence_supported_guidance for item in self.recommendations):
                raise ValueError("General guidance cannot claim source support.")
        return self
