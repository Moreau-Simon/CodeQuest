"""T206 [P] [US13] Tests de génération d'assets (FR-041, FR-044).

La génération doit être déterministe par sujet, idempotente par clé d'objet,
ne jamais exposer la graine ni le message caché, et respecter les bornes du
contrat (dimensions, format, taille du payload).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import instances
from app.instances import derive_seed, expected_answer
from app.main import app

SEED_KEY_HEX = "22" * 32
CHALLENGE_ID = "018f0000-0000-7000-8000-000000000002"
VERSION = 4


@pytest.fixture(autouse=True)
def seed_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Clé de graine déterministe, cache et limiteur vidés pour chaque test."""
    monkeypatch.setenv("ASSETS_SEED_KEY", SEED_KEY_HEX)
    instances.reset_cache()
    instances.reset_rate_limit()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def generation_request(subject_id: str = "player-alpha", **overrides: object) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "challengeId": CHALLENGE_ID,
        "challengeVersion": VERSION,
        "kind": "steganography",
        "subject": {"type": "player", "id": subject_id},
        "parameters": {"width": 800, "height": 600, "format": "png"},
    }
    payload.update(overrides)
    return payload


def answer_for(subject_id: str) -> str:
    seed = derive_seed(bytes.fromhex(SEED_KEY_HEX), CHALLENGE_ID, "player", subject_id, VERSION)
    return expected_answer(seed)


def test_generation_steganographique_est_deterministe_et_idempotente(client: TestClient) -> None:
    first = client.post("/generate", json=generation_request())
    second = client.post("/generate", json=generation_request())

    assert first.status_code == 200
    assert second.status_code == 200
    a, b = first.json(), second.json()
    assert a["sha256"] == b["sha256"]
    assert re.fullmatch(r"[0-9a-f]{64}", a["sha256"])
    assert a["assetId"] == b["assetId"]
    assert a["objectKey"] == b["objectKey"]
    assert a["objectKey"].startswith("assets/steganography/")
    assert a["seedFingerprint"] == b["seedFingerprint"]
    assert re.fullmatch(r"[0-9a-f]{16}", a["seedFingerprint"])
    assert a["cached"] is False
    assert b["cached"] is True
    assert a["bytes"] > 0
    assert a["width"] == 800
    assert a["height"] == 600
    assert "X-Amz-Expires=900" in a["url"]
    assert datetime.fromisoformat(a["generatedAt"])
    assert "ciphertext" not in a
    assert "payload" not in a


def test_deux_sujets_differents_produisent_des_assets_differents(client: TestClient) -> None:
    alpha = client.post("/generate", json=generation_request("player-alpha")).json()
    beta = client.post("/generate", json=generation_request("player-beta")).json()

    assert alpha["seedFingerprint"] != beta["seedFingerprint"]
    assert alpha["objectKey"] != beta["objectKey"]
    assert alpha["sha256"] != beta["sha256"]


def test_la_reponse_ne_revele_ni_graine_ni_message_cache(client: TestClient) -> None:
    response = client.post("/generate", json=generation_request())
    body = response.text

    assert SEED_KEY_HEX not in body
    assert answer_for("player-alpha") not in body
    assert "seed" not in {key.lower() for key in response.json()}


def test_parametres_hors_bornes_sont_rejetes(client: TestClient) -> None:
    too_small = client.post("/generate", json=generation_request(parameters={"width": 100}))
    bad_format = client.post("/generate", json=generation_request(parameters={"format": "gif"}))
    too_long = client.post("/generate", json=generation_request(parameters={"payload": "A" * 2049}))

    assert too_small.status_code == 400
    assert bad_format.status_code == 400
    assert too_long.status_code == 400


def test_atelier_inverse_cache_un_message_fourni_par_le_joueur(client: TestClient) -> None:
    message = "MESSAGE-CACHE-PAR-LE-JOUEUR"
    generated = client.post("/generate", json=generation_request(parameters={"payload": message}))
    assert generated.status_code == 200
    assert message not in generated.text

    verified = client.post(
        "/verify",
        json={
            "challengeId": CHALLENGE_ID,
            "challengeVersion": VERSION,
            "kind": "steganography",
            "subject": {"type": "player", "id": "player-alpha"},
            "answer": {"assetId": generated.json()["assetId"], "text": message},
        },
    )
    assert verified.status_code == 200
    assert verified.json()["correct"] is True
