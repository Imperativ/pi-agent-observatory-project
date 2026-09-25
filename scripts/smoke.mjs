import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
// Invoke precisely the documented npm start command, with an ephemeral port.
const npmCli = process.env.npm_execpath;
const child = npmCli
  ? spawn(process.execPath, [npmCli, 'start', '--', '--port', '0'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']})
  : spawn(process.execPath, ['server.mjs', '--port', '0'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
let output = '';
let timer;
try {
  const url = await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Serverstart hat 15 Sekunden überschritten.')), 15000);
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server vorzeitig beendet (${code}). ${output}`)));
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/Agent Observatory: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
  });
  clearTimeout(timer);
  for (const route of ['/', '/styles.css', '/app.mjs', '/src/render.mjs', '/src/contract.mjs', '/src/store.mjs', '/status.json', '/config.json']) {
    const response = await fetch(url + route);
    assert.equal(response.status, 200, `${route}: ${await response.text()}`);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    console.log(`HTTP 200 ${route}`);
  }
  const status = await (await fetch(url + '/status.json')).json();
  assert.equal(status.schemaVersion, '1.0');
  assert.ok(['sample', 'live', 'unavailable'].includes(status.dataset));
  for (const route of ['/.git/config', '/package.json', '/agent-status.json', '/agent-status.example.json']) assert.equal((await fetch(url + route)).status, 404);
  assert.equal((await fetch(url + '/status.json', {headers: {Origin: 'https://example.invalid'}})).status, 403);
  assert.equal((await fetch(url + '/status.json', {method: 'POST'})).status, 405);
  console.log(`Smoke bestanden: ${npmCli ? 'npm start -- --port 0' : 'node server.mjs --port 0'}, erlaubte Routen erreichbar, private Routen/Origin/Schreiben blockiert.`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  clearTimeout(timer);
  if (process.platform === 'win32') {
    // npm spawns the server as a descendant; terminate this test's own process tree.
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore'});
    await once(killer, 'exit').catch(() => {});
  } else {
    child.kill('SIGTERM');
  }
}
