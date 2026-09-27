import {open, lstat, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseStatus} from '../src/contract.mjs';

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
  if (/mistral|codestral|devstral|ministral/i.test(id)) return 'Mistral (Modellfamilie)';
  if (/deepseek/i.test(id)) return 'DeepSeek (Modellfamilie)';
  if (/qwen/i.test(id)) return 'Qwen (Modellfamilie)';
  if (/gemma/i.test(id)) return 'Gemma (Modellfamilie)';
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

function cleanSafeText(val, maxLen = 500) {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

/** Construct from a strict allowlist; never accept raw credentials or unbounded payloads. */
export function createLiveSnapshot({
  now = new Date(),
  state = 'idle',
  ended = false,
  model,
  tools,
  context,
  mode,
  rateLimits,
  session,
  assignment,
  capabilities,
  environment,
  permissions,
  usage,
  activity,
  artifacts,
  checks,
  issues,
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Ungültige Lebenszeichenzeit.');
  if (!['idle', 'working', 'waiting', 'failed'].includes(state) || typeof ended !== 'boolean') throw new Error('Ungültiger Pi-Lifecycle-Zustand.');
  const observedAt = now.toISOString();
  const snapshot = {
    schemaVersion: '1.0', dataset: 'live', observedAt,
    live: {source: 'pi_extension', ended},
    identity: {name: metric('Pi-Agent (Live)', SOURCE, observedAt)},
    assignment: {state: metric(ended ? 'idle' : state, SOURCE, observedAt)},
  };
  if (model && typeof model.provider === 'string') {
    const pKey = model.provider.toLowerCase();
    const providerName = Object.hasOwn(PROVIDERS, pKey) ? PROVIDERS[pKey]
      : (Object.hasOwn(PROVIDERS, model.provider) ? PROVIDERS[model.provider] : 'Anderer Anbieter');
    snapshot.identity.provider = metric(providerName, 'Pi · ausgewähltes Modell', observedAt);
  }
  const family = modelFamily(model?.id);
  if (family) {
    snapshot.identity.model = metric(family, 'Pi · erkannte Modellfamilie (keine exakte Modell-ID)', observedAt);
  }
  const exactModel = cleanModelId(model?.id);
  if (exactModel) {
    snapshot.identity.modelVersion = metric(exactModel, 'Pi · gemeldete Modell-ID', observedAt);
  }

  // Session metadata in identity
  if (session) {
    if (typeof session.id === 'string' && session.id.trim()) {
      const cleanId = cleanModelId(session.id) || session.id.slice(0, 80);
      snapshot.identity.sessionId = metric(cleanId, 'Pi · aktive Sitzung', observedAt);
    }
    if (session.startedAt && typeof session.startedAt === 'string') {
      snapshot.identity.startedAt = metric(session.startedAt, 'Pi · Sitzungsstart', observedAt);
    }
    if (Number.isFinite(session.uptimeSeconds) && session.uptimeSeconds >= 0) {
      snapshot.identity.uptimeSeconds = metric(Math.floor(session.uptimeSeconds), 'Pi · Sitzungsdauer', observedAt);
    }
  }

  // Assignment details
  if (assignment) {
    if (typeof assignment.goal === 'string' && assignment.goal.trim()) {
      snapshot.assignment.goal = metric(assignment.goal.trim().slice(0, 300), 'Pi · aktueller Auftrag', observedAt);
    }
    if (typeof assignment.step === 'string' && assignment.step.trim()) {
      snapshot.assignment.step = metric(assignment.step.trim().slice(0, 200), 'Pi · aktueller Arbeitsschritt', observedAt);
    }
    if (assignment.progress && typeof assignment.progress === 'object') {
      const {completed, total, basis} = assignment.progress;
      if (Number.isFinite(completed) && Number.isFinite(total) && total > 0 && completed >= 0 && completed <= total && basis) {
        snapshot.assignment.progress = metric({completed, total, basis: String(basis).slice(0, 100)}, 'Pi · Fortschritt', observedAt);
      }
    }
    if (typeof assignment.startedAt === 'string' && assignment.startedAt.trim()) {
      snapshot.assignment.startedAt = metric(assignment.startedAt.trim(), 'Pi · Auftragsbeginn', observedAt);
    }
  }

  // Capabilities
  if (!snapshot.capabilities) snapshot.capabilities = {};
  if (Array.isArray(tools)) {
    snapshot.capabilities.tools = metric([...new Set(tools.filter(name => TOOLS.has(name)))], 'Pi · bekannte aktivierte Werkzeuge (kein vollständiges Inventar)', observedAt);
  }
  if (capabilities) {
    if (Array.isArray(capabilities.skills)) {
      const cleanSkills = capabilities.skills.filter(s => typeof s === 'string' && /^[a-zA-Z0-9_./:-]{1,60}$/.test(s));
      snapshot.capabilities.skills = metric(cleanSkills, 'Pi · registrierte Befehle & Skills', observedAt);
    }
    if (typeof capabilities.subagents === 'string') {
      snapshot.capabilities.subagents = metric(cleanSafeText(capabilities.subagents, 120), 'Pi · Subagenten-Konfiguration', observedAt);
    }
    if (typeof capabilities.browser === 'string') {
      snapshot.capabilities.browser = metric(cleanSafeText(capabilities.browser, 120), 'System · Browser-Verfügbarkeit', observedAt);
    }
    if (typeof capabilities.shell === 'string') {
      snapshot.capabilities.shell = metric(cleanSafeText(capabilities.shell, 120), 'System · Shell-Umgebung', observedAt);
    }
    if (typeof capabilities.files === 'string') {
      snapshot.capabilities.files = metric(cleanSafeText(capabilities.files, 120), 'Pi · Dateisystem-Zugriff', observedAt);
    }
    if (typeof capabilities.network === 'string') {
      snapshot.capabilities.network = metric(cleanSafeText(capabilities.network, 120), 'Pi · Netzwerk-Richtlinie', observedAt);
    }
    if (typeof capabilities.images === 'string') {
      snapshot.capabilities.images = metric(cleanSafeText(capabilities.images, 120), 'Pi · Bild- und Multimodal-Fähigkeit', observedAt);
    }
  }

  // Usage
  const window = context?.contextWindow ?? model?.contextWindow;
  if (Number.isFinite(window) && window > 0) {
    if (!snapshot.usage) snapshot.usage = {};
    snapshot.usage.contextWindow = metric(window, 'Pi · aktives Kontextfenster', observedAt);
    if (Number.isFinite(context?.tokens) && context.tokens >= 0) {
      snapshot.usage.contextUsed = metric(context.tokens, 'Pi · Kontextbelegung (Schätzung, aktive Sitzung)', observedAt, 'unverified');
    }
  }
  if (usage) {
    if (Number.isFinite(usage.inputTokens) && usage.inputTokens >= 0) {
      if (!snapshot.usage) snapshot.usage = {};
      snapshot.usage.inputTokens = metric(Math.round(usage.inputTokens), 'Pi · Sitzungsverbrauch (Eingabe-Tokens)', observedAt);
    }
    if (Number.isFinite(usage.outputTokens) && usage.outputTokens >= 0) {
      if (!snapshot.usage) snapshot.usage = {};
      snapshot.usage.outputTokens = metric(Math.round(usage.outputTokens), 'Pi · Sitzungsverbrauch (Ausgabe-Tokens)', observedAt);
    }
    if (Number.isFinite(usage.cost) && usage.cost >= 0) {
      if (!snapshot.usage) snapshot.usage = {};
      const costSource = usage.costSource || 'Berechnet aus Tokenverbrauch (USD)';
      snapshot.usage.cost = metric(Number(usage.cost.toFixed(4)), costSource, observedAt);
    }
  }
  if (rateLimits) {
    if (!snapshot.usage) snapshot.usage = {};
    snapshot.usage.rateLimits = metric(rateLimits, 'ChatGPT / Provider Quotas', observedAt);
  }
  if (snapshot.usage && Object.keys(snapshot.usage).length === 0) {
    delete snapshot.usage;
  }

  // Environment
  if (!snapshot.environment) snapshot.environment = {};
  if (['tui', 'rpc', 'json', 'print'].includes(mode)) {
    snapshot.environment.executionMode = metric(`Pi ${mode}`, 'Pi · Laufmodus', observedAt);
  }
  if (environment) {
    if (typeof environment.cwd === 'string' && environment.cwd.trim()) {
      snapshot.environment.cwd = metric(environment.cwd.trim().slice(0, 300), 'Pi · Arbeitsverzeichnis', observedAt);
    }
    if (typeof environment.repository === 'string' && environment.repository.trim()) {
      snapshot.environment.repository = metric(environment.repository.trim().slice(0, 150), 'Git · Repository', observedAt);
    }
    if (typeof environment.branch === 'string' && environment.branch.trim()) {
      snapshot.environment.branch = metric(environment.branch.trim().slice(0, 100), 'Git · Aktiver Branch', observedAt);
    }
    if (typeof environment.os === 'string' && environment.os.trim()) {
      snapshot.environment.os = metric(environment.os.trim().slice(0, 150), 'Betriebssystem · Plattform', observedAt);
    }
    if (Array.isArray(environment.runtimes)) {
      const cleanRuntimes = environment.runtimes.filter(r => typeof r === 'string' && r.trim()).map(r => r.trim().slice(0, 80));
      snapshot.environment.runtimes = metric(cleanRuntimes, 'System · Laufzeitumgebungen', observedAt);
    }
  }

  // Permissions
  if (permissions) {
    snapshot.permissions = {};
    if (Array.isArray(permissions.readAreas)) {
      snapshot.permissions.readAreas = metric(permissions.readAreas.filter(p => typeof p === 'string').map(p => p.slice(0, 200)), 'Pi · Lesebereiche', observedAt);
    }
    if (Array.isArray(permissions.writeAreas)) {
      snapshot.permissions.writeAreas = metric(permissions.writeAreas.filter(p => typeof p === 'string').map(p => p.slice(0, 200)), 'Pi · Schreibbereiche', observedAt);
    }
    if (typeof permissions.network === 'string') {
      snapshot.permissions.network = metric(cleanSafeText(permissions.network, 150), 'Pi · Netzwerk-Richtlinie', observedAt);
    }
    if (typeof permissions.approvalMode === 'string') {
      snapshot.permissions.approvalMode = metric(cleanSafeText(permissions.approvalMode, 150), 'Pi · Freigabe- und Ausführungsmodus', observedAt);
    }
    if (Array.isArray(permissions.restrictions)) {
      snapshot.permissions.restrictions = metric(permissions.restrictions.filter(r => typeof r === 'string').map(r => r.slice(0, 150)), 'Pi · Sicherheitsbeschränkungen', observedAt);
    }
    if (Array.isArray(permissions.missingCredentials)) {
      snapshot.permissions.missingCredentials = metric(permissions.missingCredentials.filter(c => typeof c === 'string').map(c => c.slice(0, 100)), 'Pi · Zugangsdaten-Prüfung', observedAt);
    }
  }

  // Collections (activity, artifacts, checks, issues)
  // Ensure array presence to indicate explicit availability
  if (Array.isArray(activity)) {
    snapshot.activity = activity.slice(0, 100);
  }
  if (Array.isArray(artifacts)) {
    snapshot.artifacts = artifacts.slice(0, 100);
  }
  if (Array.isArray(checks)) {
    snapshot.checks = checks.slice(0, 100);
  }
  if (Array.isArray(issues)) {
    snapshot.issues = issues.slice(0, 100);
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
