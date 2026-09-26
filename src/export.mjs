import { redact, normalizeStatus, parseStatus } from './contract.mjs';

/**
 * Anonymize user-specific absolute filesystem paths across platforms (Linux, macOS, Windows).
 * Replaces /home/username or /Users/username or C:\Users\username with generic markers.
 */
export function sanitizePaths(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/(?:\/home\/|\/Users\/)[a-zA-Z0-9_.-]+(?=\/|$)/g, '/home/<user>')
    .replace(/[a-zA-Z]:\\(?:Users|Benutzer)\\[a-zA-Z0-9_.-]+(?=\\|\/|$)/gi, 'C:\\Users\\<user>');
}

/**
 * Recursively sanitize strings inside nested objects/arrays to mask sensitive path patterns.
 */
function sanitizePathsDeep(value, depth = 0) {
  if (depth > 20) return value;
  if (typeof value === 'string') return sanitizePaths(value);
  if (Array.isArray(value)) return value.map(item => sanitizePathsDeep(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizePathsDeep(v, depth + 1);
    }
    return result;
  }
  return value;
}

/**
 * Anonymizes an agent status snapshot:
 * 1. Deep secret redaction (credentials, tokens, keys)
 * 2. Path anonymization (masks usernames and machine-specific homedirs)
 * 3. Validation against the normalized status contract
 */
export function anonymizeStatus(rawStatus) {
  let statusObj;
  if (typeof rawStatus === 'string') {
    statusObj = parseStatus(rawStatus);
  } else if (rawStatus && typeof rawStatus === 'object') {
    statusObj = normalizeStatus(rawStatus);
  } else {
    throw new Error('Ungültiger Status für Export: Objekt oder JSON-String erforderlich.');
  }

  // Step 1: Deep redaction of API keys, Bearer tokens, private keys
  const redacted = redact(statusObj);

  // Step 2: Mask user home directories and user accounts in paths
  const anonymized = sanitizePathsDeep(redacted);

  return anonymized;
}

/**
 * Create a structured diagnostic export bundle ready for sharing or troubleshooting.
 */
export function createAnonymizedExport(status, options = {}) {
  const anonymizedStatus = anonymizeStatus(status);
  const now = options.now instanceof Date ? options.now : new Date();

  return {
    exportVersion: '1.0',
    exportedAt: now.toISOString(),
    format: 'pi-agent-observatory-diagnostics',
    anonymized: true,
    environmentHint: {
      platform: typeof process !== 'undefined' ? process.platform : 'browser',
    },
    status: anonymizedStatus,
  };
}

/**
 * Returns formatted JSON for export.
 */
export function exportAnonymizedStatusJson(status, options = {}) {
  const bundle = createAnonymizedExport(status, options);
  return JSON.stringify(bundle, null, 2) + '\n';
}
