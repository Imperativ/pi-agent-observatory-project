import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { chromium } from 'playwright-core';
import { parseStatus } from '../src/contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function findBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/brave',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }
  return null;
}

export function getProfileDir() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, '.config', 'pi-agent-observatory', 'quota-browser-profile');
}

export function parsePercentage(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number' && Number.isFinite(text) && text >= 0 && text <= 100) return Math.round(text);
  const match = String(text).match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (match) {
    const val = parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(val) && val >= 0 && val <= 100) return Math.round(val);
  }
  return null;
}

export function parseRelativeReset(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  let totalMinutes = 0;
  let matched = false;

  const hoursMatch = lower.match(/(\d+)\s*(?:h|std|stunde|stunden|hours?)/);
  if (hoursMatch) {
    totalMinutes += parseInt(hoursMatch[1], 10) * 60;
    matched = true;
  }
  const minsMatch = lower.match(/(\d+)\s*(?:m|min|minute|minuten|minutes?)/);
  if (minsMatch) {
    totalMinutes += parseInt(minsMatch[1], 10);
    matched = true;
  }
  const secsMatch = lower.match(/(\d+)\s*(?:s|sek|sekunde|sekunden|seconds?)/);
  if (secsMatch && !hoursMatch && !minsMatch) {
    totalMinutes += Math.max(1, Math.ceil(parseInt(secsMatch[1], 10) / 60));
    matched = true;
  }

  if (matched && totalMinutes > 0) {
    return new Date(Date.now() + totalMinutes * 60 * 1000).toISOString();
  }

  if (!Number.isNaN(Date.parse(trimmed))) {
    return new Date(trimmed).toISOString();
  }

  return trimmed;
}

export function parseOpenAIUsageText(text, apiData = null) {
  if (!text && !apiData) return null;

  let fiveHour = null;
  let weekly = null;

  if (apiData && typeof apiData === 'object') {
    if (apiData.five_hour || apiData.fiveHour) {
      const raw = apiData.five_hour || apiData.fiveHour;
      fiveHour = {
        remainingPercent: parsePercentage(raw.remaining_percent ?? raw.remainingPercent),
        used: typeof raw.used === 'number' ? raw.used : null,
        total: typeof raw.total === 'number' ? raw.total : null,
        resetsAt: parseRelativeReset(raw.resets_at ?? raw.resetsAt),
      };
    }
    if (apiData.weekly) {
      const raw = apiData.weekly;
      weekly = {
        remainingPercent: parsePercentage(raw.remaining_percent ?? raw.remainingPercent),
        used: typeof raw.used === 'number' ? raw.used : null,
        total: typeof raw.total === 'number' ? raw.total : null,
        resetsAt: parseRelativeReset(raw.resets_at ?? raw.resetsAt),
      };
    }
  }

  if (text) {
    const fiveHourMatch = text.match(/(?:5[- ](?:stunden?|hours?)|standard|nachrichten)[^.\n]*?(\d+)\s*%/i)
      || text.match(/(\d+)\s*%\s*(?:remaining|übrig)[^.\n]*?(?:5[- ](?:stunden?|hours?))/i);
    const reset5hMatch = text.match(/(?:resets?|reset|erneuert?)\s+(?:in|um|at)\s+([^\n.,;]+)/i);

    if (fiveHourMatch && !fiveHour) {
      fiveHour = {
        remainingPercent: parseInt(fiveHourMatch[1], 10),
        resetsAt: reset5hMatch ? parseRelativeReset(reset5hMatch[1]) : null,
      };
    }

    const weeklyMatch = text.match(/(?:wöchentlich|weekly|reasoning|o-serie|o1|o3|o4)[^.\n]*?(\d+)\s*%/i)
      || text.match(/(\d+)\s*%\s*(?:remaining|übrig)[^.\n]*?(?:wöchentlich|weekly|reasoning)/i);
    const resetWeeklyMatch = text.match(/(?:weekly|wöchentlich)[^.\n]*?(?:resets?|reset)\s+(?:in|am|at)\s+([^\n.,;]+)/i);

    if (weeklyMatch && !weekly) {
      weekly = {
        remainingPercent: parseInt(weeklyMatch[1], 10),
        resetsAt: resetWeeklyMatch ? parseRelativeReset(resetWeeklyMatch[1]) : null,
      };
    }

    if (!fiveHour && !weekly) {
      const anyPct = text.match(/(\d+)\s*%/);
      if (anyPct) {
        fiveHour = {
          remainingPercent: parseInt(anyPct[1], 10),
          resetsAt: reset5hMatch ? parseRelativeReset(reset5hMatch[1]) : null,
        };
      }
    }
  }

  if (!fiveHour && !weekly) return null;

  return {
    fiveHour,
    weekly,
    detail: 'ChatGPT Quota (Browser-Sync)',
  };
}

