"""T210 [US13] Stéganographie LSB avec Pillow et `stegano` (FR-041, FR-043).

Le fond d'image et l'ordre des pixels porteurs dérivent de la graine : aucun
`random` global. Le message est traité comme une donnée opaque, jamais évaluée.
"""

from __future__ import annotations

from collections.abc import Iterator
from io import BytesIO

from PIL import Image
from stegano.lsb import hide, reveal

from .seed import Xoshiro128StarStar

MAX_IMAGE_PIXELS = 4_000_000
PREFIX_OVERHEAD_BYTES = 32


class PayloadTooLarge(ValueError):
    """Le message ne tient pas dans l'image (ou dans le QR code)."""


def capacity(width: int, height: int) -> int:
    """Nombre maximal d'octets dissimulables dans une image RGB."""
    return max(0, (width * height * 3) // 8 - PREFIX_OVERHEAD_BYTES)


def _pixel_generator(seed: bytes, size: int) -> Iterator[int]:
    """Ordre de visite pseudo-aléatoire mais reproductible, sans doublon."""
    prng = Xoshiro128StarStar(seed + b"|pixels")
    seen: set[int] = set()
    while len(seen) < size:
        index = prng.next_u32() % size
        if index in seen:
            continue
        seen.add(index)
        yield index
    return


def _background(width: int, height: int, seed: bytes) -> Image.Image:
    prng = Xoshiro128StarStar(seed + b"|background")
    raw = prng.next_bytes(width * height * 3)
    return Image.frombytes("RGB", (width, height), raw)


def encode(width: int, height: int, image_format: str, seed: bytes, message: str) -> bytes:
    """Cache `message` dans une image déterministe et renvoie les octets encodés."""
    if width * height > MAX_IMAGE_PIXELS:
        raise ValueError("Image trop grande")
    if image_format == "jpeg":
        # La compression JPEG détruit les bits de faible ordre : refuser plutôt
        # que de promettre un message qui ne pourrait pas être retrouvé.
        raise ValueError("La stéganographie exige le format PNG")
    if len(message.encode("utf-8")) > capacity(width, height):
        raise PayloadTooLarge("Message trop long pour l'image")

    carrier = _background(width, height, seed)
    encoded = hide(
        carrier,
        message,
        generator=_pixel_generator(seed, width * height),
        auto_convert_rgb=True,
    )
    buffer = BytesIO()
    encoded.save(buffer, format="PNG")
    return buffer.getvalue()


def decode(data: bytes, seed: bytes) -> str | None:
    """Retrouve le message caché, ou `None` si l'image n'en contient pas."""
    try:
        with Image.open(BytesIO(data)) as image:
            width, height = image.size
        return reveal(
            BytesIO(data),
            generator=_pixel_generator(seed, width * height),
            close_file=False,
        )
    except Exception:  # noqa: BLE001 — une image altérée peut échouer de plusieurs façons
        return None
