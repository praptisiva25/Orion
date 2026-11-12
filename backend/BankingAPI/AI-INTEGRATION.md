# Local FastAPI ticket AI integration

The ASP.NET Core API calls the separate FastAPI service server-to-server. The browser only calls the authenticated .NET API. The .NET API retains JWT authorization, checks Officer assignment, loads ticket content from PostgreSQL, and does not persist generated results.

## Configure shared internal key

Set `INTERNAL_SERVICE_KEY` in `ai-service/.env` for FastAPI. Use a random key with at least 32 characters, such as one created with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Keep that value private. Do not use the Groq API key for this setting. Do not put either key in the frontend or a committed settings file.

From the repository root, configure .NET local settings with User Secrets (the project already has a `UserSecretsId`):

```powershell
dotnet user-secrets set "AiService:BaseUrl" "http://127.0.0.1:8001/" --project .\backend\BankingAPI\BankingAPI.csproj
dotnet user-secrets set "AiService:TimeoutSeconds" "75" --project .\backend\BankingAPI\BankingAPI.csproj
dotnet user-secrets set "INTERNAL_SERVICE_KEY" "<the same key set in ai-service/.env>" --project .\backend\BankingAPI\BankingAPI.csproj
```

For environment-based configuration instead, set:

```powershell
$env:AiService__BaseUrl = "http://127.0.0.1:8001/"
$env:AiService__TimeoutSeconds = "75"
$env:INTERNAL_SERVICE_KEY = "<the same key set in ai-service/.env>"
```

The AI service has a 30-second Groq timeout by default and may make one retry for short summaries. The .NET timeout defaults to 75 seconds to accommodate that retry. Tune both service timeouts together if changing the FastAPI timeout.

## Automatic customer sentiment history

The backend also calls `POST /v1/sentiment/analyze` with `{ "text": "..." }`. The authenticated FastAPI service returns `label`, `confidence`, `model_name`, and nullable `model_version`. The existing `AiService:BaseUrl` and `INTERNAL_SERVICE_KEY` settings above are shared by the .NET clients. Keep the same internal key configured for FastAPI and .NET; never send it to the browser. The worker uses a three-second idle poll and a maximum of eight attempts.

Customer ticket creation enqueues sentiment for its description, and a customer follow-up enqueues a new analysis for the description plus customer-authored messages up to that event. Officer messages are excluded. The ticket/message and corresponding job are committed together in PostgreSQL. A background worker claims jobs using expiring leases and `FOR UPDATE SKIP LOCKED`, retries transient errors with bounded exponential backoff, and records a historical result once per event. History rows retain their event sequence; reports must select the highest sequence among successful records to identify a ticket's latest successful customer-conversation sentiment. No sentiment result changes ticket priority or status.

Resolution lifecycle supports `Resolved` and `Closed`, and resolved tickets may return to active status. This batch does not enqueue a separate resolution analysis: the latest successful customer-originated event remains the meaningful conversation sentiment across resolve/reopen cycles, while an optional resolution snapshot would need a dedicated, explicitly defined event and should be added separately.

The schema change is supplied as an EF migration only. It is not applied by the application at startup.

## Admin sentiment analytics

Admin-only endpoints are available under `/api/admin/sentiment-analytics`:

- `GET /distribution` counts each ticket once using its highest successful `EventSequence`; percentages use classified tickets as the denominator, and `unanalyzedTickets` is reported separately.
- `GET /trends?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` groups successful historical event rows by UTC day. Dates default to the last 30 days and ranges are limited to 366 days.
- `GET /tickets?page=1&pageSize=20&label=positive` pages through each ticket's latest successful event. The response contains ticket ID, status, priority, label, confidence, timestamp, and event sequence; it does not include customer identity or conversation text.

The Admin dashboard is available at `/admin/sentiment`. Ticket IDs link to the existing Admin support page filtered by that ID. All requests use the existing browser JWT through `apiRequest`; the internal FastAPI key is never sent to the browser.

## Run locally

In one PowerShell window, start FastAPI using its README setup and configuration:

```powershell
Set-Location .\ai-service
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

In a second window, configure the .NET values above and run:

```powershell
Set-Location <repository-root>
dotnet run --project .\backend\BankingAPI\BankingAPI.csproj
```

Both FastAPI routes require `Authorization: Bearer <INTERNAL_SERVICE_KEY>`. Their JSON request uses `subject`, `description`, and `messages`; each message uses `sender_role` and `message`. Responses contain `result`. The .NET client uses those exact field names and paths.

## Officer routes

- `POST /api/officer/tickets/{id}/ai-summary`
- `POST /api/officer/tickets/{id}/suggested-response`

Both use the normal Officer JWT. Only the Officer assigned to the ticket can generate a result. Missing, unassigned, or differently assigned tickets return 404. The most recent 100 messages are sent in chronological order to respect FastAPI's request limit. Ticket content and generated results are not logged or saved by the integration.
