"""T213 [US13] Route `POST /verify` du contrat assets-service.md."""

from __future__ import annotations

import math
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import instances

router = APIRouter()


class VerifyRequest(BaseModel):
    challengeId: str
    challengeVersion: int
    kind: str
    subject: dict[str, Any]
    answer: dict[str, Any]


@router.post("/verify", response_model=None)
def verify(request: VerifyRequest) -> dict[str, Any] | JSONResponse:
    """Vérifie une réponse sans jamais renvoyer la valeur attendue."""
    try:
        return instances.verify(request.model_dump())
    except instances.RateLimited as cause:
        return JSONResponse(
            status_code=429,
            content={"detail": str(cause), "retryAfterMs": cause.retry_after_ms},
            headers={"Retry-After": str(math.ceil(cause.retry_after_ms / 1000))},
        )
    except (TypeError, ValueError) as cause:
        raise HTTPException(status_code=400, detail=str(cause)) from cause
