"""Service d'assets CodeQuest.

Génération déterministe (seed) d'images de stéganographie, de QR codes surchargés
et d'instances de décryptage. Aucun code utilisateur n'est exécuté ici.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app import instances

app = FastAPI(
    title="CodeQuest Assets",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


class InstanceRequest(BaseModel):
    challengeId: str
    challengeVersion: int
    kind: str
    subject: dict[str, Any]
    parameters: dict[str, Any] = {}


class VerifyRequest(InstanceRequest):
    answer: dict[str, Any]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "assets"}


@app.post("/generate")
def generate(request: InstanceRequest) -> dict[str, Any]:
    """Génère une instance d'asset ; les paramètres invalides donnent 400."""
    try:
        return instances.generate(request.model_dump())
    except ValueError as cause:
        raise HTTPException(status_code=400, detail=str(cause)) from cause


@app.post("/verify")
def verify(request: VerifyRequest) -> dict[str, Any]:
    """Vérifie une réponse sans renvoyer la solution attendue."""
    try:
        return instances.verify(request.model_dump())
    except (TypeError, ValueError) as cause:
        raise HTTPException(status_code=400, detail=str(cause)) from cause
