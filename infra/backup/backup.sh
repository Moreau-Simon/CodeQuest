#!/usr/bin/env bash
# Sauvegarde quotidienne de PostgreSQL (T259, FR-117).
# Usage : bash infra/backup/backup.sh [chemin.dump]
set -euo pipefail

TARGET="${1:-backups/codequest-$(date -u +%Y%m%dT%H%M%SZ).dump}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"

mkdir -p "$(dirname "$TARGET")"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -Fc -U "${POSTGRES_USER:-codequest}" -d "${POSTGRES_DB:-codequest}" > "$TARGET"

echo "Sauvegarde écrite dans $TARGET"
