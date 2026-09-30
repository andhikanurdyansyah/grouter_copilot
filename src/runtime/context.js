/**
 * Context builder — assemble the model context from skill output within bounds.
 * Enforces row/byte limits and redacts obvious restricted keys.
 */

const RESTRICTED_KEYS = new Set([
  'password', 'passwd', 'token', 'secret', 'apikey', 'api_key', 'apiKey',
  'authorization', 'cookie', 'credit_card', 'card_number', 'cvv', 'ssn',
]);

function sizeOf(value) {
  try {
    return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
}

function redactValue(value, key) {
  if (typeof key === 'string' && RESTRICTED_KEYS.has(key.toLowerCase())) {
    return '[REDACTED]';
  }
  if (typeof value === 'string' && /\bsk-[A-Za-z0-9_-]{8,}\b/.test(value)) {
    return value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  }
  return value;
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(redact(v), k);
    }
    return out;
  }
  return value;
}

function truncateRows(rows, maxRows) {
  const arr = Array.isArray(rows) ? rows : [rows];
  return arr.slice(0, maxRows);
}

/**
 * Build the model messages from skill output.
 * @param {{systemPrompt:string, data:any, sources:Array, question:string, limits:object}}
 * @returns {{messages:Array<{role:string,content:string}>, truncated:boolean, bytes:number}}
 */
export function buildContext({ systemPrompt, data, sources = [], question, limits = {} }) {
  const maxRows = limits.maxRows ?? 500;
  const maxContextBytes = limits.maxContextBytes ?? 32_000;

  const safeData = redact(data);
  const rows = truncateRows(safeData, maxRows);

  const dataBlock = JSON.stringify(rows);
  const sourcesBlock = sources.length ? `\n\nSources: ${JSON.stringify(sources)}` : '';

  const userContent = `Question: ${question}\n\nData:\n${dataBlock}${sourcesBlock}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  const bytes = sizeOf(userContent) + sizeOf(systemPrompt);
  const truncated = bytes > maxContextBytes || rows.length < (Array.isArray(data) ? data.length : 1);

  return { messages, truncated, bytes };
}
