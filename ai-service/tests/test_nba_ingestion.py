from __future__ import annotations

import hashlib
from datetime import date
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from app.nba.rag.chunking import chunk_passages
from app.nba.rag.config import NbaRagSettings
from app.nba.rag.embedding import BgeSmallEmbeddingProvider, EmbeddingProviderError
from app.nba.rag.extraction import DocumentExtractionError, extract_document, extract_docx, extract_html, extract_pdf
from app.nba.rag.ingestion import DocumentIngestionError, DocumentIngestionPipeline, OfficialDocumentFetcher
from app.nba.schemas.documents import ExtractedPassage
from app.nba.schemas.manifest import RegulatoryStatus, ReviewStatus, SourceManifest
from app.nba.schemas.rulebook import SourceType


def _manifest(**overrides) -> SourceManifest:
    values = {
        "document_id": "synthetic-rbi-doc",
        "title": "Synthetic test source",
        "issuing_organization": "Synthetic test publisher",
        "canonical_url": "https://rbi.org.in/test-source",
        "applicability": "Synthetic test fixture; no policy meaning.",
        "jurisdiction": "IN",
        "language": "en",
        "source_type": SourceType.OFFICIAL_PUBLIC,
        "regulatory_status": RegulatoryStatus.CURRENT,
        "scenario_tags": ["failed_atm_withdrawal"],
        "publication_date": date(2025, 1, 1),
        "updated_date": None,
        "effective_date": date(2025, 1, 1),
        "expiry_date": None,
        "version": "1.0.0",
        "content_hash": None,
        "review_status": ReviewStatus.IN_REVIEW,
        "reviewer": None,
        "approval_date": None,
    }
    values.update(overrides)
    return SourceManifest.model_validate(values)


def _synthetic_pdf() -> bytes:
    pytest.importorskip("pypdf")
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=320, height=320)
    font = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    }))
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
    })
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 40 250 Td (ATM FAQ) Tj 0 -20 Td (Cash was not dispensed.) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_pdf_extraction_keeps_page_and_heading_text() -> None:
    passages = extract_pdf(_synthetic_pdf())

    assert passages
    assert {passage.page_number for passage in passages} == {1}
    assert any("ATM FAQ" in passage.text for passage in passages)
    assert any("Cash was not dispensed" in passage.text for passage in passages)


def test_html_extraction_preserves_headings_and_table_rows() -> None:
    html = b"""<html><body><nav>ignore navigation</nav><h1>ATM section</h1>
      <p>Customer-facing information.</p><table><tr><th>Case</th><th>Review</th></tr>
      <tr><td>ATM</td><td>Check status</td></tr></table></body></html>"""

    passages = extract_html(html)

    assert any(item.section_heading == "ATM section" for item in passages)
    assert any("Case | Review" in item.text and "ATM | Check status" in item.text for item in passages)
    assert all("ignore navigation" not in item.text for item in passages)


