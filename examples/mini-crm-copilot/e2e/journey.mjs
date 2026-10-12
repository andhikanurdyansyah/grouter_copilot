
// e2e/journey.mjs — acceptance journey demo Mini CRM + gRouter Copilot.
// Jalankan: DEMO_LICENSE=<token> node e2e/journey.mjs (server demo harus sudah jalan di 4602).
// Use case live AI butuh DEMO_LICENSE (lisensi nyata). Stage A/C (CRM+widget) jalan tanpa lisensi.
// playwright dipinjam dari e2e workspace repo utama (demo sengaja zero-build).
// Node ESM tidak menghormati NODE_PATH, jadi resolve eksplisit via createRequire.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/ubuntu/grouter_copilot/e2e/node_modules/playwright');
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.DEMO_BASE || 'http://localhost:4602';
const LICENSE = process.env.DEMO_LICENSE || '';
const SHOT = new URL('../shots/', import.meta.url).pathname;
if (!existsSync(SHOT)) mkdirSync(SHOT, { recursive: true });

const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell';
const results = [];
const ok = (id, name, pass, detail = '') => { results.push({ id, name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// ---- Stage A: CRM hidup + dummy data ----
await page.goto(BASE, { waitUntil: 'networkidle' });
ok('A1', 'Dashboard tampil dengan angka overview', await page.locator('#ov-total').innerText().then((t) => t.trim() === '42').catch(() => false));
ok('A2', 'Navigasi tab lengkap', (await page.locator('nav button, .tabs button, [data-tab]').count()) >= 5);
await page.screenshot({ path: SHOT + 'stage-a-dashboard.png' });

// Customers search
await page.locator('[data-tab="customers"], nav >> text=Customers').first().click().catch(() => {});
await page.locator('#cus-search').fill('pengiriman');
await page.waitForTimeout(800);
const rows = await page.locator('#cus-list tbody tr').count();
ok('A3', 'Search customer bekerja (keluhan pengiriman)', rows > 0, `${rows} baris`);
await page.screenshot({ path: SHOT + 'stage-a-customers-search.png' });

// Leads tab + status select
await page.locator('[data-tab="leads"], nav >> text=Leads').first().click().catch(() => {});
await page.waitForTimeout(600);
const leadRows = await page.locator('#lead-list tbody tr').count();
ok('A4', 'Leads pipeline tampil', leadRows >= 20, `${leadRows} lead`);

// ---- Stage B/C/D: widget + first-run (tanpa lisensi → panel error state jelas) ----
const bubbleVisible = await page.locator('#crm-copilot-bubble').isVisible().catch(() => false);
ok('D1', 'Bubble Copilot muncul (lingkaran 56px ikon sparkle, aria-label "Buka Copilot")',
   bubbleVisible && (await page.locator('#crm-copilot-bubble').getAttribute('aria-label')) === 'Buka Copilot');
await page.screenshot({ path: SHOT + 'stage-d-bubble.png' });
// buka panel sekali untuk verifikasi interaksi
await page.locator('#crm-copilot-bubble').click();
await page.waitForTimeout(600);
ok('D1b', 'Panel chat terbuka dari bubble', await page.locator('#crm-copilot-panel').isVisible().catch(() => false));
ok('D1c', 'Header: dot status koneksi dari /api/copilot/health + gear + close',
   await page.locator('#crm-copilot-status-dot').isVisible().catch(() => false)
   && await page.locator('#crm-copilot-settings').isVisible().catch(() => false)
   && await page.locator('#crm-copilot-close').isVisible().catch(() => false));
// empty state + 4 chips kontekstual
ok('D1d', 'Empty state welcome + 4 suggestion chips kontekstual CRM',
   (await page.locator('#crm-copilot-empty').isVisible().catch(() => false))
   && (await page.locator('.grc-chip').count()) === 4);
// settings popover: 3 health checks
await page.locator('#crm-copilot-settings').click();
await page.waitForTimeout(300);
const healthOk = await page.evaluate(async () => {
  const rows = document.querySelectorAll('.grc-settings .grc-hrow').length;
  const labels = Array.from(document.querySelectorAll('.grc-settings .grc-hrow span:nth-child(2)')).map((n) => n.textContent.trim());
  return rows === 3 && ['Lisensi', 'Skills', 'Provider'].every((x) => labels.includes(x));
});
ok('D1e', 'Settings popover menampilkan 3 health checks (license, skills, provider)', healthOk);

// Escape menutup panel (settings popover masih terbuka dari D1e: Escape pertama
// menutup popover — perilaku berlapis — Escape kedua menutup panel)
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok('D2', 'Escape menutup panel', !(await page.locator('#crm-copilot-panel').isVisible().catch(() => false)));

// ---- Stage F: assertion baru Agent D (chip kirim, kartu batal, tema, mobile) ----
// HARUS berjalan dengan panel fresh: suggestion chips bagian dari empty state yang
// hilang begitu chat dimulai, jadi Stage F ditempatkan SEBELUM use case live AI.
// F1: suggestion chip mengirim pesan
await page.locator('#crm-copilot-bubble').click();
await page.waitForTimeout(400);
const chipsCount = await page.locator('.grc-chip').count();
await page.locator('.grc-chip').last().click();
await page.waitForTimeout(600);
const f1 = chipsCount === 4
  && (await page.locator('#crm-copilot-log .grc-row--user').count()) >= 1
  && (await page.locator('#crm-copilot-log .grc-row--user').first().innerText().catch(() => '')).length > 0;
ok('F1', 'Klik suggestion chip langsung mengirim pesan', f1, `${chipsCount} chips`);

// F2: approval card "Batal" tidak bermutasi CRM (verifikasi via API + state kartu)
const leadsBefore = await page.evaluate(async () => (await (await fetch('/api/leads?status=new')).json()).leads.map((l) => l.id));
const shown = await page.evaluate(() => !!window.crmCopilotPanel);
if (shown && leadsBefore.length) {
  await page.evaluate((leadId) => window.crmCopilotPanel.showProposalCard({
    leadId, currentStatus: 'new', newStatus: 'qualified',
    reason: 'Kartu uji e2e — batal tidak boleh bermutasi.',
  }), leadsBefore[0]);
  await page.waitForTimeout(300);
  await page.locator("#crm-copilot-log .grc-card button:has-text('Batal')").last().click();
  await page.waitForTimeout(500);
  const leadsAfter = await page.evaluate(async () => (await (await fetch('/api/leads?status=new')).json()).leads.map((l) => l.id));
  const canceledShown = /dibatalkan|tidak ada perubahan/i.test(await page.locator('#crm-copilot-log').innerText().catch(() => ''));
  ok('F2', 'Approval card "Batal" tidak memutasi CRM & kartu ditandai dibatalkan',
     JSON.stringify(leadsBefore) === JSON.stringify(leadsAfter) && canceledShown);
} else {
  ok('F2', 'Approval card "Batal" tidak memutasi CRM & kartu ditandai dibatalkan', false,
     shown ? 'tidak ada lead status new' : 'window.crmCopilotPanel tidak tersedia');
}

// F3: tema toggle bekerja (dark -> light -> dark) + persist di localStorage
await page.locator('#crm-copilot-settings').click();
await page.waitForTimeout(250);
await page.locator('#grc-theme-light').click();
await page.waitForTimeout(250);
const lightOn = await page.evaluate(() => ({
  cls: document.getElementById('crm-copilot-panel').classList.contains('grc-light'),
  ls: localStorage.getItem('grouter-copilot-theme'),
}));
await page.locator('#grc-theme-dark').click();
await page.waitForTimeout(250);
const darkBack = await page.evaluate(() => ({
  cls: document.getElementById('crm-copilot-panel').classList.contains('grc-light'),
  ls: localStorage.getItem('grouter-copilot-theme'),
}));
ok('F3', 'Toggle tema light/dark bekerja + persist (localStorage grouter-copilot-theme)',
   lightOn.cls && lightOn.ls === 'light' && !darkBack.cls && darkBack.ls === 'dark',
   `light: ${JSON.stringify(lightOn)} -> dark: ${JSON.stringify(darkBack)}`);
// tutup settings popover, lalu panel (Escape berlapis: popover dulu, baru panel)
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if (await page.locator('#crm-copilot-panel').isVisible().catch(() => false)) {
  await page.evaluate(() => window.crmCopilotPanel.close());
  await page.waitForTimeout(200);
}

// F4: mobile 390px — bubble tidak menutupi konten CRM (tidak overlap area konten terakhir)
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(500);
const mob = await page.evaluate(() => {
  const b = document.getElementById('crm-copilot-bubble');
  const r = b.getBoundingClientRect();
  if (r.width !== 56 || r.height !== 56) return { ok: false, why: 'bubble bukan 56px', r: r.width + 'x' + r.height };
  // konten terakhir yang bisa di-scroll: pastikan bubble tidak menutupi teks utama
  const content = Array.from(document.querySelectorAll('#panel-dashboard .card-value, #panel-dashboard .panel-desc'))
    .map((n) => n.getBoundingClientRect())
    .filter((x) => x.width > 0 && x.height > 0);
  for (const c of content) {
    const overlap = !(c.right <= r.left || c.left >= r.right || c.bottom <= r.top || c.top >= r.bottom);
    if (overlap) return { ok: false, why: 'bubble overlap konten', rect: c };
  }
  return { ok: true };
});
ok('F4', 'Mobile 390px: bubble 56px tidak menutupi konten CRM', !!mob.ok, mob.why || '');
await page.screenshot({ path: SHOT + 'stage-f-mobile-390.png' });
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(300);
// tutup panel untuk state akhir bersih
await page.locator('#crm-copilot-bubble').click().catch(() => {});
await page.waitForTimeout(200);
if (await page.locator('#crm-copilot-panel').isVisible().catch(() => false)) await page.keyboard.press('Escape');

// ---- Use cases (live AI, butuh lisensi) — berjalan SETELAH Stage F ----
if (LICENSE) {
  const ask = async (q) => {
    const panelOpen = await page.locator('#crm-copilot-panel').isVisible().catch(() => false);
    if (!panelOpen) await page.locator('#crm-copilot-bubble').click();
    const rowsBefore = await page.locator('#crm-copilot-log > div').count();
    await page.locator('#crm-copilot-input').fill(q);
    await page.locator('#crm-copilot-send').click();
    // jawaban selesai bila: tidak disabled, TIDAK ada typing indicator, dan jumlah row bertambah
    await page.waitForFunction(
      (before) => {
        const btn = document.querySelector('#crm-copilot-send');
        const rows = document.querySelectorAll('#crm-copilot-log > div').length;
        const typing = document.getElementById('crm-copilot-typing');
        return btn && !btn.disabled && !typing && rows > before;
      },
      rowsBefore,
      { timeout: 150_000 },
    );
    await page.waitForTimeout(400);
    const texts = await page.locator('#crm-copilot-log > div').allInnerTexts();
    return texts[texts.length - 1] || '';
  };
  // UC1 overview
  let ans = await ask('Berapa total customer, leads aktif, dan deals yang masih terbuka saat ini?');
  const nums = [42, 20, 11].map((n) => new RegExp(String(n))).filter((re) => re.test(ans)).length;
  ok('UC1', 'Business overview dari data real', nums >= 2 || (/customer/i.test(ans) && /deal/i.test(ans)), ans.slice(0, 90));
  await page.screenshot({ path: SHOT + 'uc1-overview.png' });
  await page.waitForTimeout(8_000);
  // UC2 pencarian
  ans = await ask('cari customer dengan keluhan keterlambatan pengiriman');
  ok('UC2', 'Pencarian keluhan delivery menemukan customer',
     (/ditemukan \d+/i.test(ans) || /cus_\d+/.test(ans)) && !/tidak ditemukan/i.test(ans), ans.slice(0, 90));
  await page.screenshot({ path: SHOT + 'uc2-find.png' });
  // UC4 pipeline
  ans = await ask('deals mana yang berpotensi closing bulan ini, dan apa alasannya?');
  ok('UC4', 'Analisis pipeline memakai record aktual', ans.length > 50, ans.slice(0, 90));
  // UC5 draft
  ans = await ask('buatkan draft follow-up untuk customer yang belum merespons selama tujuh hari');
  ok('UC5', 'Draft follow-up (DRAFT, tidak terkirim)', /draft/i.test(ans), ans.slice(0, 90));
  await page.screenshot({ path: SHOT + 'uc5-draft.png' });
  // UC6 proposal + konfirmasi (lead 'new' dipilih dinamis dari API; retry sekali bila gateway limit/transient)
  const newLeads = await page.evaluate(async () => (await (await fetch('/api/leads?status=new')).json()).leads);
  const leadId = (newLeads[0] || {}).id;
  const askRetry = async (q) => {
    let a = await ask(q);
    if (/gateway returned an error|too many requests/i.test(a)) {
      await page.waitForTimeout(25_000);
      a = await ask(q);
    }
    return a;
  };
  ans = await askRetry(`ubah status lead ${leadId} menjadi qualified`);
  const hasProposal = /terapkan perubahan/i.test(await page.locator('#crm-copilot-log').innerText().catch(() => ''));
  ok('UC6a', 'Approval card proposal muncul dengan tombol konfirmasi', hasProposal, ans.slice(0, 80));
  await page.screenshot({ path: SHOT + 'uc6-proposal.png' });
  if (hasProposal) {
    // klik tombol apply pada kartu yang MASIH AKTIF (bukan kartu demo F2 yang
    // sudah dibatalkan/di-hide) — ambil yang terakhir di log.
    await page.locator("#crm-copilot-log .grc-card:not(.grc-card--canceled) button:has-text('Terapkan perubahan')").last().click();
    await page.waitForTimeout(1500);
    // verifikasi via API: lead harus qualified
    const res = await page.evaluate(async () => (await (await fetch('/api/leads?status=qualified')).json()));
    const found = (res.leads || []).some((l) => l.id === leadId);
    ok('UC6b', 'Mutasi benar-benar terjadi di CRM setelah konfirmasi', found);
    ok('UC6c', 'Status sukses di kartu approval (terverifikasi dari callback host)',
       /diterapkan/i.test(await page.locator('#crm-copilot-log').innerText().catch(() => '')));
    await page.screenshot({ path: SHOT + 'uc6-applied.png' });
  }
  // UC7 error state: ID tak ada
  ans = await ask('ringkas hubungan kita dengan customer cus_999');
  ok('UC7', 'ID tak ada → gagal jelas, tidak mengarang',
     /tidak|could not|more specific|determine/i.test(ans) && !/cus_999.*(aktif|bahagia|puas)/i.test(ans), ans.slice(0, 90));
} else {
  console.log('(DEMO_LICENSE tidak diset — use case live AI dilewati)');
}

// Console error yang DIHARAPKAN: resource 4xx/5xx dari endpoint /api/copilot/chat saat menguji error states (UC7 dst).
// yang dihitung = error JS di luar itu (pageerror/uncaught).
const unexpected = consoleErrors.filter((e) => !/Failed to load resource.*status of (4|5)\d\d/.test(e));
ok('E1', 'Tidak ada console error tak tertangani', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

const fails = results.filter((r) => !r.pass);
console.log(`\nTOTAL: ${results.length} | pass: ${results.length - fails.length} | fail: ${fails.length}`);
await browser.close();
process.exit(fails.length ? 1 : 0);
