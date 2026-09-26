import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLiveWriter} from './scripts/live-pi-writer.mjs';
import {fetchDirectQuota, parseRelativeReset} from './scripts/browser-quota-sync.mjs';

const PROJECT_DIR = fileURLToPath(new URL('./', import.meta.url));

/** Extract rate limit metrics from provider HTTP response headers (OpenAI, Anthropic, generic IETF draft). */
export function parseRateLimitHeaders(headers, providerName = 'API') {
  if (!headers) return null;
  const getHeader = (name) => {
    if (typeof headers.get === 'function') return headers.get(name);
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lower) return v;
    }
    return null;
  };

  const anthropicReqRem = getHeader('anthropic-ratelimit-requests-remaining');
  const anthropicReqLimit = getHeader('anthropic-ratelimit-requests-limit');
  const anthropicReqReset = getHeader('anthropic-ratelimit-requests-reset');
  const anthropicTokRem = getHeader('anthropic-ratelimit-tokens-remaining');
  const anthropicTokLimit = getHeader('anthropic-ratelimit-tokens-limit');
  const anthropicTokReset = getHeader('anthropic-ratelimit-tokens-reset');

  const openaiReqRem = getHeader('x-ratelimit-remaining-requests');
  const openaiReqLimit = getHeader('x-ratelimit-limit-requests');
  const openaiReqReset = getHeader('x-ratelimit-reset-requests');
  const openaiTokRem = getHeader('x-ratelimit-remaining-tokens');
  const openaiTokLimit = getHeader('x-ratelimit-limit-tokens');
  const openaiTokReset = getHeader('x-ratelimit-reset-tokens');

  const genRem = getHeader('ratelimit-remaining');
  const genLimit = getHeader('ratelimit-limit');
  const genReset = getHeader('ratelimit-reset');

  const reqRem = [anthropicReqRem, openaiReqRem, genRem].map(v => v !== null && v !== undefined ? parseInt(v, 10) : NaN).find(n => Number.isFinite(n));
  const reqLimit = [anthropicReqLimit, openaiReqLimit, genLimit].map(v => v !== null && v !== undefined ? parseInt(v, 10) : NaN).find(n => Number.isFinite(n) && n > 0);
  const reqReset = anthropicReqReset || openaiReqReset || genReset;

  const tokRem = [anthropicTokRem, openaiTokRem].map(v => v !== null && v !== undefined ? parseInt(v, 10) : NaN).find(n => Number.isFinite(n));
  const tokLimit = [anthropicTokLimit, openaiTokLimit].map(v => v !== null && v !== undefined ? parseInt(v, 10) : NaN).find(n => Number.isFinite(n) && n > 0);
  const tokReset = anthropicTokReset || openaiTokReset;

  if (reqRem === undefined && tokRem === undefined) return null;

  let remainingPercent = null;
  let used = null;
  let total = null;

  if (tokRem !== undefined && tokLimit !== undefined) {
    total = tokLimit;
    used = Math.max(0, tokLimit - tokRem);
    remainingPercent = Math.max(0, Math.min(100, Math.round((tokRem / tokLimit) * 100)));
  } else if (reqRem !== undefined && reqLimit !== undefined) {
    total = reqLimit;
    used = Math.max(0, reqLimit - reqRem);
    remainingPercent = Math.max(0, Math.min(100, Math.round((reqRem / reqLimit) * 100)));
  }

  let resetsAt = null;
  const rawReset = tokReset || reqReset;
  if (rawReset) {
    resetsAt = parseRelativeReset(rawReset) || (Number.isNaN(Date.parse(rawReset)) ? String(rawReset).slice(0, 100) : new Date(rawReset).toISOString());
  }

  const details = [];
  if (reqRem !== undefined) details.push(`Anfragen: ${reqRem}${reqLimit !== undefined ? `/${reqLimit}` : ''}`);
  if (tokRem !== undefined) details.push(`Tokens: ${tokRem}${tokLimit !== undefined ? `/${tokLimit}` : ''}`);

  return {
    fiveHour: (used !== null || remainingPercent !== null || resetsAt !== null) ? {
      used, total, remainingPercent, resetsAt
    } : null,
    weekly: null,
    detail: `HTTP Rate-Limit-Header (${providerName}${details.length ? `: ${details.join(', ')}` : ''})`
  };
}

