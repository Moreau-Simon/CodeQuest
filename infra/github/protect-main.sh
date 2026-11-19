#!/usr/bin/env bash
# Applique la protection de la branche `main` (section 11.2 / T280).
# Prérequis : dépôt distant configuré, GitHub CLI authentifié (`gh auth login`).
# Usage : bash infra/github/protect-main.sh <owner>/<repo>
set -euo pipefail

REPO="${1:?usage: protect-main.sh <owner>/<repo>}"

echo "→ Protection de main sur ${REPO}"

gh api --method PUT "repos/${REPO}/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=ci/lint" \
  -f "required_status_checks[contexts][]=ci/typecheck" \
  -f "required_status_checks[contexts][]=ci/unit" \
  -f "required_status_checks[contexts][]=ci/integration" \
  -f "required_status_checks[contexts][]=ci/e2e" \
  -f "required_status_checks[contexts][]=ci/a11y" \
  -f "required_status_checks[contexts][]=ci/security" \
  -f "enforce_admins=true" \
  -f "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  -f "required_pull_request_reviews[require_code_owner_reviews]=true" \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -f "restrictions=null" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false" \
  -F "required_conversation_resolution=true"

echo "✓ main protégée : PR obligatoire, 1 revue CODEOWNERS, checks CI requis, pas de force-push."
echo "  Note : passer à 2 approbations pour les PR touchant contracts/ ou prisma/schema.prisma"
echo "  (règle documentée dans CODEOWNERS et versioning.md §2)."
