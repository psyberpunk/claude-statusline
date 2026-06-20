#!/usr/bin/env bash
# Desinstalador de claude-statusline
# Quita los scripts de ~/.claude/ y elimina la statusLine de settings.json
set -euo pipefail

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

echo "==> Desinstalando claude-statusline de $CLAUDE_DIR"

# 1. Borrar scripts y caché
removed=0
for f in statusline.js usage-fetch.js configure.js usage-cache.json statusline-config.json; do
  if [ -f "$CLAUDE_DIR/$f" ]; then
    rm -f "$CLAUDE_DIR/$f"
    echo "    ✓ eliminado $f"
    removed=1
  fi
done
[ "$removed" -eq 0 ] && echo "    (no había scripts que eliminar)"

# 2. Quitar la clave statusLine de settings.json (conservando el resto)
if [ -f "$SETTINGS" ] && command -v node >/dev/null 2>&1; then
  node - "$SETTINGS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { process.exit(0); }
if (cfg.statusLine) {
  delete cfg.statusLine;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log('    ✓ statusLine eliminada de ' + file);
} else {
  console.log('    (settings.json no tenía statusLine)');
}
NODE
fi

echo "==> Listo. Reinicia Claude Code para aplicar los cambios."
