import {constants} from 'node:fs';
import {lstat, open, readFile, realpath, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseStatus, timestampMs} from '../src/contract.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultSessionRoot = path.join(homedir(), '.pi', 'agent', 'sessions');
const MAX_SESSION_BYTES = 16 * 1024 * 1024;
const ENTRY_TYPES = new Set(['message', 'model_change', 'thinking_level_change', 'usage',
  'compaction', 'context_edit', 'branch_summary', 'custom', 'custom_message', 'label', 'session_info']);

class SafeExportError extends Error {}
function fail(message) { throw new SafeExportError(message); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function validMessage(message) {
  if (!isRecord(message) || !Number.isFinite(message.timestamp)) return false;
  switch (message.role) {
    case 'system': case 'user': case 'custom':
      return typeof message.content === 'string' || Array.isArray(message.content);
    case 'assistant': return Array.isArray(message.content) && isRecord(message.usage);
    case 'toolResult': return Array.isArray(message.content) && nonempty(message.toolCallId) && nonempty(message.toolName) && typeof message.isError === 'boolean';
    case 'bashExecution': return typeof message.command === 'string' && typeof message.output === 'string' && typeof message.cancelled === 'boolean';
    case 'branchSummary': return typeof message.summary === 'string';
    case 'compactionSummary': return typeof message.summary === 'string' && Number.isFinite(message.tokensBefore);
    default: return false;
  }
}
function validEntry(entry) {
  if (!nonempty(entry.id) || !(entry.parentId === null || nonempty(entry.parentId))) return false;
  switch (entry.type) {
    case 'message': return validMessage(entry.message);
    case 'model_change': return nonempty(entry.provider) && nonempty(entry.modelId);
    case 'thinking_level_change': return nonempty(entry.thinkingLevel);
    case 'usage': return nonempty(entry.kind) && isRecord(entry.usage);
    case 'compaction': return typeof entry.summary === 'string' && nonempty(entry.firstKeptEntryId);
    case 'context_edit': return nonempty(entry.targetId) && Object.hasOwn(entry, 'replacement');
    case 'branch_summary': return nonempty(entry.fromId) && typeof entry.summary === 'string';
    case 'custom': return nonempty(entry.customType) && Object.hasOwn(entry, 'data');
    case 'custom_message': return nonempty(entry.customType) && (typeof entry.content === 'string' || Array.isArray(entry.content)) && typeof entry.display === 'boolean';
    case 'label': return nonempty(entry.targetId) && (entry.label === undefined || typeof entry.label === 'string');
    case 'session_info': return typeof entry.name === 'string';
    default: return false;
  }
}
function minimalSnapshot(observedAt) {
  return {
    schemaVersion: '1.0', dataset: 'live', observedAt,
    identity: {name: {value: 'Pi-Sitzung (anonymisiert)', source: 'Lokaler Pi-Session-Exporter', observedAt, verification: 'self_reported'}}
  };
}

/** Read a caller-selected session; never expose its contents or path in an error. */
export async function buildPiSnapshot({sessionPath, sessionRoot = defaultSessionRoot}) {
  if (typeof sessionPath !== 'string' || !path.isAbsolute(sessionPath) || path.extname(sessionPath) !== '.jsonl') {
    fail('Ein absoluter Pfad zu einer .jsonl-Sitzung ist erforderlich.');
  }
  if (typeof sessionRoot !== 'string' || !path.isAbsolute(sessionRoot)) fail('Ein absolutes Sitzungsverzeichnis ist erforderlich.');
  let handle;
  try {
    const root = await realpath(sessionRoot);
    const selected = await realpath(sessionPath);
    const relative = path.relative(root, selected);
    if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
      fail('Sitzung liegt nicht innerhalb des freigegebenen Verzeichnisses.');
    }
    if (!(await lstat(sessionPath)).isFile()) fail('Sitzung muss eine reguläre Datei sein; Symlinks sind nicht erlaubt.');
    handle = await open(sessionPath, constants.O_RDONLY);
    const before = await handle.stat();
    if (!before.isFile() || before.size === 0 || before.size > MAX_SESSION_BYTES) fail('Sitzung fehlt oder überschreitet das Limit von 16 MiB.');
    // Fixed upper bound even if another process appends during the read.
    const buffer = Buffer.alloc(before.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const {bytesRead} = await handle.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    const after = await handle.stat();
    if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino ||
      (await realpath(sessionPath)) !== selected || (await stat(sessionPath)).ino !== before.ino) {
      fail('Sitzung wurde während des Lesens verändert; bitte erneut versuchen.');
    }
    const text = new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, total));
    if (!text.endsWith('\n')) fail('Sitzung endet mit einem unvollständigen Eintrag.');
    const lines = text.slice(0, -1).split('\n');
    let observedAt = null;
    for (const [index, line] of lines.entries()) {
      let entry;
      try { entry = JSON.parse(line); } catch { fail('Sitzung enthält ungültiges JSONL.'); }
      if (!isRecord(entry) || timestampMs(entry.timestamp) === null) fail('Sitzung enthält einen ungültigen Eintrag oder Zeitstempel.');
      if (index === 0) {
        // Pi migrates v1 on load; raw v1 files are intentionally not interpreted here.
        if (entry.type !== 'session' || ![2, 3].includes(entry.version) || !nonempty(entry.id) || !nonempty(entry.cwd)) {
          fail('Sitzungs-Header oder Version wird nicht unterstützt.');
        }
      } else if (!ENTRY_TYPES.has(entry.type) || !validEntry(entry)) {
        fail('Sitzung enthält einen nicht unterstützten oder unvollständigen Eintrag.');
      }
      observedAt = entry.timestamp;
    }
    // Construct only vetted fields. No prompt, IDs, cwd, provider, model, usage or message content crosses this boundary.
    const snapshot = minimalSnapshot(observedAt);
    const validated = parseStatus(JSON.stringify(snapshot));
    if (validated.dataset !== 'live' || timestampMs(validated.observedAt) === null || validated.identity.name.value !== 'Pi-Sitzung (anonymisiert)') {
      fail('Generierter Snapshot ist ungültig.');
    }
    return snapshot;
  } catch (error) {
    // Never expose native filesystem/JSON errors; they may contain paths or foreign text.
    if (error instanceof SafeExportError) throw error;
    fail('Sitzung konnte nicht sicher gelesen oder validiert werden.');
  } finally {
    await handle?.close();
  }
}

