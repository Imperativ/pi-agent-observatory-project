import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(ROOT, '..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'docs', 'adeptus-mechanicus-notes.md');
const ACTIVE_PORT_FILE = '/home/imp/.config/chromium/DevToolsActivePort';

async function getDevToolsPort() {
  // First check DevToolsActivePort file
  if (existsSync(ACTIVE_PORT_FILE)) {
    try {
      const content = await readFile(ACTIVE_PORT_FILE, 'utf8');
      const lines = content.trim().split('\n');
      const port = parseInt(lines[0], 10);
      if (port > 0) return port;
    } catch { /* continue */ }
  }

  // Check default port 9222
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
    if (res.ok) return 9222;
  } catch { /* continue */ }

  return null;
}

export async function extractFromRunningChromium() {
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

  const port = await getDevToolsPort();
  if (!port) {
    console.error('Konnte keinen aktiven Remote-Debugging-Port für Chromium finden.');
    console.error('Bitte stelle sicher, dass in Chromium unter chrome://inspect/#remote-debugging die Option aktiviert und genehmigt wurde.');
    process.exit(1);
  }

  console.log(`Verbinde mit Chromium über CDP auf Port ${port}...`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  
  let targetPage = null;
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const url = page.url();
      if (url.includes('notebook.google.com') || url.includes('92e80267')) {
        targetPage = page;
        break;
      }
    }
    if (targetPage) break;
  }

  if (!targetPage) {
    console.error('Notebook-Tab (notebook.google.com) wurde in den geöffneten Tabs nicht gefunden.');
    const allUrls = browser.contexts().flatMap(c => c.pages().map(p => p.url()));
    console.log('Gefundene Tabs:', allUrls);
    await browser.close();
    process.exit(1);
  }

  console.log(`Gefunden! Tab: "${await targetPage.title()}" (${targetPage.url()})`);
  console.log('Extrahiere Inhalte aus Gemini Notebook...');

  // Extract notebook content, sources, and media
  const extraction = await targetPage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const result = {
      title: document.title,
      url: window.location.href,
      fullText: document.body.innerText,
      sources: [],
      notes: [],
      mediaItems: [],
    };

    // Extract sources in sidebar
    const sourceElements = document.querySelectorAll(
      '[data-source-id], [role="listitem"], .source-card, .source-item, .source-title, [aria-label*="Quelle"], [aria-label*="Source"]'
    );
    for (const el of sourceElements) {
      const text = el.innerText?.trim();
      if (text && text.length > 2 && !result.sources.includes(text)) {
        result.sources.push(text);
      }
    }

    // Extract notes / artifacts / media summaries
    const noteElements = document.querySelectorAll(
      '[role="article"], .artifact-content, .note-card, .studio-item, .generated-item, .chat-message, [data-note-id]'
    );
    for (const el of noteElements) {
      const text = el.innerText?.trim();
      if (text && text.length > 5 && !result.notes.includes(text)) {
        result.notes.push(text);
      }
    }

    return result;
  });

  const markdown = `# ${extraction.title || 'Adeptus Mechanicus Background Material'}

**Quelle:** ${extraction.url}  
**Extrahiert am:** ${new Date().toISOString()}  
**Quellenanzahl erfasst:** ${extraction.sources.length}  
**Notizen / Elemente erfasst:** ${extraction.notes.length}  

---

## Gesamter sichtbarer Inhalt

\`\`\`
${extraction.fullText}
\`\`\`

---

## Quellenübersicht (${extraction.sources.length})

${extraction.sources.map((s, idx) => `### Quelle ${idx + 1}\n${s}\n`).join('\n')}

---

## Notizen & Studio-Inhalte (${extraction.notes.length})

${extraction.notes.map((n, idx) => `### Element ${idx + 1}\n${n}\n`).join('\n')}
`;

  await writeFile(OUTPUT_FILE, markdown, 'utf8');
  console.log(`Erfolg! Notebook-Inhalte wurden in ${OUTPUT_FILE} gespeichert (${markdown.length} Zeichen).`);
  await browser.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  extractFromRunningChromium().catch(err => {
    console.error('Fehler bei der Extraktion:', err);
    process.exit(1);
  });
}
