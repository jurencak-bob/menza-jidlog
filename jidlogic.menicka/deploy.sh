#!/usr/bin/env bash
#
# deploy.sh — push + bump verze + redeploy v jednom kroku.
#
# Verzování stejné jako parent projekt, jen s tisícinami:
#   parent:   v20260423.15   (datum + setiny, 2 cifry)
#   menicka:  v20260426.001  (datum + tisíciny, 3 cifry)
#
# Pravidla:
#   - Nové datum → counter resetuje na 001.
#   - Stejné datum → counter inkrementuje (.001 → .002 → … → .999).
#   - Pokud poslední description neodpovídá patternu (např. "Menicka 1.6"
#     z dřívějška), použije se vYYYYMMDD.001 pro dnešek.
#
# Pipeline:
#   1. clasp push
#   2. detekuj poslední verzi z description prod deploymentu
#   3. spočítej další verzi
#   4. clasp create-version "<nová verze>"
#   5. clasp redeploy <ID> -V <ver> -d "<nová verze>"

set -euo pipefail

PROD_DEPLOYMENT_ID="AKfycbw4_Y3RRfN4KXfQTeL2eS_fpyZmzpWtHBDQrCm8YAiVfycWi6_xKvVPke4o2Ipoi9vt8Q"

cd "$(dirname "$0")"

echo "→ clasp push"
clasp push

echo ""
echo "→ Zjišťuji aktuální verzi…"
TODAY=$(date +%Y%m%d)

CURRENT=$(clasp deployments 2>/dev/null \
  | grep -F "$PROD_DEPLOYMENT_ID" \
  | grep -oE 'v[0-9]{8}\.[0-9]{3}' \
  | head -1 || true)

if [[ -z "${CURRENT:-}" ]]; then
  # Buď první deploy, nebo description je ze starého formátu ("Menicka X.Y").
  NEXT="v${TODAY}.001"
  echo "  Žádná předchozí v-verze, začínám od ${NEXT}"
else
  CURRENT_DATE="${CURRENT:1:8}"
  CURRENT_NUM="${CURRENT:10}"
  if [[ "$CURRENT_DATE" == "$TODAY" ]]; then
    NEXT_NUM=$(printf "%03d" $((10#$CURRENT_NUM + 1)))
    NEXT="v${TODAY}.${NEXT_NUM}"
  else
    NEXT="v${TODAY}.001"
  fi
  echo "  $CURRENT → $NEXT"
fi

echo ""
echo "→ clasp create-version \"$NEXT\""
CREATE_OUT=$(clasp create-version "$NEXT" 2>&1)
echo "$CREATE_OUT"
VERSION_NUM=$(echo "$CREATE_OUT" | grep -oE 'version [0-9]+' | grep -oE '[0-9]+' | tail -1)

if [[ -z "${VERSION_NUM:-}" ]]; then
  echo "✗ Nepodařilo se vytvořit novou verzi."
  exit 1
fi
echo "  Apps Script verze č.: $VERSION_NUM"

echo ""
echo "→ clasp redeploy $PROD_DEPLOYMENT_ID -V $VERSION_NUM -d \"$NEXT\""
clasp redeploy "$PROD_DEPLOYMENT_ID" -V "$VERSION_NUM" -d "$NEXT"

echo ""
echo "✓ Hotovo. Verze $NEXT je live."
echo "  URL: https://script.google.com/a/macros/blogic.cz/s/$PROD_DEPLOYMENT_ID/exec"
echo "  Hard-refresh v prohlížeči: Cmd+Shift+R"
