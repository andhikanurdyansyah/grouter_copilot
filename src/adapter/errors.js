/**
 * gRouter Copilot — error taxonomy.
 * Stable machine-readable codes + safe messages. Never expose secrets,
 * stack traces, raw upstream errors, or SQL.
 */

export class CopilotError extends Error {
  constructor(code, message, { retryable = false, cause = null, status = 500 } = {}) {
    super(message);
    this.name = 'CopilotError';
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
    this.status = status;
  }
}

export const ErrorCode = {
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_INVALID_ARGS: 'SKILL_INVALID_ARGS',
  SKILL_FAILED: 'SKILL_FAILED',
  SCOPE_DENIED: 'SCOPE_DENIED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  CLIENT_CANCELLED: 'CLIENT_CANCELLED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
};

export function toErrorEnvelope(err, requestId) {
  if (err instanceof CopilotError) {
    return {
      requestId,
      code: err.code,
      message: err.message,
      retryable: err.retryable,
    };
  }
  // Unknown error: do not leak internals.
  return {
    requestId,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
    retryable: false,
  };
}
