#!/bin/sh
# Smoke test after a deploy: the paths, redirects and headers the app depends on, with curl only.
# Usage: sh tests/prod.sh                                   (https://ciunkos.com)
#        BASE_URL=http://localhost:8797 sh tests/prod.sh   (wrangler dev or the Node server)
# Prints each check; stops with exit 1 at the first one that fails. The www redirect is checked only
# against a real host (not localhost or 127.0.0.1). Read-only: it creates no profile and no game.
set -u

BASE_URL=${BASE_URL:-https://ciunkos.com}
BASE_URL=${BASE_URL%/}
APP="$BASE_URL/sliding-puzzle"
TMP=${TMPDIR:-/tmp}/sliding-puzzle-smoke.$$
trap 'rm -f "$TMP".*' EXIT INT TERM
passed=0

ok() { passed=$((passed + 1)); echo "  ok    $1"; }
fail() {
  echo "  FAIL  $1"
  echo "        $2"
  exit 1
}

# fetch URL: GET it without following redirects; status in $TMP.status, headers in $TMP.headers
# (without CR), body in $TMP.body.
fetch() {
  curl -sS --max-time 20 -o "$TMP.body" -D "$TMP.raw" -w '%{http_code} %{redirect_url}' "$1" \
    > "$TMP.status" 2> "$TMP.err" || fail "GET $1" "curl: $(cat "$TMP.err")"
  tr -d '\r' < "$TMP.raw" > "$TMP.headers"
}
status() { cut -d' ' -f1 < "$TMP.status"; }
location() { cut -d' ' -f2- < "$TMP.status"; }
# header NAME: its value in the last response (any case), empty when absent.
header() { grep -i "^$1:" "$TMP.headers" | tail -1 | sed 's/^[^:]*: *//'; }

expect_status() { # URL CODE DESCRIPTION
  fetch "$1"
  [ "$(status)" = "$2" ] || fail "$3" "GET $1 answered $(status), expected $2"
}

expect_redirect() { # URL TARGET DESCRIPTION
  fetch "$1"
  [ "$(status)" = 301 ] || fail "$3" "GET $1 answered $(status), expected 301"
  [ "$(location)" = "$2" ] || fail "$3" "GET $1 redirects to '$(location)', expected '$2'"
  ok "$3"
}

expect_header() { # NAME PATTERN DESCRIPTION (of the last response)
  header "$1" | grep -qiE "$2" || fail "$3" "$1 is '$(header "$1")', expected /$2/"
}

expect_body() { # PATTERN DESCRIPTION (of the last response)
  grep -qE "$1" "$TMP.body" || fail "$2" "the body does not match /$1/: $(head -c 200 "$TMP.body")"
}

echo "Smoke test of $APP"

expect_status "$APP" 200 "the app answers at /sliding-puzzle"
expect_header content-type 'text/html' "the app answers at /sliding-puzzle"
expect_body '<div id="root">' "the app answers at /sliding-puzzle"
script=$(grep -oE '/sliding-puzzle/assets/index-[A-Za-z0-9_-]+\.js' "$TMP.body" | head -1)
ok "the app answers at /sliding-puzzle (200, the shell)"

expect_redirect "$APP/?smoke=1" "$APP?smoke=1" "/sliding-puzzle/ redirects to /sliding-puzzle (301, query kept)"

case "$BASE_URL" in
  *://localhost* | *://127.0.0.1*) echo "  skip  the www host redirects to the apex (local run)" ;;
  *)
    www=$(echo "$BASE_URL" | sed 's#://#://www.#')
    expect_redirect "$www/sliding-puzzle" "$APP" "the www host redirects to the apex (301)"
    ;;
esac

expect_status "$APP/api/health" 200 "the API health check"
expect_body '^\{"ok":true\}$' "the API health check"
ok "the API health check (200, {\"ok\":true})"

expect_status "$APP/sw.js" 200 "the service worker script"
expect_header service-worker-allowed '^/sliding-puzzle$' "the service worker may control /sliding-puzzle"
expect_header cache-control 'no-store' "the service worker script is never cached"
ok "the service worker script (Service-Worker-Allowed: /sliding-puzzle, no-store)"

expect_status "$APP/manifest.webmanifest" 200 "the web app manifest"
expect_body '"id": *"/sliding-puzzle"' "the manifest id is /sliding-puzzle"
expect_body '"start_url": *"/sliding-puzzle"' "the manifest start_url is /sliding-puzzle"
expect_body '"scope": *"/sliding-puzzle"' "the manifest scope is /sliding-puzzle"
ok "the manifest (id, start_url and scope are /sliding-puzzle)"

[ -n "$script" ] || fail "the shell's script" "no /sliding-puzzle/assets/index-*.js in the shell"
expect_status "$BASE_URL$script" 200 "the shell's script $script"
expect_header cache-control 'immutable' "the shell's script is immutable"
ok "the shell's script $script (200, immutable)"

expect_status "$APP/og.jpg" 200 "the share image"
expect_header content-type 'image/jpeg' "the share image is a JPEG"
expect_header cache-control 'max-age=86400' "the share image may be kept for a day"
ok "the share image (200, image/jpeg, a day)"

expect_status "$APP/assets/smoke-missing-0000.js" 404 "a missing hashed file is 404"
header content-type | grep -qi 'text/html' && fail "a missing hashed file is not the shell" "it answered text/html"
header cache-control | grep -qi 'immutable' && fail "a missing hashed file is not kept" "its 404 is marked immutable"
ok "a missing hashed file (404, not the shell, not immutable)"

expect_status "$BASE_URL/sliding-puzzle-x" 404 "/sliding-puzzle-x is not the app"
ok "/sliding-puzzle-x (404)"

expect_status "$APP/analytics-config" 200 "the analytics config"
expect_header cache-control 'no-store' "the analytics config is never cached"
# Never printed: with analytics on, the body holds the project token.
grep -qE '"enabled":(true|false)' "$TMP.body" ||
  fail "the analytics config says whether analytics is on" "no \"enabled\" in its JSON"
ok "the analytics config (200, no-store, $(grep -oE '"enabled":(true|false)' "$TMP.body"))"

expect_status "$APP/ph/e/" 404 "the analytics proxy refuses a GET"
ok "the analytics proxy refuses a GET (404)"

echo "smoke: all $passed checks passed against $BASE_URL"
