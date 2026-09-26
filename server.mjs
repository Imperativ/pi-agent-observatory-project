import http from 'node:http';
import {isIP} from 'node:net';
import {readFile, stat, realpath} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
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
async function boundedRead(filename) {
  const [realRoot, realFile] = await Promise.all([realpath(ROOT), realpath(filename)]);
  const relative = path.relative(realRoot, realFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Datei liegt außerhalb des Projektordners.');
  if ((await stat(realFile)).size > MAX_BYTES) throw new Error('Datei überschreitet 256 KiB.');
  const text = await readFile(realFile, 'utf8');
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Datei überschreitet 256 KiB.');
  return text;
}
function send(res, status, body, type = 'application/json; charset=utf-8', head = false) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {'Content-Type': type, 'Content-Length': Buffer.byteLength(data)});
  res.end(head ? undefined : data);
}
export function createServer({statusPath = path.join(ROOT, 'agent-status.json'), configPath = path.join(ROOT, 'config.json'), bindHost = '127.0.0.1'} = {}) {
  validateBindHost(bindHost);
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const port = res.socket.localPort;
    const allowedHosts = bindHost === '127.0.0.1' ? [`127.0.0.1:${port}`, `localhost:${port}`] : [`${bindHost}:${port}`];
    if (!allowedHosts.includes(req.headers.host) || (req.headers.origin && !allowedHosts.map(h => `http://${h}`).includes(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
      send(res, 403, {error: 'Nur freigegebene, gleichursprüngliche Anfragen sind erlaubt.'}); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); send(res, 405, {error: 'Nur lesender Zugriff ist erlaubt.'}); return; }
    const head = req.method === 'HEAD';
    // Exact route matching: no filesystem paths or normalization of traversal input.
    const route = (req.url || '/').split('?')[0];
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
        send(res, 200, await boundedRead(path.join(ROOT, filename)), type, head);
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
