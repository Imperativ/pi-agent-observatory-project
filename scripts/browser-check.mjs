import assert from 'node:assert/strict';
import {access, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import axe from 'axe-core';
import {createServer} from '../server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = [process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let browserPath;
for (const candidate of candidates) {
  try { await access(candidate); browserPath = candidate; break; } catch { /* Try the next installed browser. */ }
}
if (!browserPath) throw new Error('Kein lokaler Chrome/Edge/Chromium gefunden. BROWSER_PATH setzen; Browsertest nicht ausgeführt.');

const directory = await mkdtemp(path.join(root, '.test-tmp-browser-'));
const statusPath = path.join(directory, 'status.json');
const configPath = path.join(directory, 'config.json');
const sample = JSON.parse(await readFile(path.join(root, 'agent-status.example.json'), 'utf8'));
sample.observedAt = new Date().toISOString();
await writeFile(statusPath, JSON.stringify(sample));
await writeFile(configPath, JSON.stringify({pollIntervalMs: 500, staleAfterMs: 2000, clockSkewMs: 5000, timeoutMs: 2000}));
const server = createServer({statusPath, configPath});
let browser;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath: browserPath, headless: true});
  const page = await browser.newPage({viewport: {width: 1366, height: 768}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await page.goto(base + '/'))?.status(), 200);
  await page.locator('#dashboard').getByText(/Agent|Auftrag|Status/i).first().waitFor();
  await page.waitForFunction(() => document.querySelector('#dashboard')?.textContent?.length > 350);
  assert.match(await page.locator('#dashboard').innerText(), /Muster|Beispiel|sample/i);
  assert.equal(await page.locator('#dashboard section.card').count(), 9, 'Alle neun Bereiche müssen existieren.');
  await page.locator('#activity-status').selectOption('warning');
  assert.match(await page.locator('#activity .filter-count').innerText(), /1 von 2/);
  await page.locator('#activity-status').selectOption('');
  await page.locator('#activity-category').selectOption('information');
  assert.match(await page.locator('#activity .filter-count').innerText(), /1 von 2/);
  await page.locator('#activity-category').selectOption('');
  const search = page.locator('#activity-search');
  await search.fill('TOKENVERBRAUCH');
  assert.match(await page.locator('#activity .filter-count').innerText(), /1 von 2/);
  await page.locator('#activity-category').selectOption('information');
  assert.match(await page.locator('#activity .filter-count').innerText(), /0 von 2/);
  await page.locator('#activity-category').selectOption('');
  await search.fill('');
  const firstDetail = page.locator('#activity details.activity-detail').first();
  await firstDetail.locator('summary').focus();
  await firstDetail.locator('summary').press('Enter');
  assert.notEqual(await firstDetail.getAttribute('open'), null, 'Aktivitätsdetails per Tastatur öffnen.');
  console.log('Browser: neun Bereiche, Aktivitätssuche/-filter und Tastatur-Details geprüft.');

  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY', 'Tastaturfokus muss sichtbar navigierbar sein.');
  const theme = page.locator('#theme-toggle');
  const oldBg = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor);
  await theme.click();
  const newBg = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor);
  assert.notEqual(oldBg, newBg, 'Hell/Dunkel muss die Darstellung sichtbar ändern.');
  await theme.click();
  console.log('Browser: Tastaturstart und Hell/Dunkel geprüft.');

  const updated = structuredClone(sample);
  updated.observedAt = new Date().toISOString();
  updated.assignment.goal = {value: 'AGENT_PROBE_AKTUALISIERT', source: 'browser-test', observedAt: updated.observedAt, verification: 'self_reported'};
  await search.fill('Tokenverbrauch');
  await writeFile(statusPath, JSON.stringify(updated));
  await page.getByText('AGENT_PROBE_AKTUALISIERT').first().waitFor({timeout: 8000});
  assert.match(await page.locator('#dashboard').innerText(), /AGENT_PROBE_AKTUALISIERT/);
  assert.equal(await search.inputValue(), 'Tokenverbrauch', 'Suchanfrage bleibt nach Polling erhalten.');
  assert.match(await page.locator('#activity .filter-count').innerText(), /1 von 2/);
  assert.notEqual(await page.locator('#activity details.activity-detail').first().getAttribute('open'), null, 'Geöffnete Details bleiben nach Polling erhalten.');
  await search.fill('');
  console.log('Browser: Statusänderung ohne Neubau, Suchanfrage und Detailzustand erhalten.');

  const injected = structuredClone(updated);
  injected.observedAt = new Date().toISOString();
  injected.assignment.goal.value = '<img src=x onerror="window.__injected=true"> AGENT_PROBE_TEXT';
  injected.assignment.step = {value: 'token=DEMO_SECRET', source: 'browser-test', observedAt: injected.observedAt, verification: 'self_reported'};
  injected.checks.push({name: 'CLI-Argumenttest', status: 'passed', evidence: {command: 'tool --access-token DEMO_SECRET_VALUE', exitCode: 0, finishedAt: injected.observedAt, source: 'browser-test'}});
  await writeFile(statusPath, JSON.stringify(injected));
  assert.equal((await (await fetch(base + '/status.json')).text()).includes('DEMO_SECRET_VALUE'), false, 'Statusantwort darf CLI-Secret nicht enthalten.');
  await page.getByText(/AGENT_PROBE_TEXT/).first().waitFor({timeout: 8000});
  assert.equal(await page.locator('#dashboard img').count(), 0, 'Fremdtext darf kein HTML erzeugen.');
  assert.equal(await page.evaluate(() => window.__injected === true), false, 'Fremdtext darf nicht ausführbar sein.');
  assert.equal((await page.locator('#dashboard').innerText()).includes('DEMO_SECRET'), false, 'Secrets dürfen nicht angezeigt werden.');
  console.log('Browser: HTML-Injektion inert, Secret-Wert redigiert.');

  await writeFile(statusPath, '{bad json');
  await page.waitForFunction(() => document.querySelector('#dashboard')?.textContent?.includes('AGENT_PROBE_TEXT') && /fehler|ungültig|nicht lesbar/i.test(document.querySelector('#dashboard')?.textContent || ''), null, {timeout: 8000});
  assert.match(await page.locator('#dashboard').innerText(), /AGENT_PROBE_TEXT/, 'Letzter gültiger Snapshot muss nach Fehler erhalten bleiben.');
  console.log('Browser: beschädigte Live-Quelle zeigt Fehler und letzten Snapshot.');

  const stale = structuredClone(updated);
  stale.observedAt = '2020-01-01T00:00:00Z';
  stale.assignment.goal.value = 'AGENT_PROBE_ALT';
  await writeFile(statusPath, JSON.stringify(stale));
  await page.getByText('AGENT_PROBE_ALT').first().waitFor({timeout: 8000});
  assert.match(await page.locator('#dashboard').innerText(), /veraltet/i);
  const unknown = structuredClone(updated);
  unknown.observedAt = null;
  unknown.assignment.goal.value = 'AGENT_PROBE_OHNE_ZEIT';
  await writeFile(statusPath, JSON.stringify(unknown));
  await page.getByText('AGENT_PROBE_OHNE_ZEIT').first().waitFor({timeout: 8000});
  assert.match(await page.locator('#dashboard').innerText(), /unbekannt|ungültig/i);
  const invalid = structuredClone(updated);
  invalid.observedAt = '2025-02-30T01:00:00Z';
  invalid.assignment.goal.value = 'AGENT_PROBE_UNGUELTIGE_ZEIT';
  await writeFile(statusPath, JSON.stringify(invalid));
  await page.getByText('AGENT_PROBE_UNGUELTIGE_ZEIT').first().waitFor({timeout: 8000});
  assert.match(await page.locator('.clock-grid').innerText(), /Quellzeit · observedAt\s+Nicht verfügbar/i);
  assert.match(await page.locator('#dashboard').innerText(), /Aktualität unbekannt/);
  console.log('Browser: alte, fehlende und ungültige Quellzeit markiert.');

  const live = structuredClone(updated);
  live.dataset = 'live';
  live.live = {source: 'pi_extension', ended: false};
  live.observedAt = new Date().toISOString();
  live.assignment.goal.value = 'AGENT_PROBE_LIVE_AKTIV';
  live.assignment.state = {value: 'working', source: 'Pi-Lifecycle-Event', observedAt: live.observedAt, verification: 'self_reported'};
  await writeFile(statusPath, JSON.stringify(live));
  await page.getByText('AGENT_PROBE_LIVE_AKTIV').first().waitFor({timeout: 8000});
  assert.match(await page.locator('.state-value').innerText(), /In Arbeit/);
  live.observedAt = '2020-01-01T00:00:00Z';
  live.assignment.goal.value = 'AGENT_PROBE_LIVE_VERLOREN';
  await writeFile(statusPath, JSON.stringify(live));
  await page.getByText('AGENT_PROBE_LIVE_VERLOREN').first().waitFor({timeout: 8000});
  assert.match(await page.locator('.state-value').innerText(), /Pi-Verbindung unterbrochen/);
  assert.match(await page.locator('#assignment').innerText(), /Status\s+Nicht verfügbar/);
  live.live.ended = true;
  live.observedAt = new Date().toISOString();
  live.assignment.goal.value = 'AGENT_PROBE_LIVE_BEENDET';
  await writeFile(statusPath, JSON.stringify(live));
  await page.getByText('AGENT_PROBE_LIVE_BEENDET').first().waitFor({timeout: 8000});
  assert.match(await page.locator('.state-value').innerText(), /Pi-Sitzung beendet/);
  console.log('Browser: Pi-Lebenszeichen aktiv, veraltet und beendet korrekt unterschieden.');

  const withLimits = structuredClone(updated);
  withLimits.dataset = 'live';
  withLimits.observedAt = new Date().toISOString();
  withLimits.identity.provider = {value: 'OpenAI', source: 'browser-test', observedAt: withLimits.observedAt, verification: 'self_reported'};
  withLimits.identity.model = {value: 'GPT (Modellfamilie)', source: 'browser-test', observedAt: withLimits.observedAt, verification: 'self_reported'};
  withLimits.assignment.goal.value = 'AGENT_PROBE_LIMITS';
  withLimits.usage.rateLimits = {
    value: {
      fiveHour: {remainingPercent: 75, used: 25, total: 100, resetsAt: '18:30 UTC'},
      weekly: {remainingPercent: 60, used: 40, total: 100, resetsAt: 'Sonntag 00:00 UTC'},
      detail: 'ChatGPT Plus Account Quota'
    },
    source: 'browser-test',
    observedAt: withLimits.observedAt,
    verification: 'self_reported'
  };
  await writeFile(statusPath, JSON.stringify(withLimits));
  await page.getByText('AGENT_PROBE_LIMITS').first().waitFor({timeout: 8000});
  assert.match(await page.locator('.model-value').innerText(), /OpenAI · GPT/);
  assert.match(await page.locator('.overview-model-pill').innerText(), /OpenAI · GPT/);
  assert.equal(await page.locator('.overview-quota progress').count(), 2, 'Zwei grafische Quota-Balken in der Übersicht.');
  assert.match(await page.locator('.overview-quota').innerText(), /75 % übrig/);
  assert.match(await page.locator('.overview-quota').innerText(), /60 % übrig/);
  console.log('Browser: Modell auf den ersten Blick und grafische ChatGPT-Limits verifiziert.');

  await page.evaluate(axe.source);
  for (const {width, height, columns} of [
    {width: 1200, height: 800, columns: 2},
    {width: 768, height: 1024, columns: 1},
    {width: 390, height: 844, columns: 1}
  ]) {
    await page.setViewportSize({width, height});
    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#dashboard section.card')];
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1,
        columns: getComputedStyle(document.querySelector('.dashboard-grid')).gridTemplateColumns.split(' ').length,
        cards: cards.length,
        controlsVisible: [...document.querySelectorAll('.header-actions button, .filters select')].every(node => {
          const bounds = node.getBoundingClientRect();
          return bounds.width > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1;
        })
      };
    });
    assert.equal(layout.overflow, false, `${width}px: kein horizontaler Überlauf.`);
    assert.equal(layout.columns, columns, `${width}px: erwartete Anzahl Dashboard-Spalten.`);
    assert.equal(layout.cards, 9, `${width}px: alle Bereiche bleiben vorhanden.`);
    assert.equal(layout.controlsVisible, true, `${width}px: Bedienelemente bleiben im sichtbaren Bereich.`);
    const report = await page.evaluate(() => window.axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}}));
    assert.deepEqual(report.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), [], `${width}px: axe WCAG-Verstöße`);
    if (width === 1200) {
      const initialTheme = await page.locator('html').getAttribute('data-theme');
      if (initialTheme !== 'dark') await theme.click();
      const darkReport = await page.evaluate(() => window.axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}}));
      assert.deepEqual(darkReport.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), [], '1200px: axe WCAG-Verstöße im Dunkelmodus');
      if (initialTheme !== 'dark') await theme.click();
    }
  }
  await page.emulateMedia({reducedMotion: 'no-preference'});
  assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).scrollBehavior), 'smooth', 'Normale Bewegung nutzt sanftes Scrollen.');
  await page.emulateMedia({reducedMotion: 'reduce'});
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true, 'Reduzierte Bewegung wird emuliert.');
  assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).scrollBehavior), 'auto', 'Reduzierte Bewegung deaktiviert sanftes Scrollen.');
  assert.deepEqual(errors, [], 'Keine ungefangenen Browserfehler.');
  console.log('Browser: axe WCAG A/AA und Layout bei 1200/768/390px, reduzierte Bewegung, keine Page-Errors.');
} finally {
  await browser?.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await rm(directory, {recursive: true, force: true});
}
