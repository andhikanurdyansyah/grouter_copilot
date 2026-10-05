import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const widget = readFileSync(new URL('../src/widget/CopilotChat.jsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../server/public/landing.html', import.meta.url), 'utf8');
const success = readFileSync(new URL('../server/public/success.html', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('widget exposes a bottom-left accessible draggable launcher, configurable welcome, and first-use checklist', () => {
  assert.match(widget, /welcomeMessage\s*=\s*''/);
  assert.match(widget, /firstUseSetup\s*=\s*false/);
  assert.match(widget, /aria-modal="true"/);
    assert.match(widget, /onPointerDown=\{startDrag\}/);
    assert.match(widget, /aria-label=\{`Buka \$\{title\}`\}/);
    assert.doesNotMatch(widget, /GROUTER_API_KEY|apiKey|license key/i);
});

test('customer install guidance remains consistent with the current license-only runtime contract', () => {
  assert.match(success, /license/i);
  assert.match(landing, /Embed AI assistance/);
  assert.match(landing, /Copilot Plans/);
  assert.match(landing, /languageSelect|languageToggle/);
  assert.ok(pkg.files.includes('bin'));
});

test('commandlayer landing keeps the approved product chassis and runtime controls', () => {
  assert.match(landing, /data-us-project=/);
  assert.match(landing, /Developer-defined skill registry loaded/);
  assert.match(landing, /Provider credential remains server-side/);
  assert.match(landing, /Signed license payload verified/);
  assert.match(landing, /fetch\('\/api\/plans'/);
  assert.match(landing, /Sematkan bantuan AI/);
  assert.doesNotMatch(landing, /IcosahedronGeometry|TorusGeometry|CapsuleGeometry/);
});
