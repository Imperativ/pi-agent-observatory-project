import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer, validateConfig, DEFAULT_CONFIG} from '../server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = () => ({schemaVersion: '1.0', dataset: 'live', observedAt: '2026-01-01T12:00:00Z', assignment: {goal: {value: 'Initial goal', source: 'test', observedAt: '2026-01-01T12:00:00Z', verification: 'self_reported'}}});
async function fixture(t) {
  const dir = await mkdtemp(path.join(root, '.test-tmp-http-'));
  const statusPath = path.join(dir, 'status.json');
  const configPath = path.join(dir, 'config.json');
  await writeFile(statusPath, JSON.stringify(snapshot()));
  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG));
  const server = createServer({statusPath, configPath});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await rm(dir, {recursive: true, force: true}); });
  return {url: `http://127.0.0.1:${port}`, port, statusPath, configPath};
}
function raw(port, route, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path: route, method, headers}, res => {
      let body = ''; res.on('data', part => { body += part; }); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
    }); req.on('error', reject); req.end();
  });
}

test('HTTP status updates without server restart; malformed and unsupported live files do not silently fall back', async t => {
  const f = await fixture(t);
  let response = await fetch(f.url + '/status.json');
  assert.equal(response.status, 200);
  let data = await response.json();
  assert.equal(data.assignment.goal.value, 'Initial goal');
  assert.equal(data.availability.issues, false);
  const updated = snapshot(); updated.assignment.goal.value = 'Updated goal';
  await writeFile(f.statusPath, JSON.stringify(updated));
  data = await (await fetch(f.url + '/status.json')).json();
  assert.equal(data.assignment.goal.value, 'Updated goal');
  assert.equal(data.observedAt, updated.observedAt);
  for (const bad of ['{bad JSON', '{"schemaVersion":"2.0"}', '[]']) {
    await writeFile(f.statusPath, bad);
    response = await fetch(f.url + '/status.json');
    assert.equal(response.status, 422);
    assert.equal((await response.json()).schemaVersion, undefined);
  }
  await writeFile(f.statusPath, JSON.stringify(snapshot()));
  assert.equal((await fetch(f.url + '/status.json')).status, 200);
  await rm(f.statusPath);
  data = await (await fetch(f.url + '/status.json')).json();
  assert.equal(data.dataset, 'sample');
});

test('Only allowlisted routes, hosts, origins and read methods are accepted', async t => {
  const f = await fixture(t);
  for (const route of ['/.git/config', '/README.md', '/package.json', '/agent-status.json', '/agent-status.example.json', '/config.json.bak', '/%2e%2e/server.mjs', '/../server.mjs', '/src/../../server.mjs']) assert.equal((await raw(f.port, route)).status, 404, route);
  assert.equal((await raw(f.port, '/status.json', {host: 'evil.example'})).status, 403);
  assert.equal((await raw(f.port, '/status.json', {origin: 'https://evil.example'})).status, 403);
  assert.equal((await raw(f.port, '/status.json', {'sec-fetch-site': 'cross-site'})).status, 403);
  assert.equal((await raw(f.port, '/status.json', {}, 'POST')).status, 405);
  const head = await raw(f.port, '/status.json', {}, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.match(head.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(head.headers['cache-control'], 'no-store');
  assert.equal(head.headers['access-control-allow-origin'], undefined);
});

test('Server redacts before transmission and excludes unrecognized data; body is bounded', async t => {
  const f = await fixture(t);
  const data = snapshot();
  data.apiKey = 'extremely-secret'; data.other = 'never-public';
  data.assignment.goal.value = 'token=DO_NOT_RENDER sk-abcdefghijklmnop';
  await writeFile(f.statusPath, JSON.stringify(data));
  let response = await fetch(f.url + '/status.json');
  const body = await response.text();
  for (const secret of ['extremely-secret', 'never-public', 'DO_NOT_RENDER', 'sk-abcdefghijklmnop']) assert.equal(body.includes(secret), false);
  assert.ok(body.includes('[REDACTED]'));
  await writeFile(f.statusPath, 'x'.repeat(256 * 1024 + 1));
  response = await fetch(f.url + '/status.json');
  assert.equal(response.status, 422);
  assert.equal((await response.text()).includes(root), false);
});

test('Config validates ranges and drops unknown keys, invalid config gives recoverable HTTP error', async t => {
  assert.deepEqual(validateConfig({}), DEFAULT_CONFIG);
  for (const value of [null, [], {timeoutMs: 0}, {pollIntervalMs: 12.5}, {clockSkewMs: -1}, {staleAfterMs: Infinity}]) assert.throws(() => validateConfig(value));
  assert.deepEqual(validateConfig({...DEFAULT_CONFIG, unknown: 'private'}), DEFAULT_CONFIG);
  const f = await fixture(t);
  assert.deepEqual(await (await fetch(f.url + '/config.json')).json(), DEFAULT_CONFIG);
  await writeFile(f.configPath, '{"pollIntervalMs":0}');
  assert.equal((await fetch(f.url + '/config.json')).status, 422);
});
