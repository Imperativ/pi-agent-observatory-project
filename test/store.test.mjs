import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../src/store.mjs';

const OBSERVED_AT = '2026-01-01T12:00:00Z';
const FETCHED_AT = '2026-01-01T12:01:00.000Z';
const SECOND_FETCH = '2026-01-01T12:02:00.000Z';
const fixture = (goal = 'First') => ({
  schemaVersion: '1.0', dataset: 'live', observedAt: OBSERVED_AT,
  assignment: {goal: {value: goal, source: 'Deterministic store fixture', observedAt: OBSERVED_AT, verification: 'self_reported'}},
});
const response = (body = fixture()) => ({
  ok: true, status: 200, headers: {get: () => 'application/json; charset=utf-8'},
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

test('successful refresh uses no-store, keeps source clock separate from fetch clock and recovers after failures', async () => {
  let clock = Date.parse(FETCHED_AT);
  const replies = [
    response(),
    {ok: false, status: 503},
    response('{invalid JSON'),
    response(fixture('Recovered')),
  ];
  const calls = [];
  const changes = [];
  const store = createStore({
    now: () => clock,
    fetchFn: async (url, options) => {
      calls.push({url, options});
      return replies.shift();
    },
    onChange: state => changes.push(state),
  });
  assert.deepEqual(store.getState(), {snapshot: null, fetchedAt: null, error: null, loading: false});
  const first = await store.refresh();
  assert.equal(first.snapshot.assignment.goal.value, 'First');
  assert.equal(first.snapshot.observedAt, OBSERVED_AT);
  assert.equal(first.fetchedAt, FETCHED_AT);
  assert.equal(first.error, null);
  assert.equal(first.loading, false);
  const original = first.snapshot;
  clock = Date.parse(SECOND_FETCH);
  for (const failure of ['HTTP 503', 'JSON']) {
    const state = await store.refresh();
    assert.match(state.error, new RegExp(failure));
    assert.equal(state.snapshot, original, 'failed reads retain last valid snapshot');
    assert.equal(state.fetchedAt, FETCHED_AT, 'failed reads do not refresh successful fetch time');
    assert.equal(state.loading, false);
  }
  const recovered = await store.refresh();
  assert.equal(recovered.error, null);
  assert.equal(recovered.snapshot.assignment.goal.value, 'Recovered');
  assert.equal(recovered.snapshot.observedAt, OBSERVED_AT, 'fetch time never replaces source observation');
  assert.equal(recovered.fetchedAt, SECOND_FETCH);
  assert.deepEqual(calls.map(call => call.url), Array(4).fill('/status.json'));
  for (const {options} of calls) {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'same-origin');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.deepEqual(changes.map(state => state.loading), [true, false, true, false, true, false, true, false]);
  assert.deepEqual(store.getState(), recovered);
});

test('concurrent refreshes share one request; after completion another request can start', async () => {
  const gate = deferred();
  let calls = 0;
  const store = createStore({fetchFn: () => { calls++; return calls === 1 ? gate.promise : Promise.resolve(response(fixture('Second'))); }, now: () => Date.parse(FETCHED_AT)});
  const first = store.refresh();
  const second = store.refresh();
  assert.equal(first, second, 'both callers await the same in-flight promise');
  assert.equal(calls, 1);
  assert.equal(store.getState().loading, true);
  gate.resolve(response());
  const [one, two] = await Promise.all([first, second]);
  assert.deepEqual(one, two);
  assert.equal(calls, 1);
  assert.equal((await store.refresh()).snapshot.assignment.goal.value, 'Second');
  assert.equal(calls, 2);
});

test('timeout aborts fetch and ignores a late success from an adapter that ignores abort', async () => {
  const gate = deferred();
  const changes = [];
  let signal;
  const store = createStore({
    timeoutMs: 20,
    fetchFn: (_url, options) => { signal = options.signal; return gate.promise; },
    onChange: state => changes.push(state),
  });
  const state = await store.refresh();
  assert.equal(signal.aborted, true);
  assert.match(state.error, /Zeitlimit/);
  assert.deepEqual({snapshot: state.snapshot, fetchedAt: state.fetchedAt, loading: state.loading}, {snapshot: null, fetchedAt: null, loading: false});
  const count = changes.length;
  gate.resolve(response());
  await gate.promise;
  await Promise.resolve();
  assert.deepEqual(store.getState(), state);
  assert.equal(changes.length, count, 'late fetch cannot overwrite timeout result');
});

test('timeout also covers a stalled response body and retains the last valid snapshot', async () => {
  const body = deferred();
  let signal;
  let count = 0;
  const store = createStore({
    timeoutMs: 20, now: () => Date.parse(FETCHED_AT),
    fetchFn: async (_url, options) => {
      signal = options.signal;
      return ++count === 1 ? response() : {...response(), text: () => body.promise};
    },
  });
  const first = await store.refresh();
  const failed = await store.refresh();
  assert.equal(signal.aborted, true);
  assert.match(failed.error, /Zeitlimit/);
  assert.equal(failed.snapshot, first.snapshot);
  assert.equal(failed.fetchedAt, first.fetchedAt);
  body.resolve(JSON.stringify(fixture('Late body')));
  await body.promise;
  await Promise.resolve();
  assert.deepEqual(store.getState(), failed);
});

test('stop aborts pending work, stops notifications and prevents late or future state mutations', async () => {
  const gate = deferred();
  const changes = [];
  let signal;
  let calls = 0;
  const store = createStore({
    fetchFn: (_url, options) => { signal = options.signal; calls++; return gate.promise; },
    onChange: state => changes.push(state),
  });
  const pending = store.refresh();
  assert.equal(store.getState().loading, true);
  store.stop();
  assert.equal(signal.aborted, true);
  const stoppedState = store.getState();
  assert.equal(stoppedState.loading, false);
  const eventCount = changes.length;
  gate.resolve(response());
  await pending;
  assert.deepEqual(store.getState(), stoppedState);
  assert.equal(changes.length, eventCount);
  assert.deepEqual(await store.refresh(), stoppedState);
  assert.equal(calls, 1);
});

test('secret-bearing fetch error cannot escape into state.error, even with an internal-looking prefix', async () => {
  const store = createStore({fetchFn: async () => { throw new Error('Status token=DEMO_SECRET'); }});
  const state = await store.refresh();
  assert.equal(state.loading, false);
  assert.equal(state.snapshot, null);
  assert.equal(typeof state.error, 'string');
  assert.equal(state.error.includes('DEMO_SECRET'), false, 'untrusted fetch errors must be sanitized at the store boundary');
});

test('untrusted HTTP status and content-type cannot inject secret text into store errors', async () => {
  const replies = [
    {ok: false, status: '503 token=DEMO_SECRET'},
    {...response(), headers: {get: () => 'text/plain token=DEMO_SECRET'}},
  ];
  const store = createStore({fetchFn: async () => replies.shift()});
  for (let i = 0; i < 2; i++) {
    const state = await store.refresh();
    assert.equal(state.snapshot, null);
    assert.equal(state.loading, false);
    assert.equal(typeof state.error, 'string');
    assert.equal(state.error.includes('DEMO_SECRET'), false);
  }
});
