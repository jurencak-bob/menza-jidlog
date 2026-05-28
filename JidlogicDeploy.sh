#!/usr/bin/env bash
#
# JidlogicDeploy.sh — push + deploy Jídlogicu jedním krokem.
#
# Použití:
#   ./JidlogicDeploy.sh "Popis změny v20260424.XX"
#
# Co dělá:
#   1. Pushne lokální změny do GAS (Apps Script HEAD).
#      Auto-odpovídá `y` na „Manifest file has been updated" prompt.
#   2. Aktivuje produkční deployment (URL `?app=obedy`) na čerstvý HEAD.
#   3. Vypíše výsledek (verze + URL pro hard-refresh).
#
# Odkud má Description:
#   - První argument scriptu (`$1`).
#   - Pokud chybí, použije auto-fallback `Auto-deploy YYYYMMDD-HHMMSS`.
#
# Single quotes vs double quotes:
#   Pro prevenci zsh history expansion (`!` znak) v description používá script
#   single-quoted `bash -c` wrapper. Ty si můžeš description psát volně —
#   `./JidlogicDeploy.sh "Fix !important CSS v.XX"` projde bez `event not found`.
#
# Memory reference:
#   - feedback_deploy_shell_gotchas.md  — pravidla manifest promptu, zsh quoting
#   - feedback_version_footer.md        — 4 místa verze (JS + HTML, replace_all)
#   - project_clasp_deploy.md           — kontext (clasp 3.x, .gs → .js, atd.)

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# Konstanta: produkční deployment ID Jídlogicu
# (z .clasp.json a memory; URL `?app=obedy`)
# ─────────────────────────────────────────────────────────────────────
DEPLOYMENT_ID="AKfycbxqAYO0PoeatQpr_Le8c5Eg1C1BUW81EA1dRDLyp2HtqP4-KHWaBCzA7-yCXuJd6OOm"

# ─────────────────────────────────────────────────────────────────────
# CWD do adresáře projektu (script funguje odkudkoli)
# ─────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")"

# ─────────────────────────────────────────────────────────────────────
# Description
# ─────────────────────────────────────────────────────────────────────
DESC="${1:-Auto-deploy $(date +%Y%m%d-%H%M%S)}"

echo "═══════════════════════════════════════════════════════════════"
echo " JidlogicDeploy.sh"
echo "  Adresář:    $(pwd)"
echo "  Popis:      $DESC"
echo "  Deployment: $DEPLOYMENT_ID"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────
# 1. Push (auto-y na manifest prompt)
# ─────────────────────────────────────────────────────────────────────
echo "→ clasp push"
# Heredoc místo `yes y | clasp push`: ten dřívější setup pod `set -o pipefail`
# selhával, protože když clasp žádný prompt nevyvolal, `yes` zůstal blokovaný
# na write a po skončení claspu dostal SIGPIPE (exit 141) → `pipefail` propsal
# non-zero do whole pipe a celý skript spadl, i když push samotný proběhl OK.
# Heredoc pošle pevný počet `y` a EOF; SIGPIPE riziko mizí.
if ! clasp push <<'EOF'
y
y
y
y
y
EOF
then
  echo "✗ clasp push selhal."
  exit 1
fi

echo ""

# ─────────────────────────────────────────────────────────────────────
# 2. Deploy (= aktivace produkčního deployment ID na čerstvý HEAD)
# ─────────────────────────────────────────────────────────────────────
echo "→ clasp deploy --description \"$DESC\""
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "$DESC" || {
  echo "✗ clasp deploy selhal."
  exit 1
}

echo ""

# ─────────────────────────────────────────────────────────────────────
# 3. Backup mirror sync — kopíruj source soubory do private repa
#    jurencak-bob/jidlogic-source, commit + push.
#    Pojistka pro případ ztráty přístupu k blogic.cz Google Workspace.
#
#    Repo žije v ~/Documents/Projekty/jidlogic-source/. Pokud chybí
#    (nový stroj, neklonovaný), krok se přeskočí s warning — deploy
#    samotný proběhne dokončený, jen backup chybí.
# ─────────────────────────────────────────────────────────────────────
BACKUP_DIR="$HOME/Documents/Projekty/jidlogic-source"
if [ -d "$BACKUP_DIR/.git" ]; then
  echo "→ backup sync → $BACKUP_DIR"

  # Soubory k zálohování — vše, co clasp pushuje do GAS, plus deploy/doc
  # helpery. Drž ve sync s README.md v backup repu.
  BACKUP_FILES=(
    Obedy.html obedy.js obedy.tests.js Menza.feed.js Help.html
    Dashboard.html luncher.html lunchhunter.html
    appsscript.json .clasp.json .claspignore
    JidlogicDeploy.sh bump-sw.sh
    JIDLOGIC-DOKUMENTACE.md TODO-napady.md
    menza_historie.js
  )

  for f in "${BACKUP_FILES[@]}"; do
    if [ -f "$f" ]; then
      cp "$f" "$BACKUP_DIR/"
    fi
  done

  (
    cd "$BACKUP_DIR"
    # Jen commit pokud něco fakt skopírováno se změnilo. `git diff --quiet`
    # vrátí non-zero když jsou změny v staging/working tree → tehdy commit.
    git add -A
    if ! git diff --cached --quiet; then
      git commit -m "Sync $DESC" || true
      git push origin main || echo "⚠ backup push selhal (síť? auth?) — řešit ručně později"
    else
      echo "  (žádné změny — backup je up-to-date)"
    fi
  )
else
  echo "⚠ backup repo $BACKUP_DIR neexistuje — sync přeskočen."
  echo "  Naklonuj přes: git clone https://github.com/jurencak-bob/jidlogic-source.git $BACKUP_DIR"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✓ Deploy hotov."
echo "  URL:        https://script.google.com/a/macros/blogic.cz/s/$DEPLOYMENT_ID/exec?app=obedy"
echo "  Hard-refresh v PWA: zavři + otevři, nebo počkej na version-update toast (do 3 min)."
echo "═══════════════════════════════════════════════════════════════"
