"""T141 [P] [US7] Tests de déterminisme des instances générées (FR-040, FR-041).

Une même combinaison (défi, version, sujet) doit toujours produire la même
instance ; deux sujets différents doivent produire des instances différentes ;
ni la graine ni la réponse attendue ne doivent fuir dans une réponse.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import instances
from app.instances import derive_seed, expected_answer
from app.main import app

SEED_KEY_HEX = "11" * 32
CHALLENGE_ID = "018f0000-0000-7000-8000-000000000001"
VERSION = 3


@pytest.fixture(autouse=True)
def seed_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Clé de graine déterministe et cache vidé pour chaque test."""
    monkeypatch.setenv("ASSETS_SEED_KEY", SEED_KEY_HEX)
    instances.reset_cache()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def generation_request(subject_id: str = "player-alpha", **overrides: object) -> dict:
    payload: dict = {
        "challengeId": CHALLENGE_ID,
        "challengeVersion": VERSION,
        "kind": "decryption_image",
        "subject": {"type": "player", "id": subject_id},
        "parameters": {"cipher": "xor", "width": 800, "height": 600, "format": "png"},
    }
    payload.update(overrides)
    return payload


def answer_for(subject_id: str) -> str:
    seed = derive_seed(bytes.fromhex(SEED_KEY_HEX), CHALLENGE_ID, "player", subject_id, VERSION)
    return expected_answer(seed)


def test_deux_appels_identiques_produisent_la_meme_instance(client: TestClient) -> None:
    first = client.post("/generate", json=generation_request())
    second = client.post("/generate", json=generation_request())

    assert first.status_code == 200
    assert second.status_code == 200
    a, b = first.json(), second.json()
    assert a["sha256"] == b["sha256"]
    assert a["ciphertext"] == b["ciphertext"]
    assert a["seedFingerprint"] == b["seedFingerprint"]
    assert a["objectKey"] == b["objectKey"]
    assert a["cached"] is False
    assert b["cached"] is True


def test_deux_sujets_differents_produisent_des_instances_differentes(
    client: TestClient,
) -> None:
    alpha = client.post("/generate", json=generation_request("player-alpha")).json()
    beta = client.post("/generate", json=generation_request("player-beta")).json()

    assert alpha["seedFingerprint"] != beta["seedFingerprint"]
    assert alpha["ciphertext"] != beta["ciphertext"]
    assert alpha["sha256"] != beta["sha256"]


def test_la_reponse_ne_contient_ni_graine_ni_reponse_attendue(client: TestClient) -> None:
    response = client.post("/generate", json=generation_request())
    body = response.text

    assert SEED_KEY_HEX not in body
    assert (
        expected_answer(
            derive_seed(
                bytes.fromhex(SEED_KEY_HEX), CHALLENGE_ID, "player", "player-alpha", VERSION
            )
        )
        not in body
    )
    assert "seed" not in {key.lower() for key in response.json()}


def test_verification_accepte_la_bonne_reponse_et_rejette_celle_d_une_autre_instance(
    client: TestClient,
) -> None:
    verify = {
        "challengeId": CHALLENGE_ID,
        "challengeVersion": VERSION,
        "kind": "decryption_image",
        "subject": {"type": "player", "id": "player-alpha"},
    }
    good = client.post("/verify", json={**verify, "answer": {"text": answer_for("player-alpha")}})
    bad = client.post("/verify", json={**verify, "answer": {"text": answer_for("player-beta")}})

    assert good.status_code == 200
    assert good.json()["correct"] is True
    assert bad.status_code == 200
    assert bad.json()["correct"] is False
    assert bad.json()["reason"] in {"payload_mismatch", "incomplete_fragments"}


def test_parametres_hors_bornes_et_kind_inconnu_sont_rejetes(client: TestClient) -> None:
    too_small = client.post(
        "/generate", json=generation_request(parameters={"cipher": "xor", "width": 100})
    )
    unknown_kind = client.post("/generate", json=generation_request(kind="inconnu"))

    assert too_small.status_code == 400
    assert unknown_kind.status_code == 400
