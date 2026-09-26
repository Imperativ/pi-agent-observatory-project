import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findBrowserExecutable,
  parsePercentage,
  parseRelativeReset,
  parseOpenAIUsageText,
  parseGoogleUsageText,
  parseDirectOpenAIQuota,
  parseDirectGoogleQuota,
  saveRateLimitsToStatus,
} from '../scripts/browser-quota-sync.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('findBrowserExecutable discovers installed Chromium or Chrome', async () => {
  const browser = await findBrowserExecutable();
  assert.ok(browser, 'Ein lokaler Browser muss auffindbar sein (/usr/bin/chromium)');
  assert.match(browser, /chromium|chrome|edge/i);
});

test('parsePercentage extracts integer percentages correctly', () => {
  assert.equal(parsePercentage('85%'), 85);
  assert.equal(parsePercentage('42.5 %'), 43);
  assert.equal(parsePercentage('0% übrig'), 0);
  assert.equal(parsePercentage('100 % remaining'), 100);
  assert.equal(parsePercentage('keine prozent'), null);
  assert.equal(parsePercentage(null), null);
});

test('parseRelativeReset handles relative and absolute time patterns', () => {
  const futureIso = parseRelativeReset('in 2 hours 15 mins');
  assert.ok(futureIso, 'Relative Zeitangabe muss in ISO konvertiert werden');
  const diffMinutes = Math.round((new Date(futureIso).getTime() - Date.now()) / 60000);
  assert.ok(diffMinutes >= 134 && diffMinutes <= 136, `Erwartet ~135 Minuten, erhalten: ${diffMinutes}`);

  const shortMinutes = parseRelativeReset('in 45m');
  const diffShort = Math.round((new Date(shortMinutes).getTime() - Date.now()) / 60000);
  assert.ok(diffShort >= 44 && diffShort <= 46);

  const rawIso = '2026-10-01T18:30:00Z';
  assert.equal(parseRelativeReset(rawIso), new Date(rawIso).toISOString());
});

test('parseOpenAIUsageText extracts 5h and weekly quotas from text and API data', () => {
  const sampleText = `
    Nutzungsübersicht für Ihr ChatGPT Plus Abonnement:
    5-Stunden-Limit (Standard-Modelle): 82 % verbleibend, resets in 1 hour 30 mins
    Wöchentliches Kontingent (Reasoning o1/o3): 55 % verbleibend, resets in 3 days
  `;
  const result = parseOpenAIUsageText(sampleText);
  assert.ok(result);
  assert.equal(result.fiveHour.remainingPercent, 82);
  assert.ok(result.fiveHour.resetsAt);
  assert.equal(result.weekly.remainingPercent, 55);
  assert.equal(result.detail, 'ChatGPT Quota (Browser-Sync)');

  // API data priority
  const apiData = {
    five_hour: { remaining_percent: 75, used: 20, total: 80, resets_at: '2026-09-26T18:00:00Z' },
    weekly: { remaining_percent: 40, used: 60, total: 100 },
  };
  const fromApi = parseOpenAIUsageText('', apiData);
  assert.equal(fromApi.fiveHour.remainingPercent, 75);
  assert.equal(fromApi.fiveHour.used, 20);
  assert.equal(fromApi.fiveHour.total, 80);
  assert.equal(fromApi.weekly.remainingPercent, 40);
});

test('parseGoogleUsageText extracts Gemini usage and reset time', () => {
  const geminiText = `
    Google Gemini Quota Status:
    Tageslimit Anfragen: 90 % verfügbar, erneuert in 4 Stunden
    Gemini Thinking / Pro Limit: 65 % verfügbar, erneuert in 12 Stunden
  `;
  const result = parseGoogleUsageText(geminiText);
  assert.ok(result);
  assert.equal(result.fiveHour.remainingPercent, 90);
  assert.ok(result.fiveHour.resetsAt);
  assert.equal(result.weekly.remainingPercent, 65);
  assert.equal(result.detail, 'Google Gemini Quota (Browser-Sync)');
});

test('parseDirectOpenAIQuota transforms raw API response to structured limits', () => {
  const rawApiData = {
    plan_type: 'plus',
    rate_limit: {
      allowed: false,
      limit_reached: true,
      primary_window: {
        used_percent: 100,
        limit_window_seconds: 18000,
        reset_after_seconds: 1804,
        reset_at: 1790397823,
      },
      secondary_window: {
        used_percent: 33,
        limit_window_seconds: 604800,
        reset_after_seconds: 283680,
        reset_at: 1790679699,
      },
    },
    rate_limit_reset_credits: {
      available_count: 3,
    },
  };

  const parsed = parseDirectOpenAIQuota(rawApiData);
  assert.ok(parsed);
  assert.equal(parsed.fiveHour.remainingPercent, 0);
  assert.equal(parsed.fiveHour.resetsAt, new Date(1790397823 * 1000).toISOString());
  assert.equal(parsed.weekly.remainingPercent, 67);
  assert.equal(parsed.weekly.resetsAt, new Date(1790679699 * 1000).toISOString());
  assert.match(parsed.detail, /PLUS/i);
  assert.match(parsed.detail, /3 Resets/i);
});

test('parseDirectGoogleQuota extracts Gemini and Claude model quotas correctly', () => {
  const rawGoogleData = {
    models: {
      'gemini-2.5-pro': {
        quotaInfo: { remainingFraction: 0.3790544, resetTime: '2026-09-26T05:30:30Z' },
      },
      'gemini-3.1-pro-high': {
        quotaInfo: { remainingFraction: 0.3790544, resetTime: '2026-09-26T05:30:30Z' },
      },
      'claude-sonnet-4-6': {
        quotaInfo: { remainingFraction: 1, resetTime: '2026-09-26T09:13:29Z' },
      },
    },
  };

  const parsed = parseDirectGoogleQuota(rawGoogleData);
  assert.ok(parsed);
  assert.equal(parsed.fiveHour.remainingPercent, 38);
  assert.equal(parsed.fiveHour.resetsAt, '2026-09-26T05:30:30Z');
  assert.equal(parsed.weekly.remainingPercent, 100);
  assert.equal(parsed.weekly.resetsAt, '2026-09-26T09:13:29Z');
  assert.match(parsed.detail, /Google/i);
});

test('saveRateLimitsToStatus updates status file atomically and conforms to contract', async () => {
  const dir = await mkdtemp(path.join(root, '.test-tmp-quota-'));
  const target = path.join(dir, 'agent-status.json');
  try {
    const limits = {
      fiveHour: { remainingPercent: 88, resetsAt: '2026-09-26T20:00:00Z' },
      weekly: { remainingPercent: 70 },
      detail: 'Unit-Test Sync',
    };
    const saved = await saveRateLimitsToStatus(limits, target);
    assert.equal(saved.usage.rateLimits.value.fiveHour.remainingPercent, 88);
    const text = await readFile(target, 'utf8');
    const parsed = JSON.parse(text);
    assert.equal(parsed.usage.rateLimits.value.fiveHour.remainingPercent, 88);
    assert.equal(parsed.usage.rateLimits.source, 'Unit-Test Sync');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
