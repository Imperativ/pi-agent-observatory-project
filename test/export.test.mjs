import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizePaths, anonymizeStatus, createAnonymizedExport, exportAnonymizedStatusJson } from '../src/export.mjs';
import { parseStatus } from '../src/contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('sanitizePaths masks user home directory paths correctly across OS conventions', () => {
  assert.equal(sanitizePaths('/home/imp/Dokumente/imp-projekte/pi-dashboard'), '/home/<user>/Dokumente/imp-projekte/pi-dashboard');
  assert.equal(sanitizePaths('/home/developer_99/workspace/file.js'), '/home/<user>/workspace/file.js');
  assert.equal(sanitizePaths('/Users/alice/Library/Preferences'), '/home/<user>/Library/Preferences');
  assert.equal(sanitizePaths('C:\\Users\\Bob\\AppData\\Roaming'), 'C:\\Users\\<user>\\AppData\\Roaming');
  assert.equal(sanitizePaths('C:\\Benutzer\\Charlie\\Project'), 'C:\\Users\\<user>\\Project');
  assert.equal(sanitizePaths('/etc/hosts'), '/etc/hosts');
  assert.equal(sanitizePaths(123), 123);
  assert.equal(sanitizePaths(null), null);
});

test('anonymizeStatus and createAnonymizedExport strip secrets and sanitize paths', () => {
  const sensitiveStatus = {
    schemaVersion: '1.0',
    dataset: 'live',
    observedAt: '2026-09-26T06:00:00Z',
    identity: {
      name: { value: 'Agent-Test', source: 'pi', observedAt: '2026-09-26T06:00:00Z', verification: 'self_reported' },
    },
    environment: {
      cwd: { value: '/home/imp/Dokumente/imp-projekte/pi-dashboard', source: 'proc', observedAt: '2026-09-26T06:00:00Z', verification: 'self_reported' },
    },
    permissions: {
      readAreas: {
        value: ['/home/imp/Dokumente/secret-folder', '/home/imp/Dokumente/imp-projekte'],
        source: 'config',
        observedAt: '2026-09-26T06:00:00Z',
        verification: 'self_reported',
      },
    },
    assignment: {
      goal: { value: 'Test with token=SECRET_API_KEY_VAL_123 and sk-ant-api03-abcdefghijklmnop', source: 'pi', observedAt: '2026-09-26T06:00:00Z', verification: 'self_reported' },
      step: { value: 'Bearer demo_token_value_abc', source: 'pi', observedAt: '2026-09-26T06:00:00Z', verification: 'self_reported' },
    },
    checks: [
      {
        name: 'Auth check',
        status: 'passed',
        evidence: {
          command: 'curl -H "Authorization: Bearer my_secret_token_123" /home/imp/api',
          exitCode: 0,
          source: 'test',
        },
      },
    ],
  };

  const exported = createAnonymizedExport(sensitiveStatus, { now: new Date('2026-09-26T12:00:00Z') });

  assert.equal(exported.exportVersion, '1.0');
  assert.equal(exported.exportedAt, '2026-09-26T12:00:00.000Z');
  assert.equal(exported.anonymized, true);

  const exportedStr = JSON.stringify(exported);

  // Must NOT leak raw username or secrets
  assert.equal(exportedStr.includes('/home/imp/'), false, 'Username in path must be sanitized');
  assert.equal(exportedStr.includes('SECRET_API_KEY_VAL_123'), false, 'Secret key must be redacted');
  assert.equal(exportedStr.includes('sk-ant-api03-abcdefghijklmnop'), false, 'API key pattern must be redacted');
  assert.equal(exportedStr.includes('my_secret_token_123'), false, 'Bearer token must be redacted');

  // Must contain anonymized markers
  assert.ok(exportedStr.includes('/home/<user>/Dokumente'));
  assert.ok(exportedStr.includes('[REDACTED]'));

  // Exported status must remain conforming to the contract
  const roundtripped = parseStatus(JSON.stringify(exported.status));
  assert.equal(roundtripped.schemaVersion, '1.0');
  assert.equal(roundtripped.environment.cwd.value, '/home/<user>/Dokumente/imp-projekte/pi-dashboard');
});

test('CLI script scripts/export-diagnostics.mjs exports valid JSON to stdout and file', async () => {
  const dir = await mkdtemp(path.join(root, '.test-tmp-export-'));
  try {
    const testStatusPath = path.join(dir, 'test-status.json');
    const outFilePath = path.join(dir, 'out.json');

    await writeFile(testStatusPath, JSON.stringify({
      schemaVersion: '1.0',
      dataset: 'live',
      observedAt: '2026-09-26T06:00:00Z',
      environment: {
        cwd: { value: '/home/imp/test-repo', source: 'test', observedAt: '2026-09-26T06:00:00Z', verification: 'self_reported' },
      },
      assignment: {
        goal: { value: 'Fix token=ghp_ABCDEFGHIJKL1234567890', source: 'test', observedAt: '2026-09-26T06:00:00Z', verification: 'self_reported' },
      },
    }));

    // 1. Test --stdout
    const stdoutRun = spawnSync(process.execPath, [
      'scripts/export-diagnostics.mjs',
      '--input', testStatusPath,
      '--stdout',
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(stdoutRun.status, 0, stdoutRun.stderr);
    const parsedStdout = JSON.parse(stdoutRun.stdout);
    assert.equal(parsedStdout.anonymized, true);
    assert.equal(parsedStdout.status.environment.cwd.value, '/home/<user>/test-repo');
    assert.equal(stdoutRun.stdout.includes('ghp_ABCDEFGHIJKL1234567890'), false);

    // 2. Test --output
    const fileRun = spawnSync(process.execPath, [
      'scripts/export-diagnostics.mjs',
      '--input', testStatusPath,
      '--output', outFilePath,
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(fileRun.status, 0, fileRun.stderr);
    const fileContent = await readFile(outFilePath, 'utf8');
    const parsedFile = JSON.parse(fileContent);
    assert.equal(parsedFile.anonymized, true);
    assert.equal(parsedFile.status.environment.cwd.value, '/home/<user>/test-repo');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
