import { createStore } from './src/store.mjs';
import { renderDashboard } from './src/render.mjs';
import { exportAnonymizedStatusJson } from './src/export.mjs';

const CONFIG_RANGES = {
  pollIntervalMs: [500, 60000], staleAfterMs: [1000, 86400000],
  clockSkewMs: [0, 60000], timeoutMs: [100, 60000],
};

function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Die Konfiguration muss ein JSON-Objekt sein.');
  }
  const result = {};
  for (const [key, [minimum, maximum]] of Object.entries(CONFIG_RANGES)) {
    const number = value[key];
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      throw new Error(`Konfigurationsfeld ${key} fehlt oder ist ungültig.`);
    }
    result[key] = number;
  }
  return result;
}

/** The DOM is the only adapter here; the store remains replaceable by an event source. */
export function startDashboard(documentRef = document, windowRef = window) {
  const root = documentRef.getElementById('dashboard');
  const configNotice = documentRef.getElementById('config-status');
  const reloadButton = documentRef.getElementById('reload');
  const themeButton = documentRef.getElementById('theme-toggle');
  const exportButton = documentRef.getElementById('export-diagnostics');
  if (!root || !configNotice || !reloadButton || !themeButton) return () => {};

  let config = null;
  let store = null;
  let pollTimer = null;
  let tickTimer = null;
  let configController = null;
  let booting = false;
  let stopped = false;
  let themePreference = null;
  const darkPreference = windowRef.matchMedia('(prefers-color-scheme: dark)');
  try {
    const saved = windowRef.localStorage.getItem('observatory-theme');
    if (saved === 'light' || saved === 'dark') themePreference = saved;
  } catch { /* Storage is optional; the toggle still works in memory. */ }

  function applyTheme() {
    const theme = themePreference || (darkPreference.matches ? 'dark' : 'light');
    documentRef.documentElement.dataset.theme = theme;
    themeButton.textContent = theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus';
    themeButton.setAttribute('aria-label', theme === 'dark' ? 'Zum Hellmodus wechseln' : 'Zum Dunkelmodus wechseln');
  }
  function toggleTheme() {
    themePreference = documentRef.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { windowRef.localStorage.setItem('observatory-theme', themePreference); } catch { /* Optional. */ }
    applyTheme();
  }
  applyTheme();
  themeButton.addEventListener('click', toggleTheme);
  darkPreference.addEventListener('change', applyTheme);

  function paint(state = store?.getState()) {
    if (stopped || !config || !state) return;
    renderDashboard(root, state, config, Date.now());
    reloadButton.setAttribute('aria-busy', String(state.loading));
    // Keep the button enabled and its accessible name stable while it owns focus.
  }

  function schedulePoll() {
    windowRef.clearTimeout(pollTimer);
    if (!stopped && store) {
      pollTimer = windowRef.setTimeout(async () => {
        await store.refresh();
        schedulePoll();
      }, config.pollIntervalMs);
    }
  }

  async function initialize() {
    if (booting || stopped) return;
    booting = true;
    reloadButton.setAttribute('aria-busy', 'true');
    configNotice.hidden = false;
    configNotice.className = 'notice';
    configNotice.textContent = 'Lokale Konfiguration wird geprüft …';
    configController = new AbortController();
    // Bootstrap timeout, not a purportedly loaded configuration value.
    const timer = windowRef.setTimeout(() => configController?.abort(), 5000);
    try {
      const response = await windowRef.fetch('/config.json', {
        cache: 'no-store', signal: configController.signal, credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`Konfigurationsabruf: HTTP ${response.status}.`);
      const text = await response.text();
      if (text.length > 4096) throw new Error('Die Konfiguration überschreitet die zulässige Größe.');
      let value;
      try { value = JSON.parse(text); } catch { throw new Error('Die Konfiguration enthält kein gültiges JSON.'); }
      const validated = validateConfig(value);
      if (stopped) return;
      config = validated;
      configNotice.hidden = true;
      store = createStore({
        url: '/status.json',
        fetchFn: windowRef.fetch.bind(windowRef),
        now: Date.now,
        timeoutMs: config.timeoutMs,
        onChange: paint,
      });
      paint();
      tickTimer = windowRef.setInterval(() => paint(), 1000);
      await store.refresh();
      schedulePoll();
    } catch (error) {
      if (!stopped) {
        // Network adapters can throw arbitrary messages; never echo them into the page.
        const reason = error?.name === 'AbortError'
          ? 'Zeitüberschreitung beim Konfigurationsabruf (5 Sekunden).'
          : error instanceof Error && (/^Konfigurationsfeld (?:pollIntervalMs|staleAfterMs|clockSkewMs|timeoutMs) fehlt oder ist ungültig\.$/.test(error.message)
            || ['Die Konfiguration muss ein JSON-Objekt sein.', 'Die Konfiguration überschreitet die zulässige Größe.', 'Die Konfiguration enthält kein gültiges JSON.'].includes(error.message))
            ? error.message : 'Konfigurationsabruf fehlgeschlagen oder ungültig.';
        configNotice.className = 'notice error';
        configNotice.textContent = `Konfiguration nicht verfügbar. ${reason} Es werden keine ungeprüften Standardwerte verwendet. Lokalen Server und config.json prüfen; mit „Neu laden“ erneut versuchen.`;
        configNotice.hidden = false;
      }
    } finally {
      windowRef.clearTimeout(timer);
      configController = null;
      booting = false;
      if (!stopped) reloadButton.setAttribute('aria-busy', 'false');
    }
  }

  async function refresh() {
    if (stopped) return;
    if (!store) return initialize();
    windowRef.clearTimeout(pollTimer);
    await store.refresh();
    schedulePoll();
  }
  reloadButton.addEventListener('click', refresh);

  function triggerExport() {
    const state = store?.getState();
    const snapshot = state?.snapshot;
    if (!snapshot) return;
    try {
      const json = exportAnonymizedStatusJson(snapshot, { now: new Date() });
      const blob = new windowRef.Blob([json], { type: 'application/json; charset=utf-8' });
      const url = windowRef.URL.createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `pi-observatory-diagnostics-${timestamp}.json`;
      documentRef.body.append(link);
      link.click();
      link.remove();
      windowRef.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export fehlgeschlagen:', err);
    }
  }
  exportButton?.addEventListener('click', triggerExport);

  function stop() {
    stopped = true;
    windowRef.clearTimeout(pollTimer);
    windowRef.clearInterval(tickTimer);
    configController?.abort();
    store?.stop();
    reloadButton.removeEventListener('click', refresh);
    exportButton?.removeEventListener('click', triggerExport);
    themeButton.removeEventListener('click', toggleTheme);
    darkPreference.removeEventListener('change', applyTheme);
    windowRef.removeEventListener('pagehide', onPageHide);
  }
  function onPageHide(event) {
    // A page in the back/forward cache is frozen by the browser, not destroyed.
    if (!event.persisted) stop();
  }
  windowRef.addEventListener('pagehide', onPageHide);
  void initialize();
  return stop;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  startDashboard();
}
