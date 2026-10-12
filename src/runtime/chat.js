/**
 * Runtime chat orchestrator — validate request, resolve skill, run it,
 * build context, call adapter, and return the answer envelope.
 */

import { CopilotError, ErrorCode, toErrorEnvelope } from '../adapter/errors.js';
import { SkillRegistry } from '../skills/registry.js';
import { buildContext } from './context.js';

let counter = 0;
function nextRequestId() {
  counter = (counter + 1) % 0x7fffffff;
  return `req_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export class CopilotRuntime {
  constructor({ config, adapter, registry, licenseGate, gatewayUrl } = {}) {
    this.config = config;
    this.adapter = adapter;
    this.registry = registry ?? new SkillRegistry({ skills: config?.skills ?? [] });
    this.licenseGate = licenseGate ?? null;
    // Gateway URL (D-021): satu-satunya jalur LLM bagi host app tanpa provider key.
    // Dipakai untuk arg extraction pada skill berparameter wajib.
    this.gatewayUrl = gatewayUrl ?? null;
  }

  /**
   * Enforce license (if a gate is provided). Throws before any data access.
   */
  _enforceLicense() {
    if (!this.licenseGate) return; // gate optional (tests / open build)
    const token = process.env.GROUTER_LICENSE;
    this.licenseGate.enforce(token);
  }

  /**
   * Extract required skill arguments from the user message via the model.
   * v1 runtime has no local NLU: skills with required parameters previously
   * failed with SKILL_INVALID_ARGS whenever the host did not pass `args`
   * explicitly. Natural-language requests are the primary customer path, so
   * the runtime now performs one strict JSON-extraction call to the adapter.
   * Fail-closed: any error/empty/garbage output falls back to the original
   * behavior (SKILL_INVALID_ARGS) — never invented values.
   * @returns {Promise<object>} args (provided overrides extraction)
   */
  async _resolveSkillArgs(skill, req) {
    const provided = { ...(req.args ?? {}) };
    const required = skill?.parameters?.required ?? [];
    const missing = required.filter((k) => provided[k] === undefined || provided[k] === null || provided[k] === '');
    if (missing.length === 0) return provided;
    const schema = skill?.parameters;
    if (!schema || !req.message || typeof req.message !== 'string') return provided;
    const extractionPrompt =
      'Extract skill arguments from the user message. Respond with ONLY a JSON object, no prose, no markdown. ' +
      `Required keys: ${missing.map((k) => JSON.stringify(k)).join(', ')}. ` +
      `Schema: ${JSON.stringify(schema)}. ` +
      'If a required value cannot be determined from the message, omit it. ' +
      `User message: ${JSON.stringify(req.message)}`;
    const extractionMessages = [{ role: 'user', content: extractionPrompt }];
    let answer = null;
    if (this.gatewayUrl) {
      // D-021 path: host apps hold no provider key. The ONLY LLM access is the
      // Copilot backend gateway, which owns the credential and validates the
      // host license. One small non-greedy extraction call, same ledger rules.
      const token = process.env.GROUTER_LICENSE ?? '';
      if (!token || !this.gatewayUrl) return provided;
      try {
        const res = await fetch(this.gatewayUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, messages: extractionMessages, maxTokens: 300 }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.status === 'ok') answer = body.answer ?? null;
      } catch {
        return provided; // fail closed
      }
    } else if (this.adapter?.complete) {
      // Embedded-adapter build (provider key configured host-side, tests with FakeSupplier).
      try {
        ({ answer } = await this.adapter.complete({
          model: this.config?.model,
          messages: extractionMessages,
          maxTokens: 300,
        }));
      } catch {
        return provided; // fail closed
      }
    }
    if (answer !== null) {
      const match = answer && answer.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const k of missing) {
              if (parsed[k] !== undefined && parsed[k] !== null && parsed[k] !== '') provided[k] = parsed[k];
            }
          }
        } catch { /* garbage JSON → fail closed */ }
      }
    }
    return provided;
  }

  /**
   * Handle a chat request (non-streaming).
   * @param {{message:string, userId?:string, sessionId?:string, skillHint?:string, locale?:string, user?:object}} req
   * @returns {Promise<object>}
   */
  async chat(req = {}) {
    const requestId = nextRequestId();
    try {
      validateChatRequest(req);
      this._enforceLicense();

      const skillName = this.registry.resolve(req.skillHint, req.message);

      if (!skillName) {
        if (this.registry.list().length === 0) {
          throw new CopilotError(ErrorCode.SKILL_NOT_FOUND, 'No skills are configured.', { status: 404 });
        }
        throw new CopilotError(
          ErrorCode.SKILL_NOT_FOUND,
          'I could not determine which data to use for this question. Please be more specific.',
          { status: 400 },
        );
      }

      const skill = this.registry.get(skillName);
      const args = await this._resolveSkillArgs(skill, req);
      const { data, sources } = await this.registry.run(skillName, args, {
        user: req.user ?? { id: req.userId },
        requestId,
        sessionId: req.sessionId,
      });

      const { messages, truncated } = buildContext({
        systemPrompt: this.config?.systemPrompt,
        data,
        sources,
        question: req.message,
        limits: this.config?.limits,
      });

      const { answer, usage } = await this.adapter.complete({
        model: this.config?.model,
        messages,
        maxTokens: this.config?.limits?.maxTokens,
      });

      return {
        requestId,
        status: truncated ? 'partial' : 'complete',
        answer,
        sources,
        usage,
        skill: skillName,
      };
    } catch (err) {
      const envelope = toErrorEnvelope(err, requestId);
      return { requestId, status: 'error', ...envelope };
    }
  }

  /**
   * D-021 gateway mode: build the gateway payload WITHOUT calling the
   * provider. Skills still run here (they need host-app data), the license
   * gate still applies, and the context is built locally — then the host app
   * POSTs the result to the Copilot backend gateway (/api/copilot/chat),
   * which is the only component holding the gRouter service credential.
   * @returns {Promise<{requestId, token, messages, model?, maxTokens?}>}
   */
  async buildGatewayPayload(req = {}) {
    const requestId = nextRequestId();
    validateChatRequest(req);
    this._enforceLicense();

    const skillName = this.registry.resolve(req.skillHint, req.message);
    if (!skillName) {
      if (this.registry.list().length === 0) {
        throw new CopilotError(ErrorCode.SKILL_NOT_FOUND, 'No skills are configured.', { status: 404 });
      }
      throw new CopilotError(
        ErrorCode.SKILL_NOT_FOUND,
        'I could not determine which data to use for this question. Please be more specific.',
        { status: 400 },
      );
    }

    const skill = this.registry.get(skillName);
    const args = await this._resolveSkillArgs(skill, req);
    const { data, sources } = await this.registry.run(skillName, args, {
      user: req.user ?? { id: req.userId },
      requestId,
      sessionId: req.sessionId,
    });

    const { messages, truncated } = buildContext({
      systemPrompt: this.config?.systemPrompt,
      data,
      sources,
      question: req.message,
      limits: this.config?.limits,
    });

    return {
      requestId,
      token: process.env.GROUTER_LICENSE ?? '',
      messages,
      model: this.config?.model,
      maxTokens: this.config?.limits?.maxTokens,
      meta: { skill: skillName, truncated },
    };
  }

  /**
   * Stream chat as an async generator of SSE-friendly event objects.
   */
  async *streamChat(req = {}) {
    const requestId = nextRequestId();
    try {
      validateChatRequest(req);
      this._enforceLicense();
      yield { type: 'run.started', requestId };

      const skillName = this.registry.resolve(req.skillHint, req.message);
      if (!skillName) {
        throw new CopilotError(ErrorCode.SKILL_NOT_FOUND, 'Could not determine which data to use.', {
          status: 400,
        });
      }

      yield { type: 'retrieval.status', requestId, skill: skillName, state: 'running' };

      const skill = this.registry.get(skillName);
      const args = await this._resolveSkillArgs(skill, req);
      const { data, sources } = await this.registry.run(skillName, args, {
        user: req.user ?? { id: req.userId },
        requestId,
        sessionId: req.sessionId,
      });

      yield { type: 'retrieval.status', requestId, skill: skillName, state: 'done' };
      for (const s of sources) {
        yield { type: 'source.added', requestId, source: s };
      }

      const { messages, truncated } = buildContext({
        systemPrompt: this.config?.systemPrompt,
        data,
        sources,
        question: req.message,
        limits: this.config?.limits,
      });

      for await (const evt of this.adapter.stream({
        model: this.config?.model,
        messages,
        maxTokens: this.config?.limits?.maxTokens,
      })) {
        if (evt.type === 'delta') {
          yield { type: 'answer.delta', requestId, text: evt.text };
        } else if (evt.type === 'done') {
          yield { type: 'usage.final', requestId, usage: evt.usage };
        }
      }

      yield { type: 'run.completed', requestId, status: truncated ? 'partial' : 'complete', skill: skillName };
    } catch (err) {
      if (err?.name === 'AbortError') {
        yield { type: 'run.cancelled', requestId, code: ErrorCode.CLIENT_CANCELLED };
        return;
      }
      const envelope = toErrorEnvelope(err, requestId);
      yield { type: 'run.failed', requestId, ...envelope };
    }
  }
}

function validateChatRequest(req) {
  if (!req || typeof req !== 'object') {
    throw new CopilotError(ErrorCode.INVALID_REQUEST, 'Invalid request body.', { status: 400 });
  }
  if (!req.message || typeof req.message !== 'string' || req.message.trim() === '') {
    throw new CopilotError(ErrorCode.INVALID_REQUEST, 'A non-empty "message" is required.', { status: 400 });
  }
}
