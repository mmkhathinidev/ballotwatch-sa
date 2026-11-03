#!/usr/bin/env bash
# Attach a custom domain to the BallotWatch Pages site and republish.
#
#   ./scripts/attach_domain.sh zarpolls.online               # serve at the root
#   ./scripts/attach_domain.sh zarpolls.online --project     # serve at /ballotwatch-sa/
#
# Why this script exists: GitHub Pages project sites inherit the custom domain of
# the account's user site (<user>.github.io). While that inheritance is set, every
# project URL answers 301 to a hostname that may not resolve. This detaches the
# domain from the user site, attaches it to this repo, republishes with the
# matching base path, and turns on HTTPS once the certificate is approved.
#
# Payloads are piped with printf, not heredocs: a heredoc chained to `||`
# consumes the next command's stdin, which silently made the attach step a no-op
# the first time this ran.
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
NS="$(dig +short NS "${DOMAIN}" | tr '\n' ' ' || true)"
A_RECORDS="$(dig +short A "${DOMAIN}" | tr '\n' ' ' || true)"
if [ -z "$NS" ] || [ -z "$A_RECORDS" ]; then
  echo "  ! ${DOMAIN} does not resolve yet. Attaching now leaves the site 301-ing" >&2
  echo "    to a host that answers nothing. Configure DNS first:" >&2
  echo "      A     @    185.199.108.153" >&2
  echo "      A     @    185.199.109.153" >&2
  echo "      A     @    185.199.110.153" >&2
  echo "      A     @    185.199.111.153" >&2
  echo "      CNAME www  ${OWNER}.github.io." >&2
  exit 3
fi
echo "  resolves to: ${A_RECORDS}"

echo "→ detaching any inherited domain from ${USER_SITE}"
printf '{"cname":null}' | gh api -X PUT "repos/${OWNER}/${USER_SITE}/pages" --input - >/dev/null 2>&1 \
  || echo "  (no Pages config on ${USER_SITE}, nothing to detach)"

echo "→ attaching ${DOMAIN} to ${REPO_SLUG}"
printf '{"cname":"%s"}' "${DOMAIN}" | gh api -X PUT "repos/${REPO_SLUG}/pages" --input - >/dev/null

# Verify the attachment actually took — a silent no-op here costs an hour later.
ATTACHED="$(gh api "repos/${REPO_SLUG}/pages" --jq '.cname // ""')"
if [ "${ATTACHED}" != "${DOMAIN}" ]; then
  echo "  ✗ attach failed (cname reads '${ATTACHED}')" >&2
  exit 4
fi
echo "  ✓ cname = ${ATTACHED}"

if [ "${MODE}" = "--project" ]; then
  BASE="/$(basename "${REPO_SLUG}")/"
else
  BASE="/"
fi
echo "→ republishing with base ${BASE}"
BASE="${BASE}" ./scripts/publish_pages.sh >/dev/null
echo "  ✓ published gh-pages"

echo "→ waiting for the certificate (up to 10 min)"
for _ in $(seq 1 40); do
  STATE="$(gh api "repos/${REPO_SLUG}/pages" --jq '.https_certificate.state // "pending"' 2>/dev/null || echo pending)"
  if [ "${STATE}" = "approved" ]; then
    echo "  ✓ certificate approved"
    break
  fi
  sleep 15
done

printf '{"https_enforced":true}' | gh api -X PUT "repos/${REPO_SLUG}/pages" --input - >/dev/null 2>&1 \
  || echo "  (HTTPS enforcement refused — certificate may still be provisioning)"

echo
echo "Verify:"
echo "  gh api repos/${REPO_SLUG}/pages --jq '{status,cname,https_enforced}'"
echo "  curl -sI https://${DOMAIN}${BASE#/} | head -3"
