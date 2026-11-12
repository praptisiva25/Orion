from __future__ import annotations

import hmac

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings


async def require_internal_service_key(request: Request, call_next):
    """Authenticate every HTTP path without echoing credentials or request data."""
    try:
        expected = get_settings().internal_service_key
    except RuntimeError:
        return JSONResponse(status_code=503, content={"detail": "AI service is not configured."})

    authorization = request.headers.get("authorization", "")
    scheme, _, supplied = authorization.partition(" ")
    if scheme.lower() != "bearer" or not supplied or not hmac.compare_digest(supplied, expected):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized."})
    return await call_next(request)
