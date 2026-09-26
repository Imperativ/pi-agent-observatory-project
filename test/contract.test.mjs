import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  SCHEMA_VERSION, STATES, CHECK_STATES, FIELD_LABELS,
  parseStatus, normalizeStatus, freshness, uptime, redact,
} from '../src/contract.mjs';

const TIME = '2026-01-01T12:00:00Z';
const NOW = Date.parse(TIME);
const base = (patch = {}) => ({schemaVersion: '1.0', dataset: 'live', observedAt: TIME, ...patch});
const measurement = (value, patch = {}) => ({value, source: 'Deterministic test fixture', observedAt: TIME, verification: 'self_reported', ...patch});
const unavailable = {value: null, source: null, observedAt: null, verification: 'unavailable'};
const listNames = ['activity', 'artifacts', 'checks', 'issues'];
const activity = (patch = {}) => ({id: 'a1', time: TIME, category: 'test', summary: 'Fixture, not a real check run', status: 'info', source: 'Test fixture', verification: 'self_reported', ...patch});
const evidence = (patch = {}) => ({command: 'node --test fixture.mjs', exitCode: 0, finishedAt: TIME, source: 'Synthetic test evidence, not an attestation', ...patch});

const fields = {
  identity: ['name', 'provider', 'model', 'modelVersion', 'sessionId', 'startedAt', 'uptimeSeconds'],
  assignment: ['goal', 'step', 'state', 'progress', 'startedAt'],
  capabilities: ['tools', 'skills', 'subagents', 'browser', 'shell', 'files', 'network', 'images'],
  environment: ['cwd', 'repository', 'branch', 'os', 'runtimes', 'executionMode'],
  permissions: ['readAreas', 'writeAreas', 'network', 'approvalMode', 'restrictions', 'missingCredentials'],
  usage: ['contextWindow', 'contextUsed', 'inputTokens', 'outputTokens', 'cost', 'rateLimits'],
};
const listFields = new Set(['tools', 'skills', 'runtimes', 'readAreas', 'writeAreas', 'restrictions', 'missingCredentials']);
const numberFields = new Set(['uptimeSeconds', 'contextWindow', 'contextUsed', 'inputTokens', 'outputTokens', 'cost']);

function validValue(field) {
  if (listFields.has(field)) return ['explicit item'];
  if (numberFields.has(field)) return 0;
  if (field === 'state') return 'working';
  if (field === 'startedAt') return TIME;
  if (field === 'progress') return {completed: 1, total: 2, basis: '1 of 2 equal steps'};
  return 'explicit text';
}

test('public labels and stable state vocabularies cover the contract', () => {
  assert.equal(SCHEMA_VERSION, '1.0');
  assert.deepEqual(STATES, ['idle', 'working', 'waiting', 'blocked', 'failed', 'completed']);
  assert.deepEqual(CHECK_STATES, ['not_run', 'running', 'passed', 'failed', 'unknown']);
  assert.deepEqual(Object.keys(FIELD_LABELS), Object.keys(fields));
  for (const [section, names] of Object.entries(fields)) {
    assert.deepEqual(Object.keys(FIELD_LABELS[section]), names);
    for (const label of Object.values(FIELD_LABELS[section])) assert.ok(label.trim());
  }
});

test('shipped sample parses without inventing live model, usage or executed checks', async () => {
  const text = await readFile(new URL('../agent-status.example.json', import.meta.url), 'utf8');
  const status = parseStatus(text);
  assert.equal(status.dataset, 'sample');
  assert.equal(status.observedAt, JSON.parse(text).observedAt);
  assert.match(status.identity.name.value, /Demonstration/);
  assert.equal(status.identity.model.value, null);
  assert.equal(status.usage.cost.value, null);
  assert.equal(status.checks.some(check => check.status === 'passed'), false);
  assert.deepEqual(status.warnings, []);
  assert.deepEqual(normalizeStatus(status), status);
});

test('minimal snapshot marks every measurement and missing collection unavailable', () => {
  const status = parseStatus('{"schemaVersion":"1.0"}');
  assert.equal(status.dataset, 'unavailable');
  assert.equal(status.observedAt, null);
  for (const [section, names] of Object.entries(fields)) {
    for (const name of names) assert.deepEqual(status[section][name], unavailable, `${section}.${name}`);
  }
  for (const name of listNames) {
    assert.deepEqual(status[name], []);
    assert.equal(status.availability[name], false);
  }
  assert.ok(status.warnings.length > 0);
});

