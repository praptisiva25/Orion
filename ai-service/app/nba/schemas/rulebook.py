from __future__ import annotations

import re
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


_VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")


class SourceType(StrEnum):
    OFFICIAL_PUBLIC = "official_public"
    ILLUSTRATIVE_INTERNAL = "illustrative_internal"


class ConditionOperator(StrEnum):
    """Deliberately small, declarative operator set; values are never executed as code."""

    EQUALS = "equals"
    CONTAINS_ANY = "contains_any"
    CONTAINS_ALL = "contains_all"
    IS_TRUE = "is_true"
    IS_FALSE = "is_false"


class Condition(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    field: Literal[
        "customer_report",
        "debit_reported",
        "unauthorized_activity_reported",
        "account_access_issue_reported",
        "kyc_issue_reported",
        "card_issue_reported",
        "dispute_reported",
        "escalation_requested",
        "ticket_status",
        "ticket_priority",
    ]
    operator: ConditionOperator
    value: str | bool | list[str] | None = None

    @model_validator(mode="after")
    def validate_operator_value(self) -> Condition:
        if self.operator == ConditionOperator.EQUALS:
            if not isinstance(self.value, (str, bool)):
                raise ValueError("equals requires a string or boolean value")
            if isinstance(self.value, str) and not self.value:
                raise ValueError("equals requires a non-empty string value")
        elif self.operator in {ConditionOperator.CONTAINS_ANY, ConditionOperator.CONTAINS_ALL}:
            if (
                not isinstance(self.value, list)
                or not self.value
                or any(not isinstance(item, str) or not item.strip() for item in self.value)
            ):
                raise ValueError("contains operators require a non-empty list of strings")
        elif self.value is not None:
            raise ValueError("boolean operators do not accept a value")
        return self


class TriggerConditions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    all: list[Condition] = Field(default_factory=list, max_length=20)
    any: list[Condition] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def require_conditions(self) -> TriggerConditions:
        if not self.all and not self.any:
            raise ValueError("at least one trigger condition is required")
        return self


class RuleSourceReference(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source_id: str = Field(min_length=1, max_length=120)
    source_type: SourceType
    title: str = Field(min_length=1, max_length=240)
    canonical_url: HttpUrl | None = None

    @model_validator(mode="after")
    def validate_source_reference(self) -> RuleSourceReference:
        if self.source_type == SourceType.OFFICIAL_PUBLIC and self.canonical_url is None:
            raise ValueError("official_public references require a canonical HTTPS URL")
        if self.canonical_url is not None and self.canonical_url.scheme != "https":
            raise ValueError("source URLs must use HTTPS")
        return self


class AdvisoryAction(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action_code: Literal[
        "request_information",
        "review_available_details",
        "explain_current_information",
        "escalate_for_review",
        "refer_to_authorized_process",
        "record_customer_report",
    ]
    description: str = Field(min_length=1, max_length=500)
    officer_review_required: Literal[True]


class Restriction(StrEnum):
    ADVISORY_ONLY = "advisory_only"
    NO_TRANSACTION_EXECUTION = "no_transaction_execution"
    NO_UNAUTHORIZED_TRANSACTION_EXECUTION = "no_unauthorized_transaction_execution"
    NO_REFUND_OR_CREDIT = "no_refund_or_credit"
    NO_ACCOUNT_FREEZE_OR_BLOCK = "no_account_freeze_or_block"
    NO_AUTOMATIC_CUSTOMER_COMMUNICATION = "no_automatic_customer_communication"
    NO_CLAIM_OF_VERIFICATION_OR_COMPLETION = "no_claim_of_verification_or_completion"
    NO_UNSUPPORTED_TIMELINES_OR_GUARANTEES = "no_unsupported_timelines_or_guarantees"


MANDATORY_RESTRICTIONS = frozenset(Restriction)


class BankingSupportRule(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    rule_id: str = Field(pattern=r"^[a-z][a-z0-9_]{2,79}$")
    scenario: Literal[
        "failed_atm_withdrawal",
        "failed_upi_transaction",
        "unauthorized_transaction",
        "account_access_or_blocking",
        "kyc_document_verification",
        "card_related_complaint",
        "transaction_dispute",
        "complaint_escalation",
    ]
    description: str = Field(min_length=1, max_length=500)
    trigger_conditions: TriggerConditions
    required_information: list[str] = Field(min_length=1, max_length=20)
    recommended_actions: list[AdvisoryAction] = Field(min_length=1, max_length=10)
    escalation_conditions: list[str] = Field(min_length=1, max_length=20)
    restrictions: list[Restriction] = Field(min_length=1)
    priority: int = Field(ge=1, le=100)
    source_references: list[RuleSourceReference] = Field(min_length=1, max_length=20)
    version: str = Field(pattern=_VERSION_PATTERN)

    @model_validator(mode="after")
    def validate_safety_constraints(self) -> BankingSupportRule:
        if len(set(self.restrictions)) != len(self.restrictions):
            raise ValueError("restrictions must be unique")
        missing = MANDATORY_RESTRICTIONS.difference(self.restrictions)
        if missing:
            names = ", ".join(sorted(item.value for item in missing))
            raise ValueError(f"mandatory advisory restrictions are missing: {names}")
        if any(not item.strip() for item in self.required_information + self.escalation_conditions):
            raise ValueError("required information and escalation conditions must not be blank")
        return self


class Rulebook(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    version: str = Field(pattern=_VERSION_PATTERN)
    rules: list[BankingSupportRule] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_unique_rule_ids(self) -> Rulebook:
        ids = [rule.rule_id for rule in self.rules]
        if len(ids) != len(set(ids)):
            raise ValueError("rule_id values must be unique")
        return self


class RulebookLoadError(ValueError):
    """Safe validation error that never echoes the YAML input or field values."""
