#!/usr/bin/env bash
# Cron entry point: republish the static snapshot.
#
#   */10 * * * * /home/mmkhathini/Projects/sa-election-live/scripts/cron_publish.sh
#
# cron runs with a minimal PATH and no shell profile, so every binary this needs
# is pinned here. The project venv keeps the exporter off the Hermes runtime.
# No agent, no model: running this costs nothing.
#
# Resilience rules (learned on election morning, when GitHub had a Git Operations
# outage and every 10-minute tick burned a slot on one failed push):
#   * a failed publish is retried in-run — 3 attempts, 60s apart — so a transient
#     remote blip costs two minutes, not a whole publish cycle;
#   * only ONE publisher runs at a time (flock), so a slow retry run can never
#     overlap the next cron tick and race it on the gh-pages branch;
#   * alerts collapse: one message when a failure streak starts, one every
#     ALERT_EVERY_N_FAILURES after that, and one when it recovers.
set -uo pipefail

ROOT="/home/mmkhathini/Projects/sa-election-live"
LOG="/tmp/zarpolls-publish.log"
STATE="/tmp/zarpolls-alert.state"
LOCK="/tmp/zarpolls-publish.lock"
HERMES="${HOME}/.local/bin/hermes"

ATTEMPTS="${PUBLISH_ATTEMPTS:-3}"
RETRY_SLEEP="${PUBLISH_RETRY_SLEEP:-60}"
ALERT_EVERY_N_FAILURES="${ALERT_EVERY_N_FAILURES:-6}"

export PATH="/home/mmkhathini/.hermes/tools/node-26.7.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/home/mmkhathini/.local/bin"
export PYTHON="${ROOT}/backend/.venv/bin/python3"

cd "${ROOT}" || exit 1

# One publisher at a time. A retry run can outlive its own 10-minute slot.
exec 9>"${LOCK}"
if ! flock -n 9; then
  echo "=== $(date -Iseconds) skip: previous publish still running ===" >> "${LOG}"
  exit 0
fi

failure_streak() {
  local n
  n="$(cat "${STATE}" 2>/dev/null || echo 0)"
  case "${n}" in ''|*[!0-9]*) n=0 ;; esac
  echo "${n}"
}

notify() {
  # Never let alerting break the run.
  echo "!! $1" >> "${LOG}"
  [ -x "${HERMES}" ] && "${HERMES}" send -t telegram "$1" >/dev/null 2>&1
  return 0
}

on_failure() {
  local streak
  streak=$(( $(failure_streak) + 1 ))
  echo "${streak}" > "${STATE}"
  if [ "${streak}" -eq 1 ]; then
    notify "ZAR Polls: scheduled publish failed at $(date '+%H:%M %Z') — $1. Site still serves the last good snapshot. I'll ping again only if this keeps failing ($(date -d "+$(( ALERT_EVERY_N_FAILURES * 10 )) minutes" '+%H:%M') or later) or when it recovers. Log: ${LOG}"
  elif [ $(( streak % ALERT_EVERY_N_FAILURES )) -eq 0 ]; then
    notify "ZAR Polls: still failing — ${streak} consecutive failed publishes, latest at $(date '+%H:%M %Z'). Site still serves the last good snapshot. Log: ${LOG}"
  else
    echo "   (failure ${streak}; alert suppressed)" >> "${LOG}"
  fi
  return 0
}

on_success() {
  local streak
  streak="$(failure_streak)"
  echo 0 > "${STATE}"
  if [ "${streak}" -gt 0 ]; then
    notify "ZAR Polls: publishes recovered at $(date '+%H:%M %Z') after ${streak} failed run(s). The site is updating again."
  fi
  return 0
}

publish_with_retry() {
  local attempt=1
  while :; do
    if ./scripts/publish_pages.sh; then
      return 0
    fi
    echo "-- attempt ${attempt}/${ATTEMPTS} failed at $(date -Iseconds)"
    if [ "${attempt}" -ge "${ATTEMPTS}" ]; then
      return 1
    fi
    attempt=$(( attempt + 1 ))
    sleep "${RETRY_SLEEP}"
  done
}

{
  echo "=== $(date -Iseconds) publish start ==="
  BEFORE="$(git ls-remote --heads origin gh-pages 2>/dev/null | awk '{print $1}')"
  if publish_with_retry; then
    echo "=== $(date -Iseconds) publish done ==="
    # Local, lag-free proof that the branch actually moved. Comparing against the
    # GitHub API here would false-alarm during its cache window.
    AFTER="$(git ls-remote --heads origin gh-pages 2>/dev/null | awk '{print $1}')"
    if [ -n "${BEFORE}" ] && [ "${BEFORE}" = "${AFTER}" ]; then
      on_failure "publish exited 0 but gh-pages did not move"
    else
      on_success
    fi
  else
    on_failure "publish_pages.sh exited non-zero after ${ATTEMPTS} attempts"
  fi
} >> "${LOG}" 2>&1

# Keep the log from growing without bound.
if [ -f "${LOG}" ] && [ "$(stat -c%s "${LOG}")" -gt 2000000 ]; then
  tail -c 500000 "${LOG}" > "${LOG}.tmp" && mv "${LOG}.tmp" "${LOG}"
fi
