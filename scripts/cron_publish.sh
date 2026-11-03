#!/usr/bin/env bash
# Cron entry point: republish the static snapshot.
#
#   */10 * * * * /home/mmkhathini/Projects/sa-election-live/scripts/cron_publish.sh
#
# cron runs with a minimal PATH and no shell profile, so every binary this needs
# is pinned here. The project venv keeps the exporter off the Hermes runtime.
# No agent, no model: running this costs nothing.
set -uo pipefail

ROOT="/home/mmkhathini/Projects/sa-election-live"
LOG="/tmp/zarpolls-publish.log"
HERMES="${HOME}/.local/bin/hermes"

export PATH="/home/mmkhathini/.hermes/tools/node-26.7.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/home/mmkhathini/.local/bin"
export PYTHON="${ROOT}/backend/.venv/bin/python3"

cd "${ROOT}" || exit 1

alert() {
  # Only reached on failure. Never let alerting break the run.
  echo "!! $1" >> "${LOG}"
  [ -x "${HERMES}" ] && "${HERMES}" send -t telegram \
    "ZAR Polls: scheduled publish failed at $(date '+%H:%M %Z') — $1. The live site still serves the last good snapshot. Log: ${LOG}" \
    >/dev/null 2>&1
  return 0
}

{
  echo "=== $(date -Iseconds) publish start ==="
  BEFORE="$(git ls-remote --heads origin gh-pages 2>/dev/null | awk '{print $1}')"
  if ./scripts/publish_pages.sh; then
    echo "=== $(date -Iseconds) publish done ==="
    # Local, lag-free proof that the branch actually moved. Comparing against the
    # GitHub API here would false-alarm during its cache window.
    AFTER="$(git ls-remote --heads origin gh-pages 2>/dev/null | awk '{print $1}')"
    if [ -n "${BEFORE}" ] && [ "${BEFORE}" = "${AFTER}" ]; then
      alert "publish exited 0 but gh-pages did not move"
    fi
  else
    alert "publish_pages.sh exited non-zero"
  fi
} >> "${LOG}" 2>&1

# Keep the log from growing without bound.
if [ -f "${LOG}" ] && [ "$(stat -c%s "${LOG}")" -gt 2000000 ]; then
  tail -c 500000 "${LOG}" > "${LOG}.tmp" && mv "${LOG}.tmp" "${LOG}"
fi
