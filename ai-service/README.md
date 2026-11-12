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

The sentiment classifier validates the loaded model's own `id2label` metadata and refuses to start inference unless it maps exactly to negative, neutral, and positive. It does not assume label index order. The model card reports an English Twitter dataset and approximately 0.72 accuracy; domain shift for banking messages is possible, and predictions should be treated as estimates rather than urgency or priority. Sentiment remains separate from ticket priority.

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
