#!/usr/bin/env bash
# Publish the static snapshot to the gh-pages branch.
#
# Use this when GitHub Actions cannot run (a billing lock, an org policy, or a
# private-repo minutes limit). The Pages site is branch-built, so a plain push
# is enough — no runner required.
#
#   ./scripts/publish_pages.sh                 # project page, base /<repo>/
#   ./scripts/publish_pages.sh                 # with a custom domain set: base /
#
# Custom domain handling: with branch builds, Pages treats the CNAME file *in the
# branch* as the source of truth. This script commits a fresh tree on every run,
# so it must write the CNAME itself — otherwise the next publish silently drops
# the domain and the site 404s at the custom host.
set -euo pipefail

cd "$(dirname "$0")/.."

REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")"
BRANCH="${BRANCH:-gh-pages}"
REPO_URL="${REPO_URL:-$(git remote get-url origin)}"
NAME="$(git config user.name || echo ballotwatch)"
EMAIL="$(git config user.email || echo ballotwatch@users.noreply.github.com)"
PYTHON="${PYTHON:-python3}"

# A configured custom domain means the site is served from the domain root.
DOMAIN=""
if [ -n "${REPO_SLUG}" ]; then
  DOMAIN="$(gh api "repos/${REPO_SLUG}/pages" --jq '.cname // ""' 2>/dev/null || true)"
fi

if [ -n "${DOMAIN}" ]; then
  BASE="${BASE:-/}"
else
  BASE="${BASE:-/$(basename "${REPO_URL}" .git)/}"
fi

echo "→ building SPA (static mode, base ${BASE})"
( cd frontend && VITE_STATIC=1 VITE_BASE="${BASE}" npm run build )

echo "→ exporting snapshot"
"${PYTHON}" backend/scripts/export_static.py --out static-export

if [ -n "${DOMAIN}" ]; then
  echo "${DOMAIN}" > static-export/CNAME
  echo "→ keeping custom domain ${DOMAIN} (CNAME committed to ${BRANCH})"
fi

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

echo "✓ published to ${BRANCH} ($(git rev-parse --short HEAD))${DOMAIN:+ · ${DOMAIN}}"