test('explicit empty lists differ from absent or null lists, also after a wire roundtrip', () => {
  for (const name of listNames) {
    for (const value of [undefined, null, []]) {
      const status = normalizeStatus(base({[name]: value}));
      assert.deepEqual(status[name], []);
      assert.equal(status.availability[name], Array.isArray(value), name);
      assert.deepEqual(parseStatus(JSON.stringify(status)), status);
    }
  }
});

test('empty source, malformed JSON and invalid root types are recoverable errors without payloads', () => {
  for (const text of ['', ' ', '{', '{"password":"DO_NOT_ECHO",', 'undefined']) {
    assert.throws(() => parseStatus(text), error => /JSON/.test(error.message) && !error.message.includes('DO_NOT_ECHO'));
  }
  for (const text of ['null', '[]', '1', 'true', '"text"']) assert.throws(() => parseStatus(text), /Objekt/);
  for (const input of [undefined, null, {}, 42]) assert.throws(() => parseStatus(input), /Statusquelle/);
});

test('schema version is required and exact; dataset is never guessed live', () => {
  for (const version of [undefined, null, 1, '1', '2.0', '1.0 ']) {
    assert.throws(() => normalizeStatus(base({schemaVersion: version})), /schemaVersion/);
  }
  for (const dataset of [undefined, null, '', 'LIVE', 'other', 1]) {
    assert.equal(normalizeStatus(base({dataset})).dataset, 'unavailable');
  }
  for (const dataset of ['sample', 'live']) assert.equal(normalizeStatus(base({dataset})).dataset, dataset);
});

test('malformed section and collection containers reject instead of hiding corruption', () => {
  for (const section of Object.keys(fields)) {
    for (const value of [[], 'text', 7, false]) assert.throws(() => normalizeStatus(base({[section]: value})), new RegExp(section));
    assert.deepEqual(normalizeStatus(base({[section]: null}))[section], normalizeStatus(base())[section]);
  }
  for (const name of listNames) {
    for (const value of [{}, 'text', 7, false]) assert.throws(() => normalizeStatus(base({[name]: value})), new RegExp(name));
  }
});

test('every section accepts its documented measurement types and discards unknown fields', () => {
  const input = base({unknownRoot: 'discard'});
  for (const [section, names] of Object.entries(fields)) {
    input[section] = {unknownField: 'discard'};
    for (const name of names) input[section][name] = measurement(validValue(name), {extraMetadata: 'discard'});
  }
  const before = structuredClone(input);
  const status = normalizeStatus(input);
  for (const [section, names] of Object.entries(fields)) {
    assert.equal('unknownField' in status[section], false);
    for (const name of names) assert.deepEqual(status[section][name], measurement(validValue(name)), `${section}.${name}`);
  }
  assert.equal('unknownRoot' in status, false);
  assert.deepEqual(input, before, 'normalization must not mutate the writer object');
  assert.deepEqual(status.warnings, []);
});

test('raw scalar/array measurements and invalid optional values become unavailable, not estimates', () => {
  for (const raw of ['model-name', 4, false, [], null, {}, {value: {nested: 'bad'}}]) {
    assert.equal(normalizeStatus(base({identity: {model: raw}})).identity.model.value, null);
  }
  for (const value of ['', '  ', 12, false, []]) {
    const status = normalizeStatus(base({identity: {name: measurement(value)}}));
    assert.equal(status.identity.name.verification, 'unavailable');
    assert.ok(status.warnings.length > 0);
  }
  assert.equal(normalizeStatus(base({identity: {name: measurement('hidden', {verification: 'unavailable'})}})).identity.name.value, null);
});

test('rateLimits accepts clean strings and structured quota windows (fiveHour, weekly)', () => {
  const textLimit = normalizeStatus(base({usage: {rateLimits: measurement('500 RPM, 30k TPM')}})).usage.rateLimits;
  assert.equal(textLimit.value, '500 RPM, 30k TPM');

  const structured = normalizeStatus(base({
    usage: {
      rateLimits: measurement({
        fiveHour: {used: 20, total: 100, resetsAt: TIME},
        weekly: {remainingPercent: 65, resetText: 'Sonntag 00:00'},
        detail: 'ChatGPT Plus Limits'
      })
    }
  })).usage.rateLimits;

  assert.deepEqual(structured.value, {
    fiveHour: {used: 20, total: 100, remainingPercent: 80, resetsAt: TIME},
    weekly: {used: null, total: null, remainingPercent: 65, resetsAt: 'Sonntag 00:00'},
    detail: 'ChatGPT Plus Limits'
  });

  const invalid = normalizeStatus(base({
    usage: {
      rateLimits: measurement({fiveHour: {used: -5, total: 'invalid'}})
    }
  })).usage.rateLimits;
  assert.equal(invalid.value, null);
  assert.equal(invalid.verification, 'unavailable');
});

