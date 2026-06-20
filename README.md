# claude-statusline

Una status line personalizada y rica en información para [Claude Code](https://claude.com/claude-code), escrita en Node.js (sin dependencias).

Muestra en una sola línea: directorio, estado de git, modelo, uso de contexto, costo de la sesión, líneas modificadas, **límites de uso de tu suscripción (5h / 7 días) con cuenta regresiva y hora exacta de reset**, desglose por modelo y reloj.

```
📁 ~/mi-proyecto | 🌿 main* ↑2 ↓1 📦1 | 🤖 Opus 4.8 | 🧮 46.1k (23%) | 💰 $0.12 | 📝 +123/-45 | ⏳ 5h 6% ↺2h12m (12:19) 📆 7d 3% ↺4h53m (14:59) 🧠 O7%/S2% | 🕐 10:10
```

## Características

| Segmento | Muestra |
|----------|---------|
| 📁 | Directorio actual (relativo a `~`) |
| 🌿 | Rama git + `*` si hay cambios sin commitear, `↑`/`↓` ahead/behind del upstream, `📦` número de stashes |
| 🤖 | Modelo de Claude en uso |
| 🧮 | Tokens del contexto actual + % de la ventana de 200k (verde/amarillo/rojo según llenado) |
| 💰 | Costo en USD de la sesión |
| 📝 | Líneas añadidas/eliminadas en la sesión |
| ⏳ 5h | Uso del límite de 5 horas + cuenta regresiva + hora exacta del reset |
| 📆 7d | Uso del límite semanal (7 días) + cuenta regresiva + hora exacta del reset |
| 🧠 | Desglose de uso semanal por modelo: `O`=Opus, `S`=Sonnet |
| 🕐 | Hora local |

Los colores son ANSI: verde `< 70%`, amarillo `70–89%`, rojo `≥ 90%`.

## Requisitos

- [Claude Code](https://claude.com/claude-code)
- Node.js (cualquier versión moderna; probado con v22)
- `git` (opcional, solo para el segmento de git)

## Instalación

```bash
git clone https://github.com/psyberpunk/claude-statusline.git
cd claude-statusline
./install.sh
```

El instalador:
1. Copia `statusline.js` y `usage-fetch.js` a `~/.claude/`.
2. Agrega (o fusiona) la configuración `statusLine` en `~/.claude/settings.json`.

Reinicia Claude Code (o empieza una nueva interacción) y verás la status line abajo.

### Instalación manual

1. Copia ambos `.js` a `~/.claude/`.
2. Agrega esto a `~/.claude/settings.json`:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node ~/.claude/statusline.js"
     }
   }
   ```

## Cómo funciona el uso de la suscripción

Los segmentos `⏳ 5h`, `📆 7d` y `🧠` (Opus/Sonnet) consultan el endpoint OAuth de uso de Anthropic
(`https://api.anthropic.com/api/oauth/usage`) usando el token que Claude Code ya guarda en
`~/.claude/.credentials.json`.

Para no llamar a la red en cada render (la status line se dibuja muy seguido):

- `usage-fetch.js` consulta la API y escribe un caché en `~/.claude/usage-cache.json`.
- `statusline.js` **solo lee ese caché** (render instantáneo) y, si tiene más de 5 minutos,
  dispara `usage-fetch.js` en segundo plano (`detached`/`unref`) para refrescarlo de cara al próximo render.
  Nunca bloquea esperando la red.

> ⚠️ **Nota:** el endpoint de uso no está documentado oficialmente por Anthropic. Si cambia, esos
> segmentos simplemente dejarán de actualizarse; el resto de la status line sigue funcionando.

## Personalización

Todo vive en `statusline.js`. Es un único archivo sin dependencias:

- Cambia los **colores** en el objeto `c` (códigos ANSI).
- Cambia los **íconos** directamente en cada segmento.
- Ajusta el **orden** o quita segmentos en el arreglo `parts` al final del archivo.
- Cambia `CONTEXT_LIMIT` (200000) o el `TTL` del caché de uso (5 min) según prefieras.

## Licencia

MIT
