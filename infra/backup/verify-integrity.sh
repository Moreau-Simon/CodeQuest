#!/usr/bin/env bash
# Vérifie soldes, classements et états de comptes après restauration (T251, SC-014).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# Le Pushgateway est exposé localement par la stack de production ; la CI ne
# définit pas cette variable et n'émet donc aucune métrique.
export PUSHGATEWAY_URL="${PUSHGATEWAY_URL:-http://localhost:9091}"
corepack pnpm ops:verify-integrity