test('numeric measurements are finite nonnegative numbers, not numeric strings or booleans', () => {
  for (const [section, names] of Object.entries(fields)) {
    for (const field of names.filter(name => numberFields.has(name))) {
      for (const value of [-1, NaN, Infinity, -Infinity, '42', true, {}]) {
        const normalized = normalizeStatus(base({[section]: {[field]: measurement(value)}}))[section][field];
        assert.equal(normalized.value, null, `${section}.${field}: ${String(value)}`);
        assert.equal(normalized.verification, 'unavailable');
      }
      for (const value of [0, 1.5, 123456]) {
        assert.equal(normalizeStatus(base({[section]: {[field]: measurement(value)}}))[section][field].value, value);
      }
    }
  }
});

test('list measurements preserve explicit emptiness, filter nontext entries and reject nonlists', () => {
  for (const [section, names] of Object.entries(fields)) {
    for (const field of names.filter(name => listFields.has(name))) {
      const normalize = value => normalizeStatus(base({[section]: {[field]: measurement(value)}}))[section][field];
      assert.deepEqual(normalize([]).value, []);
      assert.deepEqual(normalize(['first', '', ' ', 4, null, {}, 'second']).value, ['first', 'second']);
      assert.equal(normalize('first,second').value, null);
    }
  }
});

test('provenance downgrades claims with missing/invalid source or observation time', () => {
  for (const verification of ['verified', 'self_reported']) {
    for (const patch of [{source: undefined}, {source: ' '}, {source: 7}, {observedAt: null}, {observedAt: '2026-02-30T00:00:00Z'}]) {
      const status = normalizeStatus(base({identity: {name: measurement('agent', {verification, ...patch})}}));
      assert.equal(status.identity.name.value, 'agent');
      assert.equal(status.identity.name.verification, 'unverified');
      assert.ok(status.warnings.some(warning => /Herkunft/.test(warning)));
    }
    assert.equal(normalizeStatus(base({identity: {name: measurement('agent', {verification})}})).identity.name.verification, verification);
  }
  assert.equal(normalizeStatus(base({identity: {name: measurement('agent', {verification: 'trusted'})}})).identity.name.verification, 'unverified');
  assert.equal(normalizeStatus(base({identity: {name: {value: 'agent'}}})).identity.name.verification, 'unverified');
});

test('progress requires a positive bounded denominator and an explicit calculation basis', () => {
  for (const value of [
    {completed: -1, total: 4, basis: 'steps'}, {completed: 5, total: 4, basis: 'steps'},
    {completed: 0, total: 0, basis: 'steps'}, {completed: 1, total: -1, basis: 'steps'},
    {completed: Infinity, total: Infinity, basis: 'steps'}, {completed: NaN, total: 4, basis: 'steps'},
    {completed: 1, total: Infinity, basis: 'steps'}, {completed: '1', total: 4, basis: 'steps'},
    {completed: 1, total: '4', basis: 'steps'}, {completed: 1, total: 4},
    {completed: 1, total: 4, basis: ' '}, {completed: 1, total: 4, basis: 3}, 50,
  ]) {
    const status = normalizeStatus(base({assignment: {progress: measurement(value)}}));
    assert.equal(status.assignment.progress.value, null);
    assert.ok(status.warnings.some(warning => warning.includes('progress')));
  }
  for (const value of [{completed: 0, total: 4, basis: 'steps'}, {completed: 4, total: 4, basis: 'steps'}, {completed: 0.5, total: 1, basis: 'weighted units'}]) {
    assert.deepEqual(normalizeStatus(base({assignment: {progress: measurement(value)}})).assignment.progress.value, value);
  }
});

test('agent states are exact and do not silently default to success or idle', () => {
  for (const value of STATES) assert.equal(normalizeStatus(base({assignment: {state: measurement(value)}})).assignment.state.value, value);
  for (const value of ['passed', 'WORKING', '', null, 1]) assert.equal(normalizeStatus(base({assignment: {state: measurement(value)}})).assignment.state.value, null);
});

