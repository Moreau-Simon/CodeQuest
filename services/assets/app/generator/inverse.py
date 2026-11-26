"""T212 [US13] Atelier inverse : le joueur cache un message et un extracteur de
référence vérifie qu'il est récupérable (FR-043).

Le message fourni par le joueur reste opaque : il n'est ni évalué ni rendu,
seule son empreinte est conservée côté serveur pour la vérification.
"""

from __future__ import annotations

import hashlib

from . import steganography


def hide_message(width: int, height: int, image_format: str, seed: bytes, message: str) -> bytes:
    """Génère l'image portant le message choisi par le joueur."""
    return steganography.encode(width, height, image_format, seed, message)


def extract_message(data: bytes, seed: bytes) -> str | None:
    """Extracteur de référence utilisé pour valider l'atelier inverse."""
    return steganography.decode(data, seed)


def message_digest(message: str) -> str:
    """Empreinte du message caché, jamais exposée au client."""
    return hashlib.sha256(message.encode("utf-8")).hexdigest()
