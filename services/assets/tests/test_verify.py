"""T206 [P] [US13] Tests de vérification sans fuite (FR-029, FR-041).

La vérification compare en temps constant, ne renvoie jamais la valeur
attendue et limite les tentatives à 10 par minute et par (sujet, défi).
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import instances
from app.instances import derive_seed, expected_answer
from app.main import app

SEED_KEY_HEX = "33" * 32
CHALLENGE_ID = "018f0000-0000-7000-8000-000000000003"
VERSION = 5


@pytest.fixture(autouse=True)
def seed_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSETS_SEED_KEY", SEED_KEY_HEX)
    instances.reset_cache()
    instances.reset_rate_limit()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def verify_request(answer: dict[str, Any], subject_id: str = "player-alpha") -> dict[str, Any]:
    return {
        "challengeId": CHALLENGE_ID,
        "challengeVersion": VERSION,
        "kind": "steganography",
        "subject": {"type": "player", "id": subject_id},
        "answer": answer,
    }


def answer_for(subject_id: str) -> str:
    seed = derive_seed(bytes.fromhex(SEED_KEY_HEX), CHALLENGE_ID, "player", subject_id, VERSION)
    return expected_answer(seed)


def generate(client: TestClient, payload: str | None = None) -> dict[str, Any]:
    parameters: dict[str, Any] = {"width": 600, "height": 600, "format": "png"}
    if payload is not None:
        parameters["payload"] = payload
    response = client.post(
        "/generate",
        json={
            "challengeId": CHALLENGE_ID,
            "challengeVersion": VERSION,
            "kind": "steganography",
            "subject": {"type": "player", "id": "player-alpha"},
            "parameters": parameters,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_verification_accepte_le_message_cache_et_rejette_un_autre(client: TestClient) -> None:
    generate(client)
    expected = answer_for("player-alpha")
    good = client.post("/verify", json=verify_request({"text": expected}))
    bad = client.post("/verify", json=verify_request({"text": answer_for("player-beta")}))

    assert good.status_code == 200
    assert good.json()["correct"] is True
    assert good.json()["reason"] is None
    assert bad.status_code == 200
    assert bad.json()["correct"] is False
    assert bad.json()["reason"] == "payload_mismatch"
    assert expected not in bad.text
    assert isinstance(good.json()["elapsedMs"], int)


def test_verification_par_asset_id_retrouve_le_message_de_l_atelier_inverse(
    client: TestClient,
) -> None:
    message = "MESSAGE-INVERSE-TRIVIAL"
    asset = generate(client, message)
    good = client.post(
        "/verify", json=verify_request({"assetId": asset["assetId"], "text": message})
    )
    wrong = client.post(
        "/verify", json=verify_request({"assetId": asset["assetId"], "text": "autre"})
    )

    assert good.json()["correct"] is True
    assert wrong.json()["correct"] is False
    assert wrong.json()["reason"] == "payload_mismatch"


def test_un_asset_id_inconnu_est_rejete(client: TestClient) -> None:
    response = client.post(
        "/verify", json=verify_request({"assetId": "inconnu", "text": "message"})
    )
    assert response.status_code == 400


def test_limite_de_debit_protoge_la_verification(client: TestClient) -> None:
    for _ in range(10):
        response = client.post("/verify", json=verify_request({"text": "incorrect"}))
        assert response.status_code == 200
    limited = client.post("/verify", json=verify_request({"text": "incorrect"}))

    assert limited.status_code == 429
    assert limited.json()["retryAfterMs"] > 0