const freshnessCases = [
  ['current', TIME, NOW, 'fresh', 0],
  ['past', '2026-01-01T11:59:59Z', NOW, 'fresh', 1000],
  ['threshold inclusive', '2026-01-01T11:58:00Z', NOW, 'fresh', 120000],
  ['threshold exceeded', '2026-01-01T11:57:59.999Z', NOW, 'stale', 120001],
  ['old dates remain stale', '1999-01-01T00:00:00Z', NOW, 'stale', NOW - Date.parse('1999-01-01T00:00:00Z')],
  ['timezone equivalence', '2026-01-01T13:00:00+01:00', NOW, 'fresh', 0],
  ['negative timezone', '2026-01-01T07:00:00-05:00', NOW, 'fresh', 0],
  ['tolerated future', '2026-01-01T12:00:05Z', NOW, 'fresh', 0],
  ['future beyond skew', '2026-01-01T12:00:05.001Z', NOW, 'unknown', null],
  ['missing', undefined, NOW, 'unknown', null],
  ['null', null, NOW, 'unknown', null],
  ['blank', '', NOW, 'unknown', null],
  ['non-string', NOW, NOW, 'unknown', null],
  ['unparseable', 'tomorrow', NOW, 'unknown', null],
  ['date only', '2026-01-01', NOW, 'unknown', null],
  ['no timezone', '2026-01-01T12:00:00', NOW, 'unknown', null],
  ['invalid calendar', '2026-02-30T12:00:00Z', NOW, 'unknown', null],
  ['non-leap century', '1900-02-29T12:00:00Z', NOW, 'unknown', null],
  ['invalid month', '2026-13-01T12:00:00Z', NOW, 'unknown', null],
  ['zero day', '2026-01-00T12:00:00Z', NOW, 'unknown', null],
  ['invalid hour', '2026-01-01T24:00:00Z', NOW, 'unknown', null],
  ['invalid minute', '2026-01-01T12:60:00Z', NOW, 'unknown', null],
  ['invalid second', '2026-01-01T12:00:60Z', NOW, 'unknown', null],
  ['invalid zone hour', '2026-01-01T12:00:00+24:00', NOW, 'unknown', null],
  ['invalid zone minute', '2026-01-01T12:00:00+01:60', NOW, 'unknown', null],
  ['invalid local clock', TIME, NaN, 'unknown', null],
  ['infinite local clock', TIME, Infinity, 'unknown', null],
  ['valid leap day', '2024-02-29T12:00:00Z', Date.parse('2024-02-29T12:00:00Z'), 'fresh', 0],
  ['valid leap century', '2000-02-29T12:00:00Z', Date.parse('2000-02-29T12:00:00Z'), 'fresh', 0],
];
for (const [name, timestamp, now, state, ageMs] of freshnessCases) {
  test(`freshness: ${name}`, () => {
    const result = freshness(timestamp, now, {staleAfterMs: 120000, clockSkewMs: 5000});
    assert.equal(result.state, state);
    assert.equal(result.ageMs, ageMs);
    assert.ok(result.reason.trim(), 'all freshness states explain their clock/boundary');
  });
}

test('freshness honors custom stale threshold and zero future tolerance', () => {
  assert.equal(freshness(TIME, NOW + 1001, {staleAfterMs: 1000}).state, 'stale');
  assert.equal(freshness(TIME, NOW - 1, {clockSkewMs: 0}).state, 'unknown');
  assert.match(freshness(TIME, NOW - 5001).reason, /Zukunft/);
});

test('invalid snapshot/start clocks are never replaced with observation or fetch time', () => {
  const status = normalizeStatus(base({observedAt: '2026-02-30T00:00:00Z', identity: {startedAt: measurement('2026-02-30T00:00:00Z')}}));
  assert.equal(freshness(status.observedAt, NOW).state, 'unknown');
  assert.equal(status.identity.startedAt.value, null);
  assert.equal(uptime(status.identity, NOW).seconds, null);
  assert.equal(uptime(normalizeStatus(base()).identity, NOW).seconds, null);
});

