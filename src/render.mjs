import { FIELD_LABELS, freshness, uptime, redact, timestampMs } from './contract.mjs';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
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
const ACTIVITY_STATES = {
  info: ['Information', 'info'], running: ['Läuft', 'info'], passed: ['Erfolg gemeldet', 'success'],
  failed: ['Fehlgeschlagen', 'danger'], warning: ['Warnung', 'warning'], unknown: ['Unbekannt', 'neutral'],
};
const CHECK_LABELS = {
  not_run: ['Nicht ausgeführt', 'neutral'], running: ['Läuft', 'info'], passed: ['Bestanden (Nachweis vorhanden)', 'success'],
  failed: ['Fehlgeschlagen', 'danger'], unknown: ['Unbekannt / nicht belegt', 'warning'],
};
const CHANGES = {created: 'Erstellt', modified: 'Geändert', unchanged: 'Unverändert', unknown: 'Unbekannt'};
const SEVERITIES = {
  info: ['Hinweis', 'info'], warning: ['Warnung', 'warning'], blocker: ['Blocker', 'danger'], error: ['Fehler', 'danger'],
};
const SECTIONS = [
  ['identity', 'Noosphärische Identität', 'Agent, Modell und Kognitor'],
  ['assignment', 'Heiliger Auftrag', 'Ziel, Arbeitsschritt und Fortschritt'],
  ['capabilities', 'Geweihte Werkzeuge', 'Gemeldete Werkzeuge und Schnittstellen'],
  ['environment', 'Physische Matrix', 'Arbeitskontext und Laufzeit'],
  ['permissions', 'Doktrin & Schranken', 'Freigaben, Einschränkungen und fehlende Zugänge'],
  ['usage', 'Motive Force & Quota', 'Keine Schätzwerte ohne Messquelle'],
  ['activity', 'Noosphärischer Datenstrom', 'Chronologisch · neueste Ereignisse zuerst'],
  ['artifacts', 'Konstrukte & Riten', 'Dateiänderungen und Ausführungsnachweise'],
  ['issues', 'Litanei des Lösens', 'Blocker, Fehler, Warnungen und Annahmen'],
];

const SECTION_SHORT = {
  identity: 'Identität',
  assignment: 'Auftrag',
  capabilities: 'Werkzeuge',
  environment: 'Matrix',
  permissions: 'Schranken',
  usage: 'Quota',
  activity: 'Aktivität',
  artifacts: 'Riten',
  issues: 'Probleme',
};

