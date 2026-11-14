from __future__ import annotations

import asyncio
import hashlib
from datetime import date

import pytest
from pydantic import ValidationError

from app.nba.schemas.documents import KnowledgeChunk, RetrievedPassage
from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus
from app.nba.schemas.recommendations import NextBestActionRequest
from app.nba.schemas.rulebook import SourceType
from app.nba.services.recommendation_service import (
    GENERAL_GUIDANCE_DISCLAIMER,
    NextBestActionService,
    _parse_result,
    _safe_recommendation,
    _validated_response,
)
from app.providers.base import ProviderError


def _request(**updates) -> NextBestActionRequest:
    values = {
        "ticket_id": 42,
        "subject": "ATM cash was not dispensed",
        "description": "The customer reports that their account was debited but no cash was dispensed.",
        "status": "Open",
        "priority": "Normal",
        "messages": [{"sender_role": "customer", "message": "Please review the ATM withdrawal."}],
        "latest_sentiment": {"label": "neutral", "confidence": 0.7},
    }
    values.update(updates)
    return NextBestActionRequest.model_validate(values)


class FakeProvider:
    def __init__(self, *results: str) -> None:
        self.results = list(results)
        self.calls: list[tuple[str, str]] = []

    async def generate(self, *, system_prompt: str, user_prompt: str, max_tokens: int | None = None, reasoning_effort: str | None = None, json_mode: bool = False) -> str:
        self.calls.append((system_prompt, user_prompt))
        assert max_tokens == 2400
        assert reasoning_effort == "low"
        assert json_mode is True

        if not self.results:
            raise AssertionError("unexpected provider call")
        return self.results.pop(0)

    async def close(self) -> None:
        return None


class FakeRetriever:
    def __init__(self, passages: list[RetrievedPassage] | None = None, status: str = "no_matching_evidence") -> None:
        self.passages = passages or []
        self.status = status
        self.queries: list[str] = []

    @property
    def has_published_index(self) -> bool:
        return bool(self.passages)

    def retrieve_with_status(self, query: str, *, top_k: int | None = None, **kwargs):
        self.queries.append(query)
        return self.passages[:top_k], self.status


def _passage() -> RetrievedPassage:
    content = "Synthetic demo handbook passage: record customer-reported ATM details and review the authorized support record."
    chunk = KnowledgeChunk(
        document_id="orion-demo-bank-policy-v1",
        document_version="1.0",
        content_hash=hashlib.sha256(content.encode()).hexdigest(),
        chunk_id="chunk-001",
        source_type=SourceType.ILLUSTRATIVE_INTERNAL,
        title="Orion Demo Bank Internal Handbook",
        canonical_url=None,
        page_number=3,
        section_heading="ATM support",
        jurisdiction="Fictional demonstration environment",
        effective_date=date(2026, 11, 1),
        expiry_date=None,
        review_status=ReviewStatus.APPROVED,
        reviewer="test reviewer",
        approval_date=date.today(),
        regulatory_status=RegulatoryStatus.NOT_APPLICABLE,
        scenario_tags=(),
        text=content,
    )
    return RetrievedPassage(text=content, score=0.89, source=chunk)


def _generated(*, evidence_ids: list[str] | None = None, sufficient: bool = True) -> str:
    import json
    return json.dumps({
        "evidence_sufficient": sufficient,
        "recommendations": [{
            "title": "Review the reported ATM withdrawal",
            "rationale": "The customer reports a debit without cash being dispensed; this passage supports recording the report for review.",
            "evidence_supported_guidance": ["The handbook passage says to record the report for review." ] if evidence_ids else [],
            "additional_suggestions": [],
            "suggested_actions": ["Compare the reported time and amount with the authorized transaction support record."],
            "missing_information": ["Approximate transaction time"],
            "escalation_conditions": ["Escalate if the customer reports an unrecognized transaction."],
            "priority": "normal",
            "evidence_ids": evidence_ids or [],
        }],
    })


def test_officer_messages_are_rejected_at_request_boundary() -> None:
    with pytest.raises(ValidationError):
        _request(messages=[{"sender_role": "officer", "message": "internal-only"}])


def test_relevant_evidence_returns_knowledge_backed_with_actual_source_locator() -> None:
    passage = _passage()
    provider = FakeProvider(_generated(evidence_ids=["orion-demo-bank-policy-v1:chunk-001"]))
    service = NextBestActionService(provider, retriever=FakeRetriever([passage], "evidence_available"))

    result = asyncio.run(service.generate(_request()))

    assert result.recommendation_mode == "knowledge_backed"
    assert result.evidence_available is True
    recommendation = result.recommendations[0]
    reference = recommendation.evidence_references[0]
    assert reference.title == "Orion Demo Bank Internal Handbook"
    assert reference.page_number == 3
    assert reference.section_heading == "ATM support"
    assert reference.source_label == "Illustrative Orion Demo Guidance"
    assert result.disclaimer is None


def test_no_retrieval_calls_groq_for_general_guidance_and_exact_disclaimer() -> None:
    provider = FakeProvider(_generated())
    result = asyncio.run(NextBestActionService(provider, retriever=FakeRetriever()).generate(_request()))

    assert result.recommendation_mode == "general_guidance"
    assert result.evidence_available is False
    assert result.disclaimer == GENERAL_GUIDANCE_DISCLAIMER
    assert result.recommendations[0].evidence_references == []
    assert len(provider.calls) == 1


def test_insufficient_retrieved_evidence_falls_back_to_general_guidance() -> None:
    provider = FakeProvider(
        _generated(sufficient=False),
        _generated(),
    )
    result = asyncio.run(NextBestActionService(
        provider,
        retriever=FakeRetriever([_passage()], "evidence_available"),
    ).generate(_request()))

    assert result.recommendation_mode == "general_guidance"
    assert result.recommendations[0].evidence_references == []
    assert len(provider.calls) == 2
    assert '"retrieved_evidence":[]' in provider.calls[1][1]


