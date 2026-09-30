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
  constructor({ config, adapter, registry } = {}) {
    this.config = config;
    this.adapter = adapter;
    this.registry = registry ?? new SkillRegistry({ skills: config?.skills ?? [] });
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

      const { data, sources } = await this.registry.run(skillName, req.args ?? {}, {
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
   * Stream chat as an async generator of SSE-friendly event objects.
   */
  async *streamChat(req = {}) {
    const requestId = nextRequestId();
    try {
      validateChatRequest(req);
      yield { type: 'run.started', requestId };

      const skillName = this.registry.resolve(req.skillHint, req.message);
      if (!skillName) {
        throw new CopilotError(ErrorCode.SKILL_NOT_FOUND, 'Could not determine which data to use.', {
          status: 400,
        });
      }

      yield { type: 'retrieval.status', requestId, skill: skillName, state: 'running' };

      const { data, sources } = await this.registry.run(skillName, req.args ?? {}, {
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
