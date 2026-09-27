import http from 'node:http';
import {isIP} from 'node:net';
import {readFile, stat, realpath, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {parseStatus} from './src/contract.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 256 * 1024;
export const DEFAULT_CONFIG = Object.freeze({pollIntervalMs: 3000, staleAfterMs: 120000, clockSkewMs: 5000, timeoutMs: 5000});
/** An explicit interface address, never a wildcard, DNS name or public address. */
export function validateBindHost(host) {
  if (typeof host !== 'string' || isIP(host) !== 4) throw new Error('Nur eine private IPv4-Adresse oder 127.0.0.1 ist erlaubt.');
  const [a, b] = host.split('.').map(Number);
  if (host !== '127.0.0.1' && !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) {
    throw new Error('Nur eine private IPv4-Adresse oder 127.0.0.1 ist erlaubt.');
  }
  return host;
}
const ROUTES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/src/contract.mjs', ['src/contract.mjs', 'text/javascript; charset=utf-8']],
  ['/src/store.mjs', ['src/store.mjs', 'text/javascript; charset=utf-8']],
  ['/src/render.mjs', ['src/render.mjs', 'text/javascript; charset=utf-8']],
  ['/src/export.mjs', ['src/export.mjs', 'text/javascript; charset=utf-8']],
  ['/assets/skull-cog.svg', ['assets/skull-cog.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/purity-seal.svg', ['assets/purity-seal.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/schematic-gears.svg', ['assets/schematic-gears.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/schematic-eye.svg', ['assets/schematic-eye.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/schematic-skull.svg', ['assets/schematic-skull.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/mech-footer-plinth.svg', ['assets/mech-footer-plinth.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/hud-bracket.svg', ['assets/hud-bracket.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/corner-rivet.svg', ['assets/corner-rivet.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/skull-cog-medallion.jpg', ['assets/skull-cog-medallion.jpg', 'image/jpeg']],
  ['/assets/schematic-eye.jpg', ['assets/schematic-eye.jpg', 'image/jpeg']],
  ['/assets/schematic-skull.jpg', ['assets/schematic-skull.jpg', 'image/jpeg']],
  ['/assets/purity-seal.jpg', ['assets/purity-seal.jpg', 'image/jpeg']],
]);
export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('config.json muss ein Objekt sein.');
  const ranges = {pollIntervalMs: [500, 60000], staleAfterMs: [1000, 86400000], clockSkewMs: [0, 60000], timeoutMs: [100, 60000]};
  const config = {};
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = input[key] ?? DEFAULT_CONFIG[key];
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`config.json: ${key} muss ganzzahlig zwischen ${min} und ${max} liegen.`);
    config[key] = value;
  }
  return config;
}
async function boundedRead(filename, encoding = 'utf8') {
  const [realRoot, realFile] = await Promise.all([realpath(ROOT), realpath(filename)]);
  const relative = path.relative(realRoot, realFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Datei liegt außerhalb des Projektordners.');
  const st = await stat(realFile);
  if (st.size > MAX_BYTES) throw new Error('Datei überschreitet 256 KiB.');
  const data = await readFile(realFile, encoding);
  if (encoding && Buffer.byteLength(data) > MAX_BYTES) throw new Error('Datei überschreitet 256 KiB.');
  return data;
}
function send(res, status, body, type = 'application/json; charset=utf-8', head = false) {
  const isBuffer = Buffer.isBuffer(body);
  const data = isBuffer ? body : (typeof body === 'string' ? body : JSON.stringify(body));
  const len = isBuffer ? body.length : Buffer.byteLength(data);
  res.writeHead(status, {'Content-Type': type, 'Content-Length': len});
  res.end(head ? undefined : data);
}

async function handleAction(req, res, statusPath) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16384) { send(res, 413, {error: 'Payload zu groß.'}); return; }
  }
  let payload = {};
  try { if (body) payload = JSON.parse(body); } catch { send(res, 400, {error: 'Ungültiges JSON.'}); return; }
  const action = payload.action;
  if (!action || typeof action !== 'string') { send(res, 400, {error: 'Feld action fehlt oder ist ungültig.'}); return; }

  try {
    if (action === 'get_reset_credits') {
      const authPath = path.join(os.homedir(), '.pi', 'agent', 'auth.json');
      let count = 0;
      if (fs.existsSync(authPath)) {
        try {
          const auth = JSON.parse(await readFile(authPath, 'utf8'))['openai-codex'];
          if (auth?.access) {
            const r = await fetch('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', {
              headers: { Authorization: `Bearer ${auth.access}` }
            });
            if (r.ok) {
              const d = await r.json();
              count = (d.credits || []).filter(c => c.status === 'available').length;
            }
          }
        } catch {}
      }
      send(res, 200, { ok: true, availableCredits: count });
    } else if (action === 'reset_openai_quota') {
      const authPath = path.join(os.homedir(), '.pi', 'agent', 'auth.json');
      if (!fs.existsSync(authPath)) { send(res, 422, { ok: false, error: 'Keine Pi-Authentifizierungsdatei gefunden.' }); return; }
      const auth = JSON.parse(await readFile(authPath, 'utf8'))['openai-codex'];
      if (!auth?.access) { send(res, 422, { ok: false, error: 'Kein OpenAI-Codex Token gefunden.' }); return; }
      const r = await fetch('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', {
        headers: { Authorization: `Bearer ${auth.access}` }
      });
      if (!r.ok) { send(res, 502, { ok: false, error: `Fehler beim Abruf der Reset-Credits (HTTP ${r.status}).` }); return; }
      const d = await r.json();
      const available = (d.credits || []).filter(c => c.status === 'available');
      if (available.length === 0) { send(res, 409, { ok: false, error: 'Keine Kontingent-Reset-Credits mehr verfügbar (0 übrig).' }); return; }
      const creditId = available[0].id;
      const consumeRes = await fetch('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credit_id: creditId })
      });
      if (!consumeRes.ok) { send(res, 502, { ok: false, error: `Credit konnte nicht eingelöst werden (HTTP ${consumeRes.status}).` }); return; }
      const { fetchDirectOpenAIQuota, saveRateLimitsToStatus } = await import('./scripts/browser-quota-sync.mjs');
      const limits = await fetchDirectOpenAIQuota();
      if (limits) await saveRateLimitsToStatus(limits, statusPath);
      send(res, 200, { ok: true, consumed: creditId, remainingCredits: available.length - 1, limits });
    } else if (action === 'sync_quota') {
      const { fetchDirectQuota, saveRateLimitsToStatus } = await import('./scripts/browser-quota-sync.mjs');
      const limits = await fetchDirectQuota('auto');
      if (limits) await saveRateLimitsToStatus(limits, statusPath);
      send(res, 200, { ok: true, limits });
    } else if (action === 'install_package') {
      const pkg = String(payload.package || '').trim();
      if (!pkg || !/^(@?[a-zA-Z0-9_\-\.\/]+)$/.test(pkg)) {
        send(res, 400, { ok: false, error: 'Ungültiger Paketname.' });
        return;
      }
      const { execFile: execFileCb } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFile = promisify(execFileCb);
      try {
        const { stdout, stderr } = await execFile('pi', ['install', pkg], { timeout: 30000 });
        send(res, 200, { ok: true, package: pkg, output: stdout || stderr });
      } catch (err) {
        send(res, 500, { ok: false, package: pkg, error: err.message });
      }
    } else if (['fix_issue', 'abort_agent', 'compact_context'].includes(action)) {
      const actionFile = path.join(ROOT, 'agent-actions.json');
      const record = { action, summary: payload.summary || null, requestedAt: new Date().toISOString() };
      await writeFile(actionFile, JSON.stringify(record, null, 2), 'utf8');
      send(res, 200, { ok: true, action, message: 'Aktion an Maschinengeist übermittelt.' });
    } else {
      send(res, 400, { ok: false, error: `Unbekannte Aktion: ${action}` });
    }
  } catch (err) {
    send(res, 500, { ok: false, error: 'Aktion fehlgeschlagen: ' + err.message });
  }
}

export function createServer({statusPath = path.join(ROOT, 'agent-status.json'), configPath = path.join(ROOT, 'config.json'), bindHost = '127.0.0.1'} = {}) {
  validateBindHost(bindHost);
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const port = res.socket.localPort;
    const allowedHosts = bindHost === '127.0.0.1' ? [`127.0.0.1:${port}`, `localhost:${port}`] : [`${bindHost}:${port}`];
    if (!allowedHosts.includes(req.headers.host) || (req.headers.origin && !allowedHosts.map(h => `http://${h}`).includes(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
      send(res, 403, {error: 'Nur freigegebene, gleichursprüngliche Anfragen sind erlaubt.'}); return;
    }
    const route = (req.url || '/').split('?')[0];
    if (req.method === 'POST') {
      if (route === '/api/action') {
        await handleAction(req, res, statusPath);
        return;
      }
      res.setHeader('Allow', 'GET, HEAD');
      send(res, 405, {error: 'Nur lesender Zugriff ist erlaubt.'});
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); send(res, 405, {error: 'Nur lesender Zugriff ist erlaubt.'}); return; }
    const head = req.method === 'HEAD';
    try {
      if (route === '/status.json') {
        let raw;
        try { raw = await boundedRead(statusPath); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          raw = await boundedRead(path.join(ROOT, 'agent-status.example.json'));
        }
        send(res, 200, parseStatus(raw), undefined, head);
      } else if (route === '/config.json') {
        const config = validateConfig(JSON.parse(await boundedRead(configPath)));
        send(res, 200, config, undefined, head);
      } else if (ROUTES.has(route)) {
        const [filename, type] = ROUTES.get(route);
        const isBinary = type.startsWith('image/') && !type.includes('svg');
        send(res, 200, await boundedRead(path.join(ROOT, filename), isBinary ? null : 'utf8'), type, head);
      } else if (route === '/favicon.ico') { res.writeHead(204); res.end(); }
      else send(res, 404, {error: 'Route nicht freigegeben.'}, undefined, head);
    } catch {
      // File content, absolute error paths and environment data must not leak.
      send(res, 422, {error: route === '/config.json' ? 'Konfiguration ungültig oder nicht lesbar. config.json prüfen.' : 'Quelle ungültig oder nicht lesbar. JSON, schemaVersion und Dateigröße prüfen.'}, undefined, head);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let port = 4318;
  let bindHost = '127.0.0.1';
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    let invalid = !['--port', '--host'].includes(flag) || !value || seen.has(flag) ||
      (flag === '--port' && (!/^\d+$/.test(value) || +value > 65535));
    if (flag === '--host' && !invalid) {
      try { validateBindHost(value); } catch { invalid = true; }
    }
    if (invalid) {
      console.error('Verwendung: node server.mjs [--port 0..65535] [--host <private-IPv4|127.0.0.1>]'); process.exitCode = 1;
      break;
    }
    seen.add(flag);
    if (flag === '--port') port = Number(value);
    else bindHost = value;
  }
  if (!process.exitCode) {
    const server = createServer({bindHost});
    server.on('error', error => { console.error(`Start fehlgeschlagen (${error.code || 'Serverfehler'}). Adresse, Port oder Firewall prüfen.`); process.exitCode = 1; });
    server.listen(port, bindHost, () => console.log(`Agent Observatory: http://${bindHost}:${server.address().port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { process.exitCode = 0; }));
  }
}
