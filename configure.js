#!/usr/bin/env node
// Menú interactivo de configuración para claude-statusline.
// Activa/desactiva cada segmento y guarda en ~/.claude/statusline-config.json
//
// Uso:   node ~/.claude/configure.js
// Teclas: ↑/↓ mover · Espacio/Enter alternar · a todo · n nada · g guardar · q salir

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || require('os').homedir();
const CFG_FILE = path.join(HOME, '.claude', 'statusline-config.json');

const DEFAULTS = {
  directory: true,
  git: true,
  model: true,
  tokens: true,
  cost: true,
  lines: true,
  usage5h: true,
  usage7d: true,
  modelBreakdown: true,
  clock: true,
  contextLimit: 1000000,
};

// Segmentos alternables (en orden de aparición en la status line)
const ITEMS = [
  { key: 'directory', icon: '📁', label: 'Directorio actual' },
  { key: 'git', icon: '🌿', label: 'Rama git (+ ahead/behind, stash)' },
  { key: 'model', icon: '🤖', label: 'Modelo de Claude' },
  { key: 'tokens', icon: '🧮', label: 'Tokens de contexto (% de ventana)' },
  { key: 'cost', icon: '💰', label: 'Costo de la sesión (USD)' },
  { key: 'lines', icon: '📝', label: 'Líneas modificadas (+/-)' },
  { key: 'usage5h', icon: '⏳', label: 'Límite de uso 5h (+ reset)' },
  { key: 'usage7d', icon: '📆', label: 'Límite de uso semanal 7d (+ reset)' },
  { key: 'modelBreakdown', icon: '🧠', label: 'Desglose Opus/Sonnet' },
  { key: 'clock', icon: '🕐', label: 'Reloj (hora local)' },
];
// Última fila especial: cicla la ventana de contexto
const CTX_ROW = ITEMS.length;
const CTX_PRESETS = [1000000, 200000];

// Cargar config existente o defaults
let cfg = { ...DEFAULTS };
try {
  cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) };
} catch {}

let cursor = 0;
const TOTAL_ROWS = ITEMS.length + 1; // toggles + fila de contexto

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  inv: '\x1b[7m',
};

function fmtCtx(v) {
  return v >= 1000000 ? v / 1000000 + 'M' : v / 1000 + 'k';
}

function render() {
  const out = [];
  out.push('\x1b[2J\x1b[H'); // limpiar pantalla + cursor arriba
  out.push(`${C.bold}${C.cyan}  claude-statusline — configuración${C.reset}\n`);
  out.push(`${C.dim}  Activa/desactiva los segmentos de tu status line.${C.reset}\n\n`);

  ITEMS.forEach((it, i) => {
    const on = !!cfg[it.key];
    const box = on ? `${C.green}[x]${C.reset}` : `${C.dim}[ ]${C.reset}`;
    const sel = i === cursor;
    const arrow = sel ? `${C.cyan}›${C.reset}` : ' ';
    const labelCol = on ? '' : C.dim;
    out.push(`  ${arrow} ${box} ${it.icon}  ${labelCol}${it.label}${C.reset}\n`);
  });

  // Fila de ventana de contexto
  const selCtx = cursor === CTX_ROW;
  const arrowCtx = selCtx ? `${C.cyan}›${C.reset}` : ' ';
  out.push(
    `  ${arrowCtx} ${C.yellow}[${fmtCtx(cfg.contextLimit)}]${C.reset} 🪟  Ventana de contexto ` +
      `${C.dim}(Espacio cicla 1M/200k)${C.reset}\n`
  );

  out.push('\n');
  out.push(
    `${C.dim}  ↑/↓${C.reset} mover   ` +
      `${C.dim}Espacio/Enter${C.reset} alternar   ` +
      `${C.dim}a${C.reset} todo   ` +
      `${C.dim}n${C.reset} nada   ` +
      `${C.green}g${C.reset} guardar   ` +
      `${C.red}q${C.reset} salir\n`
  );
  process.stdout.write(out.join(''));
}

function toggleCurrent() {
  if (cursor === CTX_ROW) {
    const idx = CTX_PRESETS.indexOf(cfg.contextLimit);
    cfg.contextLimit = CTX_PRESETS[(idx + 1) % CTX_PRESETS.length] || CTX_PRESETS[0];
  } else {
    const key = ITEMS[cursor].key;
    cfg[key] = !cfg[key];
  }
}

function save() {
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2) + '\n');
}

function quit(msg) {
  process.stdout.write('\x1b[2J\x1b[H');
  if (msg) process.stdout.write(msg + '\n');
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error(
    'Este menú es interactivo. Ejecútalo en una terminal:\n  node ~/.claude/configure.js'
  );
  process.exit(1);
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
render();

process.stdin.on('data', (key) => {
  switch (key) {
    case '': // Ctrl-C
    case 'q':
      quit(`${C.dim}Sin cambios guardados.${C.reset}`);
      break;
    case '[A': // ↑
    case 'k':
      cursor = (cursor - 1 + TOTAL_ROWS) % TOTAL_ROWS;
      render();
      break;
    case '[B': // ↓
    case 'j':
      cursor = (cursor + 1) % TOTAL_ROWS;
      render();
      break;
    case ' ':
    case '\r':
    case '\n':
      toggleCurrent();
      render();
      break;
    case 'a': // activar todo
      ITEMS.forEach((it) => (cfg[it.key] = true));
      render();
      break;
    case 'n': // desactivar todo
      ITEMS.forEach((it) => (cfg[it.key] = false));
      render();
      break;
    case 'g': // guardar y salir
      save();
      quit(
        `${C.green}✓ Guardado en ${CFG_FILE}${C.reset}\n` +
          `${C.dim}Reinicia Claude Code o espera al próximo render para verlo.${C.reset}`
      );
      break;
    default:
      break;
  }
});
