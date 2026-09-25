import { FIELD_LABELS, freshness, uptime, redact } from './contract.mjs';

const views = new WeakMap();
const NUMBERS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const DATES = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC',
});
const STATES = {
  idle: ['Bereit', 'neutral'], working: ['In Arbeit', 'info'], waiting: ['Wartet', 'warning'],
  blocked: ['Blockiert', 'danger'], failed: ['Fehlgeschlagen', 'danger'],
  completed: ['Abgeschlossen', 'success'], unavailable: ['Nicht verfügbar', 'neutral'],
};
const VERIFICATION = {
  verified: ['Verifiziert laut Quelle', 'success'], self_reported: ['Selbstauskunft', 'info'],
  unverified: ['Ungeprüft', 'warning'], unavailable: ['Nicht verfügbar', 'neutral'],
};
const SECTIONS = [
  ['identity', 'Identität', 'Agent, Modell und Sitzung'],
  ['assignment', 'Auftrag', 'Ziel, Arbeitsschritt und belastbarer Fortschritt'],
  ['capabilities', 'Fähigkeiten', 'Gemeldete Werkzeuge und Schnittstellen'],
  ['environment', 'Umgebung', 'Arbeitskontext und Laufzeit'],
  ['permissions', 'Rechte & Grenzen', 'Freigaben, Einschränkungen und fehlende Zugänge'],
  ['usage', 'Kontext & Verbrauch', 'Keine Schätzwerte ohne Messquelle'],
  ['activity', 'Aktivität', 'Chronologisch · neueste Ereignisse zuerst'],
  ['artifacts', 'Artefakte & Prüfungen', 'Dateiänderungen und Ausführungsnachweise'],
  ['issues', 'Probleme & nächste Schritte', 'Blocker, Fehler, Warnungen und Annahmen'],
];

function text(node, value) {
  const next = value == null ? '' : String(value);
  if (node.textContent !== next) node.textContent = next;
}
function tone(node, value) {
  if (node.dataset.tone !== value) node.dataset.tone = value;
}
function badge(node, pair) {
  text(node, pair[0]);
  tone(node, pair[1]);
}
function date(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Nicht verfügbar';
  return `${DATES.format(new Date(value))} UTC`;
}
function duration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return 'Nicht verfügbar';
  const n = Math.floor(Math.max(0, seconds));
  if (n < 60) return `${n} s`;
  if (n < 3600) return `${Math.floor(n / 60)} min ${n % 60} s`;
  if (n < 86400) return `${Math.floor(n / 3600)} h ${Math.floor(n % 3600 / 60)} min`;
  return `${NUMBERS.format(Math.floor(n / 86400))} d ${Math.floor(n % 86400 / 3600)} h`;
}
function valueOf(measurement) {
  return measurement?.value ?? null;
}

