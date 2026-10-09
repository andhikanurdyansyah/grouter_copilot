/**
 * gRouter adapter — the ONLY outbound boundary of Copilot.
 *
 * Exposes only canonical fields (model catalog id, messages, stream events,
 * usage, status, safe errors). Never exposes provider, connection, combo,
 * fallback, or raw upstream model ids to Copilot clients.
 *
 * The real implementation calls the gRouter public API using GROUTER_API_KEY.
 * For tests and local development, `FakeSupplier` provides a deterministic
 * stand-in so no real key or network is required.
 */

import { CopilotError, ErrorCode } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
// A4 fix: the gRouter contract base is https://prod.grouter.web.id — the
// adapter appends `/v1/chat/completions` itself, so the base must NOT include
// /v1. (The old default `https://api.grouter.io` was never the real contract.)
const DEFAULT_BASE_URL = process.env.GROUTER_BASE_URL || 'https://prod.grouter.web.id';

/**
 * Extract the first balanced JSON object/array from a string (string-aware
 * brace scan). Returns null when no complete JSON value is found. Used to
 * tolerate upstream responses that append SSE framing after the JSON body.
 */
function parseFirstJsonObject(text) {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export class GrouterAdapter {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = apiKey || process.env.GROUTER_API_KEY || null;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  _requireKey() {
    if (!this.apiKey) {
      throw new CopilotError(ErrorCode.NOT_CONFIGURED, 'GROUTER_API_KEY is not set.', { status: 500 });
    }
  }

  /**
   * Non-streaming completion.
   * @param {{model:string, messages:Array<{role:string,content:string}>, maxTokens?:number}} opts
   * @returns {Promise<{answer:string, usage:{inputTokens:number,outputTokens:number}}>}
   */
  async complete({ model, messages, maxTokens }) {
    this._requireKey();
    if (!model || !Array.isArray(messages) || messages.length === 0) {
      throw new CopilotError(ErrorCode.INVALID_REQUEST, 'model and messages are required.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens ?? undefined }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Upstream AI service returned an error.', {
          retryable: res.status >= 500 || res.status === 429,
        });
      }

      // gRouter may answer with content-type text/event-stream even for a
      // non-streaming request, appending SSE framing ("data: [DONE]") after the
      // single JSON object. Extract the FIRST balanced JSON value (string-aware
      // scan) instead of failing — trailing SSE frames are ignored.
      const rawBody = await res.text();
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = parseFirstJsonObject(rawBody);
        if (!data) {
          throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Upstream AI service returned a malformed response.', { retryable: false });
        }
      }
      if (!Array.isArray(data?.choices) || data.choices.length === 0 || typeof data?.choices?.[0]?.message?.content !== 'string') {
        // Malformed upstream response (e.g. empty choices): never treat as success.
        throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Upstream AI service returned a malformed response.', { retryable: false });
      }
      const answer = data.choices[0].message.content;
      const usage = data?.usage ?? {};
      return {
        answer,
        usage: {
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof CopilotError) throw err;
      if (err?.name === 'AbortError') {
        throw new CopilotError(ErrorCode.TIMEOUT, 'Upstream request timed out.', { retryable: true });
      }
      throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Unable to reach the upstream AI service.', {
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Streaming completion via async iterator.
   * @returns {AsyncGenerator<{type:'delta'|'done'|'error', text?:string, usage?:object}>}
   */
  async *stream({ model, messages, maxTokens }) {
    this._requireKey();
    // Minimal streaming: rely on the fetch response body as an NDJSON stream.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens ?? undefined, stream: true }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Unable to reach the upstream AI service.', {
        retryable: true,
      });
    }

    if (!res.ok) {
      clearTimeout(timer);
      throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Upstream AI service returned an error.', {
        retryable: res.status >= 500 || res.status === 429,
      });
    }

    // The fake supplier supports a plain `text/event-stream` of `data: {json}` lines.
    const reader = res.body?.getReader?.();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage = { inputTokens: 0, outputTokens: 0 };

    try {
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            const text = chunk?.choices?.[0]?.delta?.content ?? '';
            if (chunk?.usage) usage = chunk.usage;
            if (text) yield { type: 'delta', text };
          } catch {
            // skip malformed chunk
          }
        }
      }
      yield { type: 'done', usage };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Deterministic fake supplier for tests and local development.
 * Implements the same fetch contract the adapter expects.
 */
export class FakeSupplier {
  constructor({ echo = true, latencyMs = 0 } = {}) {
    this.echo = echo;
    this.latencyMs = latencyMs;
  }

  async fetch(url, init = {}) {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const body = JSON.parse(init.body || '{}');
    const model = body.model;
    const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user');

    if (init.signal?.aborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }

    const content = this.echo
      ? `[${model}] ${lastUser?.content ?? ''}`
      : 'ok';

    const usage = {
      prompt_tokens: (lastUser?.content?.length ?? 0),
      completion_tokens: content.length,
    };

    if (body.stream) {
      const chunks = content.match(/.{1,4}/gs) ?? [content];
      const lines = chunks
        .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
        .join('');
      const done = `data: ${JSON.stringify({ choices: [{ delta: {} }], usage })}\n\ndata: [DONE]\n\n`;
      return new Response(lines + done, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    return new Response(
      JSON.stringify({ choices: [{ message: { content } }], usage }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
}
