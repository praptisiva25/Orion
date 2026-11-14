from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

from app.nba.schemas.documents import RetrievedPassage


@dataclass(frozen=True)
class RetrievalCase:
    case_id: str
    query: str
    expected_document_id: str | None
    expected_page_number: int | None = None


class Retriever(Protocol):
    def retrieve(self, query: str, *, top_k: int | None = None) -> Sequence[RetrievedPassage]: ...


def evaluate_retrieval(
    cases: Sequence[RetrievalCase],
    retriever: Retriever,
    *,
    top_k: int = 3,
) -> dict[str, object]:
    if top_k <= 0 or not cases:
        raise ValueError("Evaluation requires cases and a positive top_k.")
    relevant_hits = 0
    reciprocal_ranks: list[float] = []
    locator_correct = 0
    expected_result_cases = 0
    no_result_correct = 0
    ordered_case_count = 0
    examples: list[dict[str, object]] = []

    for case in cases:
        results = list(retriever.retrieve(case.query, top_k=top_k))
        ordered_case_count += int(all(
            results[index].score >= results[index + 1].score
            for index in range(len(results) - 1)
        ))
        if case.expected_document_id is None:
            expected_result_cases += 1
            correct = not results
            no_result_correct += int(correct)
            examples.append({"case_id": case.case_id, "expected": "no_result", "returned_count": len(results), "correct": correct})
            continue

        rank = next((i for i, result in enumerate(results, start=1)
                     if result.source.document_id == case.expected_document_id), None)
        hit = rank is not None
        relevant_hits += int(hit)
        reciprocal_ranks.append(1.0 / rank if rank else 0.0)
        locator_ok = any(
            result.source.document_id == case.expected_document_id
            and (case.expected_page_number is None or result.source.page_number == case.expected_page_number)
            for result in results
        )
        locator_correct += int(locator_ok)
        examples.append({
            "case_id": case.case_id,
            "expected_document_id": case.expected_document_id,
            "rank": rank,
            "page_locator_correct": locator_ok,
            "top_score": results[0].score if results else None,
            "returned_sources": [
                {"document_id": r.source.document_id, "page_number": r.source.page_number, "section_heading": r.source.section_heading, "score": r.score}
                for r in results
            ],
        })

    relevant_total = len(reciprocal_ranks)
    result: dict[str, object] = {
        f"hit_rate_at_{top_k}": relevant_hits / relevant_total if relevant_total else 0.0,
        f"mrr_at_{top_k}": sum(reciprocal_ranks) / relevant_total if relevant_total else 0.0,
        "page_locator_accuracy": locator_correct / relevant_total if relevant_total else 0.0,
        "no_result_accuracy": no_result_correct / expected_result_cases if expected_result_cases else None,
        "score_ordering_accuracy": ordered_case_count / len(cases),
        "relevant_case_count": relevant_total,
        "no_result_case_count": expected_result_cases,
        "examples": examples,
    }
    return result
