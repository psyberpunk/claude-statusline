#!/usr/bin/env bash
# Instalador de claude-statusline
# Copia los scripts a ~/.claude/ y registra la statusLine en settings.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

echo "==> Instalando claude-statusline en $CLAUDE_DIR"

# 1. Verificar dependencias
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js no está instalado. Instálalo antes de continuar." >&2
  exit 1
fi

mkdir -p "$CLAUDE_DIR"

# 2. Copiar scripts
cp "$SCRIPT_DIR/statusline.js" "$CLAUDE_DIR/statusline.js"
cp "$SCRIPT_DIR/usage-fetch.js" "$CLAUDE_DIR/usage-fetch.js"
echo "    ✓ statusline.js y usage-fetch.js copiados"

# 3. Fusionar la config en settings.json (sin perder lo existente)
node - "$SETTINGS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
cfg.statusLine = { type: 'command', command: 'node ~/.claude/statusline.js' };
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log('    ✓ statusLine registrada en ' + file);
NODE

echo "==> Listo. Reinicia Claude Code (o inicia una nueva interacción) para verla."
