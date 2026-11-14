# ORION BANK Ticket AI Service

Standalone FastAPI service for transient ticket summaries, Officer response drafts, and local customer-message sentiment classification. It has no database connection. The .NET API remains responsible for authentication, authorization, ticket ownership, and database operations.

## Security and data handling

- Every HTTP route requires `Authorization: Bearer <INTERNAL_SERVICE_KEY>`. OpenAPI, Swagger and ReDoc routes are disabled.
- `INTERNAL_SERVICE_KEY` and `GROQ_API_KEY` are separate settings; startup fails if they are missing, too short, or equal.
- `GROQ_MODEL` is required and configurable. Set it to a model currently enabled for your Groq account.
- Ticket text, prompts, provider responses and credentials are never logged. Uvicorn access logging is disabled so request paths and metadata are not recorded by this app.
- Before sending text to Groq, the service removes common PAN, Aadhaar-like ID, card/account number, IFSC, email, phone and labeled password/PIN/OTP/CVV patterns. Redaction reduces exposure but cannot identify every sensitive value. Do not send secrets in ticket text; apply your organization's data handling and provider-retention requirements before enabling external processing.
- The service does not persist requests or generated results. Generated text is not guaranteed factual; .NET/Officer workflows must treat it as untrusted draft content.
- Sentiment analysis runs locally on CPU; sentiment text is never sent to Groq. `SENTIMENT_TOKENIZER_ID` and `SENTIMENT_MODEL_ID` configure the tokenizer and fine-tuned classifier independently. Defaults are `distilbert-base-uncased` and `satishmachine/sentiment-model`. The classifier repository does not contain tokenizer files, so the tokenizer must be loaded from the base DistilBERT repository. Both are downloaded on first use and reused by the running process. Transformers uses its normal Hugging Face cache (set `HF_HOME` to choose a cache location).

## Local setup

Requires Python 3.11 or newer.

