#!/usr/bin/env bash
# End-to-end smoke test of the Docker stack: browser -> nginx -> Express -> SQLite and volumes.
# The Vitest suites call Express directly, so they miss what only the real stack shows:
# the nginx body size limit, gzip, and photos written outside the uploads volume.
#
# Start the stack from docker-compose.yml, then run this script with the same environment:
#   docker compose up -d --build --wait && ./scripts/smoke/smoke.sh
#   docker compose down -v
# Step 10 recreates the backend container with `docker compose`: keep the same
# COMPOSE_PROJECT_NAME (or -p value) and JWT_SECRET as the `up` command.
#
# Variables: BASE_URL (default http://localhost), ADMIN_EMAIL (default admin@carta.local),
# ADMIN_PASSWORD (required: the one the backend received on its first start).
# Needs bash, curl, jq, python3 and Docker Compose v2.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@carta.local}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set (the admin password given to the backend on first start)}"

BACKEND_SERVICE=carta-cocktail-backend
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BODY="$TMP/body"
HEADERS="$TMP/headers"

step_number=0
step_name=""

step() {
  step_number=$((step_number + 1))
  step_name="$1"
  printf '[%2d] %s\n' "$step_number" "$step_name"
}

fail() {
  printf 'FAIL at step %d (%s): %s\n' "$step_number" "$step_name" "$*" >&2
  exit 1
}

# Sends a request and stores the status in $status, the body in $BODY and the headers in
# $HEADERS. Extra arguments go to curl as they are.
status=""
request() {
  local method="$1" path="$2"
  shift 2
  status="$(curl -sS -X "$method" -o "$BODY" -D "$HEADERS" -w '%{http_code}' "$@" "$BASE_URL$path")" \
    || fail "$method $path: no response from $BASE_URL"
}

# Value of a response header, without the trailing carriage return. Empty when absent.
header() {
  grep -i "^$1:" "$HEADERS" | tail -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' || true
}

# Start of the response body, for failure messages
body_excerpt() {
  head -c 300 "$BODY"
}

expect_status() {
  local expected="$1"
  if [[ "$status" != "$expected" ]]; then
    fail "expected HTTP $expected, got $status: $(body_excerpt)"
  fi
}

# The pattern is a glob such as 'image/*'
expect_content_type() {
  local pattern="$1" content_type
  content_type="$(header content-type)"
  # shellcheck disable=SC2053 # the right-hand side is matched as a glob on purpose
  if [[ "$content_type" != $pattern ]]; then
    fail "expected Content-Type $pattern, got '${content_type}'"
  fi
}

json_field() {
  jq -er "$1" "$BODY" || fail "no $1 in the response: $(body_excerpt)"
}

# Random noise does not compress: the PNG stays around 2.4 MB, above the 1 MB nginx default.
write_png() {
  python3 - "$1" <<'PY'
import os, struct, sys, zlib
w = h = 900
raw = b''.join(b'\x00' + os.urandom(w * 3) for _ in range(h))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 0)) + chunk(b'IEND', b'')
open(sys.argv[1], 'wb').write(png)
PY
}

step "GET / serves the single-page app"
request GET /
expect_status 200
expect_content_type 'text/html*'
asset="$(grep -oE '/assets/[^"]+\.js' "$BODY" | head -n 1 || true)"
[[ -n "$asset" ]] || fail "no /assets/*.js script in index.html"
if [[ "$(header x-content-type-options)" != "nosniff" ]]; then
  fail "missing security header X-Content-Type-Options: nosniff"
fi

step "GET $asset is gzip-compressed"
request GET "$asset" -H 'Accept-Encoding: gzip'
expect_status 200
[[ "$(header content-encoding)" == "gzip" ]] || fail "expected Content-Encoding gzip, got '$(header content-encoding)'"

step "GET /api/health answers ok"
request GET /api/health
expect_status 200
health_status="$(json_field .status)"
[[ "$health_status" == "ok" ]] || fail "expected status ok: $(body_excerpt)"

step "POST /api/auth/login returns a token"
credentials="$(jq -n --arg email "$ADMIN_EMAIL" --arg password "$ADMIN_PASSWORD" '{email: $email, password: $password}')"
request POST /api/auth/login -H 'Content-Type: application/json' --data "$credentials"
expect_status 200
token="$(json_field .token)"
auth=(-H "Authorization: Bearer $token")

step "GET /api/cocktails without a token is refused"
request GET /api/cocktails
expect_status 401

step "POST /api/cocktails creates a cocktail"
request POST /api/cocktails "${auth[@]}" -H 'Content-Type: application/json' --data '{"name":"Smoke test"}'
expect_status 201
cocktail_id="$(json_field .id)"

step "Generate a 2.4 MB PNG"
write_png "$TMP/smoke.png" || fail "python3 could not write the PNG"

step "POST /api/cocktails/$cocktail_id/image uploads the photo through nginx"
request POST "/api/cocktails/$cocktail_id/image" "${auth[@]}" -F "image=@$TMP/smoke.png;type=image/png"
if [[ "$status" == "413" ]]; then
  fail "HTTP 413: the request body is over the nginx limit (client_max_body_size in frontend/nginx.conf.template)"
fi
expect_status 200
image_path="$(json_field .imagePath)"

step "GET /uploads/$image_path serves the photo"
request GET "/uploads/$image_path"
expect_status 200
expect_content_type 'image/*'

step "The photo survives a recreation of the backend container (uploads volume)"
(cd "$REPO_ROOT" && docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 "$BACKEND_SERVICE") \
  || fail "the recreated backend did not become healthy"
# nginx caches the backend address for up to 30 s: the new container can have another one
for _ in {1..10}; do
  request GET "/uploads/$image_path"
  [[ "$status" == "502" ]] || break
  sleep 3
done
if [[ "$status" == "404" ]]; then
  fail "HTTP 404 after the recreation: the photo was not written to the uploads volume (UPLOAD_DIR)"
fi
expect_status 200
expect_content_type 'image/*'

step "GET /api/backup/export returns a zip archive"
request GET /api/backup/export "${auth[@]}"
expect_status 200
expect_content_type 'application/zip*'
[[ -s "$BODY" ]] || fail "the archive is empty"

echo "Smoke test passed"
