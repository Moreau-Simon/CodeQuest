"""Génération et vérification déterministes d'instances (FR-040 à FR-044).

La graine dérive d'un HMAC-SHA256 d'une clé serveur secrète et de l'identité
(défi, version, sujet). Aucune dépendance à l'horloge ni au `random` global :
une même identité reproduit toujours le même asset. La graine et le message
attendu ne quittent jamais ce module.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import time
import uuid
from collections import deque
from datetime import UTC, datetime
from typing import Any

from . import storage
from .generator import inverse, steganography
from .generator import qr as qr_generator
from .generator.seed import (
    Xoshiro128StarStar,
    derive_seed,
    encrypt_answer,
    expected_answer,
    seed_fingerprint,
    seed_key,
)
from .generator.steganography import PayloadTooLarge
from .storage import ObjectConflict, StorageUnavailable

KINDS = frozenset({"steganography", "qr_code", "decryption_image"})
CIPHERS = frozenset({"xor", "caesar", "vigenere"})
FORMATS = frozenset({"png", "jpeg"})
MIN_SIZE = 600
MAX_SIZE = 2000
MAX_PAYLOAD_BYTES = 2048
MAX_GENERATION_SECONDS = 3
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX = 10

_CACHE: dict[str, dict[str, Any]] = {}
_RATE: dict[tuple[str, str], deque[float]] = {}


class RateLimited(RuntimeError):
    """Trop de vérifications pour un même (sujet, défi)."""

    def __init__(self, retry_after_ms: int) -> None:
        super().__init__("Trop de vérifications")
        self.retry_after_ms = retry_after_ms


def reset_cache() -> None:
    """Vide le cache d'idempotence et le magasin d'objets (utilisé par les tests)."""
    _CACHE.clear()
    storage.reset()


def reset_rate_limit() -> None:
    """Vide le limiteur de débit (utilisé par les tests)."""
    _RATE.clear()


def _subject(request: dict[str, Any]) -> tuple[str, str, str, int]:
    challenge_id = request.get("challengeId")
    version = request.get("challengeVersion")
    subject = request.get("subject") or {}
    if (
        not isinstance(challenge_id, str)
        or not challenge_id
        or not isinstance(version, int)
        or isinstance(version, bool)
        or subject.get("type") not in {"player", "team"}
        or not isinstance(subject.get("id"), str)
        or not subject["id"]
    ):
        raise ValueError("Identité d'instance invalide")
    return challenge_id, subject["type"], subject["id"], version


def _parameters(request: dict[str, Any]) -> dict[str, Any]:
    parameters = request.get("parameters") or {}
    if not isinstance(parameters, dict):
        raise TypeError("Paramètres invalides")
    return parameters


def _dimensions(parameters: dict[str, Any]) -> tuple[int, int, str]:
    width = parameters.get("width", 800)
    height = parameters.get("height", 600)
    image_format = parameters.get("format", "png")
    if (
        not isinstance(width, int)
        or isinstance(width, bool)
        or not isinstance(height, int)
        or isinstance(height, bool)
        or not MIN_SIZE <= width <= MAX_SIZE
        or not MIN_SIZE <= height <= MAX_SIZE
        or image_format not in FORMATS
    ):
        raise ValueError("Paramètres hors bornes")
    return width, height, image_format


def _variant(kind: str, hidden: str, parameters: dict[str, Any], cipher: str) -> str:
    """Distingue deux rendus d'une même graine (style QR, message, chiffrement)."""
    style = (
        qr_generator.validate_style(parameters.get("qrStyle") or {}) if kind == "qr_code" else None
    )
    material = {
        "cipher": cipher if kind == "decryption_image" else None,
        "hidden": hidden,
        "kind": kind,
        "qrStyle": style,
    }
    return hashlib.sha256(json.dumps(material, sort_keys=True).encode()).hexdigest()[:8]


