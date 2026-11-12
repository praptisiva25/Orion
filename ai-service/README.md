# ORION BANK Ticket AI Service

Standalone FastAPI service for transient ticket summaries and Officer response drafts. It has no database connection. The .NET API is expected to authenticate and authorize the Officer, verify ticket assignment, load the ticket and conversation, then call this service with the service-to-service key.

## Security and data handling

- Every HTTP route requires `Authorization: Bearer <INTERNAL_SERVICE_KEY>`. OpenAPI, Swagger and ReDoc routes are disabled.
- `INTERNAL_SERVICE_KEY` and `GROQ_API_KEY` are separate settings; startup fails if they are missing, too short, or equal.
- `GROQ_MODEL` is required and configurable. Set it to a model currently enabled for your Groq account.
- Ticket text, prompts, provider responses and credentials are never logged. Uvicorn access logging is disabled so request paths and metadata are not recorded by this app.
- Before sending text to Groq, the service removes common PAN, Aadhaar-like ID, card/account number, IFSC, email, phone and labeled password/PIN/OTP/CVV patterns. Redaction reduces exposure but cannot identify every sensitive value. Do not send secrets in ticket text; apply your organization's data handling and provider-retention requirements before enabling external processing.
- The service does not persist requests or generated results. Generated text is not guaranteed factual; .NET/Officer workflows must treat it as untrusted draft content.

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
