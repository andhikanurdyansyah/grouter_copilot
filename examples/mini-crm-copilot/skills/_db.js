/**
 * Adapter akses data untuk skill Copilot — SATU titik integrasi dengan
 * lib/db.js milik agent CRM. Skill tidak pernah membaca data/crm.json
 * langsung dan tidak pernah menulis.
 *
 * Bentuk export lib/db.js yang diterima (match pertama yang menang):
 *   readDb() / getDb() / loadDb() / default  -> { customers, leads, deals, activities }
 *   atau objek modul yang langsung memuat array-array tersebut (sinkron maupun Promise).
 */

function isDbShape(db) {
  return (
    !!db &&
    Array.isArray(db.customers) &&
    Array.isArray(db.leads) &&
    Array.isArray(db.deals) &&
    Array.isArray(db.activities)
  );
}

async function importDb() {
  const mod = await import('../lib/db.js');
  const candidates = [mod.loadDb, mod.readDb, mod.getDb, mod.load, mod.default, mod.db, mod];
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      const db = await candidate();
      if (isDbShape(db)) return db;
    } else if (candidate && isDbShape(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'lib/db.js harus mengekspos { customers, leads, deals, activities } ' +
      '(via loadDb()/readDb()/getDb()/load()/default atau export langsung).',
  );
}

export async function loadDb() {
  // Tanpa cache level skill: agar POST /api/reset (re-seed) langsung terlihat.
  return importDb();
}
