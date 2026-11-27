#!/usr/bin/env bash
# End-to-end smoke test of the Docker stack: browser -> nginx -> Express -> SQLite and volumes.
# The Vitest suites call Express directly, so they miss what only the real stack shows:
# the nginx body size limit, gzip, and photos written outside the uploads volume.
#
# Start the stack from docker-compose.yml in a dedicated compose project, then run this
# script with the same environment:
#   export COMPOSE_PROJECT_NAME=carta-smoke JWT_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD=$(openssl rand -hex 16)
#   docker compose -p carta-smoke up -d --build --wait && ./scripts/smoke/smoke.sh
#   docker compose -p carta-smoke down -v --remove-orphans --rmi local
# All in the same shell call: step 10 reads COMPOSE_PROJECT_NAME.
# Never the default project (the folder name): it is the local stack of a plain
# `docker compose up`. `down -v` would delete its database and photos, the script would add
# its test cocktail there, and the login fails when that admin was created with another
# password on its first start.
# Step 10 recreates the backend container with `docker compose`: keep the same
# COMPOSE_PROJECT_NAME and JWT_SECRET as the `up` command.
#
# Variables: BASE_URL (default http://localhost), ADMIN_EMAIL (default admin@carta.local),
# ADMIN_PASSWORD (required: the one the backend received on its first start).
# Needs bash, curl, jq, python3 and Docker Compose v2.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@carta.local}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set (the admin password given to the backend on first start)}"

BACKEND_SERVICE=carta-cocktail-backend
FRONTEND_SERVICE=carta-cocktail-frontend
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
  # --max-time: a stuck request fails this step instead of waiting for the job timeout
  status="$(curl -sS --max-time 60 -X "$method" -o "$BODY" -D "$HEADERS" -w '%{http_code}' "$@" "$BASE_URL$path")" \
    || fail "$method $path: no complete response from $BASE_URL (connection failed, or over 60 s)"
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

step "The service worker and the web manifest of the installable app"
grep -q '<link rel="manifest" href="/manifest.webmanifest">' "$BODY" || fail "index.html links no web manifest"
# A cached sw.js would keep browsers on an old version of the app (frontend/nginx.conf.template)
request GET /sw.js
expect_status 200
expect_content_type '*javascript*'
[[ "$(header cache-control)" == "no-cache" ]] || fail "sw.js: expected Cache-Control no-cache, got '$(header cache-control)'"
request GET /manifest.webmanifest
expect_status 200
expect_content_type 'application/manifest+json*'
[[ "$(json_field .start_url)" == "/" ]] || fail "expected start_url / in the manifest: $(body_excerpt)"

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

step "GET /uploads/$image_path serves the photo and its smaller copies"
# The backend stores the photo as WebP, with copies named after it (imageVariants.ts)
[[ "$image_path" == *.webp ]] || fail "expected a WebP photo, got $image_path"
image_stem="${image_path%.webp}"
for stored in "$image_path:image/webp" "$image_stem-960.webp:image/webp" \
  "$image_stem-480.webp:image/webp" "$image_stem-og.jpg:image/jpeg"; do
  request GET "/uploads/${stored%%:*}"
  expect_status 200
  expect_content_type "${stored#*:}"
done

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

step "A public menu with the cocktail"
# The cocktail id makes the slug unique: custom-uid.sh runs this script again on the same database
menu_slug="smoke-$cocktail_id"
request POST /api/menus "${auth[@]}" -H 'Content-Type: application/json' \
  --data "{\"name\":\"Smoke menu\",\"slug\":\"$menu_slug\",\"isPublic\":true}"
expect_status 201
menu_id="$(json_field .id)"
request PUT "/api/menus/$menu_id" "${auth[@]}" -H 'Content-Type: application/json' \
  --data "{\"cocktails\":[{\"cocktailId\":$cocktail_id}]}"
expect_status 200

step "A link preview robot gets the Open Graph tags of /menu/$menu_slug"
request GET "/menu/$menu_slug" -A 'WhatsApp/2.23.20.0'
expect_status 200
expect_content_type 'text/html*'
grep -q '<meta property="og:title" content="Smoke menu · ' "$BODY" || fail "no og:title: $(body_excerpt)"
# The JPEG copy: WhatsApp and iMessage do not always show a WebP image
grep -q "<meta property=\"og:image\" content=\"[^\"]*/uploads/$image_stem-og.jpg\">" "$BODY" \
  || fail "no og:image of the JPEG copy of the photo: $(body_excerpt)"
request GET /menu/smoke-unknown-menu -A 'WhatsApp/2.23.20.0'
expect_status 404

step "A browser still gets the single-page app at /menu/$menu_slug"
request GET "/menu/$menu_slug"
expect_status 200
grep -q '/assets/' "$BODY" || fail "the menu page is not the single-page app: $(body_excerpt)"

step "nginx runs as uid 101, not as root"
# USER 101 in frontend/Dockerfile is the only thing that keeps nginx non-root (rootless Docker,
# Podman): without it, the master process runs as root and every request above still works.
# The master is PID 1, started by the entrypoint with exec.
frontend_uids="$(cd "$REPO_ROOT" && docker compose exec -T "$FRONTEND_SERVICE" \
  sh -c 'id -u; awk "/^Uid:/ { print \$2 }" /proc/1/status')" \
  || fail "cannot run a command in the frontend container"
if [[ "$frontend_uids" != $'101\n101' ]]; then
  fail "expected uid 101 for the container user and the nginx master, got: ${frontend_uids//$'\n'/, }"
fi

step "The frontend container exposes port 8080 only"
# The official nginx image declares port 80, where nothing listens: a reverse proxy that picks
# the container port by itself would take it and answer 502. frontend/Dockerfile flattens the
# image to drop it, and only this step notices if that stops working.
frontend_id="$(cd "$REPO_ROOT" && docker compose ps -q "$FRONTEND_SERVICE")" \
  || fail "cannot find the frontend container"
exposed_ports="$(docker inspect --format '{{json .Config.ExposedPorts}}' "$frontend_id")" \
  || fail "cannot inspect the frontend container"
[[ "$exposed_ports" == '{"8080/tcp":{}}' ]] || fail "expected 8080/tcp only, got: $exposed_ports"

step "The healthcheck probe stays out of the frontend access log, a real request does not"
# The marker is a query string: the probe line carries none, and the visit line keeps it.
curl -fsS -o /dev/null "$BASE_URL/healthz" || fail "/healthz does not answer 200"
curl -fsS -o /dev/null "$BASE_URL/?smoke-access-log" || fail "/ does not answer 200"
frontend_log="$(cd "$REPO_ROOT" && docker compose logs --no-log-prefix "$FRONTEND_SERVICE")" \
  || fail "cannot read the frontend logs"
grep -q 'smoke-access-log' <<<"$frontend_log" || fail "a request to / is missing from the access log"
! grep -q 'healthz' <<<"$frontend_log" || fail "the /healthz probe is in the access log"

echo "Smoke test passed"
