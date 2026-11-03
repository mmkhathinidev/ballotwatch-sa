#!/usr/bin/env bash
# Cron entry point: republish the static snapshot.
#
#   */10 * * * * /home/mmkhathini/Projects/sa-election-live/scripts/cron_publish.sh
#
# cron runs with a minimal PATH and no shell profile, so every binary this needs
# is pinned here. The project venv keeps the exporter off the Hermes runtime.
set -euo pipefail

ROOT="/home/mmkhathini/Projects/sa-election-live"
LOG="/tmp/zarpolls-publish.log"

export PATH="/home/mmkhathini/.hermes/tools/node-26.7.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/home/mmkhathini/.local/bin"
export PYTHON="${ROOT}/backend/.venv/bin/python3"

cd "${ROOT}"

{
  echo "=== $(date -Iseconds) publish start ==="
  ./scripts/publish_pages.sh
  echo "=== $(date -Iseconds) publish done ==="
} >> "${LOG}" 2>&1

# Keep the log from growing without bound.
if [ -f "${LOG}" ] && [ "$(stat -c%s "${LOG}")" -gt 2000000 ]; then
  tail -c 500000 "${LOG}" > "${LOG}.tmp" && mv "${LOG}.tmp" "${LOG}"
fi
