/**
 * Skill registry — load, validate, resolve, and execute skills.
 */

import { validateSkill, validateArgs } from './validator.js';
import { CopilotError, ErrorCode } from '../adapter/errors.js';

export class SkillRegistry {
  constructor({ skills = [] } = {}) {
    this.skills = new Map();
    this.intentMatchers = new Map();
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
    this.intentMatchers.set(skill.name, compileIntentMatcher(skill));
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

    if (!message || typeof message !== 'string') return null;

    const text = normalizeText(message);
    const textWords = tokenize(text);

    const scored = this.list().map((s) => {
      const desc = normalizeText(s.description || '');
      const name = normalizeText(s.name);
      let score = 0;

      const matcher = this.intentMatchers.get(s.name);
      if (matcher) {
        if (matcher.phrases.some((pattern) => pattern.test(text))) score += 6;
        if (matcher.synonyms.some((pattern) => pattern.test(text))) score += 4;
      }

      // name token match is a strong signal
      for (const token of uniqueTokens(name)) {
        if (token.length >= 3 && containsToken(text, token)) score += 3;
      }
      // description token match, with light plural/stem tolerance
      for (const token of uniqueTokens(desc)) {
        if (token.length < 4) continue;
        if (containsToken(text, token)) {
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

function normalizeText(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/\s+/gu, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function uniqueTokens(value) {
  return [...new Set(tokenize(value))];
}


const MAX_INTENT_ENTRIES = 32;
const MAX_INTENT_LENGTH = 128;

function compileIntentMatcher(skill) {
  // Only the documented top-level intent object or metadata.intent is trusted.
  const intent = skill.intent ?? skill.metadata?.intent ?? {};
  const seen = new Set();
  let entryCount = 0;
  const collect = (value) => {
    const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
    const patterns = [];
    for (const item of values) {
      if (entryCount >= MAX_INTENT_ENTRIES || typeof item !== 'string') break;
      const normalized = normalizeText(item);
      if (!normalized || normalized.length > MAX_INTENT_LENGTH || seen.has(normalized)) continue;
      seen.add(normalized);
      entryCount += 1;
      patterns.push(phrasePattern(normalized));
    }
    return patterns;
  };
  const phrases = collect(intent?.phrases);
  const synonyms = collect(intent?.synonyms);
  return { phrases, synonyms };
}

function phrasePattern(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u');
}

function containsPhrase(text, phrase) {
  return phrasePattern(normalizeText(phrase)).test(text);
}

function containsToken(text, token) {
  return containsPhrase(text, token);
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
