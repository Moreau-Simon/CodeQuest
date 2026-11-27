"""T254 [US17] (FR-111) : validation stricte de la configuration assets."""

import pytest

from app.config import load_config


def test_production_rejects_placeholder_seed_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("ASSETS_SEED_KEY", "codequest-dev-seed-key-000000000000")

    with pytest.raises(ValueError, match="ASSETS_SEED_KEY"):
        load_config()


def test_production_accepts_explicit_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("ASSETS_SEED_KEY", "a" * 64)

    config = load_config()

    assert config.seed_key == "a" * 64


def test_development_keeps_default_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.delenv("ASSETS_SEED_KEY", raising=False)

    config = load_config()

    assert config.seed_key == "codequest-dev-seed-key-000000000000"