test('reported uptime wins over derivation, including zero, without advancing on fetch', () => {
  for (const seconds of [0, 42.5]) {
    const identity = normalizeStatus(base({identity: {uptimeSeconds: measurement(seconds), startedAt: measurement('2026-01-01T11:00:00Z')}})).identity;
    for (const clock of [NOW, NOW + 60000]) {
      const result = uptime(identity, clock);
      assert.equal(result.seconds, seconds);
      assert.match(result.source, /gemeldet/);
      assert.match(result.source, /Deterministic test fixture/);
      assert.equal(result.verification, 'self_reported');
    }
  }
});

test('derived uptime uses valid start plus local clock, floors seconds and identifies method', () => {
  const result = uptime({startedAt: measurement('2026-01-01T11:59:58.500Z')}, NOW);
  assert.equal(result.seconds, 1);
  assert.match(result.source, /Berechnet.*lokaler Uhr/);
  assert.equal(result.verification, 'self_reported');
  for (const value of [-1, Infinity, NaN, '20']) {
    assert.equal(uptime({uptimeSeconds: measurement(value), startedAt: measurement(TIME)}, NOW + 5000).seconds, 5);
  }
  assert.equal(uptime({startedAt: measurement('2026-01-01T12:00:05Z')}, NOW).seconds, 0);
  assert.equal(uptime({startedAt: measurement('2026-01-01T12:00:05.001Z')}, NOW).seconds, null);
  assert.equal(uptime({startedAt: measurement('2026-01-01T12:00:00.001Z')}, NOW, {clockSkewMs: 0}).seconds, null);
  for (const value of [undefined, null, '', 'bad', '2026-01-01T00:00:00', '2026-02-30T00:00:00Z']) {
    assert.equal(uptime({startedAt: measurement(value)}, NOW).verification, 'unavailable');
  }
  assert.equal(uptime({startedAt: measurement(TIME)}, NaN).seconds, null);
});

test('activity requires valid time/category/summary/status and sanitizes duration/provenance', () => {
  const invalid = [null, [], {}, ...[{time: '2026-02-30T00:00:00Z'}, {category: ''}, {summary: ' '}, {status: 'done'}].map(activity)];
  const status = normalizeStatus(base({activity: [activity({durationMs: 0}), ...invalid, activity({id: null, durationMs: -1, source: null})]}));
  assert.equal(status.activity.length, 2);
  assert.equal(status.activity[0].durationMs, 0);
  assert.equal(status.activity[0].observedAt, TIME);
  assert.equal(status.activity[1].durationMs, null);
  assert.match(status.activity[1].id, /^activity-/);
  assert.equal(status.activity[1].verification, 'unverified');
  assert.ok(status.warnings.some(warning => /Aktivität/.test(warning)));
  for (const value of ['info', 'running', 'passed', 'failed', 'warning', 'unknown']) assert.equal(normalizeStatus(base({activity: [activity({status: value})]})).activity[0].status, value);
});

test('artifacts and issues keep provenance, exclude nameless entries and use conservative defaults', () => {
  const provenance = {source: 'Fixture', observedAt: TIME, verification: 'verified'};
  const status = normalizeStatus(base({
    artifacts: [null, {}, {path: ' '}, {path: 'README.md', change: 'deleted', ...provenance}],
    issues: [null, {}, {summary: ''}, {summary: 'Unknown input', severity: 'severe', nextAction: 'Investigate', ...provenance}],
  }));
  assert.deepEqual(status.artifacts, [{path: 'README.md', change: 'unknown', ...provenance}]);
  assert.deepEqual(status.issues, [{summary: 'Unknown input', severity: 'warning', nextAction: 'Investigate', ...provenance}]);
  assert.ok(status.warnings.some(warning => /Artefakt/.test(warning)));
  assert.ok(status.warnings.some(warning => /Problem/.test(warning)));
  for (const change of ['created', 'modified', 'unchanged', 'unknown']) assert.equal(normalizeStatus(base({artifacts: [{path: 'file', change}]})).artifacts[0].change, change);
  for (const severity of ['info', 'warning', 'blocker', 'error']) assert.equal(normalizeStatus(base({issues: [{summary: 'Issue', severity}]})).issues[0].severity, severity);
});

