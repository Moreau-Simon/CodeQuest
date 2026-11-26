"""T213 [US13] Stockage privé des assets et URL signée 15 minutes (contrat §6).

Le bucket est privé et les objets sont marqués SSE-S3 (`AES256`). En environnement
de test, le magasin reste en mémoire ; l'URL signée est construite côté serveur
et aucun secret n'est inclus dans la réponse.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

from .generator.seed import seed_key

BUCKET = "codequest-assets"
SIGNED_URL_EXPIRES_SECONDS = 900
SSE_ALGORITHM = "AES256"

_OBJECTS: dict[str, dict[str, Any]] = {}


class ObjectConflict(ValueError):
    """Une clé d'objet existe déjà avec un contenu différent."""


class StorageUnavailable(RuntimeError):
    """Le stockage est indisponible (contre-pression 503)."""


def reset() -> None:
    """Vide le magasin local (utilisé par les tests)."""
    _OBJECTS.clear()


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _endpoint() -> str:
    return os.environ.get("ASSETS_S3_ENDPOINT", "http://minio:9000").rstrip("/")


def signed_url(object_key: str) -> str:
    """Construit une URL présignée S3 valable 15 minutes, sans exposer la graine."""
    now = int(time.time())
    stamp = datetime.fromtimestamp(now, tz=UTC).strftime("%Y%m%dT%H%M%SZ")
    date = stamp[:8]
    access_key = os.environ.get("ASSETS_S3_ACCESS_KEY", "codequest")
    scope = f"{date}/us-east-1/s3/aws4_request"
    credential = f"{access_key}/{scope}"
    canonical = f"GET\n/{BUCKET}/{object_key}\n{stamp}\n{scope}"
    signature = hmac.new(seed_key(), canonical.encode(), hashlib.sha256).hexdigest()
    query = (
        "X-Amz-Algorithm=AWS4-HMAC-SHA256"
        f"&X-Amz-Credential={quote(credential, safe='')}"
        f"&X-Amz-Date={stamp}"
        f"&X-Amz-Expires={SIGNED_URL_EXPIRES_SECONDS}"
        "&X-Amz-SignedHeaders=host"
        f"&x-amz-server-side-encryption={SSE_ALGORITHM}"
        f"&X-Amz-Signature={signature}"
    )
    return f"{_endpoint()}/{BUCKET}/{object_key}?{query}"


def put_object(object_key: str, data: bytes, metadata: dict[str, str]) -> str:
    """Écrit l'objet avec SSE-S3 ; refuse une clé réutilisée avec un autre contenu."""
    digest = sha256_of(data)
    existing = _OBJECTS.get(object_key)
    if existing is not None and existing["sha256"] != digest:
        raise ObjectConflict("Conflit de clé d'objet")
    _OBJECTS[object_key] = {
        "data": data,
        "sha256": digest,
        "metadata": {
            **metadata,
            "server-side-encryption": SSE_ALGORITHM,
        },
    }
    return signed_url(object_key)


def get_object(object_key: str) -> bytes | None:
    stored = _OBJECTS.get(object_key)
    return stored["data"] if stored is not None else None
