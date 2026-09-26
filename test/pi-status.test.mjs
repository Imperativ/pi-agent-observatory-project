import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {buildPiSnapshot, writePiSnapshot} from '../scripts/generate-pi-status.mjs';
import {parseStatus} from '../src/contract.mjs';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/generate-pi-status.mjs', import.meta.url));
const stamp = '2026-01-02T03:04:05.000Z';
const later = '2026-01-02T03:04:06.000Z';
const header = (overrides = {}) => ({type: 'session', version: 3, id: 'private-id', cwd: 'PRIVATE_WORKSPACE', timestamp: stamp, ...overrides});
const entry = (overrides = {}) => ({type: 'message', id: 'private-message', parentId: null, timestamp: later,
  message: {role: 'user', content: 'PRIVATE_PROMPT token=PRIVATE_SECRET', timestamp: 1767323046000}, ...overrides});
const jsonl = (...entries) => entries.map(value => JSON.stringify(value)).join('\n') + '\n';

async function fixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pi-observatory-export-'));
  const root = path.join(directory, 'sessions');
  const output = path.join(directory, 'output');
  await mkdir(root);
  await mkdir(output);
  const sessionPath = path.join(root, 'chosen.jsonl');
  try { await run({directory, root, output, sessionPath}); }
  finally { await rm(directory, {recursive: true, force: true}); }
}

test('explicit session yields only allowlisted anonymous metadata, not activity or apparent agent uptime', async () => fixture(async ({root, sessionPath}) => {
  await writeFile(sessionPath, jsonl(header(), entry(), {type: 'model_change', id: 'private-model-event', parentId: 'private-message', timestamp: later, provider: 'PRIVATE_PROVIDER', modelId: 'PRIVATE_MODEL'}));
  const snapshot = await buildPiSnapshot({sessionPath, sessionRoot: root});
  assert.deepEqual(snapshot, {schemaVersion: '1.0', dataset: 'live', observedAt: later,
    identity: {name: {value: 'Pi-Sitzung (anonymisiert)', source: 'Lokaler Pi-Session-Exporter', observedAt: later, verification: 'self_reported'}}});
  const serialized = JSON.stringify(snapshot);
  for (const secret of ['PRIVATE_WORKSPACE', 'PRIVATE_PROMPT', 'PRIVATE_SECRET', 'PRIVATE_PROVIDER', 'PRIVATE_MODEL', 'private-id']) {
    assert.equal(serialized.includes(secret), false);
  }
  const normalized = parseStatus(serialized);
  assert.equal(normalized.identity.startedAt.value, null);
  assert.equal(normalized.availability.activity, false, 'Nicht erhobene Aktivität ist nicht leer gemeldet.');
  assert.equal(normalized.identity.model.value, null);
}));

test('refuses missing, outside, symlinked, unversioned or malformed sessions', async () => fixture(async ({directory, root, sessionPath}) => {
  const outside = path.join(directory, 'outside.jsonl');
  await writeFile(outside, jsonl(header()));
  await assert.rejects(buildPiSnapshot({sessionPath: outside, sessionRoot: root}), /freigegebenen/);
  await assert.rejects(buildPiSnapshot({sessionPath: 'chosen.jsonl', sessionRoot: root}), /absoluter Pfad/);
  await assert.rejects(buildPiSnapshot({sessionPath, sessionRoot: root}), /nicht sicher gelesen/);
  const cases = [
    jsonl(header({version: 4})),
    jsonl(header({version: 1})),
    jsonl(header({version: null})),
    jsonl(header({id: ''})),
    jsonl(header({cwd: null})),
    jsonl(entry()),
    jsonl(header(), entry({message: undefined})),
    jsonl(header(), entry({message: {role: 'user', timestamp: 1767323046000}})),
    jsonl(header(), entry({id: undefined})),
    jsonl(header(), entry({timestamp: '2025-02-30T00:00:00Z'})),
    jsonl(header(), {type: 'future', timestamp: later}),
    jsonl(header(), {type: 'message', timestamp: later, message: 'SECRET'}).slice(0, -1),
    jsonl(header()) + '{bad json}\n',
    jsonl(header()) + '\n'
  ];
  for (const content of cases) {
    await writeFile(sessionPath, content);
    await assert.rejects(buildPiSnapshot({sessionPath, sessionRoot: root}));
  }
  await rm(sessionPath);
  try {
    await symlink(outside, sessionPath);
    await assert.rejects(buildPiSnapshot({sessionPath, sessionRoot: root}));
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
}));

test('bounded source rejects oversized logs without printing content', async () => fixture(async ({root, sessionPath}) => {
  await writeFile(sessionPath, jsonl(header()) + 'X'.repeat(16 * 1024 * 1024));
  await assert.rejects(buildPiSnapshot({sessionPath, sessionRoot: root}), /16 MiB/);
}));

test('exclusive atomic write preserves old status on errors, releases lock and cleans temporary files', async () => fixture(async ({root, output, sessionPath}) => {
  await writeFile(sessionPath, jsonl(header(), entry()));
  const snapshot = await buildPiSnapshot({sessionPath, sessionRoot: root});
  const target = path.join(output, 'agent-status.json');
  await writeFile(target, 'OLD_STATUS');
  await writePiSnapshot({...snapshot, private: {prompt: 'PRIVATE_SECRET'}, identity: {name: {value: 'PRIVATE_NAME', source: 'PRIVATE_SOURCE'}}}, output);
  const saved = await readFile(target, 'utf8');
  assert.equal(parseStatus(saved).observedAt, later);
  assert.equal(saved.includes('PRIVATE_'), false, 'Auch der öffentliche Writer verwirft alle zusätzlichen Felder.');
  await assert.rejects(writePiSnapshot({...snapshot, dataset: 'invalid'}, output), /Live-Snapshot/);
  assert.equal(await readFile(target, 'utf8'), saved);
  await writeFile(path.join(output, 'agent-status.lock'), 'locked');
  await assert.rejects(writePiSnapshot(snapshot, output), /nicht atomar geschrieben/);
  assert.equal(await readFile(target, 'utf8'), saved);
  assert.deepEqual((await readdir(output)).sort(), ['agent-status.json', 'agent-status.lock']);
}));

test('CLI dry-run checks selected fixture and never changes the actual project status file or echoes private text', async () => fixture(async ({root, sessionPath}) => {
  await writeFile(sessionPath, jsonl(header(), entry()));
  const target = fileURLToPath(new URL('../agent-status.json', import.meta.url));
  const metadata = async () => stat(target).then(({size, mtimeMs, ino}) => ({size, mtimeMs, ino}), error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const before = await metadata();
  const {stdout, stderr} = await exec(process.execPath, [script, '--session', sessionPath, '--session-root', root, '--dry-run']);
  assert.match(stdout, /Dry-run/);
  assert.equal(stderr, '');
  assert.equal(stdout.includes('PRIVATE_'), false);
  assert.deepEqual(await metadata(), before, 'Dry-run darf das tatsächliche Projektziel nicht ändern.');
  await writeFile(sessionPath, '{PRIVATE_SECRET}\n');
  const failure = await exec(process.execPath, [script, '--session', sessionPath, '--session-root', root, '--dry-run']).catch(error => error);
  assert.notEqual(failure.code, 0);
  assert.equal((failure.stderr + failure.stdout).includes('PRIVATE_SECRET'), false);
}));
