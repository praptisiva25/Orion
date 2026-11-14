from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from app.nba.schemas.rulebook import Rulebook, RulebookLoadError


DEFAULT_RULEBOOK_PATH = Path(__file__).with_name("rulebook.v1.yaml")


def _safe_validation_details(error: ValidationError) -> str:
    details: list[str] = []
    for item in error.errors(include_input=False, include_url=False):
        location = ".".join(str(part) for part in item["loc"]) or "rulebook"
        details.append(f"{location}: {item['msg']}")
    return "; ".join(details)


def validate_rulebook_data(data: Any) -> Rulebook:
    try:
        return Rulebook.model_validate(data)
    except ValidationError as error:
        details = _safe_validation_details(error)
        raise RulebookLoadError(f"Rulebook validation failed: {details}") from None


def load_rulebook(path: Path = DEFAULT_RULEBOOK_PATH) -> Rulebook:
    try:
        with path.open("r", encoding="utf-8") as source_file:
            data = yaml.safe_load(source_file)
    except (OSError, UnicodeError):
        raise RulebookLoadError("Rulebook file could not be read.") from None
    except yaml.YAMLError:
        raise RulebookLoadError("Rulebook YAML could not be parsed.") from None

    return validate_rulebook_data(data)
