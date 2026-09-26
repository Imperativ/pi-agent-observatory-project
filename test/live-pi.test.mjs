import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLiveSnapshot, createLiveWriter} from '../scripts/live-pi-writer.mjs';
import {createLiveExtension, sessionUsage, workspaceFacts} from '../pi-dashboard-extension.mjs';
import {writePiSnapshot} from '../scripts/generate-pi-status.mjs';
import {parseStatus} from '../src/contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const time = new Date('2026-01-01T12:00:00Z');
const exec = promisify(execFile);

async function fixture(run) {
  const dir = await mkdtemp(path.join(root, '.test-tmp-live-'));
  try { await run(dir); } finally { await rm(dir, {recursive: true, force: true}); }
}

test('live writer whitelists model, tools and measured context without prompt or credential data', () => {
  const snapshot = createLiveSnapshot({now: time, state: 'working', mode: 'tui',
    model: {provider: 'openai', id: 'gpt-5.1', contextWindow: 64000, apiKey: 'PRIVATE_SECRET'},
    tools: ['read', 'bash', 'token=PRIVATE_SECRET', 'sk-abcdefghijklmnop', 'Bearer/DEMO_PRIVATE'], context: {tokens: 1200, contextWindow: 64000, prompt: 'PRIVATE_PROMPT'},
    prompt: 'PRIVATE_PROMPT'});
  assert.equal(snapshot.assignment.state.value, 'working');
  assert.equal(snapshot.identity.model.value, 'GPT (Modellfamilie)');
  assert.equal(snapshot.identity.provider.value, 'OpenAI');
  assert.deepEqual(snapshot.capabilities.tools.value, ['read', 'bash']);
  assert.equal(snapshot.usage.contextUsed.verification, 'unverified');
  assert.equal(snapshot.usage.contextUsed.value, 1200);
  assert.equal(snapshot.live.ended, false);
  for (const secret of ['PRIVATE_SECRET', 'PRIVATE_PROMPT', 'apiKey', 'sk-abcdefghijklmnop', 'Bearer/DEMO_PRIVATE']) assert.equal(JSON.stringify(snapshot).includes(secret), false);
  const custom = createLiveSnapshot({now: time, model: {provider: 'Bearer/DEMO_PRIVATE', id: 'Bearer/DEMO_PRIVATE'}});
  assert.equal(custom.identity.provider.value, 'Anderer Anbieter');
  assert.equal(custom.identity.model, undefined);
  assert.equal(JSON.stringify(custom).includes('DEMO_PRIVATE'), false);
  const withLimits = createLiveSnapshot({now: time, state: 'idle', rateLimits: {value: {fiveHour: {remainingPercent: 80}}, source: 'Manuelle Eingabe', observedAt: '2025-12-31T12:00:00Z'}});
  assert.equal(withLimits.usage.rateLimits.value.fiveHour.remainingPercent, 80);
  assert.equal(withLimits.usage.rateLimits.observedAt, '2025-12-31T12:00:00Z');
  assert.deepEqual(parseStatus(JSON.stringify(snapshot)).live, {source: 'pi_extension', ended: false});
  assert.equal(createLiveSnapshot({now: time, state: 'idle', ended: true}).assignment.state.value, 'idle');
  assert.throws(() => createLiveSnapshot({now: time, state: 'completed'}));
});

test('workspace metadata is opt-in, local only, and never reads a Git remote', async () => {
  const calls = [];
  const git = async (_binary, args) => {
    calls.push(args);
    return {stdout: args.includes('--show-toplevel') ? `${root}\n` : 'main\n'};
  };
  const workspace = await workspaceFacts(root, git);
  assert.deepEqual(calls.map(args => args.slice(3)), [['--show-toplevel'], ['--quiet', '--short', 'HEAD']]);
  assert.equal(workspace.cwd, root);
  assert.equal(workspace.repository, root);
  assert.equal(workspace.branch, 'main');
  const hidden = createLiveSnapshot({now: time});
  assert.equal(hidden.environment.cwd, undefined);
  const published = createLiveSnapshot({now: time, workspace});
  assert.equal(published.environment.cwd.value, root);
  assert.equal(published.environment.branch.value, 'main');
  assert.equal(calls.flat().some(value => /remote/i.test(value)), false);
  assert.deepEqual(await workspaceFacts('relative', git), null);
});

