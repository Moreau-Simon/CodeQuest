# Contrat — Service d'assets (génération par graine)

**Feature**: `001-codequest-platform` · **Date**: 2026-11-13
**Stack** : Python 3.12 + FastAPI + Pillow + `qrcode` + `stegano` · **Port** : `8001` (interne)
**Accès** : réseau interne uniquement, jamais exposé au navigateur ; appelé par l'API.

## 1. Rôle

Produire et vérifier les artefacts des défis exploratoires — stéganographie, QR codes, images de
décryptage — de façon **déterministe à partir d'une graine serveur**, sans jamais révéler la graine
au client (FR-040, FR-041, FR-113).

## 2. Calcul de la graine

```text
seed = HMAC-SHA256(ASSETS_SEED_KEY, f"{challenge_id}|{subject_type}|{subject_id}|{version}")
```

- `ASSETS_SEED_KEY` : secret de 32 octets fourni par l'environnement, jamais journalisé.
- La même combinaison reproduit **exactement** la même image, y compris après redéploiement ou purge
  du cache (edge case « image régénérée »).
- Le PRNG est `xoshiro128**` initialisé avec les 128 premiers bits du HMAC ; aucune dépendance à
  `random` global ni à l'horloge.
- La graine n'est **jamais** renvoyée dans une réponse ni incluse dans une URL.

## 3. `POST /generate`

Génère l'artefact d'une instance de défi.

### Requête

```jsonc
{
  "challengeId": "uuid",
  "challengeVersion": 3,
  "kind": "steganography",              // steganography | qr_code | decryption_image
  "subject": { "type": "player", "id": "uuid" },
  "parameters": {
    "width": 800,
    "height": 600,
    "format": "png",                    // png | jpeg
    "payload": "FLAG{...}",             // pour steganography / qr_code
    "qrStyle": {                        // pour qr_code
      "fragments": 4,
      "rotationDeg": 7,
      "noiseLevel": 0.15,
      "overlay": true
    },
    "decryptionStyle": {                // pour decryption_image
      "cipher": "xor",                  // xor | caesar | vigenere
      "maskOpacity": 0.6
    }
  }
}
```

### Réponse `200`

```jsonc
{
  "assetId": "uuid",
  "seedFingerprint": "3f9a…c1",          // 8 premiers octets du HMAC, pour support/debug
  "ciphertext": "…",                     // présent pour decryption_image, consommé par GET /challenges/{id}
  "objectKey": "assets/steg/018f…/3f9a…c1-<variant>.png",
  "url": "https://minio.internal/…?X-Amz-Expires=900",
  "sha256": "…",
  "width": 800,
  "height": 600,
  "bytes": 214311,
  "generatedAt": "2026-11-13T10:00:00Z",
  "cached": false
}
```

- `url` est une URL signée de **15 minutes** vers MinIO ; l'API la remplace par une URL de proxy
  publique si le bucket n'est pas exposé.
