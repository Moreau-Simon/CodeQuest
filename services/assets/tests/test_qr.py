"""T208 [P] [US13] Tests des QR codes surchargés, fragmentés et altérés (FR-044).

Le style du QR doit changer l'asset de façon déterministe, la surcapacité doit
être refusée avec 422, et la vérification partielle ne doit rien révéler.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import instances
from app.instances import derive_seed, expected_answer
from app.main import app

SEED_KEY_HEX = "44" * 32
CHALLENGE_ID = "018f0000-0000-7000-8000-000000000004"
VERSION = 6


@pytest.fixture(autouse=True)
def seed_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSETS_SEED_KEY", SEED_KEY_HEX)
    instances.reset_cache()
    instances.reset_rate_limit()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def qr_style(fragments: int = 4, rotation: int = 7, noise: float = 0.15) -> dict[str, Any]:
    return {
        "fragments": fragments,
        "rotationDeg": rotation,
        "noiseLevel": noise,
        "overlay": True,
    }


def generation_request(style: dict[str, Any] | None = None, **overrides: object) -> dict[str, Any]:
    parameters: dict[str, Any] = {
        "width": 800,
        "height": 800,
        "format": "png",
        "qrStyle": qr_style() if style is None else style,
    }
    request: dict[str, Any] = {
        "challengeId": CHALLENGE_ID,
        "challengeVersion": VERSION,
        "kind": "qr_code",
        "subject": {"type": "player", "id": "player-qr"},
        "parameters": parameters,
    }
    request.update(overrides)
    return request


def answer_for() -> str:
    seed = derive_seed(bytes.fromhex(SEED_KEY_HEX), CHALLENGE_ID, "player", "player-qr", VERSION)
    return expected_answer(seed)


def test_qr_fragmente_rotation_bruit_et_surcharge_est_deterministe(client: TestClient) -> None:
    first = client.post("/generate", json=generation_request())
    second = client.post("/generate", json=generation_request())

    assert first.status_code == 200
    assert second.status_code == 200
    a, b = first.json(), second.json()
    assert a["sha256"] == b["sha256"]
    assert a["objectKey"].startswith("assets/qr_code/")
    assert a["cached"] is False
    assert b["cached"] is True
    assert a["bytes"] > 0
    assert "ciphertext" not in a


def test_le_style_modifie_l_asset_genere(client: TestClient) -> None:
    base = client.post("/generate", json=generation_request()).json()
    rotated = client.post("/generate", json=generation_request(qr_style(rotation=23))).json()
    fragmented = client.post(
        "/generate", json=generation_request(qr_style(fragments=9, rotation=7))
    ).json()

    assert base["sha256"] != rotated["sha256"]
    assert base["sha256"] != fragmented["sha256"]


def test_qr_surcapacitaire_est_rejete_avec_422(client: TestClient) -> None:
    request = generation_request()
    request["parameters"]["payload"] = "A" * 2000

    response = client.post("/generate", json=request)

    assert response.status_code == 422
    assert response.json()["detail"]


def test_style_invalide_est_rejete(client: TestClient) -> None:
    no_fragment = client.post("/generate", json=generation_request(qr_style(fragments=0)))
    too_much_noise = client.post("/generate", json=generation_request(qr_style(noise=1.5)))

    assert no_fragment.status_code == 400
    assert too_much_noise.status_code == 400


def test_verification_partielle_des_fragments_sans_fuite(client: TestClient) -> None:
    generate = client.post("/generate", json=generation_request())
    assert generate.status_code == 200
    expected = answer_for()
    partial = client.post(
        "/verify",
        json={
            "challengeId": CHALLENGE_ID,
            "challengeVersion": VERSION,
            "kind": "qr_code",
            "subject": {"type": "player", "id": "player-qr"},
            "answer": {"text": expected[:8]},
        },
    )

    assert partial.status_code == 200
    body = partial.json()
    assert body["correct"] is False
    assert body["reason"] == "incomplete_fragments"
    assert body["partial"] == {"matchedFragments": 1, "totalFragments": 4}
    assert expected not in partial.text
