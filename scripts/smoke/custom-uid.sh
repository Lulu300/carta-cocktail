#!/usr/bin/env bash
# Checks CARTA_UID and CARTA_GID (the `user:` line of docker-compose.yml) against the write
# check of the backend entrypoint, on the stack that smoke.sh has just tested:
#   1. recreated as another uid on volumes owned by uid 1000, the backend stops with the
#      "cannot write" message, which names that uid and gives the chown command for it;
#   2. once the volumes belong to that uid, it starts as that uid, and smoke.sh passes again
#      (database and photo writes, recreation of the container).
#
# Run it after smoke.sh, in the same shell call and with the same environment
# (COMPOSE_PROJECT_NAME, JWT_SECRET, ADMIN_PASSWORD; see the header of smoke.sh):
#   ./scripts/smoke/smoke.sh && ./scripts/smoke/custom-uid.sh
# Never on the default project: step 2 changes the owner of the volumes. The stack keeps
# running as the other uid: remove it afterwards with `docker compose down -v`.
# Needs the tools of smoke.sh.
set -euo pipefail

: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME must be set to the dedicated project of smoke.sh}"

# Neither the uid of the image (1000) nor one of its /etc/passwd: no name, HOME=/
CUSTOM_ID=4321
BACKEND_SERVICE=carta-cocktail-backend
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

backend_logs() {
  docker compose logs --no-color "$BACKEND_SERVICE" 2>&1
}

# The refused container restarts in a loop (restart: unless-stopped): wait for its first log.
wait_for_log_line() {
  local line="$1"
  for _ in {1..30}; do
    if backend_logs | grep -qF -- "$line"; then
      return 0
    fi
    sleep 2
  done
  backend_logs >&2
  fail "no \"$line\" in the backend logs after 60 s"
}

export CARTA_UID="$CUSTOM_ID" CARTA_GID="$CUSTOM_ID"

echo "[1] As uid $CUSTOM_ID on volumes owned by uid 1000, the backend refuses to start"
docker compose up -d --no-deps "$BACKEND_SERVICE"
wait_for_log_line "ERROR: the backend runs as uid $CUSTOM_ID and cannot write to /app/data."
backend_logs | grep -qF -- "chown -R $CUSTOM_ID:$CUSTOM_ID" \
  || fail "the refusal does not give the chown command for $CUSTOM_ID:$CUSTOM_ID"
if backend_logs | grep -qF -- "API running"; then
  fail "the API started although the volumes belong to uid 1000"
fi
docker compose stop "$BACKEND_SERVICE"

echo "[2] After a chown of the volumes to $CUSTOM_ID:$CUSTOM_ID, it starts as that uid"
docker compose run --rm --no-deps --user 0:0 --entrypoint chown "$BACKEND_SERVICE" \
  -R "$CUSTOM_ID:$CUSTOM_ID" /app/data /app/uploads
docker compose up -d --no-deps --wait --wait-timeout 180 "$BACKEND_SERVICE" \
  || { backend_logs >&2; fail "the backend did not become healthy as uid $CUSTOM_ID"; }
running_as="$(docker compose exec -T "$BACKEND_SERVICE" id -u):$(docker compose exec -T "$BACKEND_SERVICE" id -g)"
[[ "$running_as" == "$CUSTOM_ID:$CUSTOM_ID" ]] || fail "the backend runs as $running_as, not $CUSTOM_ID:$CUSTOM_ID"

# CARTA_UID stays exported: the recreation in smoke.sh keeps the custom uid
"$REPO_ROOT/scripts/smoke/smoke.sh"

echo "Custom uid test passed"
