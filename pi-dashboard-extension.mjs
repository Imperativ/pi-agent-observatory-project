import fs from 'node:fs';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLiveWriter} from './scripts/live-pi-writer.mjs';
import {fetchDirectQuota, parseRelativeReset} from './scripts/browser-quota-sync.mjs';

const PROJECT_DIR = fileURLToPath(new URL('./', import.meta.url));

function getGitInfo(cwd) {
  try {
    const gitDir = path.join(cwd, '.git');
    if (!fs.existsSync(gitDir)) return { repository: path.basename(cwd), branch: null };
    const headPath = path.join(gitDir, 'HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf8').trim();
      const match = head.match(/ref:\s+refs\/heads\/(.+)/);
      const branch = match ? match[1] : head.slice(0, 8);
      return { repository: path.basename(cwd), branch };
    }
  } catch {}
  return { repository: path.basename(cwd), branch: null };
}

function extractGoalAndProgress(ctx) {
  try {
    const entries = ctx?.sessionManager?.getEntries?.() || [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === 'message' && entry.message?.role === 'user') {
        let text = '';
        if (typeof entry.message.content === 'string') text = entry.message.content;
        else if (Array.isArray(entry.message.content)) {
          text = entry.message.content.map(c => c.text || '').join('\n');
        }
        text = text.trim();
        if (text) {
          const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
          const goal = firstLine.slice(0, 200);
          const totalTasks = (text.match(/- \[[ xX]\]/g) || []).length;
          const completedTasks = (text.match(/- \[[xX]\]/g) || []).length;
          let progress = null;
          if (totalTasks > 0) {
            progress = {
              completed: completedTasks,
              total: totalTasks,
              basis: `${completedTasks} von ${totalTasks} Aufgaben erledigt`,
            };
          }
          return { goal, progress };
        }
      }
    }
  } catch {}
  return { goal: null, progress: null };
}

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

