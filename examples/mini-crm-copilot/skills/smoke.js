// Smoke test offline untuk skill demo CRM (fixture inline, tanpa server, tanpa lisensi).
// Jalankan: node skills/smoke.js
import assert from 'node:assert/strict';
import { validateSkill } from '../../../src/skills/validator.js';

// ---- Fixture inline (schema CONTRACT: 42 customers/26 leads/14 deals/>=60 acts discale down) ----
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const DAY = 24 * 60 * 60 * 1000;

const fixture = {
  customers: [
    { id: 'cus_001', name: 'Budi Santoso', company: 'PT Maju Jaya', email: 'budi@majujaya.id', phone: '+62-811-1', segment: 'smb', status: 'active', createdAt: iso(90 * DAY) },
    { id: 'cus_002', name: 'Sari Dewi', company: 'CV Berkah', email: 'sari@berkah.id', phone: '+62-812-2', segment: 'retail', status: 'prospect', createdAt: iso(30 * DAY) },
    { id: 'cus_003', name: 'Andi Wijaya', company: 'PT Sumber Rezeki', email: 'andi@sumberr.id', phone: '+62-813-3', segment: 'enterprise', status: 'churned', createdAt: iso(200 * DAY) },
  ],
  leads: [
    { id: 'lead_001', name: 'Rina Kusuma', company: 'PT Kreatif Media', source: 'website', status: 'new', score: 72, createdAt: iso(5 * DAY) },
    { id: 'lead_002', name: 'Joko Prabowo', company: 'UD Sinar Terang', source: 'referral', status: 'contacted', score: 55, createdAt: iso(12 * DAY) },
  ],
  deals: [
    { id: 'deal_001', customerId: 'cus_001', title: 'Paket CRM SMB', value: 12_500_000, stage: 'proposal', expectedClose: iso(-45 * DAY), createdAt: iso(40 * DAY) },
    { id: 'deal_002', customerId: 'cus_002', title: 'Pilot Retail', value: 4_000_000, stage: 'negotiation', expectedClose: iso(-20 * DAY), createdAt: iso(20 * DAY) },
    { id: 'deal_003', customerId: 'cus_003', title: 'Enterprise Suite', value: 80_000_000, stage: 'won', expectedClose: iso(10 * DAY), createdAt: iso(120 * DAY) },
  ],
  activities: [
    { id: 'act_001', customerId: 'cus_001', type: 'call', note: 'Diskusi renewal kontrak Maju Jaya', at: iso(10 * DAY), sentiment: 'positive' },
    { id: 'act_002', customerId: 'cus_002', type: 'email', note: 'Kirim proposal pilot ke Berkah', at: iso(30 * DAY), sentiment: 'neutral' },
    { id: 'act_003', customerId: 'cus_003', type: 'meeting', note: 'QBR dengan Sumber Rezeki', at: iso(2 * DAY), sentiment: 'negative' },
  ],
};

// ---- Stub lib/db.js dengan fixture ----
const stubPath = new URL('./__smoke_db_stub.mjs', import.meta.url);
const { writeFileSync, unlinkSync } = await import('node:fs');
writeFileSync(
  stubPath,
  `export function readDb() { return ${JSON.stringify(fixture)}; }\n` +
    `export function loadDb() { return readDb(); }\n` +
    `export function getDb() { return readDb(); }\n` +
    `export function load() { return readDb(); }\n` +
    `export default { readDb, loadDb, getDb, load };\n`,
);

// lib/db.js milik agent CRM tidak boleh diubah secara permanen: kita menimpa sementara
// dengan stub fixture, menjalankan smoke, lalu me-restore persis isinya. Bila db.js
// belum ada, stub dibuat dan DIHAPUS lagi setelah selesai (fixture inline murni).
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(__dirname, '..', 'lib');
const realDb = path.join(libDir, 'db.js');
const backup = realDb + '.smoke-backup';
let createdLib = false;
let backedUp = false;

if (!existsSync(realDb)) {
  mkdirSync(libDir, { recursive: true });
  copyFileSync(stubPath, realDb);
  createdLib = true;
} else {
  copyFileSync(realDb, backup);
  copyFileSync(stubPath, realDb);
  backedUp = true;
}

const { default: crmOverview } = await import('./crm-overview.js');
const { default: findCustomer } = await import('./find-customer.js');
const { default: customerDetail } = await import('./customer-detail.js');
const { default: pipeline } = await import('./pipeline.js');
const { default: draftFollowup } = await import('./draft-followup.js');
const { default: leadUpdateProposal, LEAD_STATUSES } = await import('./lead-update-proposal.js');

try {
  await runSmokeTests({ crmOverview, findCustomer, customerDetail, pipeline, draftFollowup, leadUpdateProposal });
} finally {
  // RESTORE lib/db.js persis seperti semula (file agent CRM tidak diubah).
  if (createdLib) unlinkSync(realDb);
  if (backedUp) {
    copyFileSync(backup, realDb);
    unlinkSync(backup);
  }
  unlinkSync(stubPath);
}