test('Pi-only enrichment reads numeric branch usage and allows only fixed lifecycle labels', () => {
  const input = {getBranch: () => [
    {type: 'message', message: {role: 'user', content: 'PRIVATE_PROMPT'}},
    {type: 'message', message: {role: 'assistant', content: 'PRIVATE_PROMPT', usage: {input: 10, output: 4}}},
    {type: 'usage', usage: {input: 3, output: 2}, note: 'PRIVATE_SECRET'},
    {type: 'message', message: {role: 'assistant', usage: {input: -1, output: 4}}},
  ]};
  assert.deepEqual(sessionUsage(input), {input: 13, output: 6});
  assert.equal(sessionUsage({getBranch: () => []}), null);
  const snapshot = createLiveSnapshot({now: time, startedAt: '2026-01-01T11:00:00Z', assignmentStartedAt: time.toISOString(),
    sessionTokens: sessionUsage(input), tools: ['bash', 'read', 'browser', 'PRIVATE_SECRET'],
    activity: [{time: time.toISOString(), summary: 'Agentenlauf gestartet', status: 'running'},
      {time: time.toISOString(), summary: 'PRIVATE_PROMPT', status: 'running'}]});
  const normalized = parseStatus(JSON.stringify(snapshot));
  assert.equal(normalized.identity.startedAt.value, '2026-01-01T11:00:00Z');
  assert.equal(normalized.assignment.startedAt.value, time.toISOString());
  assert.equal(normalized.usage.inputTokens.value, 13);
  assert.equal(normalized.usage.outputTokens.value, 6);
  assert.equal(normalized.capabilities.shell.value.startsWith('Pi-Shell'), true);
  assert.equal(normalized.capabilities.files.value.startsWith('Pi-Datei'), true);
  assert.equal(normalized.environment.runtimes.value[0].startsWith('Node.js '), true);
  assert.equal(normalized.activity.length, 1);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE_'), false);
});

test('single live writer owns lock, serializes updates, retains last good status and releases on close', async () => fixture(async dir => {
  const target = path.join(dir, 'agent-status.json');
  await writeFile(target, 'OLD_STATUS');
  const writer = await createLiveWriter(dir);
  try {
    await assert.rejects(createLiveWriter(dir), /Statussperre/);
    await assert.rejects(writePiSnapshot({schemaVersion: '1.0', dataset: 'live', observedAt: time.toISOString()}, dir));
    const first = writer.publish({now: time, state: 'working'});
    const second = writer.publish({now: new Date(time.getTime() + 1000), state: 'idle'});
    await Promise.all([first, second]);
    const saved = await readFile(target, 'utf8');
    assert.equal(parseStatus(saved).assignment.state.value, 'idle');
    await assert.rejects(writer.publish({now: time, state: 'invalid'}));
    assert.equal(await readFile(target, 'utf8'), saved, 'Ungültiger Update darf den letzten gültigen Stand nicht beschädigen.');
    await writer.publish({now: new Date(time.getTime() + 2000), ended: true});
    assert.equal(parseStatus(await readFile(target, 'utf8')).live.ended, true);
  } finally { await writer.close(); }
  await assert.rejects(writer.publish({now: time}));
  assert.deepEqual(await readdir(dir), ['agent-status.json']);
  const next = await createLiveWriter(dir);
  await next.close();
}));

test('Pi lifecycle events distinguish work, UI wait, failure, settlement and shutdown', async () => {
  const handlers = new Map();
  const emitted = [];
  let closes = 0;
  createLiveExtension({on: (type, fn) => { handlers.set(type, fn); }, getActiveTools: () => ['read']}, async () => ({
    publish: async data => { emitted.push(createLiveSnapshot({...data, now: time})); },
    close: async () => { closes++; },
  }));
  const ctx = {isIdle: () => false, hasUI: false, model: {provider: 'openai', id: 'model-1'},
    getContextUsage: () => ({tokens: 100, contextWindow: 1000}), mode: 'tui',
    sessionManager: {getHeader: () => ({timestamp: time.toISOString()}), getBranch: () => [{type: 'message', message: {role: 'assistant', usage: {input: 15, output: 5}}}]}};
  const send = (name, event = {}) => handlers.get(name)(event, ctx);
  await send('session_start');
  assert.equal(emitted.at(-1).assignment.state.value, 'working');
  assert.equal(emitted.at(-1).identity.startedAt.value, time.toISOString());
  assert.equal(emitted.at(-1).usage.inputTokens.value, 15);
  await send('agent_start');
  await send('ui_prompt_start');
  assert.equal(emitted.at(-1).assignment.state.value, 'waiting');
  await send('ui_prompt_end');
  assert.equal(emitted.at(-1).assignment.state.value, 'working');
  await send('model_select', {model: {provider: 'anthropic', id: 'claude-sonnet-4-6'}});
  assert.equal(emitted.at(-1).identity.model.value, 'Claude (Modellfamilie)');
  await send('message_end', {message: {role: 'assistant', content: 'PRIVATE_PROMPT'}});
  assert.equal(JSON.stringify(emitted).includes('PRIVATE_PROMPT'), false);
  await send('agent_before_settle', {outcome: 'error'});
  await send('agent_settled');
  assert.equal(emitted.at(-1).assignment.state.value, 'failed');
  await send('agent_start');
  await send('agent_before_settle', {outcome: 'completed'});
  await send('agent_settled');
  assert.equal(emitted.at(-1).assignment.state.value, 'idle');
  await send('session_shutdown');
  assert.equal(emitted.at(-1).live.ended, true);
  assert.equal(closes, 1);
  await send('session_shutdown');
  assert.equal(closes, 1, 'Shutdown ist idempotent.');
});

