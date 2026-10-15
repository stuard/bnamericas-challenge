#!/usr/bin/env bash
# Proves docs/guide.md on a clean copy: clones this checkout into an empty temp dir, runs the guide's
# <!-- run --> blocks with a bare environment, then does a real save and a forced conflict through the backend.
# Marker forms: "<!-- run -->" (finite command) and "<!-- run server PORT -->" (stays up; started in background).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${GUIDE_CHECK_LOG:-${TMPDIR:-/tmp}/guide-check.log}"
WAIT=120
: > "$LOG"
say() { echo "$*" | tee -a "$LOG"; }
fail() { say "FAIL: $*"; exit 1; }

CLEAN="$(mktemp -d "${TMPDIR:-/tmp}/guide-clean.XXXXXX")"
PIDS=()
stop_all() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill -- "-$p" 2>/dev/null; done
  pkill -f "[u]vicorn app.main:app --port 8000" 2>/dev/null
  pkill -f "[b]in/upstream" 2>/dev/null
  pkill -f "[g]uide-clean.*node_modules/.bin/vite" 2>/dev/null
  rm -rf "$CLEAN"
}
trap stop_all EXIT

for port in 8081 8000 5173; do
  if curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$port/"; then
    fail "port $port is already in use on this machine; stop what runs there and run again"
  fi
done

say "== clean copy: git clone $ROOT -> $CLEAN/repo"
git clone -q "$ROOT" "$CLEAN/repo" 2>&1 | tee -a "$LOG"
REPO="$CLEAN/repo"
[ -f "$REPO/docs/guide.md" ] || fail "docs/guide.md is not committed in the checkout (commit it first)"
if [ -e "$REPO/frontend/node_modules" ] || [ -e "$REPO/backend/.venv" ]; then fail "the clone is not clean"; fi
say "== clean: no node_modules, no .venv in the clone"