async function runSmokeTests({ crmOverview, findCustomer, customerDetail, pipeline, draftFollowup, leadUpdateProposal }) {
const skills = { crmOverview, findCustomer, customerDetail, pipeline, draftFollowup, leadUpdateProposal };

// 1) Kontrak skill (validator produk)
for (const [label, s] of Object.entries(skills)) {
  const v = validateSkill(s);
  assert.equal(v.ok, true, `${label}: ${v.errors.join('; ')}`);
  assert.equal(s.readOnly, true, `${label} harus readOnly:true`);
}
console.log('contract: 6/6 skills valid (name/description/parameters/readOnly/run)');

// 2) Smoke per skill
const ov = await crmOverview.run({});
assert.deepEqual(ov.data.leadsByStatus, { new: 1, contacted: 1, qualified: 0, unqualified: 0, lost: 0 });
assert.equal(ov.data.totalCustomers, 3);
assert.equal(ov.data.openDeals, 2);
assert.equal(ov.data.openValue, 16_500_000);
assert.equal(ov.sources.length > 0, true);
console.log('crm-overview:', JSON.stringify(ov.data), '| sources:', ov.sources.length);

const fc = await findCustomer.run({ query: 'maju' });
assert.equal(fc.data.matches.length, 1);
assert.equal(fc.data.matches[0].customerId, 'cus_001');
assert.equal(fc.data.matches[0].company, 'PT Maju Jaya');
assert.ok(fc.data.matches[0].reason);
const fcNote = await findCustomer.run({ query: 'RENEWAL' }); // case-insensitive via note
assert.equal(fcNote.data.matches[0].customerId, 'cus_001');
console.log('find-customer: query=maju ->', JSON.stringify(fc.data.matches));
console.log('find-customer: query=RENEWAL (note, case-insensitive) ->', fcNote.data.matches[0].customerId);

const cd = await customerDetail.run({ customerId: 'cus_002' });
assert.equal(cd.data.found, true);
assert.equal(cd.data.deals.length, 1);
assert.equal(cd.data.activities.length, 1);
assert.equal(cd.data.customer.id, 'cus_002');
const cdMiss = await customerDetail.run({ customerId: 'cus_404' });
assert.equal(cdMiss.data.found, false);
console.log('customer-detail: cus_002 deals=%d activities=%d; cus_404 -> found=false', cd.data.deals.length, cd.data.activities.length);

const pl = await pipeline.run({});
assert.equal(pl.data.totalOpenDeals, 2);
assert.ok(pl.data.deals.every((d) => ['discovery', 'proposal', 'negotiation'].includes(d.stage)));
// Urutan: expectedClose terdekat (paling kecil) dulu — deal_002 (-45d) sebelum deal_001 (-20d)
assert.equal(pl.data.deals[0].dealId, 'deal_002');
assert.ok(pl.data.deals[0].lastActivity && pl.data.deals[0].lastActivity.at);
console.log('pipeline: %d open deals, nilai total %d, deal#1=%s lastAct=%s', pl.data.totalOpenDeals, pl.data.totalOpenValue, pl.data.deals[0].dealId, pl.data.deals[0].lastActivity.type);

const df = await draftFollowup.run({ days: 7 });
assert.ok(df.data.drafts.length >= 1 && df.data.drafts.length <= 5);
assert.ok(df.data.drafts.every((d) => d.isDraft && d.needsHumanReview));
// cus_002 (30 hari lalu) & cus_001? (10 hari lalu > 7) masuk; cus_003 churned -> tidak
const ids = df.data.drafts.map((d) => d.customerId).sort();
assert.deepEqual(ids, ['cus_001', 'cus_002']);
console.log('draft-followup: days=7 -> %d draft (DRAFT, perlu review): %s', df.data.drafts.length, ids.join(','));
const dfDefault = await draftFollowup.run({});
assert.equal(dfDefault.data.daysThreshold, 7);
console.log('draft-followup: default days=7 OK');

const pOk = await leadUpdateProposal.run({ leadId: 'lead_001', newStatus: 'contacted' });
assert.equal(pOk.data.proposal, true);
assert.equal(pOk.data.leadId, 'lead_001');
assert.equal(pOk.data.currentStatus, 'new');
assert.equal(pOk.data.newStatus, 'contacted');
assert.ok(pOk.data.reason);
console.log('lead-update-proposal OK:', JSON.stringify({ proposal: pOk.data.proposal, leadId: pOk.data.leadId, currentStatus: pOk.data.currentStatus, newStatus: pOk.data.newStatus, reason: pOk.data.reason.slice(0, 60) + '...' }));

const pMissing = await leadUpdateProposal.run({ leadId: 'lead_999', newStatus: 'contacted' });
assert.equal(pMissing.data.proposal, false);
const pBad = await leadUpdateProposal.run({ leadId: 'lead_001', newStatus: 'hacked' });
assert.equal(pBad.data.proposal, false);
const pSame = await leadUpdateProposal.run({ leadId: 'lead_002', newStatus: 'contacted' });
assert.equal(pSame.data.proposal, false);
assert.equal(LEAD_STATUSES.length, 5);
console.log('lead-update-proposal rejects: lead tak ada / status di luar enum / status sama -> proposal=false (tanpa mutasi)');

console.log('\nSMOKE OK — 6 skill valid + lulus fixture offline.');
}
