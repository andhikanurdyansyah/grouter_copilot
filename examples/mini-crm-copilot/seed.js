// seed.js — generator data demo Mini CRM (deterministik, lihat CONTRACT.md)
// Semua angka/teks dihasilkan dari seeded RNG (mulberry32, seed tetap) sehingga
// `node seed.js` selalu menghasilkan data yang sama (tanggal relatif terhadap hari eksekusi).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.join(__dirname, 'data')
export const DATA_FILE = path.join(DATA_DIR, 'crm.json')

// Seed tetap — pakai HEAD repo sebagai konstanta yang bermakna & stabil
const FIXED_SEED = 8654999

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY_MS = 86400000
const pad3 = (n) => String(n).padStart(3, '0')
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
const intBetween = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))

function shuffle(rng, arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Kantor cukup: kembalikan array berisi `counts[key]` salinan tiap key
function bag(counts) {
  const out = []
  for (const [key, n] of Object.entries(counts)) for (let i = 0; i < n; i++) out.push(key)
  return out
}

// Timestamp ISO deterministik: `daysAgo` hari lalu + jam kerja acak (dari rng)
function isoPast(rng, nowMs, minDaysAgo, maxDaysAgo) {
  const days = intBetween(rng, minDaysAgo, maxDaysAgo)
  const hour = intBetween(rng, 8, 18)
  const minute = intBetween(rng, 0, 59)
  const d = new Date(nowMs - days * DAY_MS)
  d.setUTCHours(hour, minute, 0, 0)
  return d.toISOString()
}

// Tanggal (YYYY-MM-DD) di masa depan/masa lalu relatif `nowMs`
function dateOffset(nowMs, days) {
  return new Date(nowMs + days * DAY_MS).toISOString().slice(0, 10)
}

// Hari acak di bulan berjalan (agar analisis pipeline "bulan ini" bermakna)
function dateInCurrentMonth(rng, now) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const day = intBetween(rng, 2, Math.min(lastDay, 27))
  return new Date(Date.UTC(y, m, day, 12)).toISOString().slice(0, 10)
}

const PERSON_NAMES = [
  'Budi Santoso', 'Siti Rahmawati', 'Andi Wijaya', 'Dewi Lestari', 'Agus Prasetyo',
  'Rina Kusuma', 'Bambang Hidayat', 'Sri Wahyuni', 'Joko Susilo', 'Ratna Puspita',
  'Hendra Gunawan', 'Maya Anggraini', 'Fajar Nugroho', 'Lestari Handayani', 'Tono Setiawan',
  'Wulan Safitri', 'Eko Prasetya', 'Indah Permatasari', 'Rizky Maulana', 'Putri Wulandari',
  'Gunawan Halim', 'Ayu Kartika', 'Hadi Firmansyah', 'Novi Rahayu', 'Darmawan Saputra',
  'Citra Maharani', 'Yusuf Tanjung', 'Mega Utami', 'Arif Ridwan', 'Tania Larasati',
  'Slamet Riyadi', 'Fitri Nuraini', 'Doni Kurniawan', 'Yanti Marlina', 'Wahyu Ramadhan',
  'Nita Amalia', 'Reza Fahmi', 'Sari Wulandari', 'Adi Nugraha', 'Vina Oktaviani',
  'Bagus Winata', 'Dewangga Pratama',
]

const COMPANIES = [
  'PT Nusantara Retail Prima', 'CV Sinar Abadi Jaya', 'PT Karya Cetak Mandiri',
  'PT Boga Rasa Nusantara', 'CV Mitra Teknik Utama', 'PT Sentra Pangan Sejahtera',
  'UD Sumber Rejeki Abadi', 'PT Digital Kreatif Indonesia', 'CV Batik Mahakam',
  'PT Solusi Logistik Andalan', 'PT Griya Bangun Perkasa', 'CV Kopi Arabika Nusantara',
  'PT Elektronik Mart Sentosa', 'PT Farmasi Sehat Bersama', 'CV Tani Makmur',
  'PT Moda Busana Indonesia', 'PT Pasar Rakyat Digital', 'CV Bengkel Presisi Jaya',
  'PT Resort Bahari Lestari', 'PT Penerbit Ilmu Populer', 'CV Rangka Kayu Kreatif',
  'PT Pangan Segar Utama', 'PT Garmen Kencana', 'CV Foto Sinematik',
  'PT Otomotif Nusantara Jaya', 'CV Dekorasi Hunian', 'PT Alat Medis Prima',
  'PT Perikanan Samudra Kita', 'CV Roti Enak Makmur', 'PT Konveksi Bintang Timur',
  'PT Agro Widya Karya', 'CV Mainan Edukatif', 'PT Konsultan Bangun Karya',
  'PT Distro Gaya Muda', 'CV Perlengkapan Sekolah Unggul', 'PT Kimia Analisis Sejahtera',
  'CV Catering Nikmat Boga', 'PT Percetakan Warna Gemilang', 'PT Toko Bangunan Jaya Makmur',
  'CV Sepatu Lokal Berkarya', 'PT Petshop Piaraan Ceria', 'PT Gudang Serba Ada Makmur',
]