test('passed checks require complete successful evidence, not activity or a verification claim', () => {
  const badEvidence = [undefined, null, {}, [], ...[
    {command: ''}, {command: ' '}, {source: ''}, {source: null}, {exitCode: 1}, {exitCode: '0'},
    {exitCode: 0.5}, {exitCode: NaN}, {finishedAt: null}, {finishedAt: '2026-02-30T00:00:00Z'},
    {finishedAt: '2026-01-01T12:00:00'},
  ].map(evidence)];
  for (const value of badEvidence) {
    const status = normalizeStatus(base({activity: [activity({status: 'passed'})], checks: [{name: 'Fixture', status: 'passed', verification: 'verified', evidence: value}]}));
    assert.equal(status.checks[0].status, 'unknown');
    assert.ok(status.warnings.some(warning => /Ausführungsnachweis/.test(warning)));
  }
  const status = normalizeStatus(base({checks: [{name: 'Fixture', status: 'passed', evidence: evidence()}]}));
  assert.equal(status.checks[0].status, 'passed');
  assert.deepEqual(status.checks[0].evidence, evidence());
  assert.deepEqual(status.warnings, []);
});

test('check states remain distinct; even exit 0 evidence never promotes not_run to passed', () => {
  for (const value of ['not_run', 'running', 'failed', 'unknown']) {
    assert.equal(normalizeStatus(base({checks: [{name: 'Fixture', status: value, evidence: evidence()}]})).checks[0].status, value);
  }
  const status = normalizeStatus(base({checks: [null, {}, {name: ' '}, {name: 'Fixture', status: 'success'}]}));
  assert.deepEqual(status.checks, [{name: 'Fixture', status: 'unknown', evidence: null}]);
  const failed = normalizeStatus(base({checks: [{name: 'Fixture', status: 'failed', evidence: evidence({exitCode: 2})}]}));
  assert.equal(failed.checks[0].evidence.exitCode, 2);
});

test('redaction recursively removes typical secret keys without losing safe usage counters', () => {
  const keys = ['apiKey', 'API_KEY', 'x-api-key', 'accessToken', 'refresh_token', 'id_token', 'password', 'passwd', 'clientSecret', 'cookie', 'Authorization', 'private_key', 'token', 'tokens', 'credentials', 'env', 'environmentVariables'];
  const secrets = Object.fromEntries(keys.map(key => [key, {value: 'NEVER_PUBLIC'}]));
  const input = {nested: [secrets], inputTokens: 0, outputTokens: 12, contextWindow: 100, missingCredentials: ['SERVICE_NAME']};
  const before = structuredClone(input);
  const result = redact(input);
  for (const key of keys) assert.equal(result.nested[0][key], '[REDACTED]', key);
  assert.equal(JSON.stringify(result).includes('NEVER_PUBLIC'), false);
  assert.equal(result.inputTokens, 0);
  assert.equal(result.outputTokens, 12);
  assert.deepEqual(result.missingCredentials, ['SERVICE_NAME']);
  assert.deepEqual(input, before);
  assert.notEqual(result.nested, input.nested);
  assert.deepEqual(redact(result), result);
});