/** Exclusive single-writer lock; replace only after a second on-disk contract check. */
export async function writePiSnapshot(snapshot, outputDir = projectRoot) {
  const target = path.join(outputDir, 'agent-status.json');
  const temporary = path.join(outputDir, `agent-status.${randomUUID()}.tmp`);
  const lockPath = path.join(outputDir, 'agent-status.lock');
  let lock;
  try {
    lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const old = await lstat(target).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (old && !old.isFile()) fail('Zieldatei ist keine reguläre Datei.');
    if (snapshot?.schemaVersion !== '1.0' || snapshot?.dataset !== 'live' || timestampMs(snapshot?.observedAt) === null) {
      fail('Kein gültiger Live-Snapshot.');
    }
    // Public writer API is a trust boundary too: ignore ALL caller-supplied fields except the clock.
    const content = JSON.stringify(minimalSnapshot(snapshot.observedAt), null, 2) + '\n';
    const valid = parseStatus(content);
    if (valid.dataset !== 'live' || timestampMs(valid.observedAt) === null) fail('Kein gültiger Live-Snapshot.');
    await writeFile(temporary, content, {flag: 'wx', mode: 0o600});
    const disk = await readFile(temporary, 'utf8');
    if (disk !== content) fail('Temporäre Datei ist ungültig.');
    const checked = parseStatus(disk);
    if (checked.dataset !== 'live' || timestampMs(checked.observedAt) === null) fail('Temporäre Datei ist ungültig.');
    await rename(temporary, target);
  } catch (error) {
    // Errors returned to the CLI are deliberately generic, even for write failures.
    if (error instanceof SafeExportError) throw error;
    fail('Status konnte nicht atomar geschrieben werden; bisherige Datei bleibt erhalten.');
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await lock?.close();
    if (lock) await unlink(lockPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return {help: true};
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--session' || flag === '--session-root') {
      if (options[flag] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) fail('Ungültige oder doppelte CLI-Option.');
      options[flag] = args[++i];
    } else if (flag === '--dry-run' || flag === '--write') {
      if (options[flag]) fail('Doppelte CLI-Option.');
      options[flag] = true;
    } else fail('Unbekannte CLI-Option.');
  }
  if (!options['--session'] || Number(Boolean(options['--dry-run'])) + Number(Boolean(options['--write'])) !== 1) {
    fail('Bitte --session und genau eines von --dry-run oder --write angeben.');
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Aufruf: node scripts/generate-pi-status.mjs --session <absolut.jsonl> [--session-root <absolutes-Verzeichnis>] (--dry-run | --write)');
    } else {
      const snapshot = await buildPiSnapshot({sessionPath: options['--session'], sessionRoot: options['--session-root']});
      if (options['--write']) {
        await writePiSnapshot(snapshot);
        console.log('Anonymisierter Live-Snapshot atomar geschrieben.');
      } else console.log('Dry-run: Sitzung geprüft; kein Snapshot geschrieben.');
    }
  } catch {
    console.error('Pi-Status-Export fehlgeschlagen. Eingabe, Freigabe und Dateirechte prüfen; keine Quelldaten ausgegeben.');
    process.exitCode = 1;
  }
}
