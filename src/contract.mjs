export const SCHEMA_VERSION = '1.0';
export const STATES = Object.freeze(['idle', 'working', 'waiting', 'blocked', 'failed', 'completed']);
export const CHECK_STATES = Object.freeze(['not_run', 'running', 'passed', 'failed', 'unknown']);
export const FIELD_LABELS = Object.freeze({
  identity: {name: 'Agent', provider: 'Anbieter / Produkt', model: 'Gemeldetes Modell', modelVersion: 'Version / Alias', sessionId: 'Sitzung', startedAt: 'Gestartet', uptimeSeconds: 'Gemeldete Laufzeit (s)'},
  assignment: {goal: 'Ziel', step: 'Aktueller Schritt', state: 'Status', progress: 'Fortschritt', startedAt: 'Auftragsbeginn'},
  capabilities: {tools: 'Werkzeuge', skills: 'Skills / Plugins', subagents: 'Subagenten', browser: 'Browser', shell: 'Shell', files: 'Dateien', network: 'Netzwerk', images: 'Bilder'},
  environment: {cwd: 'Arbeitsverzeichnis', repository: 'Repository', branch: 'Branch', os: 'Betriebssystem', runtimes: 'Laufzeitumgebungen', executionMode: 'Ausführungsmodus'},
  permissions: {readAreas: 'Lesebereiche', writeAreas: 'Schreibbereiche', network: 'Netzwerkregeln', approvalMode: 'Freigaben / Sandbox', restrictions: 'Einschränkungen', missingCredentials: 'Fehlende Zugangsdaten (nur Namen)'},
  usage: {contextWindow: 'Kontextfenster', contextUsed: 'Belegter Kontext', inputTokens: 'Eingabe-Tokens', outputTokens: 'Ausgabe-Tokens', cost: 'Kosten (Einheit siehe Quelle)', rateLimits: 'Rate-Limits'},
});
const MAX_ITEMS = 100;
const MAX_TEXT = 2000;
const MAX_BYTES = 256 * 1024;
const VERIFICATIONS = ['verified', 'self_reported', 'unverified', 'unavailable'];
const LIST_FIELDS = new Set(['tools', 'skills', 'readAreas', 'writeAreas', 'restrictions', 'missingCredentials', 'runtimes']);
const NUMBER_FIELDS = new Set(['uptimeSeconds', 'contextWindow', 'contextUsed', 'inputTokens', 'outputTokens', 'cost']);
const SECRET_KEY = /^(?:.*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|password|passwd|secret|cookie|authorization|private[_-]?key|client[_-]?secret).*|token|tokens|credentials|env|environmentVariables)$/i;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function cleanText(text) {
  return text
    .replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED JWT]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:--)?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie|token)(?:\s*[=:]\s*|\s+))(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&,;]+)/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@');
}

/** A bounded allowlist renderer is still required; redaction is defense in depth. */
export function redact(value, depth = 0) {
  if (depth > 20) return '[REDACTED: depth limit]';
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (!isObject(value)) return value;
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    result[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1);
  }
  return result;
}

/** ISO date-time, explicit timezone, and real calendar date (not Date.parse rollover). */
export function timestampMs(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, month, day, hour, minute, second, zone] = m;
  const year = Number(y), mo = Number(month), d = Number(day);
  const days = mo >= 1 && mo <= 12 ? new Date(Date.UTC(year, mo, 0)).getUTCDate() : 0;
  if (d < 1 || d > days || +hour > 23 || +minute > 59 || +second > 59) return null;
  if (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}

export function freshness(observedAt, nowMs = Date.now(), {staleAfterMs = 120000, clockSkewMs = 5000} = {}) {
  const time = timestampMs(observedAt);
  if (time === null) return {state: 'unknown', ageMs: null, reason: 'Quellzeit fehlt oder ist ungültig.'};
  if (!Number.isFinite(nowMs)) return {state: 'unknown', ageMs: null, reason: 'Lokale Uhr ist ungültig.'};
  if (time - nowMs > clockSkewMs) return {state: 'unknown', ageMs: null, reason: 'Quellzeit liegt außerhalb der erlaubten Uhrabweichung in der Zukunft.'};
  const ageMs = Math.max(0, nowMs - time);
  return {state: ageMs > staleAfterMs ? 'stale' : 'fresh', ageMs, reason: ageMs > staleAfterMs ? 'Snapshot ist veraltet; ein erneuter Abruf verjüngt ihn nicht.' : 'Alter aus observedAt der Statusquelle.'};
}

