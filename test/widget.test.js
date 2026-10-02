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
  assert.match(landing, /runtime chat, skill registry/);
  assert.match(landing, /Yang sedang dibangun/);
  assert.ok(pkg.files.includes('bin'));
});

test('landing v4 scene stays product-shaped (app host, skills, boundary, license), not abstract decoration', () => {
  assert.match(landing, /drawApp/);
  assert.match(landing, /drawCopilot/);
  assert.match(landing, /drawSkill/);
  assert.match(landing, /drawLicense/);
  assert.match(landing, /Aplikasi Anda — Orders/);
  assert.match(landing, /billing\.write/);
  assert.match(landing, /Ed25519/);
  assert.doesNotMatch(landing, /IcosahedronGeometry|TorusGeometry|CapsuleGeometry/);
});
