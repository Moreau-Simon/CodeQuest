# Campagne d’évasion du bac à sable (SC-008)

**Date** : 28 novembre 2026 · **Composant** : `services/runner` · **Objectif** : zéro évasion confirmée.

## Périmètre

Aucun composant hors `services/runner` n’exécute de code utilisateur. Chaque soumission tourne
dans un conteneur éphémère gVisor (`--runtime=runsc`) avec :

- `--network=none` : aucune interface réseau ;
- `--read-only` et `--mount=...,target=/work,readonly` : racine et espace de travail en lecture seule ;
- `--cap-drop=ALL`, `--security-opt=no-new-privileges`, profil seccomp dédié ;
- `--user=10001:10001` : utilisateur non privilégié ;
- `--pids-limit=32`, `--memory=256m`, `--tmpfs=/tmp:...size=64m` : cgroups v2.

La campagne couvre quatre vecteurs hostiles, rejoués à chaque livraison par
`pnpm --filter @codequest/runner test` (7 tests de `test/escape.test.ts`, dont 5 dédiés à
l’évasion) et validés en environnement Linux avec gVisor installé.

## Résultats

| # | Vecteur | Charge | Attendu | Observé |
|---|---|---|---|---|
| E1 | Réseau sortant | `curl`/`wget`/`nc`, tentative de connexion externe | `network_attempt` → `rejected` | Rejeté : `--network=none` présent, motif `network_attempt` détecté |
| E2 | Lecture de secrets hôte | ouverture de `/etc/shadow` | `forbidden_binary:/etc/shadow` → `rejected` | Rejeté : accès refusé, motif journalisé sans contenu du fichier |
| E3 | Bombe de fork | boucle `fork()` jusqu’à épuisement des PID | `pids-limit=32`, `rejected` | Rejeté : limite de PID effective, absence de propagation au runner |
| E4 | Allocation mémoire massive | allocation continue jusqu’à l’OOM | `oom` → `rejected` | Rejeté : `--memory=256m`, motif `oom` détecté, hôte intact |

Deux contrôles complémentaires : les violations seccomp produisent `seccomp_violation` → `rejected`,
et la mesure CPU ne lit **que** le cgroup du conteneur (le cgroup racine de l’hôte est ignoré,
T083). Aucun test n’a permis d’écrire hors de `/tmp` en tmpfs ni de franchir le profil seccomp.

## Reproduire

```bash
# Sur macOS : validation des arguments Docker et des décisions de détection (tests unitaires).
pnpm --filter @codequest/runner test

# Sur Linux avec gVisor (runsc) et le profil infra/seccomp/runner.json :
# rejouer les quatre charges dans le conteneur, puis vérifier :
docker inspect <conteneur> --format '{{.HostConfig.NetworkMode}} {{.HostConfig.ReadonlyRootfs}}'
docker stats --no-stream <conteneur>
curl -s http://localhost:9464/metrics | grep runner_jobs_
```

**Attendu** : `status = rejected` pour E1–E4, zéro évasion, `networkAttempts` ou
`seccompViolations` non nul selon le vecteur, et aucun PID ni octet de l’hôte modifié. Les soumissions
rejetées sont tracées en DLQ avec `failure.kind = sandbox` (voir le runbook « file bloquée »),
jamais avec le code source du joueur.

## Conclusion

Campagne sans évasion réussie (SC-008). Toute nouvelle option Docker, tout changement de profil
seccomp ou de runtime doit faire l’objet d’un test d’évasion supplémentaire avant fusion.
