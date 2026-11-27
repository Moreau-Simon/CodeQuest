"""T209 [US13] Graine HMAC-SHA256 et PRNG xoshiro128** (contrat §2, FR-040/041).

La graine dépend uniquement du secret serveur et de l'identité de l'instance.
Aucun appel à `random` global ni à l'horloge : une même identité reproduit
toujours la même image, même après purge du cache.
"""

from __future__ import annotations

import hashlib
import hmac

from app.config import DEFAULT_SEED_KEY, load_config

DEFAULT_KEY_BYTES = DEFAULT_SEED_KEY.encode()


def seed_key() -> bytes:
    """Lit le secret validé de 32 octets depuis la configuration, sans le journaliser."""
    raw = load_config().seed_key
    try:
        key = bytes.fromhex(raw) if len(raw) == 64 else raw.encode()
    except ValueError:
        key = raw.encode()
    return key[:32] if len(key) >= 32 else (key + DEFAULT_KEY_BYTES)[:32]


def derive_seed(
    secret: bytes, challenge_id: str, subject_type: str, subject_id: str, version: int
) -> bytes:
    """Graine unique à un sujet pour un défi et une version donnés."""
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
