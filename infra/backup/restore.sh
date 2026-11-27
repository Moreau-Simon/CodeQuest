#!/usr/bin/env bash
# Restauration sur une base scratch puis contrôle d'intégrité (T259, SC-014).
# Usage : bash infra/backup/restore.sh <chemin.dump>
set -euo pipefail

TARGET="${1:?usage: restore.sh <fichier.dump>}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"

test -f "$TARGET"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore --clean --if-exists -U "${POSTGRES_USER:-codequest}" -d "${POSTGRES_DB:-codequest}" < "$TARGET"

echo "Restauration terminée : $TARGET"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/verify-integrity.sh"
