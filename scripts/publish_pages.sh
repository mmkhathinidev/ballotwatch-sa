#!/usr/bin/env bash
# Publish the static snapshot to the gh-pages branch.
#
# Use this when GitHub Actions cannot run (a billing lock, an org policy, or a
# private-repo minutes limit). The Pages site is branch-built, so a plain push
# is enough — no runner required.
#
#   ./scripts/publish_pages.sh                 # base path /ballotwatch-sa/
#   BASE=/ ./scripts/publish_pages.sh          # custom domain or user site
set -euo pipefail

cd "$(dirname "$0")/.."

BASE="${BASE:-/ballotwatch-sa/}"
BRANCH="${BRANCH:-gh-pages}"
REPO_URL="${REPO_URL:-$(git remote get-url origin)}"
NAME="$(git config user.name || echo ballotwatch)"
EMAIL="$(git config user.email || echo ballotwatch@users.noreply.github.com)"

echo "→ building SPA (static mode, base ${BASE})"
( cd frontend && VITE_STATIC=1 VITE_BASE="$BASE" npm run build )

echo "→ exporting snapshot"
python3 backend/scripts/export_static.py --out static-export

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp -r static-export/. "$TMP/"
cd "$TMP"
git init -q
git checkout -q -b "$BRANCH"
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Publish static snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git remote add origin "$REPO_URL"
git push -q -f origin "$BRANCH"

echo "✓ published to ${BRANCH} ($(git rev-parse --short HEAD))"
