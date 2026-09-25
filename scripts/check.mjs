import {readdir, readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseStatus} from '../src/contract.mjs';
import {validateConfig} from '../server.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
async function checkDir(dir) {
  for (const entry of await readdir(new URL(dir, new URL('../', import.meta.url)), {withFileTypes: true})) {
    if (entry.isFile() && entry.name.endsWith('.mjs')) {
      const name = `${dir}${entry.name}`;
      const result = spawnSync(process.execPath, ['--check', name], {cwd: root, encoding: 'utf8'});
      if (result.status !== 0) throw new Error(`${name}: ${result.stderr || result.error}`);
      count++;
      if (['src/render.mjs', 'app.mjs'].includes(name)) {
        const code = await readFile(new URL(name, new URL('../', import.meta.url)), 'utf8');
        if (/\b(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b|document\.write\s*\(/.test(code)) throw new Error(`${name}: unsichere DOM-/Code-Senke gefunden.`);
      }
    }
  }
}
try {
  for (const dir of ['', 'src/', 'scripts/', 'test/']) await checkDir(dir);
  parseStatus(await readFile(new URL('../agent-status.example.json', import.meta.url), 'utf8'));
  JSON.parse(await readFile(new URL('../agent-status.schema.json', import.meta.url), 'utf8'));
  validateConfig(JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8')));
  console.log(`${count} JavaScript-Dateien syntaxgeprüft; DOM-Senken-Guard, Beispiel, Schema-JSON und Konfiguration gültig. Kein separates Build/Framework-Lint notwendig.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
