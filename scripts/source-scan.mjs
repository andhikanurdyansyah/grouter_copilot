#!/usr/bin/env node
/**
 * Deterministic, zero-dependency scan for a small set of high-confidence
 * production hygiene violations. It deliberately reports file/line/rule only;
 * source text and matched values are never printed.
 *
 * Scope: tracked-like source under src/, frontend/src/, server/src/, and bin/.
 * Tests, examples, generated bundles, docs, and dependencies are out of scope.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const DEFAULT_ROOTS = ['src', 'frontend/src', 'server/src', 'bin'];
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next']);

/*
 * Keep executable code visible to the rules while hiding comments and template
 * literal text. Template interpolations are code, so a small context stack is
 * used instead of treating the whole backtick-delimited value as opaque. This
 * is deliberately lexical: it handles strings/comments/braces needed to find
 * `${...}` without attempting to parse JavaScript expressions.
 */
function startsCredentialLiteral(code) {
  return /\b(?:api[_-]?key|secret|token|password|private[_-]?key)\b\s*(?::|=)\s*$/i.test(code);
}

function canStartRegex(code) {
  const trimmed = code.trimEnd();
  const previous = trimmed.at(-1);
  if (!previous) return true;
  if (/[=(:,!&|?{}[;]/.test(previous)) return true;
  if (/(?:^|\b)(?:return|throw|case|else|do)$/.test(trimmed)) return true;
  if (previous !== ')') return false;

  // A regex may begin an expression after control-flow conditions, unlike
  // after an ordinary call expression. Keep this lexical rather than parsing.
  const open = trimmed.lastIndexOf('(');
  const beforeParen = trimmed.slice(0, open).trimEnd();
  return /(?:^|\b)(?:if|while|for|with|switch|catch)$/.test(beforeParen);
}

function codeBeforeComment(line, state) {
  let code = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    const context = state.stack.at(-1);

    if (state.blockComment) {
      if (char === '*' && next === '/') { state.blockComment = false; index += 1; }
      continue;
    }

    if (context.kind === 'string') {
      // Keep credential literals visible to the secret rule, but mask all
      // other string contents so prose cannot look like executable code.
      code += context.keep ? char : (char === context.quote ? char : ' ');
      if (context.escaped) context.escaped = false;
      else if (char === '\\\\') context.escaped = true;
      else if (char === context.quote) state.stack.pop();
      continue;
    }

    if (context.kind === 'regex') {
      code += ' ';
      if (context.inClass) {
        if (char === ']') context.inClass = false;
      } else if (char === '[') context.inClass = true;
      else if (context.escaped) context.escaped = false;
      else if (char === '\\\\') context.escaped = true;
      else if (char === '/') state.stack.pop();
      continue;
    }

    if (context.kind === 'template') {
      if (context.escaped) context.escaped = false;
      else if (char === '\\\\') context.escaped = true;
      else if (char === '`') { code += context.keep ? char : ''; state.stack.pop(); }
      else if (char === '$' && next === '{') {
        code += '${';
        index += 1;
        state.stack.push({ kind: 'code', interpolation: true, braceDepth: 1 });
      } else if (context.keep) code += char;
      continue;
    }

    // All remaining work is in executable code, including interpolation code.
    if (char === '/' && next === '/') return code;
    if (char === '/' && next === '*') { state.blockComment = true; index += 1; continue; }
    if (char === '/' && canStartRegex(code)) {
      code += ' ';
      state.stack.push({ kind: 'regex', escaped: false, inClass: false });
      continue;
    }
    if (char === '"' || char === "'") {
      const keep = startsCredentialLiteral(code);
      code += char;
      state.stack.push({ kind: 'string', quote: char, escaped: false, keep });
      continue;
    }
    if (char === '`') {
      const keep = startsCredentialLiteral(code);
      code += keep ? char : '';
      state.stack.push({ kind: 'template', escaped: false, keep });
      continue;
    }
    if (context.interpolation && char === '{') context.braceDepth += 1;
    if (context.interpolation && char === '}') {
      context.braceDepth -= 1;
      if (context.braceDepth === 0) { state.stack.pop(); continue; }
    }
    code += char;
  }
  return code;
}

function stripComments(lines) {
  const state = { blockComment: false, stack: [{ kind: 'code' }] };
  return lines.map((line) => codeBeforeComment(line, state));
}

function isCommentOnly(line) {
  return /^\s*(?:\/\/|\/\*|\*|#)/.test(line);
}

function sourceFiles(root) {
  const files = [];
  function visit(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
    }
  }
  visit(root);
  return files;
}

const rules = [
  {
    id: 'hardcoded-secret',
    // Only assignment/object-property literals with credential-shaped names;
    // environment/config references and short placeholders are intentionally safe.
    match: (code) => {
      if (isCommentOnly(code)) return false;
      const match = code.match(/\b(api[_-]?key|secret|token|password|private[_-]?key)\b\s*(?::|=)\s*(["'`])([^"'`]*)\2/i);
      if (!match) return false;
      const value = match[3].trim();
      return value.length >= 12 && !/^(?:process\.env|import\.meta\.env|env\.|config\.|your[-_ ]|replace[-_ ]|example|placeholder|changeme|test[-_ ]?value)/i.test(value);
    },
  },
  {
    id: 'mock-data-in-production',
    // Keep this to executable-looking identifiers/imports. Documentation and
    // comments may explain fixtures without making the production bundle fake.
    match: (code) => {
      if (isCommentOnly(code)) return false;
      // Flag only fixture-like declarations/imports/calls, not prose or
      // legitimate adapters such as FakeSupplier.
      return /\b(?:mock|fake|fixture|dummy)(?:data|response|user|order|record|client|api|service)?\b\s*(?:=|:|\(|,)|\b(?:mock|fake|fixture|dummy)(?:data|response|user|order|record|client|api|service)?\b\s+from\s+["']/i.test(code)
        && !/\bFakeSupplier\b/.test(code);
    },
  },
];

export function scanRoot(root, { roots = DEFAULT_ROOTS } = {}) {
  const absoluteRoot = resolve(root);
  const findings = [];
  for (const sourceRoot of roots) {
    const directory = resolve(absoluteRoot, sourceRoot);
    for (const file of sourceFiles(directory)) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      const codeLines = stripComments(lines);
      codeLines.forEach((code, index) => {
        for (const rule of rules) {
          if (rule.match(code)) findings.push({ file: relative(absoluteRoot, file), line: index + 1, rule: rule.id });
        }
      });
    }
  }
  return findings;
}

function printUsage() {
  console.log('Usage: node scripts/source-scan.mjs [--root DIR] [--json]');
  console.log('Scans production source roots for high-confidence hygiene violations.');
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) { printUsage(); return 0; }
  let root = SCRIPT_ROOT;
  const rootIndex = argv.indexOf('--root');
  if (rootIndex !== -1) {
    if (!argv[rootIndex + 1] || argv[rootIndex + 1].startsWith('-')) throw new Error('--root requires a directory');
    root = resolve(argv[rootIndex + 1]);
  }
  if (!statSync(root, { throwIfNoEntry: false } )?.isDirectory()) throw new Error(`root is not a directory: ${root}`);
  const findings = scanRoot(root);
  if (argv.includes('--json')) console.log(JSON.stringify(findings));
  else if (findings.length) {
    for (const finding of findings) console.error(`source-scan: ${finding.file}:${finding.line}: ${finding.rule}`);
    console.error(`source-scan: ${findings.length} finding(s)`);
  } else console.log('source-scan: OK (0 findings; production roots only)');
  return findings.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`source-scan: ${error.message}`); process.exitCode = 2; }
}

export { DEFAULT_ROOTS, rules, codeBeforeComment, canStartRegex };
