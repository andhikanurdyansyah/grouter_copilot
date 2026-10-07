import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const widget = readFileSync(new URL('../src/widget/CopilotChat.jsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../server/public/landing.html', import.meta.url), 'utf8');
const success = readFileSync(new URL('../server/public/success.html', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('widget launches bottom-right, opens first-use setup on demand, persists completion, and keeps credentials server-side', () => {
  assert.match(widget, /welcomeMessage\s*=\s*''/);
  assert.match(widget, /firstUseSetup\s*=\s*false/);
  assert.match(widget, /viewport\.innerWidth - 58 - 24/);
  assert.match(widget, /viewport\.innerHeight - 58 - 24/);
  assert.match(widget, /Math\.min\(360, viewport\.innerWidth - 32\)/);
  assert.match(widget, /onClick=\{\(\) => \{ setOpen\(true\); if \(!setupDone\) setSetupOpen\(true\); \}\}/);
  assert.match(widget, /localStorage\.getItem\('grouter-copilot-setup-done'\)/);
  assert.match(widget, /localStorage\.setItem\('grouter-copilot-setup-done', 'true'\)/);
  assert.match(widget, /querySelector\('input'\)\.checked/);
  assert.match(widget, /role="dialog" aria-label=\{title\}/);
  assert.match(widget, /onPointerDown=\{startDrag\}/);
  assert.match(widget, /aria-label=\{`Buka \$\{title\}`\}/);
  assert.doesNotMatch(widget, /GROUTER_API_KEY|apiKey|license key/i);
});

test('first-use setup requires a fresh complete host-health response before persisting', () => {
  assert.match(widget, /healthEndpoint = '\/api\/copilot\/health'/);
  assert.match(widget, /responseOk && data\?\.status === 'ok'/);
  assert.match(widget, /checks\?\.license === true && checks\?\.skills === true && checks\?\.provider === true/);
  assert.match(widget, /await fetch\(healthEndpoint/);
  assert.match(widget, /if \(!isReadyHealth\(data, res\.ok\)\) \{ setHealth\(\{ status: 'unavailable'/);
  assert.match(widget, /healthCheckRef\.current \|\| !event\.currentTarget\.parentElement\.querySelector\('input'\)\.checked/);
  assert.match(widget, /useState\(!firstUseSetup\)/);
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