async function callAction(action, payload = {}) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

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
  if (timestampMs(value) === null) return 'Nicht verfügbar';
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
        } else if (field === 'rateLimits' && isObject(v)) {
          listSignature = null;
          const card = el('div', 'limit-grid');
          const addLimit = (label, data) => {
            if (!data) return;
            const box = el('div', 'limit-cell');
            const top = el('div', 'limit-cell-head');
            top.append(el('span', 'limit-name', label));
            const pct = data.remainingPercent;
            const pBadge = el('span', 'badge limit-pct');
            badge(pBadge, [pct !== null ? `${pct} % übrig` : 'Erfasst', pct !== null && pct <= 15 ? 'danger' : pct !== null && pct <= 35 ? 'warning' : 'info']);
            top.append(pBadge);
            const bar = el('progress', 'limit-progress');
            bar.setAttribute('aria-label', label);
            bar.max = 100;
            bar.value = pct ?? 0;
            const meta = el('div', 'limit-meta');
            const usedText = data.used != null && data.total != null ? `${data.used} / ${data.total} genutzt` : (data.used != null ? `${data.used} genutzt` : '');
            const resetText = data.resetsAt ? `Reset: ${date(data.resetsAt) !== 'Nicht verfügbar' ? date(data.resetsAt) : data.resetsAt}` : '';
            meta.append(el('span', '', usedText), el('span', 'limit-reset', resetText));
            box.append(top, bar, meta);
            card.append(box);
          };
          addLimit('5-Stunden-Limit (ChatGPT-Nachrichten)', v.fiveHour);
          addLimit('Wöchentliches Limit (Reasoning / o-Serie)', v.weekly);
          if (v.detail) card.append(el('p', 'section-note', v.detail));
          value.replaceChildren(card);
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

  const actionToast = el('div', 'action-toast');
  actionToast.setAttribute('role', 'status');
  actionToast.setAttribute('aria-live', 'polite');
  actionToast.hidden = true;
  let toastTimer = null;
  function notifyAction(message, tone = 'info') {
    text(actionToast, message);
    actionToast.dataset.tone = tone;
    actionToast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { actionToast.hidden = true; }, 7000);
  }

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
  const modelPill = el('div', 'overview-model-pill');
  const modelPillLabel = el('span', 'model-pill-label', 'Provider & Modell');
  const modelPillVal = el('span', 'model-pill-val');
  modelPill.append(modelPillLabel, modelPillVal);
  titleBlock.append(title, modelPill);
  const freshBadge = el('span', 'badge freshness-badge');
  headline.append(titleBlock, freshBadge);

  const summary = el('div', 'summary-grid');
  const modelBox = el('div', 'summary-cell model-cell');
  modelBox.append(el('span', 'eyebrow', 'Aktiver Provider & Modell'));
  const modelHead = el('p', 'model-value');
  const modelSub = el('p', 'summary-note');
  const modelLink = el('a', 'quiet-link', 'Modell & Identität →');
  modelLink.href = '#identity';
  modelBox.append(modelHead, modelSub, modelLink);

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
  const fixHeroBtn = el('button', 'btn-action btn-danger btn-blocker-action', '⚡ Litanei des Lösens (Fix it)');
  fixHeroBtn.type = 'button';
  fixHeroBtn.hidden = true;
  fixHeroBtn.addEventListener('click', async () => {
    fixHeroBtn.disabled = true;
    const critical = (currentSnapshot?.issues || []).filter(issue => ['blocker', 'error'].includes(issue.severity));
    const targetSummary = critical[0]?.summary || currentSnapshot?.issues?.[0]?.summary || 'Allgemeine Fehlerbehebung';
    notifyAction(`⚡ Litanei des Lösens wird initiiert: „${targetSummary}“ …`, 'info');
    const res = await callAction('fix_issue', { summary: `Litanei des Lösens: ${targetSummary}` });
    fixHeroBtn.disabled = false;
    if (res.ok) {
      notifyAction(`⚡ Litanei des Lösens an den Maschinengeist übermittelt: „${targetSummary}“`, 'success');
    } else {
      notifyAction(`Litanei des Lösens fehlgeschlagen: ${res.error || 'Fehler'}`, 'danger');
    }
  });
  const issueLink = el('a', 'quiet-link', 'Probleme & nächste Schritte →');
  issueLink.href = '#issues';
  issueBox.append(blockers, blockerSummary, fixHeroBtn, issueLink);
  summary.append(modelBox, stateBox, taskBox, issueBox);

  const quotaOverview = el('div', 'overview-quota');
  quotaOverview.hidden = true;

  const clocks = el('div', 'clock-grid');
  const sourceClock = labelValue(clocks, 'Quellzeit · observedAt');
  const fetchClock = labelValue(clocks, 'Letzter erfolgreicher Abruf · lokale Uhr');
  const age = labelValue(clocks, 'Alter · aus Quellzeit');
  const freshnessReason = el('p', 'freshness-reason');
  const polling = el('p', 'polling-note');
  const transport = el('span', 'transport-state');
  const pollingLine = el('div', 'polling-line');
  pollingLine.append(polling, transport);
  const heroSeal = el('div', 'hero-purity-seal');
  heroSeal.setAttribute('aria-hidden', 'true');
  hero.append(dataset, headline, summary, quotaOverview, clocks, freshnessReason, pollingLine, heroSeal);

  const nav = el('nav', 'section-nav sticky-nav');
  nav.setAttribute('aria-label', 'Informationsbereiche');
  const cards = el('div', 'dashboard-grid');
  const sections = {};
  const fields = {};
  const pillDots = {};
  const pillLinks = {};
  for (const [index, [key, label, description]] of SECTIONS.entries()) {
    const link = el('a', 'nav-pill');
    link.href = `#${key}`;
    link.dataset.section = key;
    const cog = el('span', 'pill-cog', `⚙ ${String(index + 1).padStart(2, '0')}`);
    const name = el('span', 'pill-title', SECTION_SHORT[key] || label);
    const dot = el('span', 'pill-dot');
    dot.setAttribute('aria-hidden', 'true');
    link.append(cog, name, dot);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      for (const p of Object.values(pillLinks)) p.classList.remove('active');
      link.classList.add('active');
      const target = sections[key];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('flash-highlight');
        setTimeout(() => target.classList.remove('flash-highlight'), 1200);
      }
    });
    nav.append(link);
    pillDots[key] = dot;
    pillLinks[key] = link;

    const card = el('section', `card card-${key}`);
    card.id = key;
    card.setAttribute('aria-labelledby', `${key}-title`);
    const rivetTL = el('span', 'card-rivet corner-tl');
    rivetTL.setAttribute('aria-hidden', 'true');
    const rivetTR = el('span', 'card-rivet corner-tr');
    rivetTR.setAttribute('aria-hidden', 'true');
    card.append(rivetTL, rivetTR);

    const cardHeader = el('header', 'card-header');
    cardHeader.append(el('span', 'section-index', `⚙ ${String(index + 1).padStart(2, '0')}`));
    const heading = el('div');
    const canticleBadge = el('span', 'canticle-badge', `CANTICLE ${String(index + 1).padStart(2, '0')}`);
    const h2 = el('h2', '', label);
    h2.id = `${key}-title`;
    heading.append(canticleBadge, h2, el('p', 'card-description', description));
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

  // Canticle 02 Blueprint: Cranial Cogitator Schematic
  const cogitatorCard = el('div', 'blueprint-card');
  const cogitatorCanvas = el('div', 'blueprint-canvas blueprint-cranial');
  cogitatorCanvas.setAttribute('role', 'img');
  cogitatorCanvas.setAttribute('aria-label', 'Cranial-Cogitator Schematik (MK-IV)');
  const cogitatorCap = el('span', 'blueprint-caption', 'SCHEMATIK // CRANIAL-EINHEIT MK-IV · OMNISSIAH');
  cogitatorCard.append(cogitatorCanvas, cogitatorCap);
  sections.assignment.append(cogitatorCard);

  // Canticle 05 Blueprint: Oculus Mechanicus Schematic
  const oculusCard = el('div', 'blueprint-card');
  const oculusCanvas = el('div', 'blueprint-canvas blueprint-oculus');
  oculusCanvas.setAttribute('role', 'img');
  oculusCanvas.setAttribute('aria-label', 'Oculus Mechanicus Schematik');
  const oculusCap = el('span', 'blueprint-caption', 'SCHEMATIK // OCULUS MECHANICUS SENSOR-ARRAY');
  oculusCard.append(oculusCanvas, oculusCap);
  sections.permissions.append(oculusCard);

  // Canticle 09 Purity Seal
  const issuesSeal = el('div', 'card-purity-seal');
  issuesSeal.setAttribute('aria-hidden', 'true');
  sections.issues.append(issuesSeal);

  // Section 03: Geweihte Werkzeuge - Action bar & Paket-Installer
  const capActionBar = el('div', 'card-action-bar');
  const installPkgBtn = el('button', 'btn-action btn-primary', '📦 Skill / Extension installieren');
  installPkgBtn.type = 'button';
  const browseLink = el('a', 'btn-action btn-gold', '🌐 pi.dev/packages durchstöbern ↗');
  browseLink.href = 'https://pi.dev/packages';
  browseLink.target = '_blank';
  browseLink.rel = 'noopener noreferrer';
  capActionBar.append(installPkgBtn, browseLink);

  const installerBox = el('div', 'installer-box');
  installerBox.hidden = true;
  const installerTitle = el('p', 'installer-title', 'Geweihtes Paket im Agenten verankern (pi install)');
  const installerForm = el('form', 'installer-form');
  installerForm.addEventListener('submit', (e) => e.preventDefault());
  const pkgInput = el('input', 'installer-input');
  pkgInput.type = 'text';
  pkgInput.placeholder = 'z. B. @pi-agent/git-tools oder paket-name';
  const pkgSubmit = el('button', 'btn-action btn-primary', 'Installieren');
  pkgSubmit.type = 'button';
  const pkgCancel = el('button', 'btn-action btn-secondary', 'Schließen');
  pkgCancel.type = 'button';
  const pkgStatus = el('p', 'installer-status');
  installerForm.append(pkgInput, pkgSubmit, pkgCancel);
  installerBox.append(installerTitle, installerForm, pkgStatus);

  installPkgBtn.addEventListener('click', () => {
    installerBox.hidden = !installerBox.hidden;
    if (!installerBox.hidden) {
      pkgInput.value = '';
      text(pkgStatus, '');
      pkgInput.focus();
    }
  });
  pkgCancel.addEventListener('click', () => { installerBox.hidden = true; });
  pkgSubmit.addEventListener('click', async () => {
    const pkg = pkgInput.value.trim();
    if (!pkg) return;
    if (!/^(@?[a-zA-Z0-9_\-\.\/]+)$/.test(pkg)) {
      text(pkgStatus, 'Ungültiger Paketname. Nur alphanumerische Zeichen, @, /, -, _ und . erlaubt.');
      tone(pkgStatus, 'danger');
      return;
    }
    pkgSubmit.disabled = true;
    text(pkgStatus, `Installiere ${pkg} … Bitte warten.`);
    tone(pkgStatus, 'info');
    notifyAction(`📦 Installation von „${pkg}“ wird gestartet …`, 'info');
    const res = await callAction('install_package', { package: pkg });
    pkgSubmit.disabled = false;
    if (res.ok) {
      text(pkgStatus, `Erfolg! ${res.output || 'Paket installiert.'}`);
      tone(pkgStatus, 'success');
      notifyAction(`📦 Paket „${pkg}“ erfolgreich installiert!`, 'success');
    } else {
      text(pkgStatus, `Fehler: ${res.error || 'Installation fehlgeschlagen'}`);
      tone(pkgStatus, 'danger');
      notifyAction(`Installationsfehler: ${res.error || 'Fehler'}`, 'danger');
    }
  });
  sections.capabilities.append(capActionBar, installerBox);

  // Section 06: Motive Force & Quota - Action bar
  const usageActionBar = el('div', 'card-action-bar');
  const usageSyncBtn = el('button', 'btn-action btn-gold', '📡 Noosphären-Sync');
  usageSyncBtn.type = 'button';
  usageSyncBtn.title = 'Ritus der noosphärischen Daten-Inloads vollziehen (Quota synchronisieren)';
  usageSyncBtn.addEventListener('click', async () => {
    usageSyncBtn.disabled = true;
    notifyAction('📡 Ritus der noosphärischen Daten-Inloads wird vollzogen …', 'info');
    const res = await callAction('sync_quota');
    usageSyncBtn.disabled = false;
    if (res.ok) {
      notifyAction('📡 Ritus der noosphärischen Daten-Inloads vollzogen (Quota synchronisiert).', 'success');
    } else {
      notifyAction(`Sync fehlgeschlagen: ${res.error || 'Fehler'}`, 'danger');
    }
  });

  const usageResetBtn = el('button', 'btn-action btn-primary', '🔄 OpenAI Limit-Reset einlösen');
  usageResetBtn.type = 'button';
  usageResetBtn.title = '1 Rate-Limit-Reset Credit für OpenAI verbrauchen';
  usageResetBtn.addEventListener('click', async () => {
    if (!confirm('Soll 1 OpenAI Limit-Reset-Credit jetzt eingelöst werden? (Verfügbar: 3)')) return;
    usageResetBtn.disabled = true;
    notifyAction('🔄 Litanei der Rekalibrierung wird ausgeführt …', 'info');
    const res = await callAction('reset_openai_quota');
    usageResetBtn.disabled = false;
    if (res.ok) {
      notifyAction(`🔄 Litanei der Rekalibrierung vollzogen: 1 Credit eingelöst (${res.remainingCredits ?? 0} übrig).`, 'success');
    } else {
      notifyAction(`Reset fehlgeschlagen: ${res.error || 'Fehler'}`, 'danger');
    }
  });

  const usageCompactBtn = el('button', 'btn-action btn-secondary', '🧹 Speicher-Pneumatik (Compact)');
  usageCompactBtn.type = 'button';
  usageCompactBtn.title = 'Kontext des Maschinengeistes komprimieren';
  usageCompactBtn.addEventListener('click', async () => {
    if (!confirm('Soll der Kontext des Maschinengeistes komprimiert werden (Speicher-Pneumatik / Compact)?')) return;
    usageCompactBtn.disabled = true;
    notifyAction('🧹 Litanei der Speichersäuberung (Compact) wird initiiert …', 'info');
    const res = await callAction('compact_context');
    usageCompactBtn.disabled = false;
    if (res.ok) {
      notifyAction('🧹 Litanei der Speichersäuberung an Pi übermittelt.', 'success');
    } else {
      notifyAction(`Compact fehlgeschlagen: ${res.error || 'Fehler'}`, 'danger');
    }
  });

  usageActionBar.append(usageSyncBtn, usageResetBtn, usageCompactBtn);
  sections.usage.append(usageActionBar);
  sections.usage.append(el('p', 'section-note', 'Ohne verlässliche Quelle bleiben Werte nicht verfügbar oder ungeprüft. Kosten verwenden ausschließlich die in der Quelle genannte Einheit.'));

  function collection(card, label) {
    const availability = el('p', 'collection-status');
    const list = el('ol', 'entry-list');
    list.setAttribute('aria-label', label);
    card.append(availability, list);
    return {availability, list};
  }
  function updateAvailability(node, available, count, noun) {
    text(node, !available ? `${noun}: Datenquelle enthält keine Liste. Nicht verfügbar; keine Entwarnung.`
      : count === 0 ? `${noun}: Explizit leere Liste; keine Einträge gemeldet.`
        : `${noun}: ${count} ${count === 1 ? 'Eintrag' : 'Einträge'} gemeldet.`);
    tone(node, available ? 'neutral' : 'warning');
  }
  function fieldLine(parent, label, value) {
    parent.append(el('p', 'entry-meta', `${label}: ${value ?? 'Nicht verfügbar'}`));
  }
  function evidence(parent, item, observedAt = item.observedAt) {
    const detail = el('div', 'entry-evidence');
    const verification = el('span', 'verification');
    badge(verification, VERIFICATION[item.verification] || VERIFICATION.unavailable);
    detail.append(verification);
    fieldLine(detail, 'Quelle', item.source || 'Nicht verfügbar');
    fieldLine(detail, 'Beobachtet', date(observedAt));
    parent.append(detail);
  }
  const activity = collection(sections.activity, 'Aktivitätsereignisse');
  const controls = el('div', 'filters');
  function filterControl(id, label) {
    const wrapper = el('label', 'filter-label', label);
    const select = el('select');
    select.id = id;
    wrapper.append(select);
    controls.append(wrapper);
    return select;
  }
  const searchLabel = el('label', 'filter-label', 'Aktivitäten durchsuchen');
  const searchFilter = el('input');
  searchFilter.id = 'activity-search';
  searchFilter.type = 'search';
  searchFilter.maxLength = 200;
  searchFilter.placeholder = 'Zusammenfassung oder Kategorie';
  searchLabel.append(searchFilter);
  controls.append(searchLabel);
  const categoryFilter = filterControl('activity-category', 'Kategorie');
  const statusFilter = filterControl('activity-status', 'Status');
  const sortFilter = filterControl('activity-sort', 'Reihenfolge');
  function option(value, label) {
    const node = el('option', '', label);
    node.value = value;
    return node;
  }
  categoryFilter.append(option('', 'Alle Kategorien'));
  statusFilter.append(option('', 'Alle Status'));
  for (const [key, pair] of Object.entries(ACTIVITY_STATES)) statusFilter.append(option(key, pair[0]));
  sortFilter.append(option('desc', 'Neueste zuerst (Standard)'));
  sortFilter.append(option('asc', 'Älteste zuerst (Chronologisch)'));

  const actionsBar = el('div', 'filter-actions');
  const toggleAllBtn = el('button', 'filter-btn', 'Alle aufklappen');
  toggleAllBtn.type = 'button';
  toggleAllBtn.id = 'activity-toggle-all';

  const resetFiltersBtn = el('button', 'filter-btn', 'Filter zurücksetzen');
  resetFiltersBtn.type = 'button';
  resetFiltersBtn.id = 'activity-reset-filters';
  resetFiltersBtn.hidden = true;

  actionsBar.append(toggleAllBtn, resetFiltersBtn);
  const resultCount = el('p', 'filter-count');
  resultCount.setAttribute('aria-live', 'polite');
  sections.activity.insertBefore(controls, activity.availability);
  sections.activity.insertBefore(actionsBar, activity.availability);
  sections.activity.insertBefore(resultCount, activity.list);
  const artifacts = collection(sections.artifacts, 'Artefakte');
  const checks = collection(sections.artifacts, 'Prüfungen');
  const artifactTitle = el('h3', 'subsection-title', 'Datei-Artefakte');
  const checkTitle = el('h3', 'subsection-title', 'Prüfungen');
  sections.artifacts.insertBefore(artifactTitle, artifacts.availability);
  sections.artifacts.insertBefore(checkTitle, checks.availability);
  const issues = collection(sections.issues, 'Probleme und nächste Schritte');
  const issuesActionBar = el('div', 'card-action-bar');
  const fixIssuesSectionBtn = el('button', 'btn-action btn-danger', '⚡ Litanei des Lösens (Alle Blocker beheben)');
  fixIssuesSectionBtn.type = 'button';
  fixIssuesSectionBtn.addEventListener('click', async () => {
    fixIssuesSectionBtn.disabled = true;
    const critical = (currentRenderedSnapshot?.issues || []).filter(issue => ['blocker', 'error'].includes(issue.severity));
    const targetSummary = critical[0]?.summary || currentRenderedSnapshot?.issues?.[0]?.summary || 'Allgemeine Problembehebung';
    notifyAction(`⚡ Litanei des Lösens initiiert: „${targetSummary}“ …`, 'info');
    const res = await callAction('fix_issue', { summary: `Litanei des Lösens: ${targetSummary}` });
    fixIssuesSectionBtn.disabled = false;
    if (res.ok) {
      notifyAction('⚡ Litanei des Lösens an den Maschinengeist übermittelt.', 'success');
    } else {
      notifyAction(`Aktion fehlgeschlagen: ${res.error || 'Fehler'}`, 'danger');
    }
  });
  issuesActionBar.append(fixIssuesSectionBtn);
  sections.issues.insertBefore(issuesActionBar, issues.availability);

  function relativeTime(isoString, nowMs) {
    const time = Date.parse(isoString);
    if (!Number.isFinite(time) || !Number.isFinite(nowMs)) return null;
    const diffSec = Math.round((nowMs - time) / 1000);
    if (diffSec < 0 && Math.abs(diffSec) > 5) return 'in der Zukunft';
    if (diffSec < 45) return 'gerade eben';
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `vor ${diffMin} Min.`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    const diffDays = Math.round(diffHours / 24);
    return `vor ${diffDays} Tg.`;
  }

  let currentRenderedSnapshot = null;
  let currentNowMs = Date.now();
  let renderedCollection = null;
  const openActivityKeys = new Set();
  function renderActivity(s, nowMs = currentNowMs) {
    currentRenderedSnapshot = s;
    currentNowMs = nowMs;
    const source = s?.activity || [];
    const query = searchFilter.value.trim().toLocaleLowerCase('de');
    const filtered = source.filter(item => (!categoryFilter.value || item.category === categoryFilter.value)
      && (!statusFilter.value || item.status === statusFilter.value)
      && (!query || `${item.summary} ${item.category}`.toLocaleLowerCase('de').includes(query)));
    text(resultCount, s?.availability?.activity === true ? `${filtered.length} von ${source.length} Ereignissen sichtbar.` : 'Keine filterbaren Ereignisse verfügbar.');
    updateAvailability(activity.availability, s?.availability?.activity === true, source.length, 'Aktivität');
    for (const node of activity.list.querySelectorAll('details[open]')) openActivityKeys.add(node.dataset.entryKey);
    const active = doc.activeElement;
    const focusedKey = activity.list.contains(active) ? active.closest('details')?.dataset.entryKey : null;

    const isAsc = sortFilter.value === 'asc';
    const ordered = source.map((item, index) => ({item, key: `${item.id}:${item.time}:${index}`}))
      .sort((a, b) => isAsc ? (Date.parse(a.item.time) - Date.parse(b.item.time)) : (Date.parse(b.item.time) - Date.parse(a.item.time)));

    const isFiltered = Boolean(searchFilter.value || categoryFilter.value || statusFilter.value || sortFilter.value === 'asc');
    resetFiltersBtn.hidden = !isFiltered;

    const currentKeys = new Set(ordered.map(entry => entry.key));
    for (const key of openActivityKeys) if (!currentKeys.has(key)) openActivityKeys.delete(key);
    const fragment = doc.createDocumentFragment();
    activity.list.className = 'entry-list timeline-list';
    for (const {item, key} of ordered) {
      if (!filtered.includes(item)) continue;
      const li = el('li', 'entry timeline-entry');
      const marker = el('span', 'timeline-marker');
      marker.dataset.status = item.status || 'unknown';
      marker.setAttribute('aria-hidden', 'true');
      const detail = el('details', 'activity-detail');
      detail.dataset.entryKey = key;
      detail.open = openActivityKeys.has(key);
      detail.addEventListener('toggle', () => {
        if (detail.open) openActivityKeys.add(key);
        else openActivityKeys.delete(key);
        const details = activity.list.querySelectorAll('details.activity-detail');
        const allOpen = details.length > 0 && [...details].every(d => d.open);
        toggleAllBtn.textContent = allOpen ? 'Alle zuklappen' : 'Alle aufklappen';
      });
      const summary = el('summary', 'entry-heading');
      const time = el('time', 'entry-time', date(item.time));
      time.dateTime = item.time;
      summary.append(time);
      const rel = relativeTime(item.time, nowMs);
      if (rel) {
        const relTime = el('span', 'entry-rel-time', `(${rel})`);
        summary.append(relTime);
      }
      summary.append(el('span', 'entry-category', item.category));
      const state = el('span', 'badge');
      badge(state, ACTIVITY_STATES[item.status] || ACTIVITY_STATES.unknown);
      summary.append(state, el('span', 'entry-summary', item.summary));
      const body = el('div', 'entry-body');
      fieldLine(body, 'Dauer', item.durationMs === null ? 'Nicht verfügbar' : `${NUMBERS.format(item.durationMs)} ms`);
      evidence(body, item, item.time);
      detail.append(summary, body);
      li.append(marker, detail);
      fragment.append(li);
    }
    activity.list.replaceChildren(fragment);

    const visibleDetails = activity.list.querySelectorAll('details.activity-detail');
    const allOpen = visibleDetails.length > 0 && [...visibleDetails].every(d => d.open);
    toggleAllBtn.textContent = allOpen ? 'Alle zuklappen' : 'Alle aufklappen';

    if (focusedKey) {
      const replacement = [...activity.list.querySelectorAll('details')].find(node => node.dataset.entryKey === focusedKey);
      if (replacement) replacement.querySelector('summary')?.focus({preventScroll: true});
      else categoryFilter.focus({preventScroll: true});
    }
  }

  toggleAllBtn.addEventListener('click', () => {
    const details = activity.list.querySelectorAll('details.activity-detail');
    const allOpen = details.length > 0 && [...details].every(d => d.open);
    if (allOpen) {
      openActivityKeys.clear();
      for (const d of details) d.open = false;
      toggleAllBtn.textContent = 'Alle aufklappen';
    } else {
      for (const d of details) {
        d.open = true;
        if (d.dataset.entryKey) openActivityKeys.add(d.dataset.entryKey);
      }
      toggleAllBtn.textContent = 'Alle zuklappen';
    }
  });

  resetFiltersBtn.addEventListener('click', () => {
    searchFilter.value = '';
    categoryFilter.value = '';
    statusFilter.value = '';
    sortFilter.value = 'desc';
    renderActivity(currentRenderedSnapshot, currentNowMs);
  });
  function renderArtifacts(s) {
    updateAvailability(artifacts.availability, s?.availability?.artifacts === true, s?.artifacts?.length || 0, 'Artefakte');
    const fragment = doc.createDocumentFragment();
    for (const item of s?.artifacts || []) {
      const li = el('li', 'entry');
      const main = el('div', 'entry-heading');
      main.append(el('span', 'entry-summary path', item.path));
      const change = el('span', 'badge');
      badge(change, [CHANGES[item.change] || CHANGES.unknown, item.change === 'unknown' ? 'warning' : 'neutral']);
      main.append(change);
      li.append(main);
      evidence(li, item);
      fragment.append(li);
    }
    artifacts.list.replaceChildren(fragment);
    updateAvailability(checks.availability, s?.availability?.checks === true, s?.checks?.length || 0, 'Prüfungen');
    const checkFragment = doc.createDocumentFragment();
    for (const item of s?.checks || []) {
      const li = el('li', 'entry');
      const main = el('div', 'entry-heading');
      main.append(el('span', 'entry-summary', item.name));
      const status = el('span', 'badge');
      badge(status, CHECK_LABELS[item.status] || CHECK_LABELS.unknown);
      main.append(status);
      li.append(main);
      if (item.evidence) {
        const proof = el('div', 'entry-evidence');
        fieldLine(proof, 'Befehl', item.evidence.command);
        fieldLine(proof, 'Exit-Code', item.evidence.exitCode);
        fieldLine(proof, 'Abgeschlossen', date(item.evidence.finishedAt));
        fieldLine(proof, 'Nachweisquelle', item.evidence.source);
        li.append(proof);
      } else fieldLine(li, 'Ausführungsnachweis', 'Nicht verfügbar');
      checkFragment.append(li);
    }
    checks.list.replaceChildren(checkFragment);
  }
  function renderIssues(s) {
    updateAvailability(issues.availability, s?.availability?.issues === true, s?.issues?.length || 0, 'Probleme');
    const fragment = doc.createDocumentFragment();
    for (const item of s?.issues || []) {
      const li = el('li', 'entry');
      const main = el('div', 'entry-heading');
      const severity = el('span', 'badge');
      badge(severity, SEVERITIES[item.severity] || SEVERITIES.warning);
      main.append(severity, el('span', 'entry-summary', item.summary));
      if (['blocker', 'error'].includes(item.severity)) {
        const itemFixBtn = el('button', 'btn-action btn-action-sm btn-danger item-fix-btn', '⚡ Beheben');
        itemFixBtn.type = 'button';
        itemFixBtn.title = 'Litanei des Lösens für diesen Blocker ausführen';
        itemFixBtn.addEventListener('click', async () => {
          itemFixBtn.disabled = true;
          notifyAction(`⚡ Litanei des Lösens für „${item.summary}“ übermittelt …`, 'info');
          const res = await callAction('fix_issue', { summary: `Litanei des Lösens: ${item.summary}` });
          itemFixBtn.disabled = false;
          if (res.ok) {
            notifyAction(`⚡ Litanei des Lösens für „${item.summary}“ erfolgreich erteilt.`, 'success');
          } else {
            notifyAction(`Fehler: ${res.error || 'Aktion fehlgeschlagen'}`, 'danger');
          }
        });
        main.append(itemFixBtn);
      }
      li.append(main);
      fieldLine(li, 'Nächster Schritt', item.nextAction || 'Nicht verfügbar');
      evidence(li, item);
      fragment.append(li);
    }
    issues.list.replaceChildren(fragment);
  }
  function refreshCollections(s, nowMs = currentNowMs) {
    currentRenderedSnapshot = s;
    currentNowMs = nowMs;
    if (renderedCollection === s) {
      renderActivity(s, nowMs);
      return;
    }
    renderedCollection = s;
    const categories = [...new Set((s?.activity || []).map(item => item.category))].sort((a, b) => a.localeCompare(b, 'de'));
    const selected = categoryFilter.value;
    categoryFilter.replaceChildren(option('', 'Alle Kategorien'), ...categories.map(value => option(value, value)));
    // Keep an active choice even when a later snapshot no longer has this category.
    if (selected && !categories.includes(selected)) categoryFilter.append(option(selected, `${selected} (derzeit keine Einträge)`));
    categoryFilter.value = selected;
    renderActivity(s, nowMs);
    renderArtifacts(s);
    renderIssues(s);
  }
  searchFilter.addEventListener('input', () => renderActivity(currentRenderedSnapshot, currentNowMs));
  categoryFilter.addEventListener('change', () => renderActivity(currentRenderedSnapshot, currentNowMs));
  statusFilter.addEventListener('change', () => renderActivity(currentRenderedSnapshot, currentNowMs));
  sortFilter.addEventListener('change', () => renderActivity(currentRenderedSnapshot, currentNowMs));

  function createQuotaActionBar(isGoogle) {
    const actionBar = el('div', 'quota-action-bar');
    const syncBtn = el('button', 'btn-action btn-gold', '📡 Noosphären-Sync');
    syncBtn.type = 'button';
    syncBtn.title = 'Ritus der noosphärischen Daten-Inloads vollziehen (Quota synchronisieren)';
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      notifyAction('📡 Ritus der noosphärischen Daten-Inloads wird vollzogen …', 'info');
      const res = await callAction('sync_quota');
      syncBtn.disabled = false;
      if (res.ok) {
        notifyAction('📡 Ritus der noosphärischen Daten-Inloads vollzogen (Quota synchronisiert).', 'success');
      } else {
        notifyAction(`Sync fehlgeschlagen: ${res.error || 'Fehler'}`, 'danger');
      }
    });
    actionBar.append(syncBtn);

    if (!isGoogle) {
      const resetBtn = el('button', 'btn-action btn-primary', '🔄 OpenAI Limit-Reset einlösen');
      resetBtn.type = 'button';
      resetBtn.title = '1 Rate-Limit-Reset Credit für OpenAI verbrauchen';
      resetBtn.addEventListener('click', async () => {
        if (!confirm('Soll 1 OpenAI Limit-Reset-Credit jetzt eingelöst werden? (Verfügbar: 3)')) return;
        resetBtn.disabled = true;
        notifyAction('🔄 Litanei der Rekalibrierung wird ausgeführt …', 'info');
        const res = await callAction('reset_openai_quota');
        resetBtn.disabled = false;
        if (res.ok) {
          notifyAction(`🔄 Litanei der Rekalibrierung vollzogen: 1 Credit eingelöst (${res.remainingCredits ?? 0} übrig).`, 'success');
        } else {
          notifyAction(`Reset fehlgeschlagen: ${res.error || 'Fehler'}`, 'danger');
        }
      });
      actionBar.append(resetBtn);
    }
    return actionBar;
  }

  function renderQuotaOverview(container, limits, isGoogle = false) {
    const head = el('div', 'overview-quota-head');
    const titleNode = el('span', 'overview-quota-title', isGoogle ? 'Google / Gemini Kontolimits' : 'ChatGPT / Provider Account-Limits');
    const link = el('a', 'quiet-link', 'Verbrauch & Details →');
    link.href = '#usage';
    head.append(titleNode, link);

    const grid = el('div', 'overview-quota-grid');

    const addLimit = (label, data) => {
      if (!data) return;
      const box = el('div', 'limit-cell');
      const top = el('div', 'limit-cell-head');
      top.append(el('span', 'limit-name', label));
      const pct = data.remainingPercent;
      const pBadge = el('span', 'badge limit-pct');
      badge(pBadge, [pct !== null ? `${pct} % übrig` : 'Erfasst', pct !== null && pct <= 15 ? 'danger' : pct !== null && pct <= 35 ? 'warning' : 'info']);
      top.append(pBadge);

      const bar = el('progress', 'limit-progress');
      bar.setAttribute('aria-label', label);
      bar.max = 100;
      bar.value = pct ?? 0;

      const meta = el('div', 'limit-meta');
      const usedText = data.used != null && data.total != null ? `${data.used} / ${data.total} genutzt` : (data.used != null ? `${data.used} genutzt` : '');
      const resetText = data.resetsAt ? `Reset: ${date(data.resetsAt) !== 'Nicht verfügbar' ? date(data.resetsAt) : data.resetsAt}` : '';
      meta.append(el('span', '', usedText), el('span', 'limit-reset', resetText));

      box.append(top, bar, meta);
      grid.append(box);
    };

    if (isGoogle) {
      addLimit('Kurzzeit-Limit / Anfragen (Gemini)', limits.fiveHour || limits.shortTerm);
      addLimit('Wöchentliches / Tages-Limit (Gemini Thinking)', limits.weekly || limits.daily);
    } else {
      addLimit('5-Stunden-Limit (ChatGPT-Nachrichten)', limits.fiveHour);
      addLimit('Wöchentliches Limit (Reasoning / o-Serie)', limits.weekly);
    }
    if (limits.detail) grid.append(el('p', 'section-note', limits.detail));

    container.replaceChildren(head, grid, createQuotaActionBar(isGoogle));
  }

  function renderQuotaNotice(container, isGoogle = false) {
    const head = el('div', 'overview-quota-head');
    const titleNode = el('span', 'overview-quota-title', isGoogle ? 'Google / Gemini Kontolimits' : 'ChatGPT-Kontoquotas (5h / Wöchentlich)');
    const link = el('a', 'quiet-link', 'Verbrauch & Details →');
    link.href = '#usage';
    head.append(titleNode, link);

    const note = el('p', 'section-note', isGoogle
      ? 'Nicht synchronisiert · Google stellt Kontolimits von https://gemini.google.com/usage nicht über eine offene API bereit. Quotas können über Browser-Sync ("npm run quota:sync") oder /limits in Pi übergeben werden.'
      : 'Nicht verfügbar · OpenAI stellt Kontolimits von https://chatgpt.com/settings/usage?tab=overview nicht über eine offene API bereit. Quotas können über Browser-Sync ("npm run quota:sync") oder /limits in Pi übergeben werden.');
    note.style.margin = '0';
    container.replaceChildren(head, note, createQuotaActionBar(isGoogle));
  }

  const validation = el('details', 'validation-notice');
  const validationSummary = el('summary');
  const validationList = el('ul');
  validation.append(validationSummary, validationList);
  validation.hidden = true;
  const legend = el('details', 'legend');
  legend.append(el('summary', '', 'Wie Herkunft und Zustände zu lesen sind'));
  legend.append(el('p', '', '„Verifiziert laut Quelle“ ist eine Quellenangabe, keine unabhängige Attestierung dieses Dashboards. „Selbstauskunft“ stammt vom Agenten; „ungeprüft“ hat keinen vollständigen Nachweis. „Nicht verfügbar“ ist weder null Verbrauch noch eine leere Liste.'));
  legend.append(el('p', '', '„Live-Datensatz“ bezeichnet die markierte Statusquelle, nicht garantierte Aktualität. Die Aktualität beruht nur auf observedAt. Aktivität beschreibt Ereignisse; eine bestandene Prüfung benötigt einen erfolgreichen Ausführungsnachweis.'));
  root.replaceChildren(error, actionToast, hero, nav, validation, cards, legend);

  let snapshotReference;
  let snapshot = null;
  let currentSnapshot = null;
  let warningSignature = '';
  return {
    update(state, config, nowMs) {
      if (state.snapshot !== snapshotReference) {
        snapshotReference = state.snapshot;
        snapshot = state.snapshot ? redact(state.snapshot) : null;
      }
      const s = snapshot;
      currentSnapshot = s;
      const live = s?.live?.source === 'pi_extension';
      const liveAge = live ? freshness(s.observedAt, nowMs, {staleAfterMs: 12000, clockSkewMs: config?.clockSkewMs ?? 5000}) : null;
      const liveEnded = live && s.live.ended === true;
      const liveLost = live && !liveEnded && liveAge.state !== 'fresh';
      refreshCollections(s, nowMs);
      for (const [section, sectionFields] of Object.entries(fields)) {
        for (const [field, row] of Object.entries(sectionFields)) {
          const measurement = s?.[section]?.[field];
          row.update(section === 'assignment' && field === 'state' && (liveEnded || liveLost)
            ? {...measurement, value: null, verification: 'unavailable'} : measurement);
        }
      }
      const runtime = uptime(s?.identity, nowMs, config || {});
      const runtimeObservation = valueOf(s?.identity?.uptimeSeconds) !== null
        ? s?.identity?.uptimeSeconds?.observedAt : s?.identity?.startedAt?.observedAt;
      uptimeRow.update({ value: runtime.seconds === null ? null : duration(runtime.seconds), source: runtime.source,
        observedAt: runtimeObservation, verification: runtime.verification });
      text(identity, valueOf(s?.identity?.name) ? ` / ${s.identity.name.value}` : ' / Identität nicht verfügbar');

      const providerVal = valueOf(s?.identity?.provider);
      const exactModelVal = valueOf(s?.identity?.modelVersion);
      const familyModelVal = valueOf(s?.identity?.model);
      const effectiveModel = exactModelVal || familyModelVal;
      const effectiveProvider = providerVal || 'Nicht gemeldet';

      const modelDisplay = providerVal && effectiveModel
        ? `${providerVal} · ${effectiveModel}`
        : (effectiveModel || effectiveProvider);
      text(modelHead, modelDisplay);
      const modelSourceText = s?.identity?.modelVersion?.source || s?.identity?.model?.source || s?.identity?.provider?.source || 'Gemeldete Modellquelle';
      text(modelSub, (providerVal || effectiveModel) ? modelSourceText : 'Modellinformationen nicht verfügbar');
      text(modelPillVal, modelDisplay);

      const rateLimitVal = valueOf(s?.usage?.rateLimits);
      const isGoogle = (typeof providerVal === 'string' && /google|gemini/i.test(providerVal))
        || (typeof effectiveModel === 'string' && /gemini/i.test(effectiveModel));
      const isOpenAI = (typeof providerVal === 'string' && /openai|chatgpt/i.test(providerVal))
        || (typeof effectiveModel === 'string' && /(?:gpt|o1|o3|o4|openai)/i.test(effectiveModel));
      const isStructuredLimits = isObject(rateLimitVal) && (rateLimitVal.fiveHour || rateLimitVal.weekly);

      if (isStructuredLimits) {
        quotaOverview.hidden = false;
        renderQuotaOverview(quotaOverview, rateLimitVal, isGoogle);
      } else if (isOpenAI || isGoogle) {
        quotaOverview.hidden = false;
        renderQuotaNotice(quotaOverview, isGoogle);
      } else {
        quotaOverview.hidden = true;
        quotaOverview.replaceChildren();
      }

      const mode = s?.dataset;
      text(dataset, mode === 'sample' ? 'BEISPIELDATEN · Demonstration, keine Live-Telemetrie'
        : mode === 'live' ? 'LIVE-DATENSATZ · Gemeldeter Agentenstatus, keine unabhängige Verifikation'
          : 'DATENSATZTYP UNBEKANNT · Nicht als Live-Status interpretieren');
      tone(dataset, mode === 'sample' ? 'warning' : mode === 'live' ? 'info' : 'neutral');
      badge(stateBadge, liveEnded ? ['Pi-Sitzung beendet', 'neutral'] : liveLost ? ['Pi-Verbindung unterbrochen', 'warning']
        : STATES[valueOf(s?.assignment?.state)] || STATES.unavailable);
      text(stateVerification, liveEnded ? 'Extension hat das Sitzungsende gemeldet.'
        : liveLost ? 'Lebenszeichen fehlt oder ist ungültig; letzter Zustand nicht mehr aktuell.'
          : VERIFICATION[s?.assignment?.state?.verification]?.[0] || 'Nicht verfügbar');
      text(goal, valueOf(s?.assignment?.goal) ?? 'Ziel nicht verfügbar');
      text(step, `Schritt: ${valueOf(s?.assignment?.step) ?? 'Nicht verfügbar'}`);
      const knownIssues = s?.availability?.issues === true;
      const critical = (s?.issues || []).filter(issue => ['blocker', 'error'].includes(issue.severity));
      text(blockers, knownIssues ? `${critical.length} Blocker / Fehler` : 'Nicht verfügbar');
      tone(blockers, !knownIssues ? 'neutral' : critical.length ? 'danger' : 'success');
      text(blockerSummary, !knownIssues ? 'Problemliste fehlt; keine Entwarnung möglich.'
        : critical[0]?.summary || (s.issues.length ? `${s.issues.length} weitere Hinweise in der Problemliste.` : 'Keine Probleme gemeldet (leere Liste).'));

      if (knownIssues && critical.length > 0) {
        fixHeroBtn.hidden = false;
        fixHeroBtn.textContent = `⚡ Litanei des Lösens (${critical.length} ${critical.length === 1 ? 'Problem' : 'Probleme'})`;
      } else if (knownIssues && (s?.issues || []).length > 0) {
        fixHeroBtn.hidden = false;
        fixHeroBtn.textContent = '⚡ Litanei des Lösens (Prüfen)';
      } else {
        fixHeroBtn.hidden = true;
      }

      if (pillDots.issues) {
        pillDots.issues.dataset.state = critical.length > 0 ? 'danger' : (s?.issues?.length > 0 ? 'warning' : 'clear');
      }
      if (pillDots.activity) {
        pillDots.activity.dataset.state = valueOf(s?.assignment?.state) === 'working' ? 'working' : 'idle';
      }
      if (pillDots.assignment) {
        const aState = valueOf(s?.assignment?.state);
        pillDots.assignment.dataset.state = ['failed', 'blocked'].includes(aState) ? 'danger' : aState === 'working' ? 'working' : 'clear';
      }
      if (pillDots.usage) {
        const fiveHourPct = rateLimitVal?.fiveHour?.remainingPercent;
        const weeklyPct = rateLimitVal?.weekly?.remainingPercent;
        const minPct = Math.min(fiveHourPct ?? 100, weeklyPct ?? 100);
        pillDots.usage.dataset.state = minPct <= 15 ? 'danger' : minPct <= 35 ? 'warning' : 'clear';
      }
      for (const k of ['identity', 'capabilities', 'environment', 'permissions', 'artifacts']) {
        if (pillDots[k]) pillDots[k].dataset.state = 'clear';
      }
      const fresh = liveAge || freshness(s?.observedAt, nowMs, config || {});
      badge(freshBadge, fresh.state === 'fresh' ? ['Daten aktuell', 'success']
        : fresh.state === 'stale' ? ['Daten veraltet', 'warning'] : ['Aktualität unbekannt', 'neutral']);
      text(sourceClock, date(s?.observedAt));
      text(fetchClock, date(state.fetchedAt));
      text(age, fresh.ageMs === null ? 'Nicht verfügbar' : duration(fresh.ageMs / 1000));
      text(freshnessReason, liveEnded ? 'Extension hat die Sitzung beendet; keine laufende Pi-Instanz bestätigt.' : fresh.reason);
      text(polling, config ? `/status.json · Abruf alle ${NUMBERS.format(config.pollIntervalMs / 1000)} s · ${live ? 'Lebenszeichen nach 12 s veraltet' : `Veraltet nach ${duration(config.staleAfterMs / 1000)}`} · Uhrtoleranz ${duration(config.clockSkewMs / 1000)}` : 'Statusabruf wartet auf eine gültige Konfiguration.');
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
