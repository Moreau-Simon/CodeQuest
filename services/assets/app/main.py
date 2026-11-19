"""Service d'assets CodeQuest.

Génération déterministe (seed) d'images de stéganographie, de QR codes surchargés
et d'instances de décryptage. Aucun code utilisateur n'est exécuté ici.
"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(
    title="CodeQuest Assets",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "assets"}