def test_fabricated_or_unretrieved_citations_are_rejected() -> None:
    provider = FakeProvider(_generated(evidence_ids=["not-retrieved:invented-chunk"]))
    service = NextBestActionService(provider, retriever=FakeRetriever([_passage()], "evidence_available"))

    with pytest.raises(ProviderError, match="invalid evidence reference"):
        asyncio.run(service.generate(_request()))


def test_evidence_backed_recommendation_without_citation_falls_back() -> None:
    provider = FakeProvider(_generated(), _generated())
    result = asyncio.run(NextBestActionService(
        provider,
        retriever=FakeRetriever([_passage()], "evidence_available"),
    ).generate(_request()))
    assert result.recommendation_mode == "general_guidance"
    assert result.disclaimer == GENERAL_GUIDANCE_DISCLAIMER


@pytest.mark.parametrize("unsafe", [
    "Issue a refund immediately.",
    "Freeze the account now.",
    "RBI requires resolution within 24 hours.",
])
def test_unsafe_or_unsupported_model_output_is_rejected(unsafe: str) -> None:
    import json
    value = {
        "evidence_sufficient": False,
        "recommendations": [{
            "title": "Review the reported problem",
            "rationale": "This recommendation concerns the customer report and its review.",
            "suggested_actions": [unsafe],
            "missing_information": [], "escalation_conditions": [], "priority": None, "evidence_ids": [],
        }],
    }
    provider = FakeProvider(json.dumps(value))
    with pytest.raises(ProviderError, match="unsafe recommendation"):
        asyncio.run(NextBestActionService(provider, retriever=FakeRetriever()).generate(_request()))


def test_malformed_groq_response_fails_safely() -> None:
    provider = FakeProvider("not-json")
    with pytest.raises(ProviderError, match="invalid recommendation"):
        asyncio.run(NextBestActionService(provider, retriever=FakeRetriever()).generate(_request()))


@pytest.mark.parametrize(("raw", "category"), [
    ('{"evidence_sufficient":true,"recommendations":[{"title":7}]}', "invalid_field_type"),
    ('{"evidence_sufficient":true,"recommendations":[{"title":"Review ticket"}]}', "missing_required_field"),
    ('{"evidence_sufficient":false,"recommendations":[{"title":"Review ATM report","rationale":"The reported issue needs review by an Officer.","evidence_supported_guidance":[],"additional_suggestions":[],"suggested_actions":null,"missing_information":[],"escalation_conditions":[],"priority":null,"evidence_ids":[]}]}', "invalid_field_type"),
    ('{"evidence_sufficient":true,"recommendations":[{"title":"Review ATM report","rationale":"The reported issue needs review by an Officer.","evidence_supported_guidance":[],"additional_suggestions":[],"suggested_actions":["Review transaction details."],"missing_information":[],"escalation_conditions":[],"priority":"medium","evidence_ids":[]}]}', "invalid_enum"),
    ("{broken json", "json_parsing_failure"),
])
def test_structured_response_validation_logs_category_only(
    raw: str,
    category: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with pytest.raises(ProviderError):
        _parse_result(raw)
    assert f"category={category}" in caplog.text
    assert raw not in caplog.text


def test_validation_diagnostic_names_safe_field_and_expected_type(caplog: pytest.LogCaptureFixture) -> None:
    raw = '{"evidence_sufficient":false,"recommendations":[{"title":"Review ATM report","rationale":"The reported issue needs review by an Officer.","evidence_supported_guidance":[],"additional_suggestions":[],"suggested_actions":null,"missing_information":[],"escalation_conditions":[],"priority":null,"evidence_ids":[]}]}'
    with pytest.raises(ProviderError):
        _parse_result(raw)
    assert "recommendations[0].suggested_actions:expected_list" in caplog.text
    assert "null" not in caplog.text


def test_groq_prompt_states_exact_priority_enum() -> None:
    provider = FakeProvider(_generated())
    asyncio.run(NextBestActionService(provider, retriever=FakeRetriever()).generate(_request()))
    prompt = provider.calls[0][0]
    assert "low, normal, high, urgent, or null" in prompt


def test_unknown_evidence_id_logs_specific_category_without_identifier(caplog: pytest.LogCaptureFixture) -> None:
    import json
    raw = json.loads(_generated(evidence_ids=["private-unknown-document:private-chunk"]))
    item = _parse_result(json.dumps(raw)).recommendations[0]

    with pytest.raises(ProviderError, match="invalid evidence reference"):
        _safe_recommendation(item, {})

    assert "category=unknown_evidence_reference" in caplog.text
    assert "private-unknown-document" not in caplog.text
    assert "private-chunk" not in caplog.text


def test_general_mode_final_validation_identifies_disclaimer_failure(caplog: pytest.LogCaptureFixture) -> None:
    with pytest.raises(ProviderError, match="invalid recommendation"):
        _validated_response(
            recommendation_mode="general_guidance",
            evidence_available=False,
            recommendations=[],
            disclaimer="wrong disclaimer marker",
        )

    assert "category=mandatory_disclaimer_mismatch" in caplog.text
    assert "wrong disclaimer marker" not in caplog.text


def test_ticket_text_is_redacted_before_embedding_query_and_groq() -> None:
    provider = FakeProvider(_generated())
    retriever = FakeRetriever()
    request = _request(description="ATM report with PAN ABCDE1234F")
    asyncio.run(NextBestActionService(provider, retriever=retriever).generate(request))
    assert "ABCDE1234F" not in retriever.queries[0]
    assert "ABCDE1234F" not in provider.calls[0][1]
