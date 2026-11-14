from __future__ import annotations

import json
import sys
import tempfile
from datetime import date
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from app.nba.rag.chunking import chunk_passages  # noqa: E402
from app.nba.rag.config import NbaRagSettings  # noqa: E402
from app.nba.rag.embedding import BgeSmallEmbeddingProvider  # noqa: E402
from app.nba.rag.evaluation import RetrievalCase, evaluate_retrieval  # noqa: E402
from app.nba.rag.faiss_store import FaissVectorStore  # noqa: E402
from app.nba.rag.retriever import KnowledgeRetriever  # noqa: E402
from app.nba.schemas.documents import ExtractedPassage  # noqa: E402
from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus, SourceManifest  # noqa: E402
from app.nba.schemas.rulebook import SourceType  # noqa: E402


def evaluate(service_root: Path = SERVICE_ROOT) -> dict[str, object]:
    fixture_path = service_root / "tests" / "fixtures" / "nba_retrieval_eval.json"
    fixtures = json.loads(fixture_path.read_text(encoding="utf-8"))
    settings = NbaRagSettings.from_environment()
    provider = BgeSmallEmbeddingProvider(settings)
    test_chunks = []
    cases = []
    for fixture in fixtures:
        text = (
            f"Synthetic evaluation evidence for {fixture['scenario']}. "
            f"This illustrative passage is designed only to test retrieval for: {fixture['query']}"
        )
        import hashlib

        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        manifest = SourceManifest(
            document_id=fixture["document_id"],
            title=f"Synthetic evaluation source: {fixture['scenario']}",
            issuing_organization="Synthetic test fixture",
            canonical_url=None,
            applicability="Synthetic retrieval evaluation only; not policy or customer guidance.",
            jurisdiction="IN",
            language="en",
            source_type=SourceType.ILLUSTRATIVE_INTERNAL,
            regulatory_status=RegulatoryStatus.NOT_APPLICABLE,
            scenario_tags=[fixture["scenario"]],
            publication_date=None,
            updated_date=None,
            effective_date=None,
            expiry_date=None,
            version="evaluation-v1",
            content_hash=digest,
            review_status=ReviewStatus.APPROVED,
            reviewer="Automated synthetic-test fixture",
            approval_date=date.today(),
        )
        test_chunks.extend(chunk_passages(
            [ExtractedPassage(
                text=text,
                page_number=fixture["page_number"],
                section_heading=fixture["section_heading"],
            )],
            manifest,
            settings,
        ))
        cases.append(RetrievalCase(
            case_id=fixture["case_id"],
            query=fixture["query"],
            expected_document_id=fixture["document_id"],
            expected_page_number=fixture["page_number"],
        ))
    cases.append(RetrievalCase(
        case_id="no_matching_evidence",
        query="Explain the orbital period and atmospheric composition of Jupiter.",
        expected_document_id=None,
    ))

    vectors = provider.embed_documents([chunk.text for chunk in test_chunks])
    with tempfile.TemporaryDirectory(prefix="orion-nba-evaluation-") as directory:
        store_settings = NbaRagSettings(
            embedding_model=settings.embedding_model,
            embedding_revision=settings.embedding_revision,
            embedding_dimension=settings.embedding_dimension,
            query_instruction=settings.query_instruction,
            retrieval_top_k=settings.retrieval_top_k,
            retrieval_minimum_score=settings.retrieval_minimum_score,
            faiss_index_path=Path(directory) / "faiss_index",
        )
        store = FaissVectorStore(
            settings=store_settings,
            model_id=provider.model_id,
            model_version=provider.model_version,
        )
        store.rebuild(test_chunks, vectors)
        ranking_settings = NbaRagSettings(
            embedding_model=settings.embedding_model,
            embedding_revision=settings.embedding_revision,
            embedding_dimension=settings.embedding_dimension,
            query_instruction=settings.query_instruction,
            retrieval_top_k=settings.retrieval_top_k,
            retrieval_minimum_score=0.0,
            faiss_index_path=Path(directory) / "faiss_index",
        )
        ranking = evaluate_retrieval(
            cases[:-1],
            KnowledgeRetriever(provider, store, ranking_settings),
            top_k=3,
        )
        production = evaluate_retrieval(
            cases,
            KnowledgeRetriever(provider, store, store_settings),
            top_k=3,
        )
    return {
        "model_id": provider.model_id,
        "model_version": provider.model_version,
        "device": "cpu",
        "dimension": settings.embedding_dimension,
        "synthetic_documents": len(fixtures),
        "synthetic_chunks": len(test_chunks),
        "index_type": "IndexIDMap2(IndexFlatIP)",
        "ranking_without_score_cutoff": ranking,
        "production_threshold_and_no_result": production,
        "interpretation": "Synthetic retrieval plumbing only; this does not validate real-world policy correctness.",
    }


if __name__ == "__main__":
    try:
        print(json.dumps(evaluate(), ensure_ascii=False, separators=(",", ":")))
    except Exception:
        print(json.dumps({"error": "Synthetic retrieval evaluation could not be completed."}), file=sys.stderr)
        raise SystemExit(1) from None