# Extract the marked blocks, in order, into $CLEAN/blocks/NN.sh with a NN.meta line (kind and port).
mkdir -p "$CLEAN/blocks"
awk -v dir="$CLEAN/blocks" '
  /^<!-- run( server [0-9]+)? -->[ \t]*$/ { m=$0; getline nxt; if (nxt ~ /^```bash[ \t]*$/) { n++; f=sprintf("%s/%02d.sh", dir, n); inb=1;
      kind="once"; port=""; if (match(m, /server [0-9]+/)) { kind="server"; port=substr(m, RSTART+7, RLENGTH-7) }
      print kind, port > sprintf("%s/%02d.meta", dir, n); next } }
  inb && /^```[ \t]*$/ { inb=0; close(f); next }
  inb { print > f }
' "$REPO/docs/guide.md"
NBLOCKS=$(ls "$CLEAN/blocks"/*.sh 2>/dev/null | wc -l | tr -d ' ')
[ "$NBLOCKS" -ge 4 ] || fail "found only $NBLOCKS marked blocks in docs/guide.md"
say "== $NBLOCKS marked blocks found in docs/guide.md"

# Bare environment: PATH, HOME and the proxy/CA variables only. The two rates are off for this run only.
KEEP=(PATH HOME HTTP_PROXY HTTPS_PROXY NO_PROXY ALL_PROXY http_proxy https_proxy no_proxy all_proxy
      SSL_CERT_FILE SSL_CERT_DIR REQUESTS_CA_BUNDLE CURL_CA_BUNDLE NODE_EXTRA_CA_CERTS UV_NATIVE_TLS UV_SYSTEM_CERTS)
ENVARGS=()
for v in "${KEEP[@]}"; do [ -n "${!v:-}" ] && ENVARGS+=("$v=${!v}"); done
ENVARGS+=(UPSTREAM_TIMEOUT_RATE=0 UPSTREAM_SLOW_RATE=0)

health_url() { case "$1" in 8081) echo "http://127.0.0.1:8081/docs";; 8000) echo "http://127.0.0.1:8000/health";; *) echo "http://127.0.0.1:$1/";; esac; }

for sh in "$CLEAN/blocks"/*.sh; do
  n="$(basename "$sh" .sh)"; read -r kind port < "${sh%.sh}.meta"
  say "== block $n ($kind${port:+ $port}): $(tr '\n' ';' < "$sh" | cut -c1-150)"
  if [ "$kind" = once ]; then
    ( cd "$REPO" && env -i "${ENVARGS[@]}" bash -e "$sh" ) >> "$LOG" 2>&1 || fail "block $n exited non-zero (see $LOG)"
    say "   ok"
  else
    ( cd "$REPO" && exec setsid env -i "${ENVARGS[@]}" bash -e "$sh" ) >> "$LOG" 2>&1 &
    PIDS+=("$!")
    url="$(health_url "$port")"; t0=$SECONDS
    until curl -s --noproxy '*' -f -o /dev/null --max-time 3 "$url"; do
      [ $((SECONDS - t0)) -ge $WAIT ] && fail "block $n: $url did not answer within ${WAIT}s"
      sleep 2
    done
    say "   up on $port after $((SECONDS - t0))s ($url)"
  fi
done

B=http://127.0.0.1:8000
J() { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
put() { # id, json body -> prints the HTTP code; the body goes to $CLEAN/out.json
  curl -s --noproxy '*' -o "$CLEAN/out.json" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' -d "$2" "$B/api/projects/$1"; }
mkbody() { # base-json new-name -> {base, mine}
  python3 -c "import sys,json; b=json.loads(sys.argv[1]); m=json.loads(sys.argv[1]); m['name']=sys.argv[2]; print(json.dumps({'base':b,'mine':m}))" "$1" "$2"; }

say "== real save through the backend (the page's own proxy on :5173 must answer too)"
curl -s --noproxy '*' -f "http://127.0.0.1:5173/api/projects" | J "assert len(d)>=25; print('   via :5173 /api/projects ->', len(d), 'projects')" | tee -a "$LOG"
ps=("${PIPESTATUS[@]}")
[ "${ps[0]}" = 0 ] && [ "${ps[1]}" = 0 ] || fail "the web page's proxy did not return the list"
BASE="$(curl -s --noproxy '*' -f "$B/api/projects/P-1001" | J "print(json.dumps(d['editable']))")" || fail "GET P-1001"
NEW="Guide check $RANDOM"
code=""
for try in 1 2; do code="$(put P-1001 "$(mkbody "$BASE" "$NEW")")"; say "   PUT try $try -> HTTP $code"; [ "$code" != 504 ] && break; done
[ "$code" = 200 ] || fail "PUT answered $code: $(cat "$CLEAN/out.json")"
GOT="$(curl -s --noproxy '*' -f "$B/api/projects/P-1001" | J "print(d['editable']['name'])")"
say "   GET again -> name = '$GOT'"
[ "$GOT" = "$NEW" ] || fail "saved name was not read back (wanted '$NEW')"

say "== forced conflict: two saves from the same base on the same field"
BASE2="$(curl -s --noproxy '*' -f "$B/api/projects/P-1002" | J "print(json.dumps(d['editable']))")" || fail "GET P-1002"
code=""
for try in 1 2; do code="$(put P-1002 "$(mkbody "$BASE2" "Tab A $RANDOM")")"; [ "$code" != 504 ] && break; done
[ "$code" = 200 ] || fail "first save (tab A) answered $code"
code="$(put P-1002 "$(mkbody "$BASE2" "Tab B $RANDOM")")"
say "   second save from the same base -> HTTP $code"
[ "$code" = 409 ] || fail "expected 409, got $code: $(cat "$CLEAN/out.json")"
python3 -c "
import json
d = json.load(open('$CLEAN/out.json'))
c = d['conflicts'][0]
assert d['type'] == 'conflict' and c['key'] == 'name', d
print('   conflict body: type=%s, field=%s, mine=%r, theirs=%r' % (d['type'], c['key'], c['mine'], c['theirs']))" 2>&1 | tee -a "$LOG"
[ "${PIPESTATUS[0]}" = 0 ] || fail "409 body is not the conflict body"

say "PASS: clean copy built from the guide, app answered, saved name '$GOT' read back, conflict gave 409"