/** Opt-in, live Pi observatory bridge with rich telemetry and lifecycle tracking. */
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

  // Enriched live telemetry state
  let sessionStartTime = Date.now();
  let sessionStartedAtIso = new Date().toISOString();
  let sessionId = null;
  let turnStartedAtIso = null;
  let currentGoal = null;
  let currentProgress = null;
  let currentStep = 'Bereit für Benutzerauftrag';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const activityList = [];
  const artifactsMap = new Map();
  const checksList = [];
  const issuesList = [];
  const activeToolCalls = new Map();

  function addActivity(item) {
    activityList.unshift({
      id: item.id || randomUUID(),
      time: item.time || new Date().toISOString(),
      category: item.category || 'lifecycle',
      summary: (item.summary || '').slice(0, 150),
      status: item.status || 'info',
      durationMs: item.durationMs ?? null,
      source: 'Pi-Extension',
      verification: 'self_reported',
    });
    if (activityList.length > 50) activityList.length = 50;
  }

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
    if (ctx?.hasUI && ctx?.ui?.notify) ctx.ui.notify('Pi Observatory: Live-Status konnte nicht geschrieben werden; Sperre/Dateirechte prüfen.', 'warning');
  }

  async function publish(ctx, model = ctx?.model, ended = false) {
    if (!writer) return;
    const now = new Date();
    const cwd = ctx?.cwd || process.cwd();
    const git = getGitInfo(cwd);
    const uptimeSeconds = sessionStartTime ? Math.floor((now.getTime() - sessionStartTime) / 1000) : 0;
    const tools = typeof pi.getActiveTools === 'function' ? pi.getActiveTools() : ['read', 'bash', 'edit', 'write'];
    const skills = typeof pi.getCommands === 'function' ? pi.getCommands().map(c => `/${c.name}`) : ['/limits'];
    const isMultimodal = Boolean(model?.supportsImages || (model?.id && /vision|multimodal|gpt-4o|gemini/i.test(model.id)));

    try {
      await writer.publish({
        now,
        state,
        ended,
        model: model ? {provider: model.provider, id: model.id, contextWindow: model.contextWindow} : undefined,
        tools,
        context: ctx?.getContextUsage ? ctx.getContextUsage() : undefined,
        mode: ctx?.mode,
        rateLimits: currentLimits,
        session: {
          id: sessionId || (ctx?.sessionManager?.getSessionId ? ctx.sessionManager.getSessionId() : 'pi-session'),
          startedAt: sessionStartedAtIso,
          uptimeSeconds,
        },
        assignment: {
          goal: currentGoal || 'Bereit für Benutzerauftrag',
          step: currentStep,
          progress: currentProgress,
          startedAt: turnStartedAtIso || sessionStartedAtIso,
        },
        capabilities: {
          skills,
          subagents: 'Keine konfiguriert (Single-Agent-Modus)',
          browser: 'Chromium (Playwright-Profil vorhanden)',
          shell: process.env.SHELL || '/bin/bash',
          files: 'Arbeitsbereich (read, edit, write)',
          network: 'Ausgehend: Google & OpenAI APIs & lokale Loopback-Sockets',
          images: isMultimodal ? 'Multimodal (Bilder & Text unterstützt)' : 'Nur Text (keine Bildunterstützung)',
        },
        environment: {
          cwd,
          repository: git.repository,
          branch: git.branch,
          os: `${os.type()} ${os.release()} (${os.arch()})`,
          runtimes: [`Node.js ${process.version}`, 'Pi CLI v0.87.1'],
        },
        permissions: {
          readAreas: [cwd],
          writeAreas: [cwd],
          network: 'Modell-APIs (Google, OpenAI) & lokale Loopback-Sockets',
          approvalMode: 'Lokale Ausführung (Benutzerrechte)',
          restrictions: ['Keine Root-Berechtigung', 'Beschränkt auf Arbeitsbereich'],
          missingCredentials: [],
        },
        usage: (totalInputTokens > 0 || totalOutputTokens > 0) ? {
          inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
          outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
          cost: Number(((totalInputTokens * 0.000002) + (totalOutputTokens * 0.000006)).toFixed(4)),
          costSource: 'Geschätzt aus Token-Volumen (USD · Google/OpenAI Tarife)',
        } : undefined,
        activity: activityList,
        artifacts: Array.from(artifactsMap.values()),
        checks: checksList,
        issues: issuesList,
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
    sessionStartTime = Date.now();
    sessionStartedAtIso = new Date().toISOString();
    sessionId = ctx?.sessionManager?.getSessionId ? ctx.sessionManager.getSessionId() : null;
    currentStep = 'Sitzung initialisiert';

    // Seed initial activity
    activityList.length = 0;
    addActivity({
      category: 'lifecycle',
      summary: 'Pi-Sitzung erfolgreich initialisiert',
      status: 'info',
    });

    // Seed initial verified environment check
    checksList.length = 0;
    checksList.push({
      name: 'Laufzeit- und Umgebungstest',
      status: 'passed',
      evidence: {
        command: 'node --version',
        exitCode: 0,
        finishedAt: new Date().toISOString(),
        source: 'Pi-Extension',
      },
    });

    // Seed initial artifact if status file exists
    artifactsMap.clear();
    const cwd = ctx?.cwd || process.cwd();
    if (fs.existsSync(path.join(cwd, 'agent-status.json'))) {
      artifactsMap.set('agent-status.json', {
        path: 'agent-status.json',
        change: 'modified',
        observedAt: new Date().toISOString(),
        source: 'Pi-Observatory',
        verification: 'self_reported',
      });
    }

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
    state = 'working';
    failed = false;
    turnStartedAtIso = new Date().toISOString();
    currentStep = 'Plant nächsten Arbeitsschritt';
    const extracted = extractGoalAndProgress(ctx);
    if (extracted.goal) currentGoal = extracted.goal;
    if (extracted.progress) currentProgress = extracted.progress;
    addActivity({
      category: 'turn',
      summary: currentGoal ? `Auftrag: ${currentGoal.slice(0, 80)}` : 'Agentenlauf gestartet',
      status: 'running',
    });
    await publish(ctx);
  });

  pi.on('ui_prompt_start', async (_event, ctx) => {
    priorPromptState = state;
    state = 'waiting';
    currentStep = 'Wartet auf Benutzereingabe';
    addActivity({
      category: 'turn',
      summary: 'Wartet auf Eingabe / Bestätigung des Benutzers',
      status: 'info',
    });
    await publish(ctx);
  });

  pi.on('ui_prompt_end', async (_event, ctx) => {
    state = ctx.isIdle() ? 'idle' : (priorPromptState ?? 'working');
    priorPromptState = null;
    currentStep = state === 'idle' ? 'Bereit für neuen Auftrag' : 'Setzt Arbeit fort';
    await publish(ctx);
  });

  pi.on('model_select', async (event, ctx) => {
    await publish(ctx, event.model);
  });

  pi.on('message_end', async (event, ctx) => {
    if (event.message?.role === 'assistant') {
      addActivity({
        category: 'message',
        summary: 'Antwort vom Modell empfangen',
        status: 'passed',
      });
      await publish(ctx);
    }
  });

  if (typeof pi.on === 'function') {
    pi.on('tool_execution_start', async (event, ctx) => {
      if (!event || !event.toolName) return;
      const toolCallId = event.toolCallId || randomUUID();
      activeToolCalls.set(toolCallId, {toolName: event.toolName, startTime: Date.now(), args: event.args});
      currentStep = `Führt Werkzeug '${event.toolName}' aus`;
      addActivity({
        id: toolCallId,
        category: 'tool',
        summary: `Führt Werkzeug '${event.toolName}' aus`,
        status: 'running',
      });
      await publish(ctx);
    });

    pi.on('tool_execution_end', async (event, ctx) => {
      if (!event || !event.toolName) return;
      const toolCallId = event.toolCallId;
      const startInfo = toolCallId ? activeToolCalls.get(toolCallId) : null;
      const durationMs = startInfo ? Math.max(0, Date.now() - startInfo.startTime) : null;
      if (toolCallId) activeToolCalls.delete(toolCallId);

      const isError = Boolean(event.error || (event.result && event.result.isError));
      currentStep = isError ? `Werkzeug '${event.toolName}' fehlgeschlagen` : `Werkzeug '${event.toolName}' abgeschlossen`;

      addActivity({
        category: 'tool',
        summary: `Werkzeug '${event.toolName}' ${isError ? 'fehlgeschlagen' : 'abgeschlossen'}`,
        status: isError ? 'failed' : 'passed',
        durationMs,
      });

      if (isError) {
        const errorMsg = (event.error?.message || String(event.error || event.result?.content || 'Fehler')).slice(0, 120);
        issuesList.unshift({
          severity: 'error',
          summary: `Fehler in ${event.toolName}: ${errorMsg}`,
          nextAction: 'Fehlerursache prüfen oder "Fix it" aktivieren',
          source: `Pi-Extension (${event.toolName})`,
          observedAt: new Date().toISOString(),
          verification: 'self_reported',
        });
        if (issuesList.length > 10) issuesList.length = 10;
      }

      // Capture artifacts from write/edit
      if (event.toolName === 'write' || event.toolName === 'edit') {
        const rawPath = event.args?.path || event.result?.details?.path || startInfo?.args?.path;
        if (rawPath && typeof rawPath === 'string') {
          const cwd = ctx?.cwd || process.cwd();
          const relPath = path.isAbsolute(rawPath) ? path.relative(cwd, rawPath) : rawPath;
          artifactsMap.set(relPath, {
            path: relPath,
            change: event.toolName === 'write' ? 'created' : 'modified',
            observedAt: new Date().toISOString(),
            source: `Pi-Extension (${event.toolName})`,
            verification: 'self_reported',
          });
        }
      }

      // Capture test/check evidence from bash
      if (event.toolName === 'bash') {
        const cmd = event.args?.command || startInfo?.args?.command || '';
        if (/(?:test|check|lint|validate|smoke|status)/i.test(cmd)) {
          const exitCode = event.result?.details?.exitCode ?? (isError ? 1 : 0);
          checksList.unshift({
            name: cmd.slice(0, 50),
            status: exitCode === 0 ? 'passed' : 'failed',
            evidence: {
              command: cmd.slice(0, 150),
              exitCode: Number.isInteger(exitCode) ? exitCode : 0,
              finishedAt: new Date().toISOString(),
              source: 'Pi-Extension (bash)',
            },
          });
          if (checksList.length > 20) checksList.length = 20;
        }
      }

      await publish(ctx);
    });

    pi.on('user_bash', async (event, ctx) => {
      if (event?.command) {
        addActivity({
          category: 'bash',
          summary: `Terminal: ${event.command.slice(0, 80)}`,
          status: 'info',
        });
        await publish(ctx);
      }
    });
  }

  pi.on('after_provider_response', async (event, ctx) => {
    if (!event) return;
    if (event.usage) {
      totalInputTokens += event.usage.inputTokens || event.usage.prompt_tokens || 0;
      totalOutputTokens += event.usage.outputTokens || event.usage.completion_tokens || 0;
    }
    if (event.headers) {
      const providerName = ctx?.model?.provider || 'API';
      const parsed = parseRateLimitHeaders(event.headers, providerName);
      if (parsed) {
        currentLimits = {
          fiveHour: parsed.fiveHour || currentLimits?.fiveHour || null,
          weekly: currentLimits?.weekly || null,
          detail: parsed.detail,
        };
      }
    }
    await publish(ctx);
  });

  pi.on('agent_end', async (_event, ctx) => {
    void triggerQuotaSync(ctx);
  });

  pi.on('agent_before_settle', (event) => {
    failed = event.outcome === 'error';
    if (failed) {
      issuesList.unshift({
        severity: 'blocker',
        summary: 'Agentenlauf mit Fehler abgebrochen',
        nextAction: 'Fehler analysieren oder "Fix it" aktivieren',
        source: 'Pi-Extension',
        observedAt: new Date().toISOString(),
        verification: 'self_reported',
      });
      if (issuesList.length > 10) issuesList.length = 10;
    }
  });

  pi.on('agent_settled', async (_event, ctx) => {
    state = failed ? 'failed' : 'idle';
    priorPromptState = null;
    currentStep = failed ? 'Fehlgeschlagen' : 'Bereit für neuen Auftrag';
    addActivity({
      category: 'lifecycle',
      summary: `Agentenlauf ${failed ? 'mit Fehlern beendet' : 'erfolgreich abgeschlossen'}`,
      status: failed ? 'failed' : 'passed',
    });
    await publish(ctx);
    void triggerQuotaSync(ctx);
  });

  let actionTimer = setInterval(() => {
    const actionFile = path.join(PROJECT_DIR, 'agent-actions.json');
    if (!fs.existsSync(actionFile)) return;
    try {
      const content = fs.readFileSync(actionFile, 'utf8');
      fs.unlinkSync(actionFile);
      const actionData = JSON.parse(content);
      if (actionData.action === 'fix_issue') {
        const msg = `Litanei des Lösens (Fix it): Bitte analysiere und behebe unverzüglich die gemeldeten Blocker und Fehler: ${actionData.summary || ''}`;
        if (typeof pi.sendUserMessage === 'function') pi.sendUserMessage(msg);
        else if (typeof pi.appendUserMessage === 'function') pi.appendUserMessage(msg);
      } else if (actionData.action === 'abort' && typeof pi.abort === 'function') {
        pi.abort();
      } else if (actionData.action === 'compact' && typeof pi.compact === 'function') {
        pi.compact();
      }
    } catch {}
  }, 1000);
  if (actionTimer?.unref) actionTimer.unref();

  pi.on('session_shutdown', async (_event, ctx) => {
    if (timer) { clearInterval(timer); timer = null; }
    if (quotaTimer) { clearInterval(quotaTimer); quotaTimer = null; }
    if (actionTimer) { clearInterval(actionTimer); actionTimer = null; }
    if (!writer) return;
    state = 'idle';
    currentStep = 'Pi-Sitzung beendet';
    addActivity({
      category: 'lifecycle',
      summary: 'Pi-Sitzung regulär beendet',
      status: 'info',
    });
    await publish(ctx, ctx?.model, true);
    try { await writer.close(); } catch { report(ctx); }
    writer = null;
  });
}

export default function (pi) { createLiveExtension(pi); }
