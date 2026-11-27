# Campagnes de charge k6 (T263)

Les scénarios sont versionnés dans `infra/load/` et validés avec **k6 0.50.0**
(`docker run --rm -i grafana/k6:0.50.0 inspect - < infra/load/<script>.js` → OK).
Ils ciblent le reverse proxy local (`http://127.0.0.1:8080`) et acceptent
`BASE_URL` pour un environnement déployé.

## Procédure

```bash
# 1. Démarrer la pile complète (API + runner + web + nginx) puis vérifier /health.
docker compose -f infra/docker-compose.yml up -d

# 2. Récupérer un jeton d'accès et un défi publié via le seed de démonstration.
export BASE_URL=http://127.0.0.1:8080
export AUTH_TOKEN='<access-token>'
export CHALLENGE_ID='<uuid>'

# 3. Exécuter les trois scénarios et archiver la sortie JSON.
k6 run infra/load/browse.js
k6 run infra/load/submissions.js
k6 run infra/load/realtime.js
```

## Seuils et suivi

| Objectif | Script | Seuil | État |
|---|---|---|---|
| **SC-003** p95 < 300 ms hors soumission | `browse.js` (montée jusqu'à 1000 VU) | `http_req_duration p(95)<300`, `http_req_failed<1 %` | Script validé ; mesure à consigner sur la pile complète |
| **SC-004** 100 soumissions/min, 1000 utilisateurs actifs | `submissions.js` (`constant-arrival-rate`) | `http_req_duration p(95)<300`, `http_req_failed<1 %` | Script validé ; mesure à consigner sur la pile complète |
| **SC-005** 500 connexions temps réel sans perte | `realtime.js` (500 VU Socket.IO) | `ws_connecting p(95)<1000 ms` | Script validé ; mesure à consigner sur la pile complète |

Aucune mesure SC n'est publiée ici : k6 n'est pas installé sur le poste de
développement et la pile complète (nginx + API + runner + Redis) n'est pas
démarrée. Les chiffres ne seront pas inventés ; la campagne doit être rejouée
en environnement de recette avant la mise en production, puis les valeurs
`p(95)`, le taux d'erreur et le nombre de sessions reportés dans ce tableau.

Le runner et l'API exposent déjà les métriques complémentaires utilisées pour
interpréter une campagne : `runner_jobs_active` (`:9464/metrics`) et les
compteurs Prometheus de `apps/api/src/common/metrics/`.