def _synthetic_docx() -> bytes:
    document_xml = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>ATM Service Review</w:t></w:r></w:p>
      <w:p><w:r><w:t>Record the customer report and review the available transaction details.</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>UPI status</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>'''
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def test_docx_extraction_preserves_heading_and_paragraph_locator() -> None:
    content = _synthetic_docx()
    passages = extract_docx(content)
    assert len(passages) == 3
    assert passages[1].section_heading == "ATM Service Review"
    assert passages[1].paragraph == "2"
    assert "UPI status" in passages[2].text
    assert extract_document(content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document") == passages


def test_extraction_rejects_unsupported_media_type() -> None:
    with pytest.raises(DocumentExtractionError, match="Only PDF, HTML and DOCX"):
        extract_document(b"plain text", "text/plain")


def test_chunking_preserves_document_hash_source_locators_and_overlap() -> None:
    raw = b"Synthetic text for a reviewed source."
    manifest = _manifest(
        review_status=ReviewStatus.APPROVED,
        reviewer="Test reviewer",
        approval_date=date(2025, 1, 2),
        content_hash=hashlib.sha256(raw).hexdigest(),
    )
    settings = NbaRagSettings(chunk_size_chars=35, chunk_overlap_chars=8)
    passage = ExtractedPassage(
        text="One two three four five six seven eight nine ten eleven twelve.",
        page_number=7,
        section_heading="Transaction review",
        paragraph="3",
    )

    chunks = chunk_passages([passage], manifest, settings)

    assert len(chunks) > 1
    assert all(chunk.document_id == manifest.document_id for chunk in chunks)
    assert all(chunk.document_version == manifest.version for chunk in chunks)
    assert all(chunk.content_hash == manifest.content_hash for chunk in chunks)
    assert all(chunk.page_number == 7 and chunk.section_heading == "Transaction review" for chunk in chunks)
    assert all(chunk.title == manifest.title and chunk.canonical_url for chunk in chunks)
    assert chunks[0].chunk_id != chunks[1].chunk_id
    assert set(chunks[0].text.split()).intersection(chunks[1].text.split())


def test_pipeline_hashes_content_and_skips_known_duplicate_hash() -> None:
    content = b"<html><body><h1>Synthetic</h1><p>Review this content.</p></body></html>"
    digest = hashlib.sha256(content).hexdigest()
    pipeline = DocumentIngestionPipeline(NbaRagSettings())

    prepared = pipeline.prepare(content, "text/html", _manifest())
    duplicate = pipeline.prepare(content, "text/html", _manifest(), duplicate_hashes={digest})

    assert prepared.manifest.content_hash == digest
    assert prepared.chunks
    assert duplicate.duplicate is True
    assert duplicate.chunks == ()


def test_pipeline_rejects_hash_mismatch_without_echoing_document_content() -> None:
    content = b"<html><body>synthetic private-looking text</body></html>"
    manifest = _manifest(content_hash="a" * 64)

    with pytest.raises(DocumentIngestionError, match="hash does not match") as error:
        DocumentIngestionPipeline().prepare(content, "text/html", manifest)

    assert "private-looking" not in str(error.value)


def test_embedding_provider_is_lazy_batches_cpu_and_normalizes_vectors() -> None:
    settings = NbaRagSettings(embedding_dimension=3, embedding_batch_size=2, query_instruction="Query: ")
    model = _FakeEmbeddingModel()
    provider = BgeSmallEmbeddingProvider(settings, model_loader=lambda: model)

    assert model.calls == []
    vectors = provider.embed_documents(["first", "second"])
    query = provider.embed_query("short query")

    assert model.calls[0][0] == ["first", "second"]
    assert model.calls[0][1]["device"] == "cpu"
    assert model.calls[0][1]["batch_size"] == 2
    assert model.calls[0][1]["normalize_embeddings"] is True
    assert model.calls[1][0] == ["Query: short query"]
    assert len(vectors) == 2 and len(query) == 3
    assert all(sum(value * value for value in vector) == pytest.approx(1.0) for vector in vectors + [query])
    assert provider.model_version == "synthetic-commit"


def test_embedding_model_loading_failure_is_safe() -> None:
    provider = BgeSmallEmbeddingProvider(model_loader=lambda: (_ for _ in ()).throw(RuntimeError("private path")))

    with pytest.raises(EmbeddingProviderError, match="could not be loaded") as error:
        provider.embed_query("synthetic")

    assert "private path" not in str(error.value)


def test_embedding_model_dimension_mismatch_fails_closed() -> None:
    settings = NbaRagSettings(embedding_dimension=3)
    model = _FakeEmbeddingModel()
    model.get_sentence_embedding_dimension = lambda: 4
    provider = BgeSmallEmbeddingProvider(settings, model_loader=lambda: model)

    with pytest.raises(EmbeddingProviderError, match="could not be loaded"):
        provider.embed_query("synthetic query")


def test_official_fetcher_rejects_non_rbi_or_non_https_urls_before_network() -> None:
    fetcher = OfficialDocumentFetcher()

    with pytest.raises(DocumentIngestionError, match="host allowlist"):
        fetcher._validate_url("https://example.com/fake.pdf")
    with pytest.raises(DocumentIngestionError, match="host allowlist"):
        fetcher._validate_url("http://rbi.org.in/document.pdf")


class _FakeEmbeddingModel:
    def __init__(self) -> None:
        self.calls: list[tuple[list[str], dict]] = []

    def get_sentence_embedding_dimension(self) -> int:
        return 3

    def _first_module(self):
        class Config:
            _commit_hash = "synthetic-commit"

        class AutoModel:
            config = Config()

        class Module:
            auto_model = AutoModel()

        return Module()

    def encode(self, texts, **kwargs):
        self.calls.append((list(texts), kwargs))
        return [[3.0, 4.0, 0.0] for _ in texts]
