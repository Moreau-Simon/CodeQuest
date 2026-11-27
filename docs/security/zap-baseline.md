# Baseline OWASP ZAP (T265)

**Date** : 28 novembre 2026 · **Outil** : ZAP 2.17.0 (`ghcr.io/zaproxy/zaproxy:stable`) ·
**Cible** : build de production du web servi en local par `pnpm --filter @codequest/web preview`.

## Commande

```bash
# L'aperçu Vite est démarré avec CI=1 sur 127.0.0.1:5173. Depuis le conteneur,
# on cible l'IP de l'hôte Docker (le nom host.docker.internal est refusé par Vite).
docker run --rm -v "$PWD/docs/security:/zap/wrk:rw" -u zap \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://192.168.65.254:5173 -m 3 -j -s -I \
  -r zap-baseline.html -J zap-baseline.json
```

Le spider traditionnel et le spider AJAX sont exécutés pendant 3 minutes, puis les règles
passives sont appliquées. Les rapports complets sont versionnés à côté de ce document :
`zap-baseline.html` (détail par URL) et `zap-baseline.json` (données machine).

## Résultat

| FAIL-NEW | FAIL-INPROG | WARN-NEW | INFO | IGNORE | PASS |
|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 8 | 0 | 0 | 60 |

Aucune faille de sécurité new ou en cours n’a été détectée : **0 FAIL**. Huit avertissements
sont relevés, tous de niveau « défense en profondeur » et aucun n’expose de donnée ou de test
caché (les charges utiles restent chiffrées côté API, cf. `escape-campaign.md` pour SC-008).

| Règle | Occurrences | Analyse / action |
|---|---:|---|
| Missing Anti-clickjacking Header [10020] | 3 | Serveur statique de preview. À porter par le reverse proxy de production (`X-Frame-Options: DENY`). |
| X-Content-Type-Options Header Missing [10021] | 5 | Ajouter `nosniff` dans la configuration HTTP de production. |
| Content Security Policy Header Not Set [10038] | 5 | CSP stricte à définir en production (scripts, styles, images, `connect-src`). |
| Non-Storable Content [10049] | 8 | Réponses SPA sans `Cache-Control` adapté ; distinguer coquille (cacheable) et API (jamais mise en cache). |
| Permissions Policy Header Not Set [10063] | 5 | Ajouter une `Permissions-Policy` restrictive en production. |
| Modern Web Application [10109] | 5 | Informatif : simple détection de technologies modernes. Aucune action. |
| Cross-Origin-Embedder-Policy Header Missing or Invalid [90004] | 11 | À évaluer lors de la mise en place de COOP/COEP sur le domaine de production. |
| Application Error Disclosure [90022] | 7 | Messages d’erreur génériques déjà appliqués dans l’API ; vérifier les pages d’erreur du serveur statique de production. |

## Conclusion

Baseline sans échec bloquant : la surface exposée par le build web ne révèle aucune vulnérabilité
exploitable. Les avertissements concernent principalement les en-têtes HTTP du serveur de preview
et doivent être repris dans la configuration de production ; ils sont suivis comme dette connue,
pas comme régression fonctionnelle. Toute évolution de la configuration HTTP ou ajout d’un domaine
doit déclencher un nouveau `zap-baseline.py` et une mise à jour de ce document.
