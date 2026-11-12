from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import get_settings
from app.providers.base import LLMProvider, ProviderError
from app.providers.groq_provider import GroqProvider
from app.schemas.tickets import GeneratedText, TicketContext
from app.services.response_generation import SuggestedResponseService
from app.services.summarization import TicketSummarizationService

router = APIRouter(prefix="/v1/tickets", tags=["ticket-ai"])


def get_provider() -> LLMProvider:
    return GroqProvider(get_settings())


@router.post("/summary", response_model=GeneratedText)
async def summarize_ticket(ticket: TicketContext, request: Request, provider: LLMProvider = Depends(get_provider)) -> GeneratedText:
    try:
        async with request.app.state.generation_limiter:
            result = await TicketSummarizationService(provider).summarize(ticket)
            return GeneratedText(result=result)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="AI summary generation failed.") from None
    finally:
        await provider.close()


@router.post("/suggested-response", response_model=GeneratedText)
async def suggest_response(ticket: TicketContext, request: Request, provider: LLMProvider = Depends(get_provider)) -> GeneratedText:
    try:
        async with request.app.state.generation_limiter:
            result = await SuggestedResponseService(provider).generate(ticket)
            if len(result) > 3000:
                raise ProviderError("AI provider returned a response that exceeds the message limit.")
            return GeneratedText(result=result)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="Suggested response generation failed.") from None
    finally:
        await provider.close()
