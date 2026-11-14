from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.nba.schemas.recommendations import NextBestActionRequest
from app.nba.schemas.rulebook import BankingSupportRule, Condition, ConditionOperator, Rulebook


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def derive_rule_fields(request: NextBestActionRequest) -> dict[str, Any]:
    customer_report = " ".join(
        [request.subject, request.description, *(message.message for message in request.messages)]
    ).casefold()
    return {
        "customer_report": customer_report,
        "debit_reported": _contains_any(customer_report, ("debited", "debit", "deducted", "deduction")),
        "unauthorized_activity_reported": _contains_any(
            customer_report,
            ("unauthorized", "not authorised", "not authorized", "did not authorize", "don't recognize", "unrecognized"),
        ),
        "account_access_issue_reported": _contains_any(
            customer_report, ("cannot access account", "can't access account", "account blocked", "account locked", "login issue")
        ),
        "kyc_issue_reported": _contains_any(customer_report, ("kyc", "identity verification", "document verification")),
        "card_issue_reported": _contains_any(customer_report, ("card", "debit card", "credit card")),
        "dispute_reported": _contains_any(customer_report, ("dispute", "do not recognize transaction", "transaction issue")),
        "escalation_requested": _contains_any(customer_report, ("escalate", "supervisor", "unresolved complaint", "higher authority")),
        "ticket_status": request.status.casefold(),
        "ticket_priority": request.priority.casefold(),
    }


def _matches(condition: Condition, fields: Mapping[str, Any]) -> bool:
    actual = fields.get(condition.field)
    if condition.operator == ConditionOperator.IS_TRUE:
        return actual is True
    if condition.operator == ConditionOperator.IS_FALSE:
        return actual is False
    if condition.operator == ConditionOperator.EQUALS:
        if isinstance(actual, str) and isinstance(condition.value, str):
            return actual.casefold() == condition.value.casefold()
        return actual == condition.value
    if condition.operator == ConditionOperator.CONTAINS_ANY:
        terms = tuple(str(value).casefold() for value in condition.value or [])
        return isinstance(actual, str) and _contains_any(actual.casefold(), terms)
    if condition.operator == ConditionOperator.CONTAINS_ALL:
        terms = tuple(str(value).casefold() for value in condition.value or [])
        return isinstance(actual, str) and all(term in actual.casefold() for term in terms)
    return False


def rule_matches(rule: BankingSupportRule, fields: Mapping[str, Any]) -> bool:
    conditions = rule.trigger_conditions
    return (
        all(_matches(condition, fields) for condition in conditions.all)
        and (not conditions.any or any(_matches(condition, fields) for condition in conditions.any))
    )


def evaluate_rules(rulebook: Rulebook, request: NextBestActionRequest) -> list[BankingSupportRule]:
    fields = derive_rule_fields(request)
    matched = [rule for rule in rulebook.rules if rule_matches(rule, fields)]
    return sorted(matched, key=lambda rule: (-rule.priority, rule.rule_id))