/** Opt-in, read-only Pi lifecycle bridge. Load explicitly with `pi --extension <this file>`. */
export function createLiveExtension(pi, createWriter = createLiveWriter, options = {}) {
  let writer = null;
  let timer = null;
  let quotaTimer = null;
  let lastQuotaSync = 0;
  let state = 'idle';
  let priorPromptState = null;
  let failed = false;
  let reportedError = false;
  let currentLimits = null;
  const syncIntervalMs = options.quotaSyncIntervalMs ?? 300000;
  const fetchQuota = options.fetchQuotaFn ?? fetchDirectQuota;

  async function triggerQuotaSync(ctx, force = false) {
    const now = Date.now();
    if (!force && (now - lastQuotaSync < 60000)) return;
    lastQuotaSync = now;
    try {
      const limits = await fetchQuota('auto');
      if (limits && (limits.fiveHour || limits.weekly || limits.detail)) {
        currentLimits = limits;
        await publish(ctx);
      }
    } catch {
      // Direct sync failed, silent fail without disrupting agent
    }
  }

  function report(ctx) {
    if (reportedError) return;
    reportedError = true;
    if (ctx.hasUI) ctx.ui.notify('Pi Observatory: Live-Status konnte nicht geschrieben werden; Sperre/Dateirechte prüfen.', 'warning');
  }

  async function publish(ctx, model = ctx.model, ended = false) {
    if (!writer) return;
    try {
      await writer.publish({
        state, ended,
        model: model ? {provider: model.provider, id: model.id, contextWindow: model.contextWindow} : undefined,
        tools: pi.getActiveTools(), context: ctx.getContextUsage(), mode: ctx.mode,
        rateLimits: currentLimits,
      });
      reportedError = false;
    } catch { report(ctx); }
  }

  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('limits', {
      description: 'ChatGPT / Gemini Quotas setzen: /limits <5h-%> <Woche-%> [Reset-Zeit] oder /limits sync',
      handler: async (args, ctx) => {
        const parts = args.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) {
          const msg = currentLimits
            ? `Aktuelle Quotas: 5h ${currentLimits.fiveHour?.remainingPercent ?? '-'} %, Woche ${currentLimits.weekly?.remainingPercent ?? '-'} %`
            : 'Keine Quotas gesetzt. Verwendung: /limits <5h-Prozent> <Woche-Prozent> [Reset-Zeit] oder /limits sync';
          if (ctx.hasUI) ctx.ui.notify(msg, 'info');
          return;
        }
        if (parts[0] === 'sync') {
          if (ctx.hasUI) ctx.ui.notify('Browser-Quota-Sync wird gestartet …', 'info');
          if (typeof pi.exec !== 'function') {
            if (ctx.hasUI) ctx.ui.notify('pi.exec nicht verfügbar. Führe "npm run quota:sync" im Terminal aus.', 'warning');
            return;
          }
          try {
            const providerArg = ctx.model?.provider && /google|gemini/i.test(ctx.model.provider) ? 'google' : 'openai';
            const scriptPath = path.join(PROJECT_DIR, 'scripts/browser-quota-sync.mjs');
            const res = await pi.exec('node', [scriptPath, 'sync', providerArg, '--json'], { timeout: 35000 });
            if (res.code === 0 && res.stdout) {
              try {
                const parsed = JSON.parse(res.stdout);
                if (parsed.success && parsed.limits) {
                  currentLimits = parsed.limits;
                  await publish(ctx);
                  if (ctx.hasUI) ctx.ui.notify(`Quotas synchronisiert: 5h ${currentLimits.fiveHour?.remainingPercent ?? '-'} %, Woche ${currentLimits.weekly?.remainingPercent ?? '-'} %.`, 'info');
                  return;
                }
              } catch {}
            }
            if (res.stderr?.includes('LOGIN_REQUIRED') || res.stdout?.includes('LOGIN_REQUIRED')) {
              if (ctx.hasUI) ctx.ui.notify('Browser-Login erforderlich. Bitte im Terminal "npm run quota:login" ausführen.', 'warning');
            } else {
              if (ctx.hasUI) ctx.ui.notify(`Quota-Sync: ${res.stderr || res.stdout || 'Keine Antwort'}`, 'error');
            }
          } catch (err) {
            if (ctx.hasUI) ctx.ui.notify(`Quota-Sync Fehler: ${err.message}`, 'error');
          }
          return;
        }
        if (parts[0] === 'reset' || parts[0] === 'clear') {
          currentLimits = null;
          await publish(ctx);
          if (ctx.hasUI) ctx.ui.notify('Quotas zurückgesetzt.', 'info');
          return;
        }
        const p5h = Number(parts[0].replace('%', ''));
        const pWeekly = parts[1] && parts[1] !== '-' ? Number(parts[1].replace('%', '')) : null;
        const rawReset = parts.slice(pWeekly !== null ? 2 : 1).join(' ');
        const resetText = rawReset ? rawReset.replace(/^["']|["']$/g, '').trim() : null;
        if (!Number.isFinite(p5h) || p5h < 0 || p5h > 100 || (pWeekly !== null && (!Number.isFinite(pWeekly) || pWeekly < 0 || pWeekly > 100))) {
          if (ctx.hasUI) ctx.ui.notify('Ungültige Prozentwerte (0 bis 100). Beispiel: /limits 85 60', 'error');
          return;
        }
        currentLimits = {
          fiveHour: {remainingPercent: p5h, resetsAt: resetText},
          weekly: pWeekly !== null ? {remainingPercent: pWeekly, resetsAt: null} : null,
          detail: 'Quota-Vorgabe (via /limits in Pi)',
        };
        await publish(ctx);
        if (ctx.hasUI) ctx.ui.notify(`Quotas aktualisiert: 5h ${p5h} %, Woche ${pWeekly ?? '-'} %.`, 'info');
      },
    });
  }

  pi.on('session_start', async (_event, ctx) => {
    if (timer) clearInterval(timer);
    if (quotaTimer) clearInterval(quotaTimer);
    if (writer) { await writer.close().catch(() => {}); writer = null; }
    state = ctx.isIdle() ? 'idle' : 'working';
    priorPromptState = null;
    failed = false;
    reportedError = false;
    try { writer = await createWriter(); }
    catch { report(ctx); return; }
    await publish(ctx);
    timer = setInterval(() => { void publish(ctx); }, 3000);
    timer.unref?.();
    void triggerQuotaSync(ctx);
    if (syncIntervalMs > 0) {
      quotaTimer = setInterval(() => { void triggerQuotaSync(ctx, true); }, syncIntervalMs);
      quotaTimer.unref?.();
    }
  });

  pi.on('agent_start', async (_event, ctx) => {
    state = 'working'; failed = false;
    await publish(ctx);
  });
  pi.on('ui_prompt_start', async (_event, ctx) => {
    priorPromptState = state;
    state = 'waiting';
    await publish(ctx);
  });
  pi.on('ui_prompt_end', async (_event, ctx) => {
    state = ctx.isIdle() ? 'idle' : (priorPromptState ?? 'working');
    priorPromptState = null;
    await publish(ctx);
  });
  pi.on('model_select', async (event, ctx) => { await publish(ctx, event.model); });
  pi.on('message_end', async (event, ctx) => {
    if (event.message.role === 'assistant') await publish(ctx);
  });
  pi.on('after_provider_response', async (event, ctx) => {
    if (!event || !event.headers) return;
    const providerName = ctx?.model?.provider || 'API';
    const parsed = parseRateLimitHeaders(event.headers, providerName);
    if (parsed) {
      currentLimits = {
        fiveHour: parsed.fiveHour || currentLimits?.fiveHour || null,
        weekly: currentLimits?.weekly || null,
        detail: parsed.detail,
      };
      await publish(ctx);
    }
  });
  pi.on('agent_end', async (_event, ctx) => {
    void triggerQuotaSync(ctx);
  });
  pi.on('agent_before_settle', (event) => { failed = event.outcome === 'error'; });
  pi.on('agent_settled', async (_event, ctx) => {
    state = failed ? 'failed' : 'idle';
    priorPromptState = null;
    await publish(ctx);
    void triggerQuotaSync(ctx);
  });
  pi.on('session_shutdown', async (_event, ctx) => {
    if (timer) { clearInterval(timer); timer = null; }
    if (quotaTimer) { clearInterval(quotaTimer); quotaTimer = null; }
    if (!writer) return;
    state = 'idle';
    await publish(ctx, ctx.model, true);
    try { await writer.close(); } catch { report(ctx); }
    writer = null;
  });
}

export default function (pi) { createLiveExtension(pi); }