const LEAD_NAMES = [
  'Pandu Adikusumo', 'Melati Anggun', 'Rangga Saputra', 'Kartika Dewi', 'Bayu Segara',
  'Nadine Halim', 'Iqbal Maulana', 'Rosa Amelia', 'Teguh Waluyo', 'Anisa Fitriani',
  'Dendi Pratama', 'Silvi Handayani', 'Farhan Yudhistira', 'Gita Savitri', 'Ilham Nurhakim',
  'Tiara Puspasari', 'Oscar Pranata', 'Laila Ramadhani', 'Semuel Tampubolon', 'Vanya Kirana',
  'Aditya Baskoro', 'Prita Ningsih', 'Bagas Wicaksono', 'Sherly Oktavia', 'Yoga Prasetyo',
  'Zahra Amelia',
]

const LEAD_COMPANIES = [
  'PT Sentra Retail Bersama', 'CV Dunia Otomotif Kita', 'PT Rumah Makan Padang Sederhana',
  'PT Sekolah Digital Cerdas', 'CV Laundry Kiloan Bersih', 'PT Toko Herbal Sehat Amanah',
  'CV Studio Video Kreatif', 'PT Klinik Gigi Senyum', 'CV Agen Properti Harmoni',
  'PT Bengkel Mobil Andal', 'CV Peternakan Ayam Sejahtera', 'PT Salon Kecantikan Melati',
  'CV Penerjemah Dokumen Resmi', 'PT Warnet Game Zone', 'CV Kursus Mengemudi Aman',
  'PT Toko Bunga Mekar', 'CV Jasa Pindahan Rapat', 'PTles.exports', 'PT Katering Sehat Anak',
  'CV Servis AC Dingin', 'PT Toko HP Original', 'CV Latihan Musik Ananda', 'PT Print Banner Cepat',
  'CV Wisata Gunung Apik', 'PT Laundry Hotel Nusantara', 'CV Bimbel Sukses Selalu',
]

const LEAD_SOURCES = ['website', 'referral', 'event', 'linkedin', 'cold-call', 'whatsapp', 'marketplace']

const DEAL_TITLES = {
  discovery: [
    'Eksplorasi kebutuhan POS multi-outlet',
    'Diskusi awal paket inventory tetap',
    'Analisis kebutuhan CRM tim sales',
    'Survei kebutuhan modul gudang',
  ],
  proposal: [
    'Penawaran paket POS 10 outlet',
    'Proposal kontrak tahunan maintenance',
    'Penawaran lisensi modul accounting',
    'Proposal integrasi marketplace',
  ],
  negotiation: [
    'Negosiasi harga paket enterprise',
    'Revisi penawaran modul logistik',
    'Negosiasi SLA support premium',
  ],
  won: [
    'Kontrak implementasi POS 6 outlet',
    'Kontrak tahunan lisensi + support',
  ],
  lost: [
    'Penawaran modul HR — kalah harga',
  ],
}

