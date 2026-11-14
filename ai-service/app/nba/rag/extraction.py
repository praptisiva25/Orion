from __future__ import annotations

import re
from io import BytesIO
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree

from app.nba.schemas.documents import ExtractedPassage


class DocumentExtractionError(ValueError):
    """Safe, content-free document extraction failure."""


def clean_text(value: str) -> str:
    """Normalize layout noise while retaining line breaks, headings, and table rows."""
    value = value.replace("\u00a0", " ").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[\t\f\v ]+", " ", line).strip() for line in value.split("\n")]
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _pdf_section_for_line(line: str, current: str | None) -> str | None:
    candidate = line.strip()
    if not candidate or len(candidate) > 140:
        return current
    if candidate.endswith((".", ",", ";", ":")):
        return current
    if re.match(r"^(?:\d+(?:\.\d+)*[.)]?|[A-Z][.)])\s+\S", candidate):
        return candidate
    letters = [char for char in candidate if char.isalpha()]
    if letters and all(char.isupper() for char in letters):
        return candidate
    return current


def extract_pdf(data: bytes, *, maximum_pages: int = 1000) -> list[ExtractedPassage]:
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data), strict=False)
        if len(reader.pages) > maximum_pages:
            raise DocumentExtractionError("PDF page count exceeds the supported limit.")
        passages: list[ExtractedPassage] = []
        for page_number, page in enumerate(reader.pages, start=1):
            page_text = clean_text(page.extract_text() or "")
            section: str | None = None
            paragraph_index = 0
            for line in page_text.splitlines():
                text = line.strip()
                if not text:
                    continue
                next_section = _pdf_section_for_line(text, section)
                if next_section != section:
                    section = next_section
                    # Headings remain in the extracted text and are also retained as metadata.
                paragraph_index += 1
                passages.append(ExtractedPassage(
                    text=text,
                    page_number=page_number,
                    section_heading=section,
                    paragraph=str(paragraph_index),
                ))
        return passages
    except DocumentExtractionError:
        raise
    except Exception:
        raise DocumentExtractionError("PDF text could not be extracted.") from None


def extract_html(data: bytes) -> list[ExtractedPassage]:
    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(data, "html.parser")
        for element in soup.find_all(["script", "style", "noscript", "nav", "footer", "header", "svg"]):
            element.decompose()

        body = soup.body or soup
        section: str | None = None
        passages: list[ExtractedPassage] = []
        paragraph_index = 0
        content_tags = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "table", "blockquote"}
        for element in body.find_all(content_tags):
            tag = element.name.lower()
            text = clean_text(element.get_text(" ", strip=True))
            if not text:
                continue
            if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                section = text
            elif tag == "table":
                rows: list[str] = []
                for row in element.find_all("tr"):
                    cells = [clean_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
                    if any(cells):
                        rows.append(" | ".join(cells))
                text = "\n".join(rows)
            if text:
                paragraph_index += 1
                passages.append(ExtractedPassage(
                    text=text,
                    page_number=None,
                    section_heading=section,
                    paragraph=str(paragraph_index),
                ))
        return passages
    except Exception:
        raise DocumentExtractionError("HTML text could not be extracted.") from None


def extract_docx(data: bytes) -> list[ExtractedPassage]:
    """Extract paragraph and table text from a DOCX without executing document content."""
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    try:
        with ZipFile(BytesIO(data)) as archive:
            names = set(archive.namelist())
            if "word/document.xml" not in names:
                raise DocumentExtractionError("DOCX document body is missing.")
            if archive.getinfo("word/document.xml").file_size > 25_000_000:
                raise DocumentExtractionError("DOCX document body exceeds the supported size limit.")
            root = ElementTree.fromstring(archive.read("word/document.xml"))
        body = root.find("w:body", namespace)
        if body is None:
            raise DocumentExtractionError("DOCX document body is missing.")
        passages: list[ExtractedPassage] = []
        section: str | None = None
        paragraph_index = 0
        for paragraph in body.findall(".//w:p", namespace):
            text = clean_text("".join(node.text or "" for node in paragraph.findall(".//w:t", namespace)))
            if not text:
                continue
            style = paragraph.find("w:pPr/w:pStyle", namespace)
            style_name = style.attrib.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val", "") if style is not None else ""
            if style_name.lower().startswith("heading"):
                section = text
            paragraph_index += 1
            passages.append(ExtractedPassage(
                text=text,
                page_number=None,
                section_heading=section,
                paragraph=str(paragraph_index),
            ))
        if not passages:
            raise DocumentExtractionError("DOCX document contains no extractable text.")
        return passages
    except DocumentExtractionError:
        raise
    except (BadZipFile, KeyError, ElementTree.ParseError, OSError):
        raise DocumentExtractionError("DOCX text could not be extracted.") from None


def extract_document(data: bytes, media_type: str, *, maximum_bytes: int = 25_000_000) -> list[ExtractedPassage]:
    if not data:
        raise DocumentExtractionError("Document is empty.")
    if len(data) > maximum_bytes:
        raise DocumentExtractionError("Document exceeds the supported size limit.")

    normalized_type = media_type.split(";", 1)[0].strip().lower()
    if normalized_type in {"application/pdf", ".pdf"} or data.startswith(b"%PDF-"):
        return extract_pdf(data)
    if normalized_type in {"text/html", "application/xhtml+xml", ".html", ".htm"}:
        return extract_html(data)
    if normalized_type in {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"} or data.startswith(b"PK"):
        return extract_docx(data)
    raise DocumentExtractionError("Only PDF, HTML and DOCX documents are supported.")