def generate(request: dict[str, Any]) -> dict[str, Any]:
    """Génère (ou retrouve) une instance déterministe pour un sujet."""
    kind = request.get("kind")
    if kind not in KINDS:
        raise ValueError("kind inconnu")
    challenge_id, subject_type, subject_id, version = _subject(request)
    parameters = _parameters(request)
    width, height, image_format = _dimensions(parameters)
    decryption_style = parameters.get("decryptionStyle") or {}
    cipher = decryption_style.get("cipher", parameters.get("cipher", "xor"))
    if cipher not in CIPHERS:
        raise ValueError("Chiffrement inconnu")
    payload = parameters.get("payload", "")
    if not isinstance(payload, str) or len(payload.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise ValueError("Payload invalide")

    seed = derive_seed(seed_key(), challenge_id, subject_type, subject_id, version)
    fingerprint = seed_fingerprint(seed)
    hidden = payload if payload else expected_answer(seed)
    qr_style = (
        qr_generator.validate_style(parameters.get("qrStyle") or {}) if kind == "qr_code" else {}
    )
    object_key = (
        f"assets/{kind}/{challenge_id}/{fingerprint}-{_variant(kind, hidden, parameters, cipher)}"
        f".{image_format}"
    )

    cached = _CACHE.get(object_key)
    if cached is not None:
        return {**cached["public"], "cached": True}

    started = time.perf_counter()
    ciphertext: str | None = None
    if kind == "qr_code":
        data = qr_generator.encode(hidden, width, height, image_format, seed, qr_style)
    elif kind == "steganography":
        data = steganography.encode(width, height, image_format, seed, hidden)
    else:
        ciphertext = encrypt_answer(expected_answer(seed), cipher, seed)
        data = steganography.encode(width, height, image_format, seed, ciphertext)
    if time.perf_counter() - started > MAX_GENERATION_SECONDS:
        raise StorageUnavailable("Génération trop lente")

    generated_at = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    url = storage.put_object(
        object_key,
        data,
        {
            "sha256": storage.sha256_of(data),
            "challenge-version": str(version),
            "generated-at": generated_at,
            "seed-fingerprint": fingerprint,
        },
    )
    public: dict[str, Any] = {
        "assetId": str(uuid.uuid5(uuid.NAMESPACE_URL, object_key)),
        "seedFingerprint": fingerprint,
        "objectKey": object_key,
        "url": url,
        "sha256": storage.sha256_of(data),
        "width": width,
        "height": height,
        "bytes": len(data),
        "generatedAt": generated_at,
        "cached": False,
    }
    if ciphertext is not None:
        public["ciphertext"] = ciphertext

    _CACHE[object_key] = {
        "public": public,
        "expected": hidden,
        "data": data,
        "fragments": int(qr_style.get("fragments", 1)),
    }
    return public


def _check_rate_limit(challenge_id: str, subject_id: str) -> None:
    now = time.monotonic()
    key = (challenge_id, subject_id)
    attempts = _RATE.setdefault(key, deque())
    while attempts and now - attempts[0] >= RATE_LIMIT_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= RATE_LIMIT_MAX:
        retry = math.ceil(RATE_LIMIT_WINDOW_SECONDS - (now - attempts[0])) * 1000
        raise RateLimited(max(1, retry))
    attempts.append(now)


def _partial_matches(expected: str, answer: str, total: int) -> int:
    total = max(1, total)
    size = max(1, math.ceil(len(expected) / total))
    return sum(
        1
        for index in range(total)
        if hmac.compare_digest(
            expected[index * size : (index + 1) * size],
            answer[index * size : (index + 1) * size],
        )
    )


def verify(request: dict[str, Any]) -> dict[str, Any]:
    """Vérifie une réponse en temps constant, sans jamais révéler l'attendu."""
    started = time.perf_counter()
    challenge_id, subject_type, subject_id, version = _subject(request)
    _check_rate_limit(challenge_id, subject_id)
    answer = request.get("answer") or {}
    if not isinstance(answer, dict):
        raise TypeError("Réponse invalide")
    text = answer.get("text")
    asset_id = answer.get("assetId")
    seed = derive_seed(seed_key(), challenge_id, subject_type, subject_id, version)

    expected: str | None = None
    fragments = 1
    if asset_id is not None:
        entry = next(
            (
                candidate
                for candidate in _CACHE.values()
                if candidate["public"]["assetId"] == asset_id
            ),
            None,
        )
        if entry is None:
            raise ValueError("Asset inconnu")
        expected = entry["expected"]
        fragments = entry["fragments"]
    else:
        for candidate in _CACHE.values():
            if candidate["public"]["seedFingerprint"] == seed_fingerprint(seed):
                fragments = candidate["fragments"]
                break
        expected = expected_answer(seed)

    if not isinstance(text, str):
        raise TypeError("Réponse invalide")
    correct = hmac.compare_digest(expected, text)
    matched = _partial_matches(expected, text, fragments)
    reason = None if correct else ("incomplete_fragments" if matched else "payload_mismatch")
    return {
        "correct": correct,
        "partial": {"matchedFragments": matched, "totalFragments": fragments},
        "reason": reason,
        "elapsedMs": round((time.perf_counter() - started) * 1000),
    }


__all__ = [
    "CIPHERS",
    "FORMATS",
    "KINDS",
    "MAX_PAYLOAD_BYTES",
    "MAX_SIZE",
    "MIN_SIZE",
    "ObjectConflict",
    "PayloadTooLarge",
    "RateLimited",
    "StorageUnavailable",
    "Xoshiro128StarStar",
    "derive_seed",
    "encrypt_answer",
    "expected_answer",
    "generate",
    "inverse",
    "reset_cache",
    "reset_rate_limit",
    "seed_fingerprint",
    "seed_key",
    "storage",
    "verify",
]
