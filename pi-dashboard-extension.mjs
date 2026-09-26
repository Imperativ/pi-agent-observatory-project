import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createLiveWriter} from './scripts/live-pi-writer.mjs';
import {timestampMs} from './src/contract.mjs';

const run = promisify(execFile);

// Workspace disclosure is opt-in because the unauthenticated LAN view can reveal these values.
export async function workspaceFacts(cwd, git = run) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null;
  const facts = {cwd};
  try {
    const options = {timeout: 1500, maxBuffer: 4096, windowsHide: true};
    const root = (await git('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], options)).stdout.trim();
    if (root && path.isAbsolute(root)) facts.repository = root;
    const branch = (await git('git', ['-C', cwd, 'symbolic-ref', '--quiet', '--short', 'HEAD'], options)).stdout.trim();
    if (branch && branch.length <= 200) facts.branch = branch;
  } catch { /* Not a repository or git is unavailable: leave fields unknown. */ }
  return facts;
}

// Only numeric usage crosses the bridge; never serialize messages or session identifiers.
export function sessionUsage(sessionManager) {
  if (typeof sessionManager?.getBranch !== 'function') return null;
  let entries;
  try { entries = sessionManager.getBranch(); } catch { return null; }
  if (!Array.isArray(entries)) return null;
  let input = 0, output = 0, count = 0;
  for (const entry of entries) {
    const usage = entry?.type === 'usage' ? entry.usage : entry?.type === 'message' && entry.message?.role === 'assistant' ? entry.message.usage : null;
    if (!usage || !Number.isSafeInteger(usage.input) || usage.input < 0 || !Number.isSafeInteger(usage.output) || usage.output < 0) continue;
    input += usage.input;
    output += usage.output;
    count++;
  }
  return count && Number.isSafeInteger(input) && Number.isSafeInteger(output) ? {input, output} : null;
}

const PROJECT_DIR = fileURLToPath(new URL('./', import.meta.url));

/** Opt-in, read-only Pi lifecycle bridge. Load explicitly with `pi --extension <this file>`. */
export function createLiveExtension(pi, createWriter = createLiveWriter) {
  let writer = null;
  let timer = null;
  let state = 'idle';
  let priorPromptState = null;
  let failed = false;
  let reportedError = false;
  let currentLimits = null;
  let startedAt = null;
  let assignmentStartedAt = null;
  let activity = [];
  let workspace = null;

  function record(summary, status) {
    const time = new Date().toISOString();
    activity = [...activity.slice(-19), {time, category: 'Pi-Lifecycle', summary, status}];
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
        startedAt, assignmentStartedAt, activity, workspace, sessionTokens: sessionUsage(ctx.sessionManager),
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
          const val = currentLimits?.value ?? currentLimits;
          const msg = val
            ? `Aktuelle Quotas: 5h ${val.fiveHour?.remainingPercent ?? '-'} %, Woche ${val.weekly?.remainingPercent ?? '-'} %`
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
                  currentLimits = {
                    value: parsed.limits,
                    source: `Browser-Sync (${providerArg === 'google' ? 'Google' : 'ChatGPT'})`,
                    observedAt: new Date().toISOString(),
                  };
                  await publish(ctx);
                  if (ctx.hasUI) ctx.ui.notify(`Quotas synchronisiert: 5h ${parsed.limits.fiveHour?.remainingPercent ?? '-'} %, Woche ${parsed.limits.weekly?.remainingPercent ?? '-'} %.`, 'info');
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
          value: {
            fiveHour: {remainingPercent: p5h, resetsAt: resetText},
            weekly: pWeekly !== null ? {remainingPercent: pWeekly, resetsAt: null} : null,
            detail: 'Quota-Vorgabe (manuell via /limits in Pi)',
          },
          source: 'ChatGPT Web (manuelle Eingabe in Pi)',
          observedAt: new Date().toISOString(),
        };
        await publish(ctx);
        if (ctx.hasUI) ctx.ui.notify(`Quotas aktualisiert: 5h ${p5h} %, Woche ${pWeekly ?? '-'} %.`, 'info');
      },
    });
  }

  pi.on('session_start', async (_event, ctx) => {
    if (timer) clearInterval(timer);
    if (writer) { await writer.close().catch(() => {}); writer = null; }
    state = ctx.isIdle() ? 'idle' : 'working';
    priorPromptState = null;
    failed = false;
    reportedError = false;
    const headerTime = ctx.sessionManager?.getHeader?.()?.timestamp;
    startedAt = timestampMs(headerTime) !== null ? headerTime : null;
    assignmentStartedAt = null;
    activity = [];
    workspace = process.env.PI_DASHBOARD_INCLUDE_WORKSPACE === '1' ? await workspaceFacts(ctx.cwd) : null;
    record('Pi-Sitzung gestartet', 'info');
    try { writer = await createWriter(); }
    catch { report(ctx); return; }
    await publish(ctx);
    timer = setInterval(() => { void publish(ctx); }, 3000);
    timer.unref?.();
  });

  pi.on('agent_start', async (_event, ctx) => {
    state = 'working'; failed = false;
    assignmentStartedAt = new Date().toISOString();
    record('Agentenlauf gestartet', 'running');
    await publish(ctx);
  });
  pi.on('ui_prompt_start', async (_event, ctx) => {
    priorPromptState = state;
    state = 'waiting';
    record('Pi wartet auf Eingabe', 'info');
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
  pi.on('agent_before_settle', (event) => { failed = event.outcome === 'error'; });
  pi.on('agent_settled', async (_event, ctx) => {
    state = failed ? 'failed' : 'idle';
    priorPromptState = null;
    record(failed ? 'Agentenlauf fehlgeschlagen' : 'Agentenlauf beendet', failed ? 'failed' : 'info');
    await publish(ctx);
  });
  pi.on('session_shutdown', async (_event, ctx) => {
    if (timer) { clearInterval(timer); timer = null; }
    if (!writer) return;
    state = 'idle';
    record('Pi-Sitzung beendet', 'info');
    await publish(ctx, ctx.model, true);
    try { await writer.close(); } catch { report(ctx); }
    writer = null;
  });
}

export default function (pi) { createLiveExtension(pi); }
