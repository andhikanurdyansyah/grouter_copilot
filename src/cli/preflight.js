// Pre-flight engine for CLI commands: check → report → confirm → fix.
// Philosophy (D-021 + product goal): never touch the host app without asking;
// print an honest status table; each mutation is one Y/n consent (or --yes).
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const WIDGET_FILES = ['copilot.js', 'copilot.css'];

/** Absolute path of the installed grouter-copilot package root (contains dist-widget/). */
export function packageRoot() {
  const here = fileURLToPath(import.meta.url); // <pkg>/src/cli/preflight.js
  return path.dirname(path.dirname(path.dirname(here)));
}

/** Ask Y/n. autoYes forces yes; non-TTY never guesses (returns false with a hint). */
export async function confirm(question, { autoYes = false } = {}) {
  if (autoYes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`${question}`)).trim().toLowerCase();
    return ans === '' || ans === 'y' || ans === 'ya' || ans === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Detect candidate app entries for the chat widget, from cwd.
 * Returns [{ html, publicDir|null }] — most specific/likely first.
 */
export function findWidgetTargets(cwd = process.cwd()) {
  const candidates = [
    { html: 'public/index.html', publicDir: 'public' },
    { html: 'index.html', publicDir: existsSync(path.join(cwd, 'public')) ? 'public' : null },
    { html: 'frontend/index.html', publicDir: existsSync(path.join(cwd, 'frontend/public')) ? 'frontend/public' : null },
    { html: 'frontend/public/index.html', publicDir: 'frontend/public' },
    { html: 'dist/index.html', publicDir: existsSync(path.join(cwd, 'public')) ? 'public' : null },
    { html: 'static/index.html', publicDir: 'static' },
    { html: 'webapp/index.html', publicDir: null },
  ];
  return candidates
    .filter((c) => existsSync(path.join(cwd, c.html)))
    .map((c) => ({ html: path.join(cwd, c.html), publicDir: c.publicDir ? path.join(cwd, c.publicDir) : null }));
}

/** True if the HTML already loads the widget (idempotency guard). */
export function htmlHasWidget(htmlPath) {
  try {
    const src = readFileSync(htmlPath, 'utf8');
    return src.includes('copilot.js') || src.includes('copilot.css');
  } catch {
    return false;
  }
}

/**
 * Inject the 2 tags (link in <head>, script before </body>), relative to base.
 * Writes a one-time .grx-backup next to the file. Idempotent.
 */
export function injectWidgetTags(htmlPath, { base = '/', endpoint = null } = {}) {
  let src = readFileSync(htmlPath, 'utf8');
  if (src.includes('copilot.js') || src.includes('copilot.css')) {
    return { changed: false, already: true };
  }
  const scriptTag = endpoint
    ? `<script src="${base}copilot.js" data-endpoint="${endpoint}/api/copilot/chat" data-health-endpoint="${endpoint}/api/copilot/health"></script>`
    : `<script src="${base}copilot.js"></script>`;
  const backup = `${htmlPath}.grx-backup`;
  if (!existsSync(backup)) writeFileSync(backup, src, 'utf8');
  if (/<\/head>/i.test(src)) {
    src = src.replace(/<\/head>/i, `    <link rel="stylesheet" href="${base}copilot.css">\n  </head>`);
  } else {
    src = `    <link rel="stylesheet" href="${base}copilot.css">\n${src}`;
  }
  if (/<\/body>/i.test(src)) {
    src = src.replace(/<\/body>/i, `    ${scriptTag}\n  </body>`);
  } else {
    src = `${src}\n    ${scriptTag}\n`;
  }
  writeFileSync(htmlPath, src, 'utf8');
  return { changed: true, already: false, backup };
}

/** Copy the prebuilt widget (copilot.js/.css) from the package into targetDir. */
export function vendorWidgetFiles(targetDir) {
  const srcDir = path.join(packageRoot(), 'dist-widget');
  mkdirSync(targetDir, { recursive: true });
  for (const f of WIDGET_FILES) {
    copyFileSync(path.join(srcDir, f), path.join(targetDir, f));
  }
  return WIDGET_FILES.map((f) => path.join(targetDir, f));
}

const ICONS = { ok: '✔', warn: '⚠', fail: '✗', todo: '◻', info: '·' };

/**
 * Run the preflight: print every check, then for each 'todo' with a fix,
 * ask consent and apply. Returns the enriched results array.
 */
export async function preflight(checks, { autoYes = false } = {}) {
  const isTTY = !!process.stdout.isTTY;
  const results = [];
  const say = (...a) => console.log(...a);
  for (const c of checks) {
    const icon = ICONS[c.status] ?? '·';
    say(`${icon} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
    if (c.status === 'todo' && c.fix) {
      const go = autoYes ? true : await confirm(`  ${c.question} [Y/n] `);
      if (!go) {
        results.push({ ...c, applied: false, skipped: true });
        say('  → dilewati (tidak jadi)');
        continue;
      }
      try {
        const r = await c.fix();
        results.push({ ...c, applied: true, detail: (r && r.detail) || c.detail });
        say(`  → diterapkan ✅${r && r.note ? ` ${r.note}` : ''}`);
      } catch (err) {
        results.push({ ...c, applied: false, error: err.message });
        say(`  → gagal: ${err.message}`);
      }
    } else {
      results.push({ ...c, applied: false });
    }
  }
  return results;
}
