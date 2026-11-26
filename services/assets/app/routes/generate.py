"""T213 [US13] Route `POST /generate` du contrat assets-service.md."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app import instances
from app.generator.steganography import PayloadTooLarge
from app.storage import ObjectConflict, StorageUnavailable

router = APIRouter()


class InstanceRequest(BaseModel):
    challengeId: str
    challengeVersion: int
    kind: str
    subject: dict[str, Any]
    parameters: dict[str, Any] = {}


@router.post("/generate")
def generate(request: InstanceRequest, response: Response) -> dict[str, Any]:
    """Génère un asset ; les erreurs métier conservent les codes du contrat."""
    try:
        return instances.generate(request.model_dump())
    except PayloadTooLarge as cause:
        raise HTTPException(status_code=422, detail=str(cause)) from cause
    except ObjectConflict as cause:
        raise HTTPException(status_code=409, detail=str(cause)) from cause
    except StorageUnavailable as cause:
        response.headers["Retry-After"] = "1"
        raise HTTPException(status_code=503, detail=str(cause)) from cause
    except ValueError as cause:
        raise HTTPException(status_code=400, detail=str(cause)) from cause
