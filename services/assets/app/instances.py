"""Génération déterministe d'instances de décryptage (FR-040, FR-041).

La graine dérive d'un HMAC-SHA256 d'une clé serveur secrète et de l'identité
(défi, version, sujet). Le PRNG `xoshiro128**` est initialisé avec les 128
premiers bits de cette graine : aucune dépendance à l'horloge ni au `random`
global. La graine et la réponse attendue ne quittent jamais ce module.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from typing import Any

KINDS = frozenset({"steganography", "qr_code", "decryption_image"})
CIPHERS = frozenset({"xor", "caesar", "vigenere"})
FORMATS = frozenset({"png", "jpeg"})
MIN_SIZE = 600
MAX_SIZE = 2000
MAX_PAYLOAD_BYTES = 2048
DEFAULT_SEED_KEY = b"codequest-dev-seed-key-000000000000"

_CACHE: dict[str, dict[str, Any]] = {}


def reset_cache() -> None:
    """Vide le cache d'idempotence (utilisé par les tests)."""
    _CACHE.clear()


def _seed_key() -> bytes:
    raw = os.environ.get("ASSETS_SEED_KEY", "")
    if not raw:
        return DEFAULT_SEED_KEY
    try:
        key = bytes.fromhex(raw) if len(raw) == 64 else raw.encode()
    except ValueError:
        key = raw.encode()
    return key[:32] if len(key) >= 32 else (key + DEFAULT_SEED_KEY)[:32]


def derive_seed(
    secret: bytes, challenge_id: str, subject_type: str, subject_id: str, version: int
) -> bytes:
    """Graine HMAC-SHA256 unique à un sujet pour un défi et une version donnés."""
    material = f"{challenge_id}|{subject_type}|{subject_id}|{version}".encode()
    return hmac.new(secret, material, hashlib.sha256).digest()


def seed_fingerprint(seed: bytes) -> str:
    """Empreinte publique (8 premiers octets) destinée au support/debug."""
    return seed[:8].hex()


def _rotl(value: int, shift: int) -> int:
    return ((value << shift) | (value >> (32 - shift))) & 0xFFFFFFFF


class Xoshiro128StarStar:
    """PRNG déterministe xoshiro128**, sans état global."""

    def __init__(self, seed: bytes) -> None:
        self.state = [int.from_bytes(seed[i : i + 4], "little") for i in (0, 4, 8, 12)]
        if not any(self.state):
            self.state[0] = 1

    def next_u32(self) -> int:
        s = self.state
        result = (_rotl((s[1] * 5) & 0xFFFFFFFF, 7) * 9) & 0xFFFFFFFF
        t = (s[1] << 9) & 0xFFFFFFFF
        s[2] ^= s[0]
        s[3] ^= s[1]
        s[1] ^= s[2]
        s[0] ^= s[3]
        s[2] ^= t
        s[3] = _rotl(s[3], 11)
        return result

    def next_bytes(self, count: int) -> bytes:
        out = bytearray()
        while len(out) < count:
            out.extend(self.next_u32().to_bytes(4, "little"))
        return bytes(out[:count])


def expected_answer(seed: bytes) -> str:
    """Réponse attendue, calculée depuis la graine et jamais exposée par l'API."""
    return "FLAG-" + Xoshiro128StarStar(seed).next_bytes(8).hex().upper()


def encrypt_answer(answer: str, cipher: str, seed: bytes) -> str:
    """Chiffre la réponse avec une clé dérivée de la graine (côté serveur)."""
    key = Xoshiro128StarStar(seed).next_bytes(max(len(answer), 1))
    if cipher == "xor":
        return bytes(a ^ key[i % len(key)] for i, a in enumerate(answer.encode())).hex()
    shift = key[0] % 26
    if cipher == "caesar":
        return "".join(
            chr((ord(char) - base + shift) % 26 + base)
            if (base := 65 if char.isupper() else 97) and char.isalpha()
            else char
            for char in answer
        )
    return "".join(
        chr(
            (ord(char) - (65 if char.isupper() else 97) + key[i % len(key)] % 26) % 26
            + (65 if char.isupper() else 97)
        )
        if char.isalpha()
        else char
        for i, char in enumerate(answer)
    )


def _subject(request: dict[str, Any]) -> tuple[str, str, str, int]:
    challenge_id = request.get("challengeId")
    version = request.get("challengeVersion")
    subject = request.get("subject") or {}
    if (
        not isinstance(challenge_id, str)
        or not challenge_id
        or not isinstance(version, int)
        or subject.get("type") not in {"player", "team"}
        or not isinstance(subject.get("id"), str)
        or not subject["id"]
    ):
        raise ValueError("Identité d'instance invalide")
    return challenge_id, subject["type"], subject["id"], version


def generate(request: dict[str, Any]) -> dict[str, Any]:
    """Génère (ou retrouve) une instance déterministe pour un sujet."""
    kind = request.get("kind")
    if kind not in KINDS:
        raise ValueError("kind inconnu")

    parameters = request.get("parameters") or {}
    width = parameters.get("width", 800)
    height = parameters.get("height", 600)
    fmt = parameters.get("format", "png")
    cipher = parameters.get("cipher", "xor")
    payload = parameters.get("payload", "")
    if (
        not isinstance(width, int)
        or not isinstance(height, int)
        or not MIN_SIZE <= width <= MAX_SIZE
        or not MIN_SIZE <= height <= MAX_SIZE
        or fmt not in FORMATS
        or cipher not in CIPHERS
        or not isinstance(payload, str)
        or len(payload.encode()) > MAX_PAYLOAD_BYTES
    ):
        raise ValueError("Paramètres hors bornes")

    challenge_id, subject_type, subject_id, version = _subject(request)
    seed = derive_seed(_seed_key(), challenge_id, subject_type, subject_id, version)
    fingerprint = seed_fingerprint(seed)
    object_key = f"assets/{kind}/{challenge_id}/{fingerprint}.{fmt}"

    cached = _CACHE.get(object_key)
    if cached is not None:
        return {**cached, "cached": True}

    answer = expected_answer(seed)
    ciphertext = encrypt_answer(answer, cipher, seed)
    result: dict[str, Any] = {
        "assetId": str(uuid.uuid5(uuid.NAMESPACE_URL, object_key)),
        "seedFingerprint": fingerprint,
        "objectKey": object_key,
        "url": f"/assets/internal/{object_key}",
        "sha256": hashlib.sha256(ciphertext.encode()).hexdigest(),
        "width": width,
        "height": height,
        "bytes": len(ciphertext.encode()),
        "generatedAt": "deterministic",
        "cached": False,
        "ciphertext": ciphertext,
    }
    _CACHE[object_key] = result
    return result


def verify(request: dict[str, Any]) -> dict[str, Any]:
    """Vérifie une réponse en temps constant, sans jamais révéler l'attendu."""
    started = time.perf_counter()
    challenge_id, subject_type, subject_id, version = _subject(request)
    answer = (request.get("answer") or {}).get("text")
    if not isinstance(answer, str):
        raise TypeError("Réponse invalide")

    seed = derive_seed(_seed_key(), challenge_id, subject_type, subject_id, version)
    correct = hmac.compare_digest(expected_answer(seed), answer)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    return {
        "correct": correct,
        "partial": {"matchedFragments": len(answer) if correct else 0, "totalFragments": 1},
        "reason": None if correct else "payload_mismatch",
        "elapsedMs": elapsed_ms,
    }