test('redaction recognizes representative credential value patterns in free text', () => {
  const cases = [
    ['sk-abcdefgh12345678', 'sk-abcdefgh12345678'],
    ['sk-proj-abcdefgh12345678', 'sk-proj-abcdefgh12345678'],
    ['sk-ant-abcdefgh12345678', 'sk-ant-abcdefgh12345678'],
    ['ghp_abcdefgh12345678', 'ghp_abcdefgh12345678'],
    ['github_pat_abcdefgh12345678', 'github_pat_abcdefgh12345678'],
    ['AKIA1234567890ABCDEF', 'AKIA1234567890ABCDEF'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl', 'eyJhbGciOiJIUzI1NiJ9'],
    ['Bearer abcDEF123._~+/-==', 'abcDEF123'],
    ['api_key=fixture-credential', 'fixture-credential'],
    ['tool --access-token DEMO_SECRET_VALUE', 'DEMO_SECRET_VALUE'],
    ['tool --api-key "two word credential"', 'two word credential'],
    ["tool --password 'single quoted credential'", 'single quoted credential'],
    ['Authorization Bearer private-token-value', 'private-token-value'],
    ['password="two word credential"', 'two word credential'],
    ["secret='single quoted credential'", 'single quoted credential'],
    ['cookie: session-private', 'session-private'],
    ['https://fixture-user:fixture-pass@example.test/path', 'fixture-pass'],
    ['-----BEGIN RSA PRIVATE KEY-----\nPRIVATE_CONTENT\n-----END RSA PRIVATE KEY-----', 'PRIVATE_CONTENT'],
    ['-----BEGIN PRIVATE KEY-----\nTRUNCATED_KEY', 'TRUNCATED_KEY'],
  ];
  for (const [value, secret] of cases) {
    const result = redact(`before ${value} after`);
    assert.equal(result.includes(secret), false, value);
    assert.match(result, /REDACTED/);
    assert.equal(redact(result), result);
  }
});

test('redaction ignores prototype pollution keys and bounds recursive/cyclic objects', () => {
  const result = redact(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{},"safe":"value"}'));
  assert.equal(Object.getPrototypeOf(result), null);
  assert.deepEqual(Object.keys(result), ['safe']);
  assert.equal({}.polluted, undefined);
  const cyclic = {safe: 'value'};
  cyclic.next = cyclic;
  assert.match(JSON.stringify(redact(cyclic)), /depth limit/);
});

test('known text fields are redacted while harmless HTML remains inert data for the DOM-safe renderer', () => {
  const html = '<img src=x onerror="globalThis.injection=true">';
  const status = normalizeStatus(base({
    identity: {name: measurement(html), apiKey: measurement('DO_NOT_ECHO')},
    assignment: {goal: measurement('Bearer fixture-private-token')},
    activity: [activity({summary: 'password=fixture-password'})],
    checks: [{name: 'Fixture', status: 'passed', evidence: evidence({command: 'tool --api_key=fixture-key'})}],
    unknown: {value: 'DO_NOT_ECHO'},
  }));
  assert.equal(status.identity.name.value, html, 'contract keeps text; browser tests must verify inert DOM rendering');
  const serialized = JSON.stringify(status);
  for (const secret of ['DO_NOT_ECHO', 'fixture-private-token', 'fixture-password', 'fixture-key']) assert.equal(serialized.includes(secret), false);
  assert.equal('apiKey' in status.identity, false);
});

test('source limit counts UTF-8 bytes and accepts exactly 256 KiB', () => {
  const minimal = '{"schemaVersion":"1.0"}';
  const exact = minimal + ' '.repeat(256 * 1024 - Buffer.byteLength(minimal));
  assert.doesNotThrow(() => parseStatus(exact));
  assert.throws(() => parseStatus(exact + ' '), /256 KiB/);
  const multibyte = JSON.stringify(base({unknown: 'é'.repeat(140000)}));
  assert.ok(multibyte.length < 256 * 1024);
  assert.throws(() => parseStatus(multibyte), /256 KiB/);
});

test('text, list and warning bounds truncate visibly and remain idempotent', () => {
  const long = 'x'.repeat(2001);
  const status = normalizeStatus(base({
    identity: {name: measurement(long)},
    capabilities: {tools: measurement(Array.from({length: 101}, (_, i) => `tool-${i}`))},
    activity: Array.from({length: 101}, (_, i) => activity({id: `a${i}`})),
    artifacts: Array.from({length: 101}, (_, i) => ({path: `file-${i}`})),
    checks: Array.from({length: 101}, (_, i) => ({name: `check-${i}`, status: 'not_run'})),
    issues: Array.from({length: 101}, (_, i) => ({summary: `issue-${i}`})),
  }));
  assert.equal(status.identity.name.value.length, 2000);
  assert.equal(status.capabilities.tools.value.length, 100);
  for (const key of listNames) assert.equal(status[key].length, 100);
  assert.ok(status.warnings.some(warning => /2000/.test(warning)));
  for (const key of ['tools', ...listNames]) assert.ok(status.warnings.some(warning => warning.includes(key) && warning.includes('100')), key);
  assert.deepEqual(normalizeStatus(status), status);
  const warnings = normalizeStatus(base({warnings: Array.from({length: 200}, (_, i) => `warning-${i}`)})).warnings;
  assert.equal(warnings.length, 100);
});

test('normalization is stable across repeated server/browser passes for degraded snapshots', () => {
  const inputs = [
    {schemaVersion: '1.0'},
    base({issues: [], checks: [{name: 'Without evidence', status: 'passed'}]}),
    base({identity: {name: measurement('Agent', {source: null})}, assignment: {progress: measurement(50)}}),
    base({activity: [activity(), activity({time: 'bad'})], artifacts: [{path: 'file', change: 'invalid'}]}),
  ];
  for (const input of inputs) {
    const once = normalizeStatus(input);
    assert.deepEqual(normalizeStatus(once), once);
    assert.deepEqual(parseStatus(JSON.stringify(once)), once);
    assert.deepEqual(normalizeStatus(normalizeStatus(once)), once);
  }
});
