import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer, validateBindHost, validateConfig, DEFAULT_CONFIG} from '../server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = () => ({schemaVersion: '1.0', dataset: 'live', observedAt: '2026-01-01T12:00:00Z', assignment: {goal: {value: 'Initial goal', source: 'test', observedAt: '2026-01-01T12:00:00Z', verification: 'self_reported'}}});
async function fixture(t, bindHost = '127.0.0.1') {
  const dir = await mkdtemp(path.join(root, '.test-tmp-http-'));
  const statusPath = path.join(dir, 'status.json');
  const configPath = path.join(dir, 'config.json');
  await writeFile(statusPath, JSON.stringify(snapshot()));
  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG));
  const server = createServer({statusPath, configPath, bindHost});
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

test('LAN mode accepts only an explicit private IPv4 Host and same-origin request', async t => {
  for (const host of ['127.0.0.1', '10.4.5.6', '172.16.0.1', '172.31.255.254', '192.168.1.27']) assert.equal(validateBindHost(host), host);
  for (const host of ['0.0.0.0', 'localhost', '::1', '169.254.1.2', '172.15.255.255', '172.32.0.1', '8.8.8.8', '1.2.3.4', '192.169.1.1']) assert.throws(() => validateBindHost(host), host);
  assert.throws(() => createServer({bindHost: '0.0.0.0'}));
  const f = await fixture(t, '192.168.1.27');
  const host = `192.168.1.27:${f.port}`;
  assert.equal((await raw(f.port, '/status.json', {host})).status, 200);
  assert.equal((await raw(f.port, '/status.json', {host, origin: `http://${host}`})).status, 200);
  assert.equal((await raw(f.port, '/status.json', {host: `127.0.0.1:${f.port}`})).status, 403);
  assert.equal((await raw(f.port, '/status.json', {host, origin: `http://127.0.0.1:${f.port}`})).status, 403);
  assert.equal((await raw(f.port, '/status.json', {host, 'sec-fetch-site': 'cross-site'})).status, 403);
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

test('POST /api/action executes allowed commands with same-origin validation', async t => {
  const f = await fixture(t);
  // Cross-origin rejected
  const cross = await fetch(f.url + '/api/action', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Origin': 'http://evil.com'},
    body: JSON.stringify({action: 'fix_issue'})
  });
  assert.equal(cross.status, 403);

  // Missing or invalid action
  const badAction = await fetch(f.url + '/api/action', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({})
  });
  assert.equal(badAction.status, 400);

  // Allowed action
  const allowed = await fetch(f.url + '/api/action', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'fix_issue', summary: 'Blocker beheben'})
  });
  assert.equal(allowed.status, 200);
  const json = await allowed.json();
  assert.equal(json.ok, true);

  // POST to status.json is still 405
  const postStatus = await fetch(f.url + '/status.json', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'test'})
  });
  assert.equal(postStatus.status, 405);
});

test('Server serves allowlisted visual asset SVGs correctly', async t => {
  const f = await fixture(t);
  const assets = [
    '/assets/skull-cog.svg',
    '/assets/purity-seal.svg',
    '/assets/schematic-gears.svg',
    '/assets/schematic-eye.svg',
    '/assets/schematic-skull.svg',
    '/assets/mech-footer-plinth.svg',
    '/assets/hud-bracket.svg',
    '/assets/corner-rivet.svg'
  ];
  for (const asset of assets) {
    const res = await fetch(f.url + asset);
    assert.equal(res.status, 200, asset);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    const text = await res.text();
    assert.ok(text.includes('<svg'), `${asset} should contain svg element`);
  }

  const jpgs = [
    '/assets/skull-cog-medallion.jpg',
    '/assets/schematic-eye.jpg',
    '/assets/schematic-skull.jpg',
    '/assets/purity-seal.jpg'
  ];
  for (const jpg of jpgs) {
    const res = await fetch(f.url + jpg);
    assert.equal(res.status, 200, jpg);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 1000, `${jpg} should contain binary image data`);
  }
});

