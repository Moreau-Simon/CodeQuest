# Runbook — rotation de clé AES (FR-110, SC-021)

**Date** : 28 novembre 2026 · **Périmètre** : chiffrement applicatif des tests cachés et solutions.

## Contexte

`AesGcmService` chiffre en AES-256-GCM avec `AES_KEY_BASE64` (32 octets) et `AES_KEY_ID`.
Le format stocké est `[longueur du key_id][key_id][nonce 12][chiffré][tag 16]` ; le
`challenge_version_id` sert d'AAD, donc un chiffré ne peut pas être réutilisé pour une autre
version de défi. Le service n'accepte qu'**une seule clé active** : un chiffré portant un autre
`key_id` est refusé avec « Clé AES inconnue ». La rotation est donc une procédure de
**ré-chiffrement**, pas un simple changement de variable d'environnement.

## Procédure

1. **Préparer** : générer une nouvelle clé aléatoire de 32 octets et un nouvel identifiant
   unique, par exemple `v2`. Stocker les deux valeurs dans le gestionnaire de secrets ; ne jamais
   les committer.
2. **Inventaire** : relever les `key_id` effectivement présents (lecture de l'en-tête via
   `AesGcmService.readKeyId`) dans les versions de défis. Vérifier qu'aucun chiffré ne référence
   une clé déjà perdue.
3. **Fenêtre de compatibilité** : déployer une version de l'API capable de déchiffrer l'ancien
   `key_id` avec l'ancienne clé et de chiffrer avec la nouvelle (double lecture, écriture unique).
   Tant que cette version n'est pas en production, ne pas modifier `AES_KEY_ID`.
4. **Ré-chiffrer** : pour chaque version, déchiffrer avec l'ancienne clé puis ré-enregistrer avec
   la nouvelle avec le même AAD (`challenge_version_id`). Traiter par lots et consigner les identifiants
   traités dans un fichier d'audit non versionné.
5. **Bascule** : positionner `AES_KEY_BASE64` / `AES_KEY_ID` sur la nouvelle clé, redémarrer
   l'API et retirer l'ancienne clé du gestionnaire de secrets après observation complète.
6. **Rotation des secrets voisins** : si la clé AES est compromise, rotation également de
   `SESSION_SECRET` (invalidation des sessions) et de `ASSETS_SEED_KEY` selon le runbook
   `onboarding.md`.

## Vérification

- `pnpm --filter @codequest/api test -- --runTestsByPath test/unit/aes-gcm-di.spec.ts` :
  chiffrement/déchiffrement, altération du tag et séparation par AAD.
- Aucun test caché ni solution de référence n'est lisible en clair dans la base ni dans les
  réponses API (quickstart S3).
- La soumission d'un défi de chaque type (tri, débogage, stéganographie) fonctionne après bascule.
- L'ancien `key_id` n'apparaît plus dans l'inventaire ; les journaux ne contiennent ni clé ni
  chiffré brut.