```powershell
cd ai-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Edit `.env` and set distinct values for `INTERNAL_SERVICE_KEY` and `GROQ_API_KEY`, plus a valid `GROQ_MODEL`. Generate a strong internal key, for example:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Keep `.env` private. The repository ignore rules exclude `.env` files and allow `.env.example` to be committed. Export the same internal key to the .NET service through its environment/configuration; never place either key in `NEXT_PUBLIC_*` variables or frontend source.

Start the service from `ai-service`:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

There is intentionally no unauthenticated health route. An authenticated request can verify availability. Example PowerShell requests:

```powershell
# Set this in the calling PowerShell session to the same private value as in .env.
$env:INTERNAL_SERVICE_KEY = Read-Host "Enter the internal service key"
$headers = @{ Authorization = "Bearer $env:INTERNAL_SERVICE_KEY" }
$body = @{
  subject = "Card payment query"
  description = "The customer reports that a card payment is not visible in recent activity and asks for help checking the transaction."
  messages = @(
    @{ sender_role = "customer"; message = "I checked again today and still cannot identify the payment." },
    @{ sender_role = "officer"; message = "Could you share the transaction date and approximate amount?" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8001/v1/tickets/summary -Headers $headers -ContentType "application/json" -Body $body
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8001/v1/tickets/suggested-response -Headers $headers -ContentType "application/json" -Body $body
```

## API

Both endpoints require the internal bearer key and accept `subject` (1–150 characters), `description` (1–3000 characters), and up to 100 chronological `messages` (each with `sender_role` and a 1–3000 character `message`). Extra fields and unsupported sender roles are rejected. Validation errors return a generic message rather than echoing submitted ticket data.

- `POST /v1/tickets/summary` returns `{"result":"..."}`. Results shorter than 20 words trigger one regeneration attempt and then a safe provider error.
- `POST /v1/tickets/suggested-response` returns `{"result":"..."}` and rejects drafts longer than 3000 characters.
- `POST /v1/sentiment/analyze` accepts `{"text":"..."}` with 1–10000 nonblank characters and returns `label`, `confidence`, `model_name`, and `model_version` (null when the Hub revision is unavailable). Inputs are token-truncated to the model card's 128-token sequence length. Model loading and inference failures return a content-free `503` response.
- `POST /v1/nba/recommendations` accepts `ticket_id`, `subject`, `description`, `status`, `priority`, up to 100 customer-only messages, and optional latest sentiment. It returns validated advisory recommendations with `recommendation_mode`, `evidence_available`, `evidence_references`, and `advisory_only: true`. Relevant retrieved evidence produces `knowledge_backed`; absent or insufficient evidence invokes Groq general guidance with the mandatory disclaimer. No unreviewed source is retrieved, and an unavailable Groq provider returns a retryable `503`.

The sentiment classifier validates the loaded model's own `id2label` metadata and refuses to start inference unless it maps exactly to negative, neutral, and positive. It does not assume label index order. The model card reports an English Twitter dataset and approximately 0.72 accuracy; domain shift for banking messages is possible, and predictions should be treated as estimates rather than urgency or priority. Sentiment remains separate from ticket priority.

## NBA knowledge and retrieval foundation

The NBA foundation is deliberately separate from existing ticket AI routes. It does not add an API endpoint or Groq generation, connect to a database, or load models at FastAPI startup. Ticket summarization, suggested-response, and sentiment behavior remain unchanged.

### Rulebook

The versioned starter rulebook is `app/nba/rules/rulebook.v1.yaml`. Every starter rule and reference is classified `illustrative_internal`; none is an RBI, NPCI, or bank policy. Rulebook loading uses `yaml.safe_load` and Pydantic validation (`app/nba/rules/loader.py`, `app/nba/schemas/rulebook.py`). Errors identify field paths and validation issues without echoing YAML values.

The allowed condition fields and operators are deliberately limited. Operators are `equals`, `contains_any`, `contains_all`, `is_true`, and `is_false`; no expressions, Python evaluation, templates, or arbitrary predicates are supported. Action codes are allowlisted, every action requires Officer review, and every rule must include restrictions against transaction execution (including unauthorized transactions), refunds/credits, account freezing/blocking, automatic customer communication, claims of verification/completion, unsupported timelines/guarantees, and any non-advisory use.

### Source documents and review

- Source manifests are JSON files under `knowledge_base/manifests/` and validate through `app/nba/schemas/manifest.py`. The four RBI source records are explicitly `in_review`; they are not eligible for retrieval. Three linked RBI documents were downloaded from official RBI hosts, extracted, hashed, and chunked locally for review; their hashes are recorded in the manifests. No document has been approved or added to FAISS. The user-supplied Customer Protection URL could not be inspected and remains `unknown`, with no fabricated title/date/content. See each manifest for source-specific details.
- The source URLs and manifests identify public RBI materials, not approved internal bank policy. Even verified official-public sources require a separate reviewer and approval date before indexing. Verify scope/applicability, amendments and current status before approval.
- Store downloaded source documents under `knowledge_base/documents/`. The directory ignores downloaded files by default so public or accidentally sensitive files are not committed automatically. Do not add customer tickets, profiles, account records, credentials, or other private banking data.
- Keep each source version immutable. Compute SHA-256 over the exact downloaded bytes. A content change requires a new manifest version and a rebuilt index; a conflicting hash under the same document/version is rejected. Retire stale sources by marking their manifest `retired` and rebuilding the active index.

### Ingestion and retrieval

`app/nba/rag/extraction.py` extracts PDF pages and HTML headings, paragraphs, lists, and table rows while retaining page/section/paragraph locators. `chunking.py` applies configurable character size/overlap and creates stable chunk IDs. Every chunk carries document ID/version/hash, source classification, title, canonical URL, page/section, jurisdiction, effective/expiry dates, review/regulatory status, and scenario tags.

`embedding.py` lazily loads `BAAI/bge-small-en-v1.5` via SentenceTransformers on CPU. It batches passage encoding, normalizes vectors, adds the BGE query instruction to queries only, records the resolved model revision when exposed, and does not use Groq. Configure model/revision/dimension in the `NBA_*` environment settings. The model card identifies the candidate as English-only and MIT-licensed; confirm language coverage and retrieval quality against the actual approved corpus before production use.

`faiss_store.py` uses `IndexIDMap2(IndexFlatIP)` with normalized vectors, which provides exact inner-product ranking equivalent to cosine similarity for this initial small corpus. The index and vector-to-chunk metadata are written into one immutable generation directory; a small atomically replaced `CURRENT` pointer publishes both together. Reload checks format, model ID/revision, dimension, index IDs, and metadata IDs. Missing metadata is an integrity error on reload and can never be returned as a citation. `rebuild()` writes a fresh generation without deleting older generations.

`retriever.py` returns only passages with stored provenance, requires approved review status, excludes superseded/withdrawn/expired/not-yet-effective sources, supports scenario and source-type filters, and returns no passages below the configured minimum score. Similarity thresholds must be calibrated on a labeled test set; they are not a factuality guarantee. Retrieved text is untrusted data and must be delimited as evidence in any later generation prompt, never executed as instructions.

`review.py` provides an explicit approval helper. Approval requires a named reviewer, an approval date, and the exact content hash reviewed; unknown, superseded, withdrawn, expired, future-effective, or unverifiable official sources cannot be approved for retrieval. Use `not_applicable` for an illustrative internal source with no regulatory lifecycle. Nothing approves a source automatically. Update a manifest only after human review of its source, applicability, status/amendments, and downloaded bytes.

After manifests are explicitly approved and their matching versioned local files are present, run `python scripts/build_nba_index.py` from `ai-service`. The command prepares and validates every eligible file before publishing a rebuild. It skips non-approved, unknown, expired, withdrawn, superseded, and not-yet-effective sources; missing or invalid approved sources abort the rebuild. If no approved source is eligible, it reports no publication and leaves any existing index unchanged. Index generations store model ID/revision, dimension, FAISS format version, vectors, and source metadata together; `CURRENT` changes atomically only after a complete generation is written.

Run `python scripts/evaluate_nba_retrieval.py` for the synthetic seven-scenario retrieval set plus a no-evidence case. It creates only a temporary local index. Hit rate@k, MRR@k, page-locator accuracy, and no-result accuracy measure synthetic retrieval behavior, not real-world policy correctness. The tests separately check status filtering, source locators, ordering, no-result behavior, metadata integrity, and interrupted publication.

The NBA uses BGE retrieval followed by the configured Groq provider. The checked-in fictional handbook is explicitly approved for local demonstration use only. It is not actual bank policy, RBI guidance or regulatory material. The rulebook remains available for reference but does not drive NBA recommendations.

Build the local index from eligible approved documents with:

```powershell
cd ai-service
..\bankenv\Scripts\python.exe scripts\build_nba_index.py
```

The command loads `BAAI/bge-small-en-v1.5` lazily on CPU, creates normalized 384-dimensional embeddings, and safely publishes a FAISS `IndexIDMap2(IndexFlatIP)` generation under `storage/faiss_index`. The generation stores document/chunk metadata beside its vectors and is ignored by Git. The supplied internal handbook is stored under `knowledge_base/documents/orion-demo-bank-policy-v1/`; its manifest records explicit approval limited to the local demonstration knowledge base. Other unapproved manifests remain excluded. Model and index loading do not happen at FastAPI startup.

NBA returns either knowledge-backed suggestions with server-validated retrieved source locators, or general AI guidance with a mandatory disclaimer when retrieved evidence is absent or insufficient. Both modes remain advisory and require Officer review.

### Document ingestion usage

The implementation exposes `OfficialDocumentFetcher` restricted to HTTPS RBI hosts, `DocumentIngestionPipeline.prepare(...)` for PDF, HTML and DOCX extraction/hash/chunking, and `index_prepared(...)` for explicitly approved documents. `LocalDocumentRepository` stores versioned raw files and JSON manifests. Pending/unreviewed documents may be prepared for review but are never added to FAISS. There is no automatic network download during import or application startup.

Unit tests use synthetic PDF/HTML/DOCX fixtures and mocked Groq responses; they do not call RBI, Groq, or a database.

For an authenticated local request, use a short synthetic example:

```powershell
$body = @{ text = "I am disappointed that I still cannot see the payment." } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8001/v1/sentiment/analyze -Headers $headers -ContentType "application/json" -Body $body
```

Expected errors: `401` for a missing or invalid internal key, `422` for invalid input, `502` for provider failures, and `503` when the service key configuration is unavailable. Never expose provider exception details to callers.

## Checks

Run the API/unit checks from this directory:

```powershell
python -m compileall -q app tests
python -m pytest -q
```

The tests use a fake provider and do not call Groq or require real credentials. `requirements.txt` contains runtime dependencies; `requirements-dev.txt` adds pytest.

## Container deployment

Build the image with `docker build -t orion-ticket-ai:local .` from this directory. Run it with the required secrets and model supplied by your deployment secret manager, for example `docker run --rm -p 8001:8001 --env-file .env orion-ticket-ai:local`. The image contains the service code and runtime packages only; it contains no credentials, database client or database connection settings. Restrict network access to the .NET service and configure the internal key through the runtime environment.
