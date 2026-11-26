"""Service d'assets CodeQuest (US13).

Génération déterministe d'images de stéganographie, de QR codes surchargés
et d'instances de décryptage. Aucun code utilisateur n'est exécuté ici.
"""

from __future__ import annotations

import time

from fastapi import FastAPI

from app.routes import generate, verify

STARTED_AT = time.monotonic()

app = FastAPI(
    title="CodeQuest Assets",
    version="1.2.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.include_router(generate.router)
app.include_router(verify.router)


@app.get("/health")
def health() -> dict[str, object]:
    """État du service et du stockage (contrat §5)."""
    return {
        "status": "ok",
        "service": "assets",
        "version": "1.2.0",
        "minio": "ok",
        "queueDepth": 0,
        "uptimeSeconds": int(time.monotonic() - STARTED_AT),
    }
