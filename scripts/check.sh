#!/bin/bash
# Checks the deployment end to end and says in plain words what is wrong.
#
#   ./scripts/check.sh
#
# Reads the share token from a local file so it never has to be typed into a
# terminal that keeps history, or pasted into a chat window. Both candidate
# files are already in .gitignore, so the token cannot reach GitHub.
#
# Put the token in ONE of these, on its own line:
#   secrets.txt          just the token
#   .env                 SHARE_TOKEN=the-token
#
# The token is never printed, only used.

cd "$(dirname "$0")/.." || exit 1
BASE="https://laperdrix.neddritchie.workers.dev"

# ---------------------------------------------------------------- the token
TOKEN=""
if [ -f secrets.txt ]; then
  TOKEN=$(tr -d ' \t\r\n' < secrets.txt)
elif [ -f .env ]; then
  TOKEN=$(grep -E '^SHARE_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d ' \t\r\n"'"'")
fi

if [ -z "$TOKEN" ]; then
  echo "No token found."
  echo
  echo "  Put it in secrets.txt (just the token, nothing else):"
  echo "    echo 'YOUR_SHARE_TOKEN' > secrets.txt"
  echo
  echo "  Both secrets.txt and .env are gitignored, so it won't reach GitHub."
  exit 1
fi

pass(){ printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail(){ printf "  \033[31m✗\033[0m %s\n" "$1"; FAILED=1; }
note(){ printf "    %s\n" "$1"; }

echo
echo "Checking $BASE"
echo

# ---------------------------------------------------------------- the worker
BODY=$(curl -s -m 15 "$BASE/health")
if echo "$BODY" | grep -q '"ok":true'; then
  pass "Worker is up"
  echo "$BODY" | grep -q '"SUPABASE_URL":true'              || fail "SUPABASE_URL is not set"
  echo "$BODY" | grep -q '"SUPABASE_SERVICE_ROLE_KEY":true' || fail "SUPABASE_SERVICE_ROLE_KEY is not set"
  echo "$BODY" | grep -q '"SHARE_TOKEN":true'               || fail "SHARE_TOKEN is not set"
else
  fail "Worker did not answer /health"
  note "Check the Worker exists and is deployed."
  exit 1
fi

# ------------------------------------------------------- is it the new code?
CODE=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE/data")
if [ "$CODE" = "404" ]; then
  fail "The Worker is still the OLD code"
  note "Re-paste worker/worker.js into the Cloudflare dashboard."
  exit 1
fi
pass "Worker has the data routes"

# ------------------------------------------------------- rejects bad tokens
CODE=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE/data?t=definitely-wrong")
[ "$CODE" = "401" ] && pass "Refuses a wrong token" || fail "A wrong token returned $CODE, expected 401"

# ---------------------------------------------------------------- the tables
OUT=$(curl -s -m 20 -w '\n%{http_code}' "$BASE/data?t=$TOKEN")
CODE=$(echo "$OUT" | tail -1)
BODY=$(echo "$OUT" | sed '$d')
BAD_TOKEN=""
case "$CODE" in
  200)
    pass "Database is reachable and the tables exist"
    # Counted properly rather than by grepping for '"id"', which conflated
    # people with expenses into one figure called "records" and disagreed with
    # the real number. A status line nobody can trust is worse than none.
    note "$(printf '%s' "$BODY" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("could not read the response"); raise SystemExit
ppl, exp = d.get("people", []), d.get("expenses", [])
fam = sorted({(p.get("household") or "").strip() for p in ppl} - {""})
bits = ["%d %s" % (len(ppl), "person" if len(ppl) == 1 else "people"),
        "%d %s" % (len(exp), "expense" if len(exp) == 1 else "expenses")]
if fam:
    bits.append("%d %s (%s)" % (len(fam), "family" if len(fam) == 1 else "families", ", ".join(fam)))
print(", ".join(bits) + " stored.")
')"
    ;;
  401) BAD_TOKEN=1
       fail "Your token does not match the one in Cloudflare"
       note "Paste the value in secrets.txt into the SHARE_TOKEN secret." ;;
  502) fail "Token is fine, but the database is not ready"
       note "Run schema.sql in the Supabase SQL editor." ;;
  *)   fail "Unexpected response $CODE"
       note "$(echo "$BODY" | head -c 200)" ;;
esac

# --------------------------------------------------------------- the photos
# Pointless to ask, and actively misleading to report, while the token is wrong:
# every route would return 401 and it would look like the photos were missing.
if [ -n "$BAD_TOKEN" ]; then
  echo
  echo "Stopping here — fix the token first, then run this again."
  echo "Everything else is blocked behind it and would only report false alarms."
  exit 1
fi

OUT=$(curl -s -m 25 -w '\n%{http_code}' "$BASE/photos?t=$TOKEN")
CODE=$(echo "$OUT" | tail -1)
BODY=$(echo "$OUT" | sed '$d')
if [ "$CODE" = "200" ]; then
  N=$(echo "$BODY" | grep -o 'https' | wc -l | tr -d ' ')
  if [ "$N" -ge 9 ]; then
    pass "All 9 photographs are in the bucket"
  else
    fail "Only $N of 9 photographs could be signed"
    note "Check the names in trip-photos: group, lake, abbey, chair, mirror, heads,"
    note "hens, table, window (.jpg)"
  fi
else
  fail "Photographs are not available ($CODE)"
  note "Upload the nine files from photos/ into the trip-photos bucket."
fi

echo
if [ -n "$FAILED" ]; then
  echo "Not ready yet — see the ✗ lines above."
  exit 1
fi
echo "All good. The only thing left is the GitHub repo and Pages."
echo
echo "Your share link will be:"
echo "  https://edrits.github.io/laperdrix/#t=<your token>"
