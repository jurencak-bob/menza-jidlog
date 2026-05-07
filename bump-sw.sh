#!/usr/bin/env bash
#
# bump-sw.sh — auto-increment sw.js cache version když se změní wrapper soubory.
#
# Spouští se buď ručně před commitem, nebo automaticky přes git pre-commit hook
# (viz .githooks/pre-commit). Detekuje změny v watched souborech (staged i
# unstaged), inkrementuje `CACHE_NAME = 'jidlogic-shell-vN'` v sw.js.
#
# Bez tohoto skriptu by user musel ručně bumpnout cache verzi po každé změně
# wrapperu — easy to forget → stávající uživatelé dostanou stale shell ze SW
# cache.
#
# Watched soubory: luncher.html, manifest, ikony. sw.js sám se nepočítá
# (jinak by se cyklil).

set -euo pipefail
cd "$(dirname "$0")"

WATCHED_FILES=(
  "luncher.html"
  "luncher-manifest.json"
  "luncher-icon.svg"
  "luncher-apple-touch-icon.png"
  "luncher-icon-192.png"
  "luncher-icon-512.png"
)

# Detekuj změnu (staged or unstaged) v některém z watched souborů.
CHANGED=0
for f in "${WATCHED_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then continue; fi
  if ! git diff --cached --quiet -- "$f" 2>/dev/null; then
    CHANGED=1; break
  fi
  if ! git diff --quiet -- "$f" 2>/dev/null; then
    CHANGED=1; break
  fi
done

if [[ $CHANGED -eq 0 ]]; then
  echo "bump-sw: žádné watched soubory se nezměnily, sw.js zůstává."
  exit 0
fi

# Pokud sw.js sám už má staged změnu (CACHE_NAME bumpnutý ručně), respektuj to.
if ! git diff --cached --quiet -- sw.js 2>/dev/null; then
  if git diff --cached -- sw.js | grep -qE '^\+.*CACHE_NAME.*shell-v[0-9]+'; then
    echo "bump-sw: sw.js už má staged změnu CACHE_NAME, skip auto-bump."
    exit 0
  fi
fi

# Najdi aktuální verzi a inkrementuj.
CURRENT=$(grep -oE "'jidlogic-shell-v[0-9]+'" sw.js | head -1 | tr -d "'")
if [[ -z "$CURRENT" ]]; then
  echo "bump-sw: neumím parsovat CACHE_NAME v sw.js. Skip." >&2
  exit 0
fi

NUM=$(echo "$CURRENT" | grep -oE '[0-9]+$')
NEXT_NUM=$((NUM + 1))
NEXT="jidlogic-shell-v${NEXT_NUM}"

# In-place replace (sed -i.bak pro macOS BSD compat, pak smaz backup).
sed -i.bak "s/${CURRENT}/${NEXT}/" sw.js
rm -f sw.js.bak

git add sw.js

echo "bump-sw: ${CURRENT} → ${NEXT} (sw.js staged)"
