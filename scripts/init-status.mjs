import {readFile, writeFile} from 'node:fs/promises';
import {parseStatus} from '../src/contract.mjs';
const target = new URL('../agent-status.json', import.meta.url);
try {
  const sample = await readFile(new URL('../agent-status.example.json', import.meta.url), 'utf8');
  parseStatus(sample);
  await writeFile(target, sample, {flag: 'wx'});
  console.log('agent-status.json erstellt. Beispieldaten bleiben als sample markiert; vor echter Nutzung ersetzen.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'agent-status.json existiert bereits; keine Datei überschrieben.' : 'Initialisierung fehlgeschlagen. Beispiel/Verzeichnis prüfen.');
  process.exitCode = 1;
}
