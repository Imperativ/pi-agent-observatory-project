import {open, lstat, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {release, type} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseStatus, timestampMs} from '../src/contract.mjs';

const PROJECT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = 'Pi-Extension · beobachteter Lifecycle';
const PROVIDERS = Object.freeze({
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  google: 'Google',
  'google-antigravity': 'Google Antigravity',
  xai: 'xAI',
  mistral: 'Mistral',
  openrouter: 'OpenRouter',
  'github-copilot': 'GitHub Copilot',
});
const TOOLS = new Set(['read', 'bash', 'edit', 'write', 'powershell', 'grep', 'find', 'ls']);
function modelFamily(id) {
  if (typeof id !== 'string') return null;
  if (/claude/i.test(id)) return 'Claude (Modellfamilie)';
  if (/gpt/i.test(id)) return 'GPT (Modellfamilie)';
  if (/gemini/i.test(id)) return 'Gemini (Modellfamilie)';
  if (/\b(?:o1|o3|o4)\b/i.test(id) || /^o[1-9]/i.test(id)) return 'OpenAI o-Serie (Modellfamilie)';
  if (/llama/i.test(id)) return 'Llama (Modellfamilie)';
  return null;
}
function cleanModelId(id) {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (/^[a-zA-Z0-9_.:/-]{1,100}$/.test(trimmed) && !/bearer|secret|token|password|private|sk-/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}
const metric = (value, source, observedAt, verification = 'self_reported') => ({value, source, observedAt, verification});

/** Construct from a strict allowlist; never accept prompts, paths, tool arguments or credentials. */
export function createLiveSnapshot({now = new Date(), state = 'idle', ended = false, model, tools, context, mode, rateLimits, startedAt, assignmentStartedAt, sessionTokens, activity, workspace} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Ungültige Lebenszeichenzeit.');
  if (!['idle', 'working', 'waiting', 'failed'].includes(state) || typeof ended !== 'boolean') throw new Error('Ungültiger Pi-Lifecycle-Zustand.');
  const observedAt = now.toISOString();
  const snapshot = {
    schemaVersion: '1.0', dataset: 'live', observedAt,
    live: {source: 'pi_extension', ended},
    identity: {name: metric('Pi-Agent (Live)', SOURCE, observedAt)},
    assignment: {state: metric(ended ? 'idle' : state, SOURCE, observedAt)},
  };
  if (timestampMs(startedAt) !== null) snapshot.identity.startedAt = metric(startedAt, 'Pi · Sitzungsbeginn (ohne Sitzungs-ID)', observedAt);
  if (timestampMs(assignmentStartedAt) !== null) snapshot.assignment.startedAt = metric(assignmentStartedAt, 'Pi · Beginn des letzten Agentenlaufs', observedAt);
  if (Array.isArray(activity)) snapshot.activity = activity.slice(-20).flatMap((event, index) => {
    const allowed = {
      'Pi-Sitzung gestartet': ['info'], 'Agentenlauf gestartet': ['running'],
      'Pi wartet auf Eingabe': ['info'], 'Agentenlauf beendet': ['info'],
      'Agentenlauf fehlgeschlagen': ['failed'], 'Pi-Sitzung beendet': ['info'],
    };
    return timestampMs(event?.time) !== null && allowed[event.summary]?.includes(event.status)
      ? [{id: `pi-lifecycle-${index}`, time: event.time, category: 'Pi-Lifecycle', summary: event.summary,
          status: event.status, source: SOURCE, verification: 'self_reported'}] : [];
  });
  if (model && typeof model.provider === 'string') {
    snapshot.identity.provider = metric(Object.hasOwn(PROVIDERS, model.provider) ? PROVIDERS[model.provider] : 'Anderer Anbieter', 'Pi · ausgewähltes Modell', observedAt);
  }
  const family = modelFamily(model?.id);
  if (family) {
    snapshot.identity.model = metric(family, 'Pi · erkannte Modellfamilie (keine exakte Modell-ID)', observedAt);
  }
  const exactModel = cleanModelId(model?.id);
  if (exactModel) {
    snapshot.identity.modelVersion = metric(exactModel, 'Pi · gemeldete Modell-ID', observedAt);
  }
  if (Array.isArray(tools)) {
    const active = [...new Set(tools.filter(name => TOOLS.has(name)))];
    snapshot.capabilities = {tools: metric(active, 'Pi · bekannte aktivierte Werkzeuge (kein vollständiges Inventar)', observedAt)};
    if (active.includes('bash') || active.includes('powershell')) snapshot.capabilities.shell = metric('Pi-Shell-Werkzeug aktiv (keine Aussage über Freigaben)', SOURCE, observedAt);
    if (active.some(name => ['read', 'edit', 'write'].includes(name))) snapshot.capabilities.files = metric('Pi-Dateiwerkzeug aktiv (keine Aussage über Freigaben)', SOURCE, observedAt);
  }
  const window = context?.contextWindow ?? model?.contextWindow;
  if (Number.isFinite(window) && window > 0) {
    snapshot.usage = {contextWindow: metric(window, 'Pi · aktives Kontextfenster', observedAt)};
    if (Number.isFinite(context?.tokens) && context.tokens >= 0) {
      snapshot.usage.contextUsed = metric(context.tokens, 'Pi · Kontextbelegung (Schätzung, aktive Sitzung)', observedAt, 'unverified');
    }
  }
  if (sessionTokens && Number.isSafeInteger(sessionTokens.input) && sessionTokens.input >= 0 && Number.isSafeInteger(sessionTokens.output) && sessionTokens.output >= 0) {
    snapshot.usage ??= {};
    snapshot.usage.inputTokens = metric(sessionTokens.input, 'Pi · Eingabe-Tokens im aktiven Sitzungszweig (inkl. gemeldeter Usage-Einträge; keine Kontoquote)', observedAt);
    snapshot.usage.outputTokens = metric(sessionTokens.output, 'Pi · Ausgabe-Tokens im aktiven Sitzungszweig (inkl. gemeldeter Usage-Einträge; keine Kontoquote)', observedAt);
  }
  snapshot.environment = {};
  if (['tui', 'rpc', 'json', 'print'].includes(mode)) snapshot.environment.executionMode = metric(`Pi ${mode}`, 'Pi · Laufmodus', observedAt);
  if (type() === 'Windows_NT') {
    const build = Number(release().split('.')[2]);
    snapshot.environment.os = metric(Number.isInteger(build) && build >= 22000 ? 'Windows 11' : 'Windows (Version nicht eindeutig)', 'Node.js · OS-Build', observedAt);
  }
  snapshot.environment.runtimes = metric([`Node.js ${process.versions.node}`], 'Pi-Prozess · Node.js-Laufzeit', observedAt);
  if (workspace && typeof workspace.cwd === 'string' && path.isAbsolute(workspace.cwd)) {
    snapshot.environment.cwd = metric(workspace.cwd, 'Pi · freigegebenes Arbeitsverzeichnis', observedAt);
    if (typeof workspace.repository === 'string' && path.isAbsolute(workspace.repository))
      snapshot.environment.repository = metric(workspace.repository, 'Git · freigegebene lokale Repository-Wurzel (keine Remote-URL)', observedAt);
    if (typeof workspace.branch === 'string' && workspace.branch.length <= 200)
      snapshot.environment.branch = metric(workspace.branch, 'Git · freigegebener Branchname', observedAt);
  }
  if (rateLimits?.value && timestampMs(rateLimits.observedAt) !== null) {
    snapshot.usage ??= {};
    snapshot.usage.rateLimits = metric(rateLimits.value, rateLimits.source, rateLimits.observedAt);
  }
  parseStatus(JSON.stringify(snapshot));
  return snapshot;
}

/** One exclusive writer owns agent-status.lock for its entire Pi session. */
export async function createLiveWriter(outputDir = PROJECT) {
  const target = path.join(outputDir, 'agent-status.json');
  const lockPath = path.join(outputDir, 'agent-status.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new Error('Live-Exporter konnte die exklusive Statussperre nicht erhalten.'); }
  let closed = false;
  let chain = Promise.resolve();
  return {
    publish(input) {
      if (closed) return Promise.reject(new Error('Live-Exporter wurde beendet.'));
      const job = chain.then(async () => {
        const old = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (old && !old.isFile()) throw new Error('Statusziel ist keine reguläre Datei.');
        const content = JSON.stringify(createLiveSnapshot(input), null, 2) + '\n';
        const temporary = path.join(outputDir, `agent-status.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, content, {flag: 'wx', mode: 0o600});
          if ((await readFile(temporary, 'utf8')) !== content) throw new Error('Temporärer Status weicht ab.');
          parseStatus(content);
          await rename(temporary, target);
        } finally {
          await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
      });
      chain = job.catch(() => {});
      return job;
    },
    async close() {
      if (closed) return;
      closed = true;
      await chain;
      try { await lock.close(); }
      finally { await unlink(lockPath); }
    },
  };
}
