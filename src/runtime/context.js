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
      .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/\b(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
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

function truncateUtf8(value, maxBytes) {
  if (sizeOf(value) <= maxBytes) return value;
  const chars = Array.from(value);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (sizeOf(chars.slice(0, mid).join('')) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join('');
}

export function sanitizeHistory(history, limits = {}) {
  const maxTurns = Number.isSafeInteger(limits.maxHistoryTurns) && limits.maxHistoryTurns > 0
    ? Math.min(limits.maxHistoryTurns, 20) : 10;
  const maxBytes = Number.isSafeInteger(limits.maxHistoryBytes) && limits.maxHistoryBytes >= 0
    ? Math.min(limits.maxHistoryBytes, 16_000) : 8_000;
  const selected = (Array.isArray(history) ? history : []).filter((m) => m && typeof m === 'object'
    && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-maxTurns);
  const kept = [];
  let bytes = 0;
  // Work backwards so a byte limit retains the newest turns, then restore order.
  for (let i = selected.length - 1; i >= 0; i -= 1) {
    const original = String(redact(selected[i].content));
    const fitted = truncateUtf8(original, Math.max(0, maxBytes - bytes));
    if (!fitted) break;
    kept.push({ role: selected[i].role, content: fitted });
    bytes += sizeOf(fitted);
    if (fitted !== original) break;
  }
  const messages = kept.reverse();
  const truncated = messages.length !== selected.length
    || messages.some((m, i) => m.content !== String(redact(selected[i].content)));
  return { messages, bytes, truncated };
}
export function fitMessagesToContext(messages, maxBytes) {
  let fitted = messages.map((message) => ({ ...message }));
  const bytes = () => fitted.reduce((total, message) => total + sizeOf(message.content), 0);
  let truncated = false;
  while (bytes() > maxBytes && fitted.length > 2) {
    fitted.splice(1, 1);
    truncated = true;
  }
  while (bytes() > maxBytes && fitted.some((message, index) => index === 0 || index === fitted.length - 1)) {
    const system = fitted[0];
    const question = fitted[fitted.length - 1];
    const excess = bytes() - maxBytes;
    const target = system.content.length >= question.content.length ? system : question;
    const next = truncateUtf8(target.content, Math.max(0, sizeOf(target.content) - excess));
    if (next === target.content) break;
    target.content = next;
    truncated = true;
  }
  if (bytes() > maxBytes) throw new RangeError('maxContextBytes is too small for the minimum chat context envelope.');
  return { messages: fitted, bytes: bytes(), truncated };
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
      safePrompt = truncateUtf8(safePrompt, Math.max(0, sizeOf(safePrompt) - Math.ceil((base.total - maxContextBytes) / 2)));
    } else {
      safeQuestion = truncateUtf8(safeQuestion, Math.max(0, sizeOf(safeQuestion) - (base.total - maxContextBytes)));
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
 * @param {{systemPrompt:string, data:any, sources:Array, question:string, history?:Array, limits:object}}
 * @returns {{messages:Array<{role:string,content:string}>, truncated:boolean, bytes:number}}
 */
export function buildContext({ systemPrompt, data, sources = [], question, history = [], limits = {} }) {
  const maxRows = limits.maxRows ?? 500;
  const maxContextBytes = limits.maxContextBytes ?? 32_000;

  const safeData = redact(data);
  const safeSources = redact(sources);
  const rows = truncateRows(safeData, maxRows);

  const safeHistory = sanitizeHistory(history, {
    ...limits,
    maxHistoryBytes: Math.min(
      Number.isSafeInteger(limits.maxHistoryBytes) ? limits.maxHistoryBytes : 8_000,
      Math.max(0, maxContextBytes),
    ),
  });
  const fitted = fitDataToContext({
    rows,
    systemPrompt,
    question,
    sources: safeSources,
    maxContextBytes: Math.max(0, maxContextBytes - safeHistory.bytes),
  });
  const userContent = fitted.userContent;
  const messages = [
    { role: 'system', content: fitted.systemContent },
    ...safeHistory.messages,
    { role: 'user', content: userContent },
  ];

  const truncated = safeHistory.truncated
    || fitted.data.length < rows.length
    || rows.length < (Array.isArray(safeData) ? safeData.length : 1)
    || fitted.systemContent !== String(systemPrompt ?? '')
    || !userContent.includes(String(question ?? ''));

  return { messages, truncated, bytes: fitted.bytes + safeHistory.bytes };
}
