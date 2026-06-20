#!/usr/bin/env node
// Claude Code status line — directorio + rama git + modelo + costo
// Recibe un JSON por stdin y escribe una sola línea en stdout.

const { execSync } = require('child_process');

// Colores ANSI
const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

let data = {};
try {
  data = JSON.parse(readStdin() || '{}');
} catch {
  data = {};
}

const cwd = (data.workspace && data.workspace.current_dir) || data.cwd || process.cwd();
const home = process.env.HOME || '';

// --- Directorio (relativo a $HOME con ~) ---
let dir = cwd;
if (home && dir.startsWith(home)) dir = '~' + dir.slice(home.length);
const dirSeg = `${c.cyan}📁 ${dir}${c.reset}`;

// --- Rama git (verde si limpio, amarillo si hay cambios) ---
let gitSeg = '';
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim();
  if (branch) {
    let dirty = '';
    try {
      const status = execSync('git status --porcelain', {
        cwd, stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim();
      dirty = status ? '*' : '';
    } catch {}
    const col = dirty ? c.yellow : c.green;
    let extra = '';
    // Ahead/behind respecto al upstream
    try {
      const ab = execSync('git rev-list --left-right --count @{u}...HEAD', {
        cwd, stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim().split(/\s+/);
      const behind = parseInt(ab[0], 10) || 0;
      const ahead = parseInt(ab[1], 10) || 0;
      if (ahead) extra += `${c.dim} ${c.reset}${c.green}↑${ahead}${c.reset}`;
      if (behind) extra += `${c.dim} ${c.reset}${c.red}↓${behind}${c.reset}`;
    } catch {
      // sin upstream configurado → nada
    }
    // Número de stashes
    try {
      const stash = execSync('git stash list', {
        cwd, stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim();
      const n = stash ? stash.split('\n').length : 0;
      if (n) extra += `${c.dim} ${c.reset}${c.magenta}📦${n}${c.reset}`;
    } catch {}
    gitSeg = `${col}🌿 ${branch}${dirty}${c.reset}${extra}`;
  }
} catch {
  // no es repo git → sin segmento
}

// --- Modelo ---
const model = (data.model && data.model.display_name) || 'Claude';
const modelSeg = `${c.magenta}🤖 ${model}${c.reset}`;

// --- Consumo de tokens (tamaño actual del contexto) ---
// Se lee del transcript: el último mensaje del asistente con `usage`.
let tokSeg = '';
const CONTEXT_LIMIT = 1000000; // ventana de contexto de referencia (1M)
function fmtTokens(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
if (data.transcript_path) {
  try {
    const fs = require('fs');
    const lines = fs.readFileSync(data.transcript_path, 'utf8').split('\n');
    let usage = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        const u = obj.message && obj.message.usage;
        if (u && typeof u.input_tokens === 'number') {
          usage = u;
          break;
        }
      } catch {}
    }
    if (usage) {
      const ctx =
        (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.output_tokens || 0);
      const pct = Math.round((ctx / CONTEXT_LIMIT) * 100);
      // Color según qué tan lleno está el contexto
      const col = pct >= 90 ? c.red : pct >= 70 ? c.yellow : c.green;
      tokSeg = `${col}🧮 ${fmtTokens(ctx)} (${pct}%)${c.reset}`;
    }
  } catch {
    // sin transcript legible → sin segmento de tokens
  }
}

// --- Costo de la sesión ---
let costSeg = '';
const cost = data.cost && typeof data.cost.total_cost_usd === 'number'
  ? data.cost.total_cost_usd : null;
if (cost !== null) {
  costSeg = `${c.yellow}💰 $${cost.toFixed(2)}${c.reset}`;
}

// --- Líneas modificadas en la sesión (+añadidas / -eliminadas) ---
let linesSeg = '';
const added = data.cost && data.cost.total_lines_added;
const removed = data.cost && data.cost.total_lines_removed;
if (typeof added === 'number' || typeof removed === 'number') {
  linesSeg =
    `${c.dim}📝 ${c.reset}${c.green}+${added || 0}${c.reset}` +
    `${c.dim}/${c.reset}${c.red}-${removed || 0}${c.reset}`;
}

// --- Reloj (hora local) ---
const _now = new Date();
const _pad = (n) => String(n).padStart(2, '0');
const clockSeg = `${c.dim}🕐 ${_pad(_now.getHours())}:${_pad(_now.getMinutes())}${c.reset}`;

// --- Uso de la suscripción (5h "diario" + 7d semanal) ---
// Se lee de un caché actualizado en segundo plano por usage-fetch.js.
// Si el caché está viejo (>5 min), se dispara un refresco detached SIN bloquear.
let usageSeg = '';
(function () {
  const fs = require('fs');
  const path = require('path');
  const home = process.env.HOME || require('os').homedir();
  const cacheFile = path.join(home, '.claude', 'usage-cache.json');
  const fetcher = path.join(home, '.claude', 'usage-fetch.js');
  const TTL = 5 * 60 * 1000; // 5 minutos

  let cache = null;
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {}

  const age = cache && cache.fetchedAt ? Date.now() - cache.fetchedAt : Infinity;
  if (age > TTL) {
    // Refresco en segundo plano: no esperamos resultado.
    try {
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, [fetcher], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch {}
  }

  if (!cache) return;
  function fmtPct(v) {
    return typeof v === 'number' ? Math.round(v) + '%' : '—';
  }
  function colFor(v) {
    if (typeof v !== 'number') return c.dim;
    return v >= 90 ? c.red : v >= 70 ? c.yellow : c.green;
  }
  // Cuenta regresiva + hora exacta del reset, p.ej. ↺2h15m (16:19)
  // Si el reset no es hoy, incluye el día: ↺3d2h (lun 14:30)
  function fmtReset(iso) {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const now = Date.now();
    let ms = t - now;
    // Cuenta regresiva
    let cd;
    if (ms <= 0) {
      cd = 'ya';
    } else {
      const totalMin = Math.floor(ms / 60000);
      const d = Math.floor(totalMin / 1440);
      const h = Math.floor((totalMin % 1440) / 60);
      const m = totalMin % 60;
      if (d > 0) cd = `${d}d${h}h`;
      else if (h > 0) cd = `${h}h${m}m`;
      else cd = `${m}m`;
    }
    // Hora exacta (hora local del sistema)
    const dt = new Date(t);
    const pad = (n) => String(n).padStart(2, '0');
    const clock = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    // ¿Es hoy? Si no, anteponer el día de la semana
    const nd = new Date(now);
    const sameDay =
      dt.getFullYear() === nd.getFullYear() &&
      dt.getMonth() === nd.getMonth() &&
      dt.getDate() === nd.getDate();
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const when = sameDay ? clock : `${days[dt.getDay()]} ${clock}`;
    return ` ${c.dim}↺${cd} (${when})${c.reset}`;
  }
  const segs = [];
  if (typeof cache.five_hour === 'number') {
    segs.push(
      `${colFor(cache.five_hour)}⏳ 5h ${fmtPct(cache.five_hour)}${c.reset}` +
        fmtReset(cache.five_hour_resets_at)
    );
  }
  if (typeof cache.seven_day === 'number') {
    segs.push(
      `${colFor(cache.seven_day)}📆 7d ${fmtPct(cache.seven_day)}${c.reset}` +
        fmtReset(cache.seven_day_resets_at)
    );
  }
  // Desglose semanal por modelo (Opus / Sonnet)
  const models = [];
  if (typeof cache.seven_day_opus === 'number') {
    models.push(`${colFor(cache.seven_day_opus)}O${fmtPct(cache.seven_day_opus)}${c.reset}`);
  }
  if (typeof cache.seven_day_sonnet === 'number') {
    models.push(`${colFor(cache.seven_day_sonnet)}S${fmtPct(cache.seven_day_sonnet)}${c.reset}`);
  }
  if (models.length) {
    segs.push(`${c.dim}🧠 ${c.reset}` + models.join(`${c.dim}/${c.reset}`));
  }
  usageSeg = segs.join(`${c.dim} ${c.reset}`);
})();

const sep = `${c.dim} | ${c.reset}`;
const parts = [
  dirSeg,
  gitSeg,
  modelSeg,
  tokSeg,
  costSeg,
  linesSeg,
  usageSeg,
  clockSeg,
].filter(Boolean);
process.stdout.write(parts.join(sep));