// Aktivitas netral/positif/negatif-non-delivery. {first} = nama depan customer.
const ACTIVITY_TEMPLATES = [
  { type: 'call', sentiment: 'neutral', note: 'Telepon follow-up penawaran, {first} minta waktu membahas dengan tim internal.' },
  { type: 'call', sentiment: 'neutral', note: 'Telepon konfirmasi jadwal demo produk minggu depan.' },
  { type: 'call', sentiment: 'neutral', note: 'Reminder telepon untuk pembayaran invoice, akan diproses minggu ini.' },
  { type: 'email', sentiment: 'neutral', note: 'Email katalog produk dan harga terkirim. Menunggu balasan purchasing.' },
  { type: 'email', sentiment: 'neutral', note: 'Follow-up email penawaran kedua, belum ada balasan dari klien.' },
  { type: 'meeting', sentiment: 'neutral', note: 'Meeting review kebutuhan di kantor klien, hadir tim ops dan purchasing.' },
  { type: 'meeting', sentiment: 'neutral', note: 'Video call presentasi fitur dashboard, respons cukup antusias.' },
  { type: 'note', sentiment: 'neutral', note: 'Catatan internal: klien menahan budget sampai kuartal berikutnya.' },
  { type: 'note', sentiment: 'neutral', note: 'Catatan: purchasing sedang membandingkan penawaran dengan dua vendor lain.' },
  { type: 'call', sentiment: 'positive', note: 'Check-in bulanan: {first} puas dengan support bulan lalu, tertarik upgrade paket.' },
  { type: 'email', sentiment: 'positive', note: 'Balasan email: klien setuju dilanjutkan ke tahap proposal.' },
  { type: 'meeting', sentiment: 'positive', note: 'Kickoff meeting berjalan lancar, jadwal implementasi disepakati bersama.' },
  { type: 'note', sentiment: 'positive', note: 'Testimoni positif untuk proses onboarding, minta dijadikan studi kasus.' },
  { type: 'call', sentiment: 'negative', note: 'Telepon komplain: jaringan sering putus saat demo, minta bantuan teknis.' },
  { type: 'note', sentiment: 'negative', note: '{first} kecewa dengan respons support yang lambat pekan lalu, perlu follow-up.' },
]

// PENTING untuk use case pencarian Copilot: keluhan keterlambatan delivery/pengiriman.
// Dicantumkan eksplisit (bukan hasil acak) agar selalu ada di data seed.
const DELIVERY_COMPLAINTS = [
  { type: 'note', note: 'Komplain keterlambatan pengiriman: PO-2231 terlambat 6 hari dari jadwal, pelanggan minta kompensasi ongkir.' },
  { type: 'email', note: 'Email masuk: pengiriman barang tahap 2 tersangkut di gudang, keterlambatan sudah minggu kedua, minta update resi harian.' },
  { type: 'call', note: 'Telepon komplain: status pengiriman PO-1987 masih terlambat, pelanggan terancam pindah vendor.' },
  { type: 'note', note: 'Catatan CS: keluhan delivery delay berulang di cabang Surabaya, perlu eskalasi ke tim operasional.' },
  { type: 'email', note: 'Follow-up komplain: janji ganti rugi atas keterlambatan pengiriman belum terealisasi.' },
  { type: 'call', note: 'Telepon masuk: tanya pengiriman yang terlambat 3 hari, sudah dijelaskan penyebab cuaca buruk.' },
  { type: 'note', note: 'Catatan: keluhan keterlambatan delivery proyek toko cabang Bekasi, revisi jadwal dikirim minggu depan.' },
]

// Indeks customer penerima keluhan delivery (deterministik, 7 customer berbeda)
const COMPLAINT_CUSTOMER_INDICES = [2, 7, 12, 17, 23, 29, 35]

function companyDomain(company, rng) {
  const slug = company.replace(/^(PT|CV|UD)\s+/i, '').replace(/[^A-Za-z]/g, '').toLowerCase()
  const tld = pick(rng, ['.co.id', '.id', '.com'])
  return slug + tld
}

function makePhone(rng) {
  if (rng() < 0.6) {
    return `+62 8${intBetween(rng, 11, 89)}-${intBetween(rng, 1000, 9999)}-${intBetween(rng, 1000, 9999)}`
  }
  const area = pick(rng, ['021', '022', '031', '024', '061'])
  return `(${area}) ${intBetween(rng, 2000, 5999)}-${intBetween(rng, 1000, 9999)}`
}

