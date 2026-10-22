import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = path.join(repo, 'bin', 'grouter-copilot.js');
// dev-repo shortcut: use dist-widget iff present; else copy placeholders (CI pack test covers real files)
const widgetSrc = path.join(repo, 'dist-widget');

function makeProject({ withHtml }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-embed-'));
  if (withHtml) {
    mkdirSync(path.join(dir, 'public'), { recursive: true });
    writeFileSync(
      path.join(dir, 'index.html'),
      '<!doctype html><html><head><title>t</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      'utf8',
    );
    if (existsSync(widgetSrc)) {
      copyFileSync(path.join(widgetSrc, 'copilot.js'), path.join(dir, 'public', 'copilot.js'));
      copyFileSync(path.join(widgetSrc, 'copilot.css'), path.join(dir, 'public', 'copilot.css'));
    }
  }
  return dir;
}

test('embed: non-TTY without --yes must FAIL CLOSED (no consent → no mutation)', () => {
  const dir = makeProject({ withHtml: true });
  const r = spawnSync(process.execPath, [bin, 'embed'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /copilot\.(js|css)/, 'non-consented run must not touch the app');
  rmSync(dir, { recursive: true, force: true });
});

test('embed: --yes injects 2 tags + backup + vendors widget; second run is idempotent', () => {
  const dir = makeProject({ withHtml: true });
  const r1 = spawnSync(process.execPath, [bin, 'embed', '--yes'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r1.status, 0);
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('<link rel="stylesheet" href="/copilot.css">'), 'css link injected');
  assert.ok(/<script src="\/copilot.js"><\/script>\s*<\/body>/.test(html), 'script before </body>');
  assert.ok(existsSync(path.join(dir, 'index.html.grx-backup')), 'one-time backup written');
  assert.ok(existsSync(path.join(dir, 'public', 'copilot.js')), 'widget vendored to public/');
  assert.ok(existsSync(path.join(dir, 'public', 'copilot.css')), 'css vendored to public/');

  const r2 = spawnSync(process.execPath, [bin, 'embed', '--yes'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /sudah tertanam/, 'second run is a no-op with a clear status');
  const html2 = readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.equal((html2.match(/copilot\.js/g) || []).length, 1, 'no duplicate tags');
  rmSync(dir, { recursive: true, force: true });
});

test('embed: no HTML anywhere → offers demo scaffold (with consent via --yes)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-embed-empty-'));
  const r = spawnSync(process.execPath, [bin, 'embed', '--yes'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(existsSync(path.join(dir, 'copilot-demo', 'index.html')), 'demo page created');
  assert.ok(existsSync(path.join(dir, 'copilot-demo', 'copilot.js')), 'widget vendored into demo');
  rmSync(dir, { recursive: true, force: true });
});
