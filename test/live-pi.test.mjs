import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLiveSnapshot, createLiveWriter} from '../scripts/live-pi-writer.mjs';
import {createLiveExtension, parseRateLimitHeaders} from '../pi-dashboard-extension.mjs';
import {writePiSnapshot} from '../scripts/generate-pi-status.mjs';
import {parseStatus} from '../src/contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const time = new Date('2026-01-01T12:00:00Z');

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
  const withLimits = createLiveSnapshot({now: time, state: 'idle', rateLimits: {fiveHour: {remainingPercent: 80}}});
  assert.equal(withLimits.usage.rateLimits.value.fiveHour.remainingPercent, 80);
  assert.deepEqual(parseStatus(JSON.stringify(snapshot)).live, {source: 'pi_extension', ended: false});
  assert.equal(createLiveSnapshot({now: time, state: 'idle', ended: true}).assignment.state.value, 'idle');
  assert.throws(() => createLiveSnapshot({now: time, state: 'completed'}));
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
    getContextUsage: () => ({tokens: 100, contextWindow: 1000}), mode: 'tui'};
  const send = (name, event = {}) => handlers.get(name)(event, ctx);
  await send('session_start');
  assert.equal(emitted.at(-1).assignment.state.value, 'working');
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

  await commands.get('limits').handler('reset', ctx);
  assert.equal(emitted.at(-1).usage, undefined);
});

test('invalid live metadata never becomes an unvalidated health claim', () => {
  for (const live of [false, {}, {source: 'pi_extension', ended: 'false'}, {source: 'other', ended: false}]) {
    assert.throws(() => parseStatus(JSON.stringify({schemaVersion: '1.0', dataset: 'live', observedAt: time.toISOString(), live})), /live/);
  }
  assert.throws(() => parseStatus(JSON.stringify({schemaVersion: '1.0', dataset: 'sample', observedAt: time.toISOString(), live: {source: 'pi_extension', ended: false}})), /live/);
  assert.equal(parseStatus('{"schemaVersion":"1.0"}').live, null);
});

test('parseRateLimitHeaders parses Anthropic, OpenAI and generic rate limit headers correctly', () => {
  assert.equal(parseRateLimitHeaders(null), null);
  assert.equal(parseRateLimitHeaders({}), null);

  // Anthropic format
  const anthropicHeaders = {
    'anthropic-ratelimit-requests-remaining': '950',
    'anthropic-ratelimit-requests-limit': '1000',
    'anthropic-ratelimit-tokens-remaining': '75000',
    'anthropic-ratelimit-tokens-limit': '100000',
    'anthropic-ratelimit-tokens-reset': '2m',
  };
  const anthropicParsed = parseRateLimitHeaders(anthropicHeaders, 'Anthropic');
  assert.equal(anthropicParsed.fiveHour.total, 100000);
  assert.equal(anthropicParsed.fiveHour.used, 25000);
  assert.equal(anthropicParsed.fiveHour.remainingPercent, 75);
  assert.ok(anthropicParsed.fiveHour.resetsAt);
  assert.match(anthropicParsed.detail, /Anthropic.*Tokens: 75000\/100000/);

  // OpenAI format
  const openaiHeaders = {
    'x-ratelimit-remaining-requests': '490',
    'x-ratelimit-limit-requests': '500',
    'x-ratelimit-remaining-tokens': '180000',
    'x-ratelimit-limit-tokens': '200000',
  };
  const openaiParsed = parseRateLimitHeaders(openaiHeaders, 'OpenAI');
  assert.equal(openaiParsed.fiveHour.total, 200000);
  assert.equal(openaiParsed.fiveHour.remainingPercent, 90);
  assert.match(openaiParsed.detail, /OpenAI/);

  // Headers object with .get()
  const mapHeaders = new Headers({
    'ratelimit-remaining': '80',
    'ratelimit-limit': '100',
  });
  const mapParsed = parseRateLimitHeaders(mapHeaders, 'Generic');
  assert.equal(mapParsed.fiveHour.remainingPercent, 80);
});

test('extension captures after_provider_response and triggers quota sync on agent_end / settled', async () => {
  const handlers = new Map();
  const emitted = [];
  let quotaFetches = 0;
  createLiveExtension({
    on: (type, fn) => { handlers.set(type, fn); },
    getActiveTools: () => ['read'],
  }, async () => ({
    publish: async data => { emitted.push(createLiveSnapshot({...data, now: time})); },
    close: async () => {},
  }), {
    fetchQuotaFn: async () => {
      quotaFetches++;
      return {
        fiveHour: {remainingPercent: 88, resetsAt: '2026-09-26T12:00:00Z'},
        weekly: {remainingPercent: 77, resetsAt: null},
        detail: 'Auto Quota Sync',
      };
    },
    quotaSyncIntervalMs: 0,
  });

  const ctx = {
    isIdle: () => false, hasUI: false,
    model: {provider: 'anthropic', id: 'claude-3-7-sonnet'},
    getContextUsage: () => ({tokens: 50, contextWindow: 200000}),
    mode: 'tui',
  };

  await handlers.get('session_start')({}, ctx);
  assert.equal(quotaFetches, 1, 'Initial quota fetch triggered at session start');
  assert.equal(emitted.at(-1).usage.rateLimits.value.fiveHour.remainingPercent, 88);

  // Provider response with rate limit headers
  await handlers.get('after_provider_response')({
    status: 200,
    headers: {
      'anthropic-ratelimit-tokens-remaining': '150000',
      'anthropic-ratelimit-tokens-limit': '200000',
    },
  }, ctx);

  const afterSnap = emitted.at(-1);
  assert.equal(afterSnap.usage.rateLimits.value.fiveHour.remainingPercent, 75);
  assert.match(afterSnap.usage.rateLimits.value.detail, /HTTP Rate-Limit-Header/);

  // agent_settled
  await handlers.get('agent_settled')({}, ctx);
  assert.equal(emitted.at(-1).assignment.state.value, 'idle');
});