export function parseGoogleUsageText(text, apiData = null) {
  if (!text && !apiData) return null;

  let fiveHour = null;
  let weekly = null;

  if (apiData && typeof apiData === 'object') {
    if (apiData.daily || apiData.requests || apiData.quota) {
      const q = apiData.daily || apiData.quota || apiData.requests;
      fiveHour = {
        remainingPercent: parsePercentage(q.remaining_percent ?? q.remainingPercent),
        used: typeof q.used === 'number' ? q.used : null,
        total: typeof q.total === 'number' ? q.total : null,
        resetsAt: parseRelativeReset(q.resets_at ?? q.resetsAt),
      };
    }
  }

  if (text) {
    const qMatch = text.match(/(?:anfragen|requests|quota|kontingent|tageslimit|daily)[^.\n]*?(\d+)\s*%/i)
      || text.match(/(\d+)\s*%\s*(?:remaining|übrig|verfügbar)/i);
    const resetMatch = text.match(/(?:resets?|reset|erneuert?|wieder verfügbar)\s+(?:in|um|at|nach)\s+([^\n.,;]+)/i);

    if (qMatch) {
      fiveHour = {
        remainingPercent: parseInt(qMatch[1], 10),
        resetsAt: resetMatch ? parseRelativeReset(resetMatch[1]) : null,
      };
    }

    const proMatch = text.match(/(?:thinking|pro|advanced|erweitert)[^.\n]*?(\d+)\s*%/i);
    if (proMatch) {
      weekly = {
        remainingPercent: parseInt(proMatch[1], 10),
        resetsAt: resetMatch ? parseRelativeReset(resetMatch[1]) : null,
      };
    }
  }

  if (!fiveHour && !weekly) return null;

  return {
    fiveHour,
    weekly,
    detail: 'Google Gemini Quota (Browser-Sync)',
  };
}

export async function scrapeOpenAI(page) {
  let capturedApiQuota = null;

  page.on('response', async res => {
    try {
      const url = res.url();
      if (/usage|rate_limit|account|codex/i.test(url) && res.ok()) {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json')) {
          const json = await res.json().catch(() => null);
          if (json && (json.rate_limit || json.five_hour || json.weekly || json.usage)) {
            capturedApiQuota = json;
          }
        }
      }
    } catch {}
  });

  try {
    await page.goto('https://chatgpt.com/settings/usage?tab=overview', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
  } catch {
    await page.goto('https://chatgpt.com/settings/usage', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => null);
  }

  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (currentUrl.includes('/auth/login') || currentUrl.includes('/login') || currentUrl.includes('auth.openai.com')) {
    return null;
  }

  const pageText = await page.locator('body').innerText().catch(() => '');
  return parseOpenAIUsageText(pageText, capturedApiQuota);
}

export async function scrapeGoogle(page) {
  let capturedApiQuota = null;

  page.on('response', async res => {
    try {
      const url = res.url();
      if (/usage|quota|limits|batchexecute/i.test(url) && res.ok()) {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json')) {
          const json = await res.json().catch(() => null);
          if (json && (json.quota || json.limits || json.usage)) {
            capturedApiQuota = json;
          }
        }
      }
    } catch {}
  });

  try {
    await page.goto('https://gemini.google.com/usage', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
  } catch {}

  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (currentUrl.includes('accounts.google.com') || currentUrl.includes('/signin')) {
    return null;
  }

  const pageText = await page.locator('body').innerText().catch(() => '');
  return parseGoogleUsageText(pageText, capturedApiQuota);
}

