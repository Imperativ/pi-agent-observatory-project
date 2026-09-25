import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseStatus} from '../src/contract.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const candidate = path.resolve(root, process.argv[2] || 'agent-status.example.json');
const relative = path.relative(root, candidate);
try {
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Nur Dateien im Projektordner validieren.');
  const status = parseStatus(await readFile(candidate, 'utf8'));
  console.log(`Status gültig: schemaVersion=${status.schemaVersion}, dataset=${status.dataset}`);
  for (const warning of status.warnings) console.log(`WARNUNG: ${warning}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