function createView(root) {
  const doc = root.ownerDocument;
  function el(tag, className, content) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content != null) text(node, content);
    return node;
  }
  function labelValue(parent, label, className = '') {
    const block = el('div', className);
    const title = el('span', 'eyebrow', label);
    const value = el('span', 'summary-value');
    block.append(title, value);
    parent.append(block);
    return value;
  }
  function provenance(parent, label = 'Herkunft') {
    const details = el('details', 'provenance');
    const summary = el('summary');
    const verification = el('span', 'verification');
    summary.append(verification, doc.createTextNode(` · ${label}`));
    const source = el('p', 'source-line');
    const observed = el('p', 'source-line');
    details.append(summary, source, observed);
    parent.append(details);
    return {
      update(measurement) {
        badge(verification, VERIFICATION[measurement?.verification] || VERIFICATION.unavailable);
        text(source, `Quelle: ${measurement?.source || 'Nicht verfügbar'}`);
        text(observed, `Beobachtet: ${date(measurement?.observedAt)}`);
      },
    };
  }
  function measurementRow(parent, field, label) {
    const row = el('div', 'measurement');
    const name = el('dt', '', label);
    const content = el('dd');
    const value = el('div', 'measurement-value');
    const progress = el('progress');
    progress.setAttribute('aria-label', label);
    progress.hidden = true;
    const basis = el('p', 'basis');
    basis.hidden = true;
    content.append(value, progress, basis);
    const source = provenance(content);
    row.append(name, content);
    parent.append(row);
    let listSignature = null;
    return {
      update(m) {
        const v = valueOf(m);
        row.classList.toggle('unavailable', v === null);
        progress.hidden = field !== 'progress' || v === null;
        basis.hidden = progress.hidden;
        if (Array.isArray(v)) {
          const signature = JSON.stringify(v);
          if (signature !== listSignature) {
            const list = el('ul', 'value-list');
            for (const item of v) list.append(el('li', '', item));
            value.replaceChildren(v.length ? list : el('span', 'empty-value', 'Keine Einträge (explizit leere Liste)'));
            listSignature = signature;
          }
        } else {
          listSignature = null;
          if (v === null) text(value, 'Nicht verfügbar');
          else if (field === 'progress') {
            text(value, `${NUMBERS.format(v.completed / v.total * 100)} % · ${NUMBERS.format(v.completed)} / ${NUMBERS.format(v.total)}`);
            progress.max = v.total;
            progress.value = v.completed;
            text(basis, `Berechnungsbasis: ${v.basis}`);
          } else if (field === 'state') {
            badge(value, STATES[v] || STATES.unavailable);
          } else if (field === 'startedAt') text(value, date(v));
          else text(value, typeof v === 'number' ? NUMBERS.format(v) : v);
        }
        source.update(m);
      },
    };
  }

  const error = el('div', 'notice error');
  error.setAttribute('role', 'status');
  error.setAttribute('aria-live', 'polite');
  error.hidden = true;
  const hero = el('section', 'overview');
  hero.setAttribute('aria-labelledby', 'overview-title');
  const dataset = el('p', 'dataset-banner');
  const headline = el('div', 'overview-heading');
  const titleBlock = el('div');
  titleBlock.append(el('p', 'eyebrow', 'NOOSPHÄRISCHER EINBLICK / LOKALE STATUSQUELLE'));
  const title = el('h1', '', 'Agentenlage');
  title.id = 'overview-title';
  const identity = el('span', 'overview-agent');
  title.append(identity);
  titleBlock.append(title);
  const freshBadge = el('span', 'badge freshness-badge');
  headline.append(titleBlock, freshBadge);

  const summary = el('div', 'summary-grid');
  const stateBox = el('div', 'summary-cell state-cell');
  stateBox.append(el('span', 'eyebrow', 'Gesamtstatus · gemeldet'));
  const stateBadge = el('p', 'state-value');
  const stateVerification = el('p', 'summary-note');
  const stateLink = el('a', 'quiet-link', 'Statusherkunft →');
  stateLink.href = '#assignment';
  stateBox.append(stateBadge, stateVerification, stateLink);
  const taskBox = el('div', 'summary-cell task-cell');
  taskBox.append(el('span', 'eyebrow', 'Aktueller Auftrag'));
  const goal = el('p', 'task-goal');
  const step = el('p', 'task-step');
  const taskLink = el('a', 'quiet-link', 'Auftrag & Herkunft →');
  taskLink.href = '#assignment';
  taskBox.append(goal, step, taskLink);
  const issueBox = el('div', 'summary-cell blocker-cell');
  issueBox.append(el('span', 'eyebrow', 'Blocker & Fehler · gemeldet'));
  const blockers = el('p', 'blocker-count');
  const blockerSummary = el('p', 'blocker-summary');
  const issueLink = el('a', 'quiet-link', 'Probleme & nächste Schritte →');
  issueLink.href = '#issues';
  issueBox.append(blockers, blockerSummary, issueLink);
  summary.append(stateBox, taskBox, issueBox);

  const clocks = el('div', 'clock-grid');
  const sourceClock = labelValue(clocks, 'Quellzeit · observedAt');
  const fetchClock = labelValue(clocks, 'Letzter erfolgreicher Abruf · lokale Uhr');
  const age = labelValue(clocks, 'Alter · aus Quellzeit');
  const freshnessReason = el('p', 'freshness-reason');
  const polling = el('p', 'polling-note');
  const transport = el('span', 'transport-state');
  const pollingLine = el('div', 'polling-line');
  pollingLine.append(polling, transport);
  hero.append(dataset, headline, summary, clocks, freshnessReason, pollingLine);

  const nav = el('nav', 'section-nav');
  nav.setAttribute('aria-label', 'Informationsbereiche');
  const cards = el('div', 'dashboard-grid');
  const sections = {};
  const fields = {};
  for (const [index, [key, label, description]] of SECTIONS.entries()) {
    const link = el('a', '', `${String(index + 1).padStart(2, '0')} ${label}`);
    link.href = `#${key}`;
    nav.append(link);
    const card = el('section', `card card-${key}`);
    card.id = key;
    card.setAttribute('aria-labelledby', `${key}-title`);
    const cardHeader = el('header', 'card-header');
    cardHeader.append(el('span', 'section-index', String(index + 1).padStart(2, '0')));
    const heading = el('div');
    const h2 = el('h2', '', label);
    h2.id = `${key}-title`;
    heading.append(h2, el('p', 'card-description', description));
    cardHeader.append(heading);
    card.append(cardHeader);
    sections[key] = card;
    if (FIELD_LABELS[key]) {
      const dl = el('dl', 'measurements');
      fields[key] = {};
      for (const [field, fieldLabel] of Object.entries(FIELD_LABELS[key])) {
        if (key === 'identity' && field === 'uptimeSeconds') continue;
        fields[key][field] = measurementRow(dl, field, fieldLabel);
      }
      card.append(dl);
    }
    cards.append(card);
  }
  const uptimeRow = measurementRow(sections.identity.querySelector('dl'), 'uptime', 'Laufzeit');
  const assignmentUpdated = el('p', 'section-note');
  sections.assignment.append(assignmentUpdated);
  sections.usage.append(el('p', 'section-note', 'Ohne verlässliche Quelle bleiben Werte nicht verfügbar oder ungeprüft. Kosten verwenden ausschließlich die in der Quelle genannte Einheit.'));

  const validation = el('details', 'validation-notice');
  const validationSummary = el('summary');
  const validationList = el('ul');
  validation.append(validationSummary, validationList);
  validation.hidden = true;
  const legend = el('details', 'legend');
  legend.append(el('summary', '', 'Wie Herkunft und Zustände zu lesen sind'));
  legend.append(el('p', '', '„Verifiziert laut Quelle“ ist eine Quellenangabe, keine unabhängige Attestierung dieses Dashboards. „Selbstauskunft“ stammt vom Agenten; „ungeprüft“ hat keinen vollständigen Nachweis. „Nicht verfügbar“ ist weder null Verbrauch noch eine leere Liste.'));
  legend.append(el('p', '', '„Live-Datensatz“ bezeichnet die markierte Statusquelle, nicht garantierte Aktualität. Die Aktualität beruht nur auf observedAt. Aktivität beschreibt Ereignisse; eine bestandene Prüfung benötigt einen erfolgreichen Ausführungsnachweis.'));
  root.replaceChildren(error, hero, nav, validation, cards, legend);

  let snapshotReference;
  let snapshot = null;
  let warningSignature = '';
  return {
    update(state, config, nowMs) {
      if (state.snapshot !== snapshotReference) {
        snapshotReference = state.snapshot;
        snapshot = state.snapshot ? redact(state.snapshot) : null;
      }
      const s = snapshot;
      for (const [section, sectionFields] of Object.entries(fields)) {
        for (const [field, row] of Object.entries(sectionFields)) row.update(s?.[section]?.[field]);
      }
      const runtime = uptime(s?.identity, nowMs, config || {});
      const runtimeObservation = valueOf(s?.identity?.uptimeSeconds) !== null
        ? s?.identity?.uptimeSeconds?.observedAt : s?.identity?.startedAt?.observedAt;
      uptimeRow.update({ value: runtime.seconds === null ? null : duration(runtime.seconds), source: runtime.source,
        observedAt: runtimeObservation, verification: runtime.verification });
      text(identity, valueOf(s?.identity?.name) ? ` / ${s.identity.name.value}` : ' / Identität nicht verfügbar');
      const mode = s?.dataset;
      text(dataset, mode === 'sample' ? 'BEISPIELDATEN · Demonstration, keine Live-Telemetrie'
        : mode === 'live' ? 'LIVE-DATENSATZ · Gemeldeter Agentenstatus, keine unabhängige Verifikation'
          : 'DATENSATZTYP UNBEKANNT · Nicht als Live-Status interpretieren');
      tone(dataset, mode === 'sample' ? 'warning' : mode === 'live' ? 'info' : 'neutral');
      badge(stateBadge, STATES[valueOf(s?.assignment?.state)] || STATES.unavailable);
      text(stateVerification, VERIFICATION[s?.assignment?.state?.verification]?.[0] || 'Nicht verfügbar');
      text(goal, valueOf(s?.assignment?.goal) ?? 'Ziel nicht verfügbar');
      text(step, `Schritt: ${valueOf(s?.assignment?.step) ?? 'Nicht verfügbar'}`);
      const knownIssues = s?.availability?.issues === true;
      const critical = (s?.issues || []).filter(issue => ['blocker', 'error'].includes(issue.severity));
      text(blockers, knownIssues ? `${critical.length} Blocker / Fehler` : 'Nicht verfügbar');
      tone(blockers, !knownIssues ? 'neutral' : critical.length ? 'danger' : 'success');
      text(blockerSummary, !knownIssues ? 'Problemliste fehlt; keine Entwarnung möglich.'
        : critical[0]?.summary || (s.issues.length ? `${s.issues.length} weitere Hinweise in der Problemliste.` : 'Keine Probleme gemeldet (leere Liste).'));
      const fresh = freshness(s?.observedAt, nowMs, config || {});
      badge(freshBadge, fresh.state === 'fresh' ? ['Daten aktuell', 'success']
        : fresh.state === 'stale' ? ['Daten veraltet', 'warning'] : ['Aktualität unbekannt', 'neutral']);
      text(sourceClock, date(s?.observedAt));
      text(fetchClock, date(state.fetchedAt));
      text(age, fresh.ageMs === null ? 'Nicht verfügbar' : duration(fresh.ageMs / 1000));
      text(freshnessReason, fresh.reason);
      text(polling, config ? `/status.json · Abruf alle ${NUMBERS.format(config.pollIntervalMs / 1000)} s · Veraltet nach ${duration(config.staleAfterMs / 1000)} · Uhrtoleranz ${duration(config.clockSkewMs / 1000)}` : 'Statusabruf wartet auf eine gültige Konfiguration.');
      text(transport, state.loading ? 'Wird abgerufen …' : state.error ? 'Abruf gestört' : s ? 'Quelle geladen' : 'Noch kein Snapshot');
      tone(transport, state.error ? 'danger' : 'neutral');
      const safeError = state.error ? redact(String(state.error)) : null;
      error.hidden = !safeError;
      text(error, safeError ? `Statusabruf fehlgeschlagen. ${safeError} ${s ? 'Der letzte gültige Snapshot bleibt sichtbar; seine Quellzeit und letzte erfolgreiche Abrufzeit bleiben erhalten.' : 'Noch kein gültiger Snapshot verfügbar.'} Lokalen Server und agent-status.json prüfen; mit „Neu laden“ erneut versuchen.` : '');
      text(assignmentUpdated, `Letzte Snapshot-Aktualisierung (observedAt): ${date(s?.observedAt)}. Einzelwerte können ältere Beobachtungszeiten haben; siehe Herkunft.`);
      const warnings = s?.warnings || [];
      const signature = JSON.stringify(warnings);
      if (signature !== warningSignature) {
        warningSignature = signature;
        validationList.replaceChildren(...warnings.map(warning => el('li', '', warning)));
      }
      validation.hidden = warnings.length === 0;
      text(validationSummary, `${warnings.length} Datenhinweise aus der Validierung`);
    },
  };
}

/** The root, controls, measurement rows and provenance details survive every update. */
export function renderDashboard(root, state, config, nowMs = Date.now()) {
  let view = views.get(root);
  if (!view) {
    view = createView(root);
    views.set(root, view);
  }
  view.update(state, config, nowMs);
}
