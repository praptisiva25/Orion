from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import yaml
import pytest

from app.nba.rules.loader import DEFAULT_RULEBOOK_PATH, load_rulebook, validate_rulebook_data
from app.nba.schemas.rulebook import RulebookLoadError, SourceType


def _rulebook_data() -> dict:
    return yaml.safe_load(DEFAULT_RULEBOOK_PATH.read_text(encoding="utf-8"))


def test_valid_rulebook_loads_all_initial_scenarios() -> None:
    rulebook = load_rulebook()

    assert rulebook.version == "1.0.0"
    assert len(rulebook.rules) == 8
    assert {rule.scenario for rule in rulebook.rules} == {
        "failed_atm_withdrawal",
        "failed_upi_transaction",
        "unauthorized_transaction",
        "account_access_or_blocking",
        "kyc_document_verification",
        "card_related_complaint",
        "transaction_dispute",
        "complaint_escalation",
    }
    assert all(
        reference.source_type == SourceType.ILLUSTRATIVE_INTERNAL
        for rule in rulebook.rules
        for reference in rule.source_references
    )


def test_duplicate_rule_ids_are_rejected() -> None:
    data = _rulebook_data()
    data["rules"][1]["rule_id"] = data["rules"][0]["rule_id"]

    with pytest.raises(RulebookLoadError, match="rule_id values must be unique"):
        validate_rulebook_data(data)


def test_unsupported_condition_operator_is_rejected() -> None:
    data = _rulebook_data()
    data["rules"][0]["trigger_conditions"]["any"][0]["operator"] = "exec_python"

    with pytest.raises(RulebookLoadError, match="operator"):
        validate_rulebook_data(data)


def test_missing_required_rule_field_is_rejected() -> None:
    data = _rulebook_data()
    del data["rules"][0]["required_information"]

    with pytest.raises(RulebookLoadError, match="required_information"):
        validate_rulebook_data(data)


@pytest.mark.parametrize("priority", [0, 101, -1])
def test_out_of_range_priorities_are_rejected(priority: int) -> None:
    data = _rulebook_data()
    data["rules"][0]["priority"] = priority

    with pytest.raises(RulebookLoadError, match="priority"):
        validate_rulebook_data(data)


def test_invalid_rule_version_is_rejected() -> None:
    data = _rulebook_data()
    data["rules"][0]["version"] = "latest"

    with pytest.raises(RulebookLoadError, match="version"):
        validate_rulebook_data(data)


def test_prohibited_action_code_is_rejected() -> None:
    data = _rulebook_data()
    data["rules"][0]["recommended_actions"][0]["action_code"] = "issue_refund"

    with pytest.raises(RulebookLoadError, match="action_code"):
        validate_rulebook_data(data)


def test_actions_must_require_officer_review() -> None:
    data = _rulebook_data()
    data["rules"][0]["recommended_actions"][0]["officer_review_required"] = False

    with pytest.raises(RulebookLoadError, match="officer_review_required"):
        validate_rulebook_data(data)


def test_rules_must_include_all_mandatory_safety_restrictions() -> None:
    data = _rulebook_data()
    data["rules"][0]["restrictions"].remove("no_refund_or_credit")

    with pytest.raises(RulebookLoadError, match="no_refund_or_credit"):
        validate_rulebook_data(data)


def test_official_rule_reference_requires_https_source_url() -> None:
    data = _rulebook_data()
    data["rules"][0]["source_references"][0] = {
        "source_id": "official-source",
        "source_type": "official_public",
        "title": "Unverified official source",
        "canonical_url": "http://example.com/policy",
    }

    with pytest.raises(RulebookLoadError, match="canonical_url|HTTPS"):
        validate_rulebook_data(data)


def test_malformed_yaml_returns_safe_error_without_echoing_content(tmp_path: Path) -> None:
    content = "sensitive-example: [not closed"
    path = tmp_path / "broken.yaml"
    path.write_text(content, encoding="utf-8")

    with pytest.raises(RulebookLoadError, match="could not be parsed") as error:
        load_rulebook(path)

    assert "sensitive-example" not in str(error.value)


def test_validation_error_does_not_echo_invalid_field_value() -> None:
    data = deepcopy(_rulebook_data())
    data["rules"][0]["priority"] = "private-value-must-not-leak"

    with pytest.raises(RulebookLoadError) as error:
        validate_rulebook_data(data)

    assert "priority" in str(error.value)
    assert "private-value-must-not-leak" not in str(error.value)
