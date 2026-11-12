from __future__ import annotations

import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes.tickets import router as tickets_router
from app.core.config import get_settings
from app.core.security import require_internal_service_key

for logger_name in ("uvicorn.access", "httpx", "httpcore"):
    logging.getLogger(logger_name).disabled = True


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = get_settings()
    application.state.generation_limiter = asyncio.Semaphore(settings.max_concurrent_generations)
    yield


app = FastAPI(
    title="ORION BANK Ticket AI Service",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.middleware("http")(require_internal_service_key)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, __: RequestValidationError) -> JSONResponse:
    # FastAPI's default validation response includes submitted values; never echo ticket text.
    return JSONResponse(status_code=422, content={"detail": "Invalid ticket AI request."})


app.include_router(tickets_router)
