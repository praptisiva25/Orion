from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request

from app.schemas.sentiment import SentimentRequest, SentimentResponse
from app.services.sentiment_analysis import (
    SentimentAnalysisError,
    SentimentAnalysisService,
    SentimentInputError,
)


router = APIRouter(prefix="/v1/sentiment", tags=["sentiment"])


def get_sentiment_service(request: Request) -> SentimentAnalysisService:
    return request.app.state.sentiment_service


@router.post("/analyze", response_model=SentimentResponse)
async def analyze_sentiment(
    payload: SentimentRequest,
    service: SentimentAnalysisService = Depends(get_sentiment_service),
) -> SentimentResponse:
    try:
        prediction = await asyncio.to_thread(service.analyze, payload.text)
    except SentimentInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except SentimentAnalysisError:
        raise HTTPException(status_code=503, detail="Sentiment analysis is temporarily unavailable.") from None

    return SentimentResponse(
        label=prediction.label,
        confidence=prediction.confidence,
        model_name=prediction.model_name,
        model_version=prediction.model_version,
    )
