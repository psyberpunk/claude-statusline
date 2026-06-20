#!/usr/bin/env node
// Actualiza el caché de uso (límites de suscripción) consultando la API OAuth.
// Pensado para ejecutarse en segundo plano desde statusline.js.
// Escribe ~/.claude/usage-cache.json y NUNCA bloquea al statusline.

const fs = require('fs');
const https = require('https');
const path = require('path');

const HOME = process.env.HOME || require('os').homedir();
const CRED = path.join(HOME, '.claude', '.credentials.json');
const CACHE = path.join(HOME, '.claude', 'usage-cache.json');

let token;
try {
  token = JSON.parse(fs.readFileSync(CRED, 'utf8')).claudeAiOauth.accessToken;
} catch {
  process.exit(0); // sin credenciales → no hacemos nada
}
if (!token) process.exit(0);

const req = https.request(
  {
    hostname: 'api.anthropic.com',
    path: '/api/oauth/usage',
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      'anthropic-beta': 'oauth-2025-04-20',
    },
    timeout: 8000,
  },
  (res) => {
    let body = '';
    res.on('data', (d) => (body += d));
    res.on('end', () => {
      if (res.statusCode !== 200) process.exit(0);
      try {
        const j = JSON.parse(body);
        const out = {
          fetchedAt: Date.now(),
          five_hour: j.five_hour ? j.five_hour.utilization : null,
          five_hour_resets_at: j.five_hour ? j.five_hour.resets_at : null,
          seven_day: j.seven_day ? j.seven_day.utilization : null,
          seven_day_resets_at: j.seven_day ? j.seven_day.resets_at : null,
          seven_day_opus: j.seven_day_opus ? j.seven_day_opus.utilization : null,
          seven_day_sonnet: j.seven_day_sonnet ? j.seven_day_sonnet.utilization : null,
        };
        fs.writeFileSync(CACHE, JSON.stringify(out));
      } catch {}
      process.exit(0);
    });
  }
);
req.on('error', () => process.exit(0));
req.on('timeout', () => {
  req.destroy();
  process.exit(0);
});
req.end();