export function uptime(identity, nowMs = Date.now(), {clockSkewMs = 5000} = {}) {
  const explicit = identity?.uptimeSeconds;
  if (typeof explicit?.value === 'number' && Number.isFinite(explicit.value) && explicit.value >= 0) {
    return {seconds: explicit.value, source: `Vom Agenten gemeldet: ${explicit.source || 'Quelle unbekannt'}`, verification: explicit.verification || 'unverified'};
  }
  const start = identity?.startedAt;
  const time = timestampMs(start?.value);
  if (time === null || !Number.isFinite(nowMs) || time - nowMs > clockSkewMs) return {seconds: null, source: 'Kein gültiger Agentenstart bekannt.', verification: 'unavailable'};
  return {seconds: Math.floor(Math.max(0, nowMs - time) / 1000), source: `Berechnet aus Startzeit (${start.source || 'Quelle unbekannt'}) und lokaler Uhr.`, verification: start.verification || 'unverified'};
}

export function parseStatus(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Statusquelle fehlt oder überschreitet 256 KiB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Ungültiges JSON. Statusdatei prüfen und vollständig/atomar schreiben.'); }
  return normalizeStatus(data);
}

export function normalizeStatus(input) {
  if (!isObject(input)) throw new Error('Status muss ein JSON-Objekt sein.');
  if (input.schemaVersion !== SCHEMA_VERSION) throw new Error('Nicht unterstützte schemaVersion; erwartet wird "1.0".');
  const data = redact(input);
  const warnings = [];
  const warn = message => { if (!warnings.includes(message) && warnings.length < 100) warnings.push(message); };
  const text = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    if (value.length > MAX_TEXT) warn('Lange Texte wurden auf 2000 Zeichen begrenzt.');
    return value.slice(0, MAX_TEXT);
  };
  const items = (value, path) => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Error(`${path} muss eine Liste sein.`);
    if (value.length > MAX_ITEMS) warn(`${path}: nur die ersten 100 Einträge werden angezeigt.`);
    return value.slice(0, MAX_ITEMS);
  };
  const provenance = (m, observedKey = 'observedAt') => {
    const source = text(m?.source);
    const observedAt = timestampMs(m?.[observedKey]) === null ? null : m[observedKey];
    let verification = VERIFICATIONS.includes(m?.verification) ? m.verification : 'unverified';
    if (['verified', 'self_reported'].includes(verification) && (!source || !observedAt)) {
      verification = 'unverified';
      warn('Ein Herkunftsnachweis ist unvollständig; Verifikation wurde auf ungeprüft gesetzt.');
    }
    return {source, observedAt, verification};
  };
  const measurement = (raw, field) => {
    const m = isObject(raw) ? raw : {};
    let value = null;
    if (m.value != null && m.verification !== 'unavailable') {
      if (LIST_FIELDS.has(field)) {
        if (Array.isArray(m.value)) value = items(m.value, field).map(text).filter(x => x !== null);
      } else if (NUMBER_FIELDS.has(field)) {
        if (typeof m.value === 'number' && Number.isFinite(m.value) && m.value >= 0) value = m.value;
      } else if (field === 'progress') {
        const p = m.value;
        if (isObject(p) && Number.isFinite(p.completed) && Number.isFinite(p.total) && p.completed >= 0 && p.total > 0 && p.completed <= p.total && text(p.basis)) value = {completed: p.completed, total: p.total, basis: text(p.basis)};
      } else if (field === 'state') {
        if (STATES.includes(m.value)) value = m.value;
      } else if (field === 'startedAt') {
        if (timestampMs(m.value) !== null) value = m.value;
      } else value = text(m.value);
    }
    if (value === null) {
      if (m.value != null && m.verification !== 'unavailable') warn(`Ungültiger Wert für ${field}; wird als nicht verfügbar angezeigt.`);
      return {value: null, source: text(m.source), observedAt: timestampMs(m.observedAt) === null ? null : m.observedAt, verification: 'unavailable'};
    }
    return {value, ...provenance(m)};
  };
  const result = {
    schemaVersion: SCHEMA_VERSION,
    dataset: ['sample', 'live'].includes(data.dataset) ? data.dataset : 'unavailable',
    observedAt: text(data.observedAt),
  };
  if (result.dataset === 'unavailable') warn('Herkunft des Datensatzes (sample/live) ist unbekannt.');
  for (const [section, fields] of Object.entries(FIELD_LABELS)) {
    if (data[section] != null && !isObject(data[section])) throw new Error(`${section} muss ein Objekt sein.`);
    result[section] = {};
    for (const field of Object.keys(fields)) result[section][field] = measurement(data[section]?.[field], field);
  }
  // Preserve conservative missing-list metadata when validating an already normalized response.
  result.availability = Object.fromEntries(['activity', 'artifacts', 'checks', 'issues'].map(key => [key, Array.isArray(data[key]) && !(data[key].length === 0 && data.availability?.[key] === false)]));
  if (Array.isArray(data.warnings)) for (const warning of data.warnings.slice(0, 100)) { const safe = text(warning); if (safe) warn(safe); }
  result.activity = items(data.activity, 'activity').flatMap((entry, index) => {
    if (!isObject(entry) || timestampMs(entry.time) === null || !text(entry.category) || !text(entry.summary) || !['info', 'running', 'passed', 'failed', 'warning', 'unknown'].includes(entry.status)) {
      warn('Ein unvollständiger Aktivitätseintrag wurde ausgeschlossen.'); return [];
    }
    return [{id: text(entry.id) || `activity-${index}`, time: entry.time, category: text(entry.category), summary: text(entry.summary), status: entry.status, durationMs: typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs) && entry.durationMs >= 0 ? entry.durationMs : null, ...provenance(entry, 'time')}];
  });
  result.artifacts = items(data.artifacts, 'artifacts').flatMap(entry => {
    if (!isObject(entry) || !text(entry.path)) { warn('Ein Artefakt ohne Pfad wurde ausgeschlossen.'); return []; }
    return [{path: text(entry.path), change: ['created', 'modified', 'unchanged'].includes(entry.change) ? entry.change : 'unknown', ...provenance(entry)}];
  });
  result.checks = items(data.checks, 'checks').flatMap(entry => {
    if (!isObject(entry) || !text(entry.name)) { warn('Eine Prüfung ohne Namen wurde ausgeschlossen.'); return []; }
    let status = CHECK_STATES.includes(entry.status) ? entry.status : 'unknown';
    const e = entry.evidence;
    const validEvidence = isObject(e) && text(e.command) && text(e.source) && Number.isInteger(e.exitCode) && timestampMs(e.finishedAt) !== null;
    if (status === 'passed' && (!validEvidence || e.exitCode !== 0)) {
      status = 'unknown'; warn('Ein bestandenes Prüfergebnis ohne erfolgreichen Ausführungsnachweis wurde auf unbekannt gesetzt.');
    }
    return [{name: text(entry.name), status, evidence: validEvidence ? {command: text(e.command), source: text(e.source), exitCode: e.exitCode, finishedAt: e.finishedAt} : null}];
  });
  result.issues = items(data.issues, 'issues').flatMap(entry => {
    if (!isObject(entry) || !text(entry.summary)) { warn('Ein Problem ohne Beschreibung wurde ausgeschlossen.'); return []; }
    return [{severity: ['info', 'warning', 'blocker', 'error'].includes(entry.severity) ? entry.severity : 'warning', summary: text(entry.summary), nextAction: text(entry.nextAction), ...provenance(entry)}];
  });
  result.warnings = warnings;
  return result;
}
