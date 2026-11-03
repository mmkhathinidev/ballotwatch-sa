#!/usr/bin/env bash
# Attach a custom domain to the BallotWatch Pages site and republish.
#
#   ./scripts/attach_domain.sh elections.culolethu.online
#   ./scripts/attach_domain.sh culolethu.online --project   # serve under /ballotwatch-sa/
#
# Why this script exists: GitHub Pages project sites inherit the custom domain of
# the account's user site (<user>.github.io). While that inheritance is set, every
# project URL answers 301 to a hostname that may not resolve. This detaches the
# domain from the user site, attaches it to this repo, and republishes with the
# matching base path.
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
MODE="${2:-apex}"   # apex (domain root) or --project (domain/ballotwatch-sa/)
if [ -z "$DOMAIN" ]; then
  echo "usage: $0 <domain> [--project]" >&2
  exit 2
fi

REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
OWNER="${REPO_SLUG%%/*}"
USER_SITE="${OWNER}.github.io"

echo "→ checking DNS for ${DOMAIN}"
NS="$(dig +short NS "${DOMAIN}" || true)"
if [ -z "$NS" ]; then
  echo "  ! no nameservers yet — the site will 404 until the domain is registered"
  echo "    and DNS is configured. Continuing so the config is ready."
  echo "    Recommended records at your registrar:"
  echo "      A     @    185.199.108.153"
  echo "      A     @    185.199.109.153"
  echo "      A     @    185.199.110.153"
  echo "      A     @    185.199.111.153"
  [ "$MODE" = "--project" ] && echo "      (or CNAME <sub> ${OWNER}.github.io.)"
  echo "      CNAME www  ${OWNER}.github.io."
else
  echo "  nameservers: ${NS//$'\n'/ }"
fi

echo "→ detaching any inherited domain from ${USER_SITE}"
gh api -X PUT "repos/${REPO_SLUG%%/*}/${USER_SITE}/pages" --input - <<'JSON' >/dev/null 2>&1 || \
  echo "  (no Pages config on ${USER_SITE}, nothing to detach)"
{"cname": null}
JSON

echo "→ attaching ${DOMAIN} to ${REPO_SLUG}"
gh api -X PUT "repos/${REPO_SLUG}/pages" --input - >/dev/null <<JSON
{"cname": "${DOMAIN}"}
JSON

if [ "$MODE" = "--project" ]; then
  BASE="/$(basename "$REPO_SLUG")/"
else
  BASE="/"
fi
echo "→ republishing with base ${BASE}"
BASE="$BASE" ./scripts/publish_pages.sh

echo "→ enabling HTTPS (may take a few minutes after DNS verifies)"
gh api -X PUT "repos/${REPO_SLUG}/pages" --input - <<'JSON' >/dev/null 2>&1 || \
  echo "  (certificate not ready yet — re-run this step later)"
{"https_enforced": true}
JSON

echo
echo "Verify:"
echo "  gh api repos/${REPO_SLUG}/pages --jq '{status,cname,https_enforced}'"
echo "  curl -sI https://${DOMAIN}${BASE#/} | head -3"