export function generateCRM(now = new Date()) {
  const rng = mulberry32(FIXED_SEED)
  const nowMs = now.getTime()

  // ---- Customers: 42 (segment retail 14 / smb 18 / enterprise 10; status active 24 / prospect 12 / churned 6)
  const segments = shuffle(rng, bag({ retail: 14, smb: 18, enterprise: 10 }))
  const statuses = shuffle(rng, bag({ active: 24, prospect: 12, churned: 6 }))
  const customers = PERSON_NAMES.map((name, i) => {
    const company = COMPANIES[i]
    const first = name.split(' ')[0].toLowerCase()
    const last = name.split(' ').slice(1).join(' ').toLowerCase()
    const usePersonal = rng() < 0.3
    const email = usePersonal
      ? `${first}.${last}@${pick(rng, ['gmail.com', 'yahoo.co.id'])}`
      : `${first}.${last}@${companyDomain(company, rng)}`
    return {
      id: `cus_${pad3(i + 1)}`,
      name,
      company,
      email,
      phone: makePhone(rng),
      segment: segments[i],
      status: statuses[i],
      createdAt: isoPast(rng, nowMs, 90, 540),
    }
  })

  // ---- Leads: 26 (status new 7 / contacted 7 / qualified 6 / unqualified 3 / lost 3)
  const leadStatuses = shuffle(rng, bag({ new: 7, contacted: 7, qualified: 6, unqualified: 3, lost: 3 }))
  const scoreRange = {
    new: [20, 55], contacted: [35, 70], qualified: [60, 95], unqualified: [5, 30], lost: [10, 45],
  }
  const leads = LEAD_NAMES.map((name, i) => {
    const status = leadStatuses[i]
    const [lo, hi] = scoreRange[status]
    return {
      id: `lead_${pad3(i + 1)}`,
      name,
      company: LEAD_COMPANIES[i],
      source: pick(rng, LEAD_SOURCES),
      status,
      score: intBetween(rng, lo, hi),
      createdAt: isoPast(rng, nowMs, 1, 120),
    }
  })

  // ---- Deals: 14 (stage discovery 4 / proposal 4 / negotiation 3 / won 2 / lost 1), value IDR 5jt-250jt
  const dealStages = [
    'discovery', 'discovery', 'discovery', 'discovery',
    'proposal', 'proposal', 'proposal', 'proposal',
    'negotiation', 'negotiation', 'negotiation',
    'won', 'won', 'lost',
  ]
  const customerIds = shuffle(rng, customers.map((c) => c.id)).slice(0, dealStages.length)
  const openInCurrentMonth = new Set([0, 4, 8, 9]) // indeks deal terbuka yang expectedClose-nya di bulan berjalan
  const deals = dealStages.map((stage, i) => {
    const rawValue = (5 + rng() * 245) * 1_000_000
    const value = Math.max(5_000_000, Math.round(rawValue / 500_000) * 500_000)
    let expectedClose
    if (openInCurrentMonth.has(i)) {
      expectedClose = dateInCurrentMonth(rng, now)
    } else if (stage === 'won' || stage === 'lost') {
      expectedClose = dateOffset(nowMs, -intBetween(rng, 10, 80))
    } else {
      expectedClose = dateOffset(nowMs, intBetween(rng, 10, 70))
    }
    return {
      id: `deal_${pad3(i + 1)}`,
      customerId: customerIds[i],
      title: DEAL_TITLES[stage][Math.min(i, DEAL_TITLES[stage].length - 1)] ?? DEAL_TITLES[stage][0],
      value,
      stage,
      expectedClose,
      createdAt: isoPast(rng, nowMs, 7, 200),
    }
  })

  // ---- Activities: >=65, semua terhubung ke customer.
  // 1 aktivitas dasar per customer + bonus acak + 7 keluhan delivery eksplisit.
  const activities = []
  customers.forEach((c, i) => {
    const pushOne = () => {
      const t = pick(rng, ACTIVITY_TEMPLATES)
      activities.push({
        customerId: c.id,
        type: t.type,
        note: t.note.replace('{first}', c.name.split(' ')[0]),
        at: isoPast(rng, nowMs, 1, 89),
        sentiment: t.sentiment,
      })
    }
    pushOne()
    if (rng() < 0.55) pushOne()
    if (rng() < 0.25) pushOne()
    void i
  })
  COMPLAINT_CUSTOMER_INDICES.forEach((ci, k) => {
    const c = customers[ci]
    const t = DELIVERY_COMPLAINTS[k]
    activities.push({
      customerId: c.id,
      type: t.type,
      note: t.note,
      at: isoPast(rng, nowMs, 0, 14),
      sentiment: 'negative',
    })
  })
  activities.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  activities.forEach((a, i) => { a.id = `act_${pad3(i + 1)}` })

  return { customers, leads, deals, activities }
}

export function writeSeedFile(data = generateCRM()) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  return data
}

// Jalankan langsung: node seed.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const data = writeSeedFile()
  console.log(
    `Data seed ditulis ke ${path.relative(process.cwd(), DATA_FILE)} ` +
    `(${data.customers.length} customers, ${data.leads.length} leads, ${data.deals.length} deals, ${data.activities.length} activities)`
  )
}
