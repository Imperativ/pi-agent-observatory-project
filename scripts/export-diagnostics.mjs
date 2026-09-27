#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportAnonymizedStatusJson } from '../src/export.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  let inputPath = path.join(root, 'agent-status.json');
  let outputPath = path.join(root, 'diagnostics-export.json');
  let toStdout = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputPath = path.resolve(args[++i]);
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = path.resolve(args[++i]);
    } else if (args[i] === '--stdout') {
      toStdout = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Verwendung: node scripts/export-diagnostics.mjs [Optionen]

Optionen:
  --input <Pfad>   Eingabe-Statusdatei (Standard: agent-status.json)
  --output <Pfad>  Ausgabe-Datei (Standard: diagnostics-export.json)
  --stdout         Ausgabe auf stdout statt in Datei schreiben
  --help, -h       Diese Hilfe anzeigen
`);
      process.exit(0);
    }
  }

  let rawContent;
  try {
    rawContent = await readFile(inputPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const examplePath = path.join(root, 'agent-status.example.json');
      if (!toStdout) console.warn(`Hinweis: ${inputPath} nicht gefunden. Verwende ${examplePath} als Vorlage.`);
      rawContent = await readFile(examplePath, 'utf8');
    } else {
      throw err;
    }
  }

  const exportedJson = exportAnonymizedStatusJson(rawContent);

  if (toStdout) {
    process.stdout.write(exportedJson);
  } else {
    await writeFile(outputPath, exportedJson, 'utf8');
    console.log(`✔ Anonymisierter Diagnose-Snapshot erfolgreich exportiert:`);
    console.log(`  Quelle:  ${inputPath}`);
    console.log(`  Ziel:    ${outputPath}`);
  }
}

main().catch(err => {
  console.error(`Fehler beim Exportieren: ${err.message}`);
  process.exit(1);
});
