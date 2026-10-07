/**
 * Context builder — assemble the model context from skill output within bounds.
 * Enforces row/byte limits and redacts obvious restricted keys.
 */

const RESTRICTED_KEYS = new Set([
  'password', 'passwd', 'token', 'secret', 'apikey', 'api_key', 'apiKey',
  'grouterapikey', 'grouter_api_key',
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
  if (typeof value === 'string') {
    // Provider keys use the `gRouter-…` format (contains digits); the product
    // name `gRouter-copilot` has no digits and must survive redaction.
    return value
      .replace(/\bgRouter-(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{6,}\b/g, '[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
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

function fitDataToContext({ rows, systemPrompt, question, sources, maxContextBytes }) {
  const fixedOverhead = (q, prompt) => {
    const sourcesBlock = sources.length ? `\n\nSources: ${JSON.stringify(sources)}` : '';
    return { sourcesBlock, total: sizeOf(prompt) + sizeOf(`Question: ${q}\n\nData:\n[]${sourcesBlock}`) };
  };

  let safePrompt = String(systemPrompt ?? '');
  let safeQuestion = String(question ?? '');
  let base = fixedOverhead(safeQuestion, safePrompt);

  while (base.total > maxContextBytes && (safePrompt.length || safeQuestion.length)) {
    if (safePrompt.length >= safeQuestion.length && safePrompt.length) {
      safePrompt = safePrompt.slice(0, Math.max(0, safePrompt.length - Math.ceil((base.total - maxContextBytes) / 2)));
    } else {
      safeQuestion = safeQuestion.slice(0, Math.max(0, safeQuestion.length - (base.total - maxContextBytes)));
    }
    base = fixedOverhead(safeQuestion, safePrompt);
  }
  if (base.total > maxContextBytes) {
    throw new RangeError('maxContextBytes is too small for the minimum chat context envelope.');
  }

  let candidate = rows;
  const render = (data) => {
    const dataBlock = JSON.stringify(data);
    const userContent = `Question: ${safeQuestion}\n\nData:\n${dataBlock}${base.sourcesBlock}`;
    return {
      userContent,
      systemContent: safePrompt,
      bytes: sizeOf(userContent) + sizeOf(safePrompt),
    };
  };

  let rendered = render(candidate);
  while (rendered.bytes > maxContextBytes && candidate.length > 0) {
    candidate = candidate.slice(0, Math.max(0, candidate.length - 1));
    rendered = render(candidate);
  }

  return { ...rendered, data: candidate };
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

  const fitted = fitDataToContext({
    rows,
    systemPrompt,
    question,
    sources,
    maxContextBytes,
  });
  const userContent = fitted.userContent;
  const messages = [
    { role: 'system', content: fitted.systemContent },
    { role: 'user', content: userContent },
  ];

  const truncated = fitted.data.length < rows.length
    || rows.length < (Array.isArray(safeData) ? safeData.length : 1)
    || fitted.systemContent !== String(systemPrompt ?? '')
    || !userContent.includes(String(question ?? ''));

  return { messages, truncated, bytes: fitted.bytes };
}
