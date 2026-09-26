import {open, lstat, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseStatus} from '../src/contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (['--5h', '--weekly', '--reset-5h', '--reset-weekly', '--status'].includes(flag)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) fail(`Wert für ${flag} fehlt.`);
      options[flag] = args[++i];
    } else if (flag === '--reset' || flag === '--clear' || flag === '--help') {
      options[flag] = true;
    } else fail(`Unbekannte Option: ${flag}`);
  }
  return options;
}

const args = parseArgs(process.argv.slice(2));
if (args['--help']) {
  console.log(`Verwendung: node scripts/update-limits.mjs [Optionen]
Optionen:
  --5h <0..100>           Verbleibendes 5-Stunden-Limit in Prozent (z.B. --5h 85)
  --weekly <0..100>       Verbleibendes Wochen-Limit in Prozent (z.B. --weekly 60)
  --reset-5h <Zeit/Text>  Reset-Zeitpunkt 5h (z.B. --reset-5h "18:30 UTC")
  --reset-weekly <Text>   Reset-Zeitpunkt Woche (z.B. --reset-weekly "Sonntag 00:00 UTC")
  --reset                 Setzt Rate-Limits in der Statusdatei zurück
  --status <Pfad>         Pfad zur agent-status.json (Standard: Projektwurzel)
  --help                  Zeigt diese Hilfe`);
  process.exit(0);
}

const targetPath = args['--status'] ? path.resolve(args['--status']) : path.join(root, 'agent-status.json');
const targetDir = path.dirname(targetPath);
const lockPath = path.join(targetDir, 'agent-status.lock');

// Check lock
try {
  const lockStat = await lstat(lockPath).catch(() => null);
  if (lockStat) fail('agent-status.lock ist aktiv. Wenn die Pi-Live-Extension läuft, nutze dort den Befehl /limits.');
} catch (e) {
  fail('Fehler beim Prüfen der Statussperre.');
}

let existing;
try {
  const text = await readFile(targetPath, 'utf8');
  existing = JSON.parse(text);
} catch (error) {
  if (error.code === 'ENOENT') {
    existing = {
      schemaVersion: '1.0',
      dataset: 'live',
      observedAt: new Date().toISOString(),
      identity: {
        name: {value: 'Manuell gemeldete Account-Quotas', source: 'update-limits', observedAt: new Date().toISOString(), verification: 'self_reported'}
      },
      assignment: {state: {value: 'idle', source: 'update-limits', observedAt: new Date().toISOString(), verification: 'self_reported'}},
      usage: {}
    };
  } else fail('Bestehende Statusdatei konnte nicht gelesen werden.');
}

if (!existing.usage || typeof existing.usage !== 'object') existing.usage = {};

const observedAt = new Date().toISOString();
if (args['--reset']) {
  delete existing.usage.rateLimits;
  console.log('Rate-Limits wurden zurückgesetzt.');
} else {
  const p5h = args['--5h'] !== undefined ? Number(args['--5h']) : null;
  const pWeekly = args['--weekly'] !== undefined ? Number(args['--weekly']) : null;
  if (p5h === null && pWeekly === null && !args['--reset-5h'] && !args['--reset-weekly']) {
    fail('Mindestens --5h oder --weekly erforderlich (z.B. --5h 85 --weekly 60). Siehe --help.');
  }
  if (p5h !== null && (!Number.isFinite(p5h) || p5h < 0 || p5h > 100)) fail('--5h muss zwischen 0 und 100 liegen.');
  if (pWeekly !== null && (!Number.isFinite(pWeekly) || pWeekly < 0 || pWeekly > 100)) fail('--weekly muss zwischen 0 und 100 liegen.');

  const prevLimits = existing.usage.rateLimits?.value && typeof existing.usage.rateLimits.value === 'object' ? existing.usage.rateLimits.value : {};
  existing.usage.rateLimits = {
    value: {
      fiveHour: p5h !== null || args['--reset-5h'] ? {
        remainingPercent: p5h !== null ? p5h : (prevLimits.fiveHour?.remainingPercent ?? null),
        resetsAt: args['--reset-5h'] || prevLimits.fiveHour?.resetsAt || null
      } : (prevLimits.fiveHour || null),
      weekly: pWeekly !== null || args['--reset-weekly'] ? {
        remainingPercent: pWeekly !== null ? pWeekly : (prevLimits.weekly?.remainingPercent ?? null),
        resetsAt: args['--reset-weekly'] || prevLimits.weekly?.resetsAt || null
      } : (prevLimits.weekly || null),
      detail: 'Konto-Quotas von https://chatgpt.com/settings/usage?tab=overview'
    },
    source: 'ChatGPT Web Account (manuelle Eingabe)',
    observedAt,
    verification: 'self_reported'
  };
}

// Editing a quota is not a new Pi observation. Preserve the snapshot's authoritative freshness clock.
const content = JSON.stringify(existing, null, 2) + '\n';
parseStatus(content);

const temporary = path.join(targetDir, `agent-status.${randomUUID()}.tmp`);
await writeFile(temporary, content, {flag: 'wx', mode: 0o600});
await rename(temporary, targetPath);
console.log('Statusdatei erfolgreich mit ChatGPT-Quotas aktualisiert.');