test('/limits extension command sets and resets structured rate limits in live snapshot', async () => {
  const handlers = new Map();
  const commands = new Map();
  const emitted = [];
  const notifications = [];
  createLiveExtension({
    on: (type, fn) => { handlers.set(type, fn); },
    registerCommand: (name, opts) => { commands.set(name, opts); },
    getActiveTools: () => ['read']
  }, async () => ({
    publish: async data => { emitted.push(createLiveSnapshot({...data, now: time})); },
    close: async () => {},
  }));
  const ctx = {
    isIdle: () => true, hasUI: true, model: {provider: 'openai', id: 'gpt-5'},
    getContextUsage: () => undefined, mode: 'tui',
    ui: {notify: (msg, type) => notifications.push({msg, type})}
  };
  await handlers.get('session_start')({}, ctx);
  assert.equal(emitted.at(-1).usage, undefined);

  assert.ok(commands.has('limits'));
  await commands.get('limits').handler('80% 65% "17:30 UTC"', ctx);
  const snap = emitted.at(-1);
  assert.equal(snap.usage.rateLimits.value.fiveHour.remainingPercent, 80);
  assert.equal(snap.usage.rateLimits.value.weekly.remainingPercent, 65);
  assert.equal(snap.usage.rateLimits.value.fiveHour.resetsAt, '17:30 UTC');
  assert.equal(snap.usage.rateLimits.source, 'ChatGPT Web (manuelle Eingabe in Pi)');
  assert.ok(snap.usage.rateLimits.observedAt);
  assert.equal(emitted.at(-1).usage.rateLimits.observedAt, snap.usage.rateLimits.observedAt);

  await commands.get('limits').handler('reset', ctx);
  assert.equal(emitted.at(-1).usage, undefined);
});

test('manual quota edit does not refresh an older Pi snapshot or invent an OpenAI model', async () => fixture(async dir => {
  const target = path.join(dir, 'agent-status.json');
  await writeFile(target, JSON.stringify(createLiveSnapshot({now: time, ended: true})));
  await exec(process.execPath, [path.join(root, 'scripts/update-limits.mjs'), '--status', target, '--5h', '75']);
  const result = parseStatus(await readFile(target, 'utf8'));
  assert.equal(result.observedAt, time.toISOString());
  assert.equal(result.usage.rateLimits.value.fiveHour.remainingPercent, 75);
  assert.notEqual(result.usage.rateLimits.observedAt, time.toISOString());
  const fresh = path.join(dir, 'fresh', 'agent-status.json');
  await mkdir(path.dirname(fresh));
  await exec(process.execPath, [path.join(root, 'scripts/update-limits.mjs'), '--status', fresh, '--weekly', '30']);
  const quotaOnly = parseStatus(await readFile(fresh, 'utf8'));
  assert.equal(quotaOnly.identity.provider.value, null);
  assert.equal(quotaOnly.identity.model.value, null);
}));

test('invalid live metadata never becomes an unvalidated health claim', () => {
  for (const live of [false, {}, {source: 'pi_extension', ended: 'false'}, {source: 'other', ended: false}]) {
    assert.throws(() => parseStatus(JSON.stringify({schemaVersion: '1.0', dataset: 'live', observedAt: time.toISOString(), live})), /live/);
  }
  assert.throws(() => parseStatus(JSON.stringify({schemaVersion: '1.0', dataset: 'sample', observedAt: time.toISOString(), live: {source: 'pi_extension', ended: false}})), /live/);
  assert.equal(parseStatus('{"schemaVersion":"1.0"}').live, null);
});
