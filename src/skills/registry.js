/**
 * Skill registry — load, validate, resolve, and execute skills.
 */

import { validateSkill, validateArgs } from './validator.js';
import { CopilotError, ErrorCode } from '../adapter/errors.js';

export class SkillRegistry {
  constructor({ skills = [] } = {}) {
    this.skills = new Map();
    this.invalid = [];
    for (const skill of skills) {
      this.register(skill);
    }
  }

  register(skill) {
    const check = validateSkill(skill);
    if (!check.ok) {
      this.invalid.push({ name: skill?.name ?? '<anonymous>', errors: check.errors });
      return false;
    }
    this.skills.set(skill.name, skill);
    return true;
  }

  get(name) {
    return this.skills.get(name) ?? null;
  }

  list() {
    return [...this.skills.values()];
  }

  has(name) {
    return this.skills.has(name);
  }

  /**
   * Resolve a skill from an optional explicit hint, falling back to a
   * keyword matcher over skill descriptions.
   * @returns {string|null} skill name or null if ambiguous/not found
   */
  resolve(hint, message) {
    if (hint && this.has(hint)) return hint;

    const names = this.list().map((s) => s.name);
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];

    if (!message || typeof message !== 'string') return null;

    const text = message.toLowerCase();
    const textWords = text.split(/[^a-z0-9]+/).filter(Boolean);

    const scored = this.list().map((s) => {
      const desc = (s.description || '').toLowerCase();
      const name = s.name.toLowerCase();
      let score = 0;
      // name token match is a strong signal
      for (const token of name.split(/[^a-z0-9]+/).filter(Boolean)) {
        if (token.length >= 3 && text.includes(token)) score += 3;
      }
      // description token match, with light plural/stem tolerance
      for (const token of desc.split(/[^a-z0-9]+/).filter(Boolean)) {
        if (token.length < 4) continue;
        if (text.includes(token)) {
          score += 1;
          continue;
        }
        if (stemMatch(textWords, token)) score += 1;
      }
      return { name: s.name, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (top.score === 0) return null;
    // ambiguous if a runner-up ties the top non-zero score
    const runnerUp = scored[1];
    if (runnerUp && runnerUp.score === top.score) return null;
    return top.name;
  }

  /**
   * Execute a skill by name with raw args + context.
   * Validates args against the skill schema, injects `user`, and returns the
   * normalized result (data + optional sources).
   */
  async run(name, args = {}, ctx = {}) {
    const skill = this.get(name);
    if (!skill) {
      throw new CopilotError(ErrorCode.SKILL_NOT_FOUND, `Skill "${name}" not found.`, { status: 404 });
    }

    const { ok, errors } = validateArgs(skill.parameters, args);
    if (!ok) {
      throw new CopilotError(ErrorCode.SKILL_INVALID_ARGS, `Invalid arguments: ${errors.join('; ')}`, {
        status: 400,
      });
    }

    if (skill.readOnly !== true) {
      throw new CopilotError(
        ErrorCode.SCOPE_DENIED,
        'Mutating skills are not available in this version.',
        { status: 403 },
      );
    }

    try {
      const user = ctx.user ?? args.user ?? null;
      const out = await skill.run({ ...args, user }, ctx);
      return normalizeSkillOutput(out);
    } catch (err) {
      if (err instanceof CopilotError) throw err;
      throw new CopilotError(ErrorCode.SKILL_FAILED, `Skill "${name}" failed.`, {
        status: 500,
        cause: err,
      });
    }
  }
}

/**
 * Light plural/stem tolerance: match if a text word starts with the token
 * and differs only by a common suffix (e.g. "customers" vs "customer").
 */
function stemMatch(textWords, token) {
  for (const w of textWords) {
    if (w === token) return true;
    // text word is a variant of token (customers vs customer)
    if (w.startsWith(token)) {
      const rest = w.slice(token.length);
      if (['', 's', 'es', 'ing', 'ed'].includes(rest)) return true;
    }
    // token is a variant of text word (customer vs customers)
    if (token.startsWith(w)) {
      const rest = token.slice(w.length);
      if (['s', 'es', 'ing', 'ed'].includes(rest)) return true;
    }
  }
  return false;
}

function normalizeSkillOutput(out) {
  if (out === undefined || out === null) {
    return { data: null, sources: [] };
  }
  if (Array.isArray(out)) {
    return { data: out, sources: [] };
  }
  if (typeof out === 'object' && ('data' in out || 'sources' in out)) {
    return {
      data: out.data ?? null,
      sources: Array.isArray(out.sources) ? out.sources : [],
    };
  }
  return { data: out, sources: [] };
}
