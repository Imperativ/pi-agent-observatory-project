import {parseStatus} from './contract.mjs';

// Only messages created inside this module cross the store/UI boundary.
class StatusError extends Error {}

export function createStore({url = '/status.json', fetchFn = globalThis.fetch, now = Date.now, timeoutMs = 5000, onChange = () => {}} = {}) {
  let state = {snapshot: null, fetchedAt: null, error: null, loading: false};
  let stopped = false;
  let pending = null;
  let controller;
  const emit = patch => {
    if (stopped) return;
    state = {...state, ...patch};
    onChange({...state});
  };
  function refresh() {
    if (stopped) return Promise.resolve({...state});
    if (pending) return pending;
    controller = new AbortController();
    emit({loading: true});
    pending = (async () => {
      let timer;
      try {
        // Race covers headers AND body, even an adapter which ignores AbortSignal.
        const task = (async () => {
          const response = await fetchFn(url, {signal: controller.signal, cache: 'no-store', credentials: 'same-origin'});
          if (!response.ok) {
            const code = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? ` (HTTP ${response.status})` : '';
            throw new StatusError(`Statusabruf fehlgeschlagen${code}. Statusdatei und Server prüfen.`);
          }
          const contentType = response.headers?.get?.('content-type');
          if (contentType && !contentType.toLowerCase().includes('application/json')) throw new StatusError('Statusquelle liefert kein JSON. Serverroute prüfen.');
          const body = await response.text();
          try { return parseStatus(body); }
          catch { throw new StatusError('Statusquelle enthält ungültige Daten. JSON, schemaVersion und Struktur prüfen.'); }
        })();
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => { reject(new StatusError('Statusabruf hat das Zeitlimit überschritten. Lokalen Server prüfen.')); controller.abort(); }, timeoutMs);
        });
        const snapshot = await Promise.race([task, timeout]);
        emit({snapshot, fetchedAt: new Date(now()).toISOString(), error: null, loading: false});
      } catch (error) {
        // Untrusted fetch/adapter errors can contain secrets, even if they start with "Status".
        const message = error instanceof StatusError ? error.message : 'Statusquelle nicht erreichbar oder ungültig. Lokalen Server und Statusdatei prüfen.';
        emit({error: message, loading: false});
      } finally {
        clearTimeout(timer);
        pending = null;
      }
      return {...state};
    })();
    return pending;
  }
  return {
    refresh,
    getState: () => ({...state}),
    stop() { stopped = true; controller?.abort(); state = {...state, loading: false}; },
  };
}
