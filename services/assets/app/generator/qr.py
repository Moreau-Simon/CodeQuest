"""T211 [US13] QR codes surchargés, fragmentés, pivotés et bruités (FR-044).

Toutes les altérations sont pilotées par la graine : le style change l'image
de façon stable et reproductible, sans jamais dépendre de l'horloge.
"""

from __future__ import annotations

from io import BytesIO
from math import ceil, sqrt
from typing import Any

import qrcode
from PIL import Image, ImageDraw
from qrcode.constants import ERROR_CORRECT_H
from qrcode.exceptions import DataOverflowError

from .seed import Xoshiro128StarStar
from .steganography import MAX_IMAGE_PIXELS, PayloadTooLarge

DEFAULT_STYLE: dict[str, Any] = {
    "fragments": 1,
    "rotationDeg": 0,
    "noiseLevel": 0,
    "overlay": False,
}


def validate_style(style: dict[str, Any]) -> dict[str, Any]:
    """Valide et normalise `qrStyle` ; les bornes sont celles du contrat."""
    normalized = dict(DEFAULT_STYLE)
    normalized.update(style or {})
    fragments = normalized["fragments"]
    rotation = normalized["rotationDeg"]
    noise = normalized["noiseLevel"]
    overlay = normalized["overlay"]
    if (
        not isinstance(fragments, int)
        or isinstance(fragments, bool)
        or not 1 <= fragments <= 9
        or not isinstance(rotation, int)
        or isinstance(rotation, bool)
        or not -180 <= rotation <= 180
        or not isinstance(noise, (int, float))
        or isinstance(noise, bool)
        or not 0 <= noise <= 1
        or not isinstance(overlay, bool)
    ):
        raise ValueError("qrStyle invalide")
    return normalized


def _noise(image: Image.Image, level: float, seed: bytes) -> None:
    if level <= 0:
        return
    width, height = image.size
    prng = Xoshiro128StarStar(seed + b"|noise")
    pixels = image.load()
    for _ in range(int(width * height * level)):
        x, y = prng.next_u32() % width, prng.next_u32() % height
        red, green, blue = pixels[x, y]
        delta = 1 if prng.next_u32() % 2 else -1
        pixels[x, y] = (
            min(255, max(0, red + delta)),
            min(255, max(0, green + delta)),
            min(255, max(0, blue + delta)),
        )


def _overlay(image: Image.Image, seed: bytes) -> None:
    width, height = image.size
    prng = Xoshiro128StarStar(seed + b"|overlay")
    draw = ImageDraw.Draw(image)
    for index in range(6):
        offset = prng.next_u32() % (height // 2)
        draw.line((0, offset, width, offset + height // 3), fill=(190, 190, 190), width=2)


def _fragments(image: Image.Image, count: int) -> Image.Image:
    if count == 1:
        return image
    width, height = image.size
    columns = ceil(sqrt(count))
    rows = ceil(count / columns)
    tile_width, tile_height = width // columns, height // rows
    canvas = Image.new("RGB", (tile_width * columns, tile_height * rows), "white")
    for index in range(count):
        left = (index % columns) * tile_width
        top = (index // columns) * tile_height
        box = (
            index * width // count,
            0,
            (index + 1) * width // count,
            height,
        )
        tile = image.crop(box).resize((tile_width, tile_height), Image.Resampling.NEAREST)
        canvas.paste(tile, (left, top))
    return canvas


def encode(
    payload: str, width: int, height: int, image_format: str, seed: bytes, style: dict[str, Any]
) -> bytes:
    """Génère un QR code altéré selon `style` et renvoie les octets de l'image."""
    normalized = validate_style(style)
    if width * height > MAX_IMAGE_PIXELS:
        raise ValueError("Image trop grande")

    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=1, border=2)
    try:
        qr.add_data(payload)
        qr.make(fit=True)
    except (DataOverflowError, ValueError) as cause:
        # qrcode 8 lève `ValueError` (« version > 40 ») quand la charge dépasse
        # la capacité maximale ; les versions antérieures lèvent DataOverflowError.
        raise PayloadTooLarge("QR code sur-capacitaire") from cause

    image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    image = image.resize((width, height), Image.Resampling.NEAREST)
    if normalized["rotationDeg"]:
        image = image.rotate(
            normalized["rotationDeg"],
            resample=Image.Resampling.BICUBIC,
            expand=False,
            fillcolor="white",
        )
    _noise(image, float(normalized["noiseLevel"]), seed)
    if normalized["overlay"]:
        _overlay(image, seed)
    image = _fragments(image, normalized["fragments"])

    buffer = BytesIO()
    image.save(buffer, format="PNG" if image_format == "png" else "JPEG", quality=95)
    return buffer.getvalue()