export async function saveRateLimitsToStatus(limits, targetPath) {
  const targetDir = path.dirname(targetPath);
  const lockPath = path.join(targetDir, 'agent-status.lock');

  try {
    const lockStat = await access(lockPath, fsConstants.F_OK).then(() => true).catch(() => false);
    if (lockStat) {
      console.warn('Hinweis: agent-status.lock ist aktiv. Werte werden atomar integriert.');
    }
  } catch {}

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
          name: { value: 'Browser Quota Monitor', source: 'browser-quota-sync', observedAt: new Date().toISOString(), verification: 'self_reported' },
        },
        assignment: {
          state: { value: 'idle', source: 'browser-quota-sync', observedAt: new Date().toISOString(), verification: 'self_reported' },
        },
        usage: {},
      };
    } else {
      throw error;
    }
  }

  if (!existing.usage) existing.usage = {};
  existing.observedAt = new Date().toISOString();
  existing.usage.rateLimits = {
    value: limits,
    source: limits.detail || 'Browser-Sync',
    observedAt: existing.observedAt,
    verification: 'self_reported',
  };

  const content = JSON.stringify(existing, null, 2) + '\n';
  parseStatus(content);

  const tempPath = path.join(targetDir, `agent-status.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await writeFile(tempPath, content, { flag: 'wx', mode: 0o600 });
    await rename(tempPath, targetPath);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
  return existing;
}

export async function runLogin(provider = 'openai') {
  const executablePath = await findBrowserExecutable();
  if (!executablePath) throw new Error('Kein lokaler Chrome/Chromium Browser gefunden.');

  const profileDir = getProfileDir();
  await mkdir(profileDir, { recursive: true });

  const targetUrl = provider === 'google'
    ? 'https://gemini.google.com/usage'
    : 'https://chatgpt.com/settings/usage?tab=overview';

  console.log(`\n======================================================`);
  console.log(`  BROWSER LOGIN FÜR ${provider.toUpperCase()}`);
  console.log(`======================================================`);
  console.log(`Browser: ${executablePath}`);
  console.log(`Profil:  ${profileDir}`);
  console.log(`Ziel:    ${targetUrl}\n`);
  console.log(`Ein sichtbares Browserfenster wird geöffnet.`);
  console.log(`Melde dich an. Die Sitzung wird automatisch erkannt und gespeichert,\nsobald du eingeloggt bist oder das Browserfenster schließt.\n`);

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(targetUrl).catch(() => {});

  let done = false;
  const finish = () => { done = true; };

  context.on('close', finish);
  page.on('close', finish);

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Drücke [ENTER] sobald du eingeloggt bist (oder warte auf Auto-Erkennung)... ', () => {
      rl.close();
      finish();
    });
  }

  const startTime = Date.now();
  const maxWaitMs = 180000;

  while (!done && (Date.now() - startTime < maxWaitMs)) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const url = page.url();
      const isAuthPage = url.includes('/login') || url.includes('/auth') || url.includes('accounts.google.com');
      const isUsagePage = (provider === 'google' && url.includes('gemini.google.com/usage'))
        || (provider !== 'google' && url.includes('chatgpt.com/settings/usage'));

      if (!isAuthPage && isUsagePage) {
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (bodyText && !bodyText.includes('Log in') && !bodyText.includes('Anmelden')) {
          console.log('✔ Anmeldung erkannt! Sitzung wird gespeichert...');
          await page.waitForTimeout(2000);
          break;
        }
      }
    } catch {
      break;
    }
  }

  console.log('Sitzung wird gespeichert und Browser geschlossen...');
  await context.close().catch(() => {});
  console.log(`✔ Profil erfolgreich aktualisiert! Du kannst nun "npm run quota:sync" oder "/limits sync" in Pi nutzen.\n`);
}

export async function runSync(provider = 'auto', options = {}) {
  const executablePath = await findBrowserExecutable();
  if (!executablePath) throw new Error('Kein lokaler Chrome/Chromium Browser gefunden.');

  const profileDir = getProfileDir();
  const headless = options.headless !== false;

  let activeProvider = provider;
  if (activeProvider === 'auto') {
    try {
      const statusText = await readFile(path.join(root, 'agent-status.json'), 'utf8');
      const parsed = JSON.parse(statusText);
      const p = parsed?.identity?.provider?.value || '';
      if (/google|gemini/i.test(p)) activeProvider = 'google';
      else activeProvider = 'openai';
    } catch {
      activeProvider = 'openai';
    }
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    let limits = null;

    if (activeProvider === 'google') {
      limits = await scrapeGoogle(page);
    } else {
      limits = await scrapeOpenAI(page);
    }

    if (!limits) {
      throw new Error(`LOGIN_REQUIRED: Keine Quota-Daten für ${activeProvider} gefunden. Bitte "npm run quota:login" ausführen.`);
    }

    if (options.write !== false) {
      const statusPath = options.statusPath || path.join(root, 'agent-status.json');
      await saveRateLimitsToStatus(limits, statusPath);
    }

    return limits;
  } finally {
    await context.close();
  }
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('browser-quota-sync.mjs')) {
  const command = process.argv[2] || 'sync';
  const provider = process.argv[3] || 'auto';
  const isJson = process.argv.includes('--json');

  if (command === 'login') {
    runLogin(provider).catch(err => {
      console.error('Login-Fehler:', err.message);
      process.exit(1);
    });
  } else if (command === 'sync') {
    runSync(provider).then(limits => {
      if (isJson) {
        console.log(JSON.stringify({ success: true, limits }));
      } else {
        console.log('✔ Quota-Sync erfolgreich:', JSON.stringify(limits, null, 2));
      }
    }).catch(err => {
      if (isJson) {
        console.error(JSON.stringify({ success: false, error: err.message }));
      } else {
        console.error('Sync-Fehler:', err.message);
      }
      process.exit(1);
    });
  } else {
    console.log(`Verwendung: node scripts/browser-quota-sync.mjs <login|sync> [openai|google|auto] [--json]`);
    process.exit(0);
  }
}
