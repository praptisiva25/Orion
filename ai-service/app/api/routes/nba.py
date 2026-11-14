from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.routes.tickets import get_provider
from app.nba.schemas.recommendations import NextBestActionRequest, NextBestActionResponse
from app.nba.services.recommendation_service import NextBestActionService
from app.providers.base import LLMProvider, ProviderError


router = APIRouter(prefix="/v1/nba", tags=["next-best-action"])
logger = logging.getLogger(__name__)


@router.post("/recommendations", response_model=NextBestActionResponse)
async def generate_next_best_actions(
    context: NextBestActionRequest,
    request: Request,
    provider: LLMProvider = Depends(get_provider),
) -> NextBestActionResponse:
    try:
        async with request.app.state.generation_limiter:
            return await NextBestActionService(provider).generate(context)
    except ProviderError as error:
        logger.warning(
            "NBA generation failed; stage=%s upstream_status_code=%s",
            error.stage,
            error.upstream_status_code,
        )
        raise HTTPException(status_code=503, detail="Next Best Action service is temporarily unavailable. Please retry.") from None
    except Exception as error:
        logger.error("NBA generation failed; stage=unhandled exception_type=%s", type(error).__name__)
        raise HTTPException(status_code=502, detail="Next Best Action service is unavailable.") from None
    finally:
        await provider.close()