- **Idempotence** : la clé d'objet dérive de `(challengeId, version, subject, kind,
  seedFingerprint)`. Un appel répété renvoie `cached: true` avec la même clé, sans régénération.
- **Limites** : `600 ≤ width,height ≤ 2000`, `payload ≤ 2 Kio`, temps de génération ≤ 3 s ; au-delà,
  `503` avec `Retry-After`.

### Erreurs

| Code | Cas |
|---|---|
| `400` | Paramètres invalides, `kind` inconnu, payload trop long |
| `409` | Conflit de clé d'objet avec un contenu différent (garde-fou d'intégrité) |
| `422` | Payload impossible à encoder (QR sur-capacitaire) |
| `503` | Saturation CPU ou MinIO indisponible |

## 4. `POST /verify`

Vérifie la réponse d'un joueur **sans jamais renvoyer la solution**.

### Requête

```jsonc
{
  "challengeId": "uuid",
  "challengeVersion": 3,
  "kind": "steganography",
  "subject": { "type": "player", "id": "uuid" },
  "answer": { "text": "FLAG{...}" }      // ou { "assetId": "uuid" } pour une image retour
}
```

### Réponse `200`

```jsonc
{
  "correct": true,
  "partial": { "matchedFragments": 4, "totalFragments": 4 },
  "reason": null,
  "elapsedMs": 812
}
```

- En cas d'échec, `reason` reste générique (`"payload_mismatch"`, `"incomplete_fragments"`) : aucune
  fuite de la valeur attendue (FR-029).
- La comparaison est à temps constant pour les payloads textuels.
- Un rate limit de 10 vérifications/minute par `(subject.type, subject.id, challengeId)` protège
  du brute force. L'API publique traduit ses champs plats (`cipher`, `maskOpacity`) en
  `parameters.decryptionStyle` ; le suffixe `-<variant>` de l'objectKey distingue les variantes.

## 5. `GET /health`

```jsonc
{ "status": "ok", "version": "1.2.0", "minio": "ok", "queueDepth": 0, "uptimeSeconds": 41233 }
```

`status` ∈ `ok | degraded | down` ; `degraded` si MinIO répond en plus de 1 s.

## 6. Stockage et cycle de vie

| Élément | Règle |
|---|---|
| Bucket | `codequest-assets`, privé, versioning désactivé |
| Chemin | `assets/<kind>/<challengeId>/<seedFingerprint>-<variant>.<ext>` |
| Métadonnées | `sha256`, `challenge-version`, `generated-at`, `seed-fingerprint` |
| Rétention | 90 jours ; purge des objets non référencés par une soumission récente |
| Régénération | toujours possible depuis la graine, sans perte |
| Chiffrement | SSE-S3 côté MinIO ; aucune donnée personnelle dans les images |

## 7. Sécurité et ressources

- Aucun accès réseau sortant (le service n'appelle que MinIO sur le réseau interne).
- `payload` est traité comme une donnée opaque : pas d'évaluation, pas de rendu HTML.
- Limites d'exécution : `CPU 1.0`, `mémoire 512 Mio`, timeout de requête 5 s, file d'attente bornée à
  50 tâches ; au-delà, `503` immédiat (contre-pression vers l'API).
- Les images générées sont scannées par Pillow (mode, dimensions) avant écriture pour éviter les
  bombes de décompression.
- Journalisation : `assetId`, `challengeId`, `kind`, durée ; jamais la graine ni le payload.

## 8. Tests attendus (`pytest`)

- Déterminisme : deux appels identiques produisent le même `sha256`.
- Indépendance : deux `subject_id` différents produisent des images différentes.
- Non-fuite : la réponse ne contient ni graine brute ni payload attendu.
- Vérification correcte/incorrecte/partielle pour chaque `kind`.
- Rejet des paramètres hors bornes et des payloads sur-capacitaires.
- Temps de génération sous 3 s pour les tailles maximales (repère de performance).

## 9. Conformité

| Exigence | Couverture |
|---|---|
| FR-040, FR-041 génération déterministe par graine | §2, §3 (idempotence) |
| FR-043 atelier inverse (cacher un message) | `kind = steganography`, `payload` fourni par le joueur |
| FR-044 QR surchargé, fragmenté, altéré | `qrStyle` (`overlay`, `fragments`, `rotationDeg`) |
| FR-028 aucune fuite de test ou de solution vers le client | §4 (`reason` générique), §7 |
| FR-027, principe I — exécution hors du processus web, sans code utilisateur | service séparé, aucun payload évalué |

## État d’implémentation (T269, 28 novembre 2026)

- L’API publique expose des champs plats (`cipher`, `maskOpacity`) traduits en
  `parameters.decryptionStyle` avant l’appel au service interne.
- `ciphertext` est renvoyé par `/generate` pour `decryption_image` et consommé par
  `GET /challenges/{id}` ; il ne contient ni graine ni réponse attendue.
- `maskOpacity` est réservé : le rendu actuel n’applique pas encore d’opacité paramétrable.
- `GET /health` expose un champ `service` supplémentaire ; `minio` est signalé `ok` et le passage à
  `degraded` nécessite une sonde de latence (à brancher sur le healthcheck MinIO).
- La rétention à 90 jours est assurée par la politique de cycle de vie du bucket ; la file de
  génération est bornée par la capacité du pool de workers.
