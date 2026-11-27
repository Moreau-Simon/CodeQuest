"""Validation de la configuration du service assets (T254, FR-111)."""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_SEED_KEY = "codequest-dev-seed-key-000000000000"
FORBIDDEN = ("changez-moi", "placeholder", "codequest-dev", "devkey", "test-")


@dataclass(frozen=True)
class AssetsConfig:
    node_env: str
    seed_key: str


def _read(name: str) -> str:
    """Supporte les Docker secrets `NAME_FILE` quand `NAME` est absent."""
    value = os.environ.get(name, "")
    if value:
        return value
    path = os.environ.get(f"{name}_FILE", "")
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip()
    return ""


def load_config() -> AssetsConfig:
    node_env = os.environ.get("NODE_ENV", "development")
    raw = _read("ASSETS_SEED_KEY") or DEFAULT_SEED_KEY

    if node_env == "production" and any(marker in raw.lower() for marker in FORBIDDEN):
        raise ValueError("ASSETS_SEED_KEY doit être remplacé par une clé secrète en production")

    return AssetsConfig(node_env=node_env, seed_key=raw)
