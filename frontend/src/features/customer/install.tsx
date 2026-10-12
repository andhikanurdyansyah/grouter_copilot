import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Check, Slash, Plus, Terminal, Shield } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function CustomerInstall() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const meQ = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const myLicense = meQ.data?.licenses?.find((l) => String(l.status ?? 'active') === 'active') ?? meQ.data?.licenses?.[0]
  const licenseId = myLicense?.id ?? '—'

  const [copiedId, setCopiedId] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [activeStep, setActiveStep] = useState(3)
  const [addSkillOpen, setAddSkillOpen] = useState(false)
  const [exampleSkillOpen, setExampleSkillOpen] = useState(false)
  const [copiedSkillExample, setCopiedSkillExample] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillAllowed, setNewSkillAllowed] = useState(true)

  const commandText = isId
    ? `$ npx @grouter/copilot install --license ${licenseId}
✓ Lisensi tervalidasi (Ed25519)
✓ .env server diperbarui (nilai tidak dicetak)
✓ Route gateway: /api/copilot/chat

Siap. Mount <CopilotChat /> di UI Anda`
    : `$ npx @grouter/copilot install --license ${licenseId}
✓ License validated (Ed25519)
✓ Server .env updated (values never printed)
✓ Gateway route: /api/copilot/chat

Ready. Mount <CopilotChat /> in your UI`

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(commandText)
    setCopiedCmd(true)
    setTimeout(() => setCopiedCmd(false), 2000)
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(licenseId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const [skills, setSkills] = useState([
    { name: 'orders.list', allowed: true, usage: '58% ' + (isId ? 'permintaan' : 'requests') },
    { name: 'tickets.list', allowed: true, usage: '31% ' + (isId ? 'permintaan' : 'requests') },
    { name: 'customers.find', allowed: true, usage: '11% ' + (isId ? 'permintaan' : 'requests') },
    {
      name: 'billing.write',
      allowed: false,
      usage: isId ? 'Ditolak · tulis tidak diizinkan' : 'Denied · write not permitted',
    },
  ])

  const toggleSkill = (idx: number) => {
    setSkills((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, allowed: !s.allowed } : s))
    )
  }

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSkillName.trim()) return
    const formatted = newSkillName.trim().toLowerCase()
    setSkills((prev) => [
      ...prev,
      {
        name: formatted,
        allowed: newSkillAllowed,
        usage: newSkillAllowed ? `0% ${isId ? 'permintaan (baru)' : 'requests (new)'}` : (isId ? 'Ditolak · tidak diizinkan' : 'Denied · not permitted'),
      },
    ])
    setNewSkillName('')
    setAddSkillOpen(false)
  }

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Top Header Row ── */}
      <div>
        <h1 className='text-2xl font-bold tracking-tight text-foreground'>
          {isId ? 'Lisensi & instalasi' : 'Licenses & setup'}
        </h1>
        <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
          {isId
            ? 'Pasang Copilot di server aplikasi Anda. Kredensial provider tetap di server, tidak pernah di browser.'
            : 'Install Copilot on your host application server. Provider keys stay on the server, never in the browser.'}
        </p>
      </div>

      {!myLicense && (
        <div className='rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-500 font-medium bevel-shine'>
          {isId
            ? 'Anda belum punya lisensi — beli paket di halaman Paket & Harga untuk mendapatkan lisensi dan panduan instalasi aktif.'
            : "You don't have a license yet — purchase a plan on the Plans & Pricing page to get a license and active installation guide."}
        </div>
      )}

            {/* ── Grid: Left Steps & 3D Terminal (8 cols) + Right Stepper (4 cols) ── */}

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
        {/* Left Column (8 cols) */}
        <div className='lg:col-span-8 space-y-5'>
          {/* 3D Metadata Strip */}
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border/80 bg-card/80 p-4 card-3d hover-lift-3d bevel-shine text-xs'>
            <div className='flex items-center justify-between sm:justify-start gap-2'>
              <span className='text-muted-foreground'>{isId ? 'ID lisensi' : 'License ID'}</span>
              <button
                type='button'
                onClick={handleCopyId}
                className='font-mono font-bold text-foreground flex items-center gap-1.5 hover:text-[#7778FF] transition-colors p-1 rounded-md hover:bg-muted/40 interactive-press'
                title='Copy ID'
              >
                <span>{licenseId}</span>
                {copiedId ? <Check className='size-3 text-emerald-500' /> : <Copy className='size-3 text-muted-foreground' />}
              </button>
            </div>

            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground'>{isId ? 'Status' : 'Status'}: </span>
              <span className='font-semibold text-[#39D6A0] inline-flex items-center gap-1.5'>
                <span className='relative flex size-2'>
                  <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-[#39D6A0] opacity-75' />
                  <span className='relative inline-flex rounded-full size-2 bg-[#39D6A0]' />
                </span>
                {myLicense
                  ? (isId ? 'Aktif · Ed25519' : 'Active · Ed25519')
                  : (isId ? 'Belum ada lisensi aktif' : 'No active license')}
              </span>
            </div>

            <div>
              <span className='text-muted-foreground'>{isId ? 'Berlaku hingga' : 'Valid until'}: </span>
              <span className='font-mono font-semibold text-foreground'>
                {myLicense?.expiresAt
                  ? new Date(myLicense.expiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'}
              </span>
            </div>
          </div>

          {/* 3D Terminal Box (Mac styled traffic lights & glow) */}
          <div className='rounded-xl border border-border/80 bg-[#0B0F17] card-3d shadow-2xl overflow-hidden bevel-shine'>
            {/* Terminal Header */}
            <div className='flex items-center justify-between px-4 py-3 border-b border-border/60 bg-[#10141D]'>
              <div className='flex items-center gap-2'>
                {/* Traffic lights */}
                <div className='size-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/50' />
                <div className='size-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/50' />
                <div className='size-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/50' />
                <span className='font-mono text-xs text-muted-foreground ml-2 flex items-center gap-1.5'>
                  <Terminal className='size-3.5 text-[#7778FF]' /> server · bash
                </span>
              </div>

              <Button
                size='sm'
                variant='outline'
                onClick={handleCopyCmd}
                className='h-7 gap-1.5 border-border bg-card/60 hover:bg-muted text-xs interactive-press'
              >
                {copiedCmd ? <Check className='size-3 text-emerald-500' /> : <Copy className='size-3' />}
                {copiedCmd ? (isId ? 'Tersalin' : 'Copied') : t('btn_copy')}
              </Button>
            </div>

            {/* Terminal Body */}
            <div className='p-5 font-mono text-xs text-slate-200 space-y-2.5 leading-relaxed selection:bg-[#7778FF]/30'>
              <div className='flex items-center gap-2 text-indigo-300'>
                <span className='text-emerald-400 font-bold'>$</span> npx @grouter/copilot install --license GRC-••••
              </div>
              <div className='text-emerald-400 flex items-center gap-2'>
                <span>✓</span> <span>{isId ? 'Lisensi tervalidasi (Ed25519)' : 'License validated (Ed25519)'}</span>
              </div>
              <div className='text-emerald-400 flex items-center gap-2'>
                <span>✓</span> <span>{isId ? '.env server diperbarui (nilai tidak dicetak)' : 'Server .env updated (values never printed)'}</span>
              </div>
              <div className='text-emerald-400 flex items-center gap-2'>
                <span>✓</span> <span>{isId ? 'Route gateway: /api/copilot/chat' : 'Gateway route: /api/copilot/chat'}</span>
              </div>
              <div className='pt-2 text-slate-100 flex items-center gap-2'>
                <span className='text-emerald-400 font-bold'>{isId ? 'Siap.' : 'Ready.'}</span>
                <span>{isId ? 'Mount <CopilotChat /> di UI Anda' : 'Mount <CopilotChat /> in your UI'}</span>
                <span className='inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse' />
              </div>
              <div className='pt-3 text-muted-foreground text-[11px] border-t border-slate-800/80'>
                # {isId ? 'Paket npm publik belum tersertifikasi; gunakan tarball lokal untuk uji' : 'Public npm package not certified yet; use local tarball for testing'}
              </div>
            </div>
          </div>

          {/* Skill Read-Only Card with interactive toggles */}
          <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
            <div className='flex items-start justify-between'>
              <div>
                <h2 className='text-base font-bold text-foreground'>
                  {isId ? 'Skill read-only' : 'Read-only skills'}
                </h2>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  {isId
                    ? 'Copilot hanya membaca data yang Anda definisikan secara eksplisit. Klik untuk uji toggle status.'
                    : 'Copilot only reads data that you explicitly configure. Click to test status toggle.'}
                </p>
              </div>

              <Button
                variant='outline'
                size='sm'
                onClick={() => setAddSkillOpen(true)}
                className='h-8 gap-1.5 border-border bg-card text-xs font-semibold interactive-press'
              >
                <Plus className='size-3.5' /> {isId ? 'Tambah skill' : 'Add skill'}
              </Button>
            </div>

            <div className='space-y-2 font-mono text-xs'>
              {skills.map((skill, i) => (
                <div
                  key={i}
                  onClick={() => toggleSkill(i)}
                  className={cn(
                    'flex items-center justify-between rounded-xl p-3 transition-all cursor-pointer interactive-press',
                    skill.allowed
                      ? 'border border-border/80 bg-card/70 hover:border-emerald-500/40 text-foreground'
                      : 'border border-[#FF667A]/30 bg-[#FF667A]/10 text-[#FF667A]'
                  )}
                >
                  <div className='flex items-center gap-2.5'>
                    {skill.allowed ? (
                      <span className='size-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0'>
                        <Check className='size-3' />
                      </span>
                    ) : (
                      <span className='size-5 rounded-full bg-[#FF667A]/20 text-[#FF667A] flex items-center justify-center shrink-0'>
                        <Slash className='size-3' />
                      </span>
                    )}
                    <span className='font-bold'>{skill.name}</span>
                  </div>
                  <span className='font-sans text-[11px] text-muted-foreground'>
                    {skill.usage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: 3D Interactive Stepper (4 cols) */}
        <div className='lg:col-span-4 space-y-5'>
          <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-base font-bold text-foreground'>
                {isId ? 'Langkah instalasi' : 'Installation steps'}
              </h2>
              <span className='text-xs font-mono font-bold text-[#7778FF] rounded-md bg-[#7778FF]/10 px-2 py-0.5 border border-[#7778FF]/20'>
                {activeStep}/5
              </span>
            </div>

            {/* Glowing Stepper Progress Bar */}
            <div className='h-2 w-full rounded-full bg-muted/60 overflow-hidden'>
              <div
                className='h-full rounded-full bg-gradient-to-r from-[#7778FF] to-[#4CC9F0] transition-all duration-500 shadow-[0_0_8px_#7778FF]'
                style={{ width: `${(activeStep / 5) * 100}%` }}
              />
            </div>

            {/* Steps List */}
            <div className='space-y-3 pt-2 text-xs'>
              {/* Step 1 */}
              <div
                onClick={() => setActiveStep(1)}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all',
                  activeStep === 1 ? 'bg-[#7778FF]/10 border border-[#7778FF]/40' : 'hover:bg-muted/40'
                )}
              >
                <div className='flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-bold shadow-xs'>
                  ✓
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-foreground'>
                    {isId ? 'Beli & aktivasi lisensi' : 'Purchase & activate license'}
                  </div>
                  <div className='text-muted-foreground text-[11px]'>
                    {isId ? 'Selesai 12 Okt 2026 · Pro' : 'Completed 12 Oct 2026 · Pro'}
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div
                onClick={() => setActiveStep(2)}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all',
                  activeStep === 2 ? 'bg-[#7778FF]/10 border border-[#7778FF]/40' : 'hover:bg-muted/40'
                )}
              >
                <div className='flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-bold shadow-xs'>
                  ✓
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-foreground'>
                    {isId ? 'Jalankan CLI install' : 'Run install CLI'}
                  </div>
                  <div className='text-muted-foreground text-[11px]'>
                    {isId ? 'Di environment server aplikasi host.' : 'On the host application server environment.'}
                  </div>
                </div>
              </div>

              {/* Step 3 (Active) */}
              <div
                onClick={() => setActiveStep(3)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border border-[#7778FF]/50 bg-[#7778FF]/15 card-3d shadow-sm'
                )}
              >
                <div className='flex size-6 shrink-0 items-center justify-center rounded-full bg-[#7778FF] text-white text-xs font-bold shadow-[0_0_8px_#7778FF]'>
                  3
                </div>
                <div className='space-y-1'>
                  <div className='font-bold text-foreground'>
                    {isId ? 'Definisikan skill' : 'Define skills'}
                  </div>
                  <div className='text-muted-foreground text-[11px] leading-relaxed'>
                    {isId
                      ? 'Edit skills/example.js; ekspos hanya data read-only.'
                      : 'Edit skills/example.js; expose read-only data only.'}
                  </div>
                  <button
                    type='button'
                    onClick={() => setExampleSkillOpen(true)}
                    className='text-[11px] font-semibold text-[#7778FF] hover:underline flex items-center gap-1 pt-1 interactive-press'
                  >
                    {isId ? 'Buka contoh skill →' : 'Open example skill →'}
                  </button>
                </div>
              </div>

              {/* Step 4 */}
              <div
                onClick={() => setActiveStep(4)}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all opacity-70 hover:opacity-100'
                )}
              >
                <div className='flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground text-xs font-bold'>
                  4
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-foreground'>
                    Mount CopilotChat
                  </div>
                  <div className='text-muted-foreground text-[11px]'>
                    {isId ? 'Tambahkan widget ke UI dan wire route.' : 'Add widget to UI and wire route.'}
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div
                onClick={() => setActiveStep(5)}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all opacity-70 hover:opacity-100'
                )}
              >
                <div className='flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground text-xs font-bold'>
                  5
                </div>
                <div className='space-y-0.5'>
                  <div className='font-semibold text-foreground'>
                    {isId ? 'Uji percakapan pertama' : 'Test first conversation'}
                  </div>
                  <div className='text-muted-foreground text-[11px]'>
                    {isId ? 'Permintaan akan muncul di Penggunaan AI.' : 'Requests will appear in AI Usage.'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Renewal Box with 3D Border */}
          <div className='rounded-xl border border-border/80 bg-card/80 p-4 card-3d bevel-shine text-xs space-y-1.5'>
            <div className='font-bold text-foreground flex items-center gap-2'>
              <Shield className='size-3.5 text-emerald-400' /> Renewal
            </div>
            <p className='text-muted-foreground text-[11px] leading-relaxed'>
              {isId
                ? 'Pastikan .env hanya berisi satu baris GROUTER_LICENSE= yang terbaru. Plugin memverifikasi token secara offline via Ed25519.'
                : 'Make sure .env contains only one line of the latest GROUTER_LICENSE=. The plugin verifies the token offline via Ed25519.'}
            </p>
          </div>
        </div>
      </div>

      {/* Add Skill Dialog */}
      <Dialog open={addSkillOpen} onOpenChange={setAddSkillOpen}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <DialogTitle className='text-base font-bold text-foreground'>
              {isId ? 'Tambah Skill Baru' : 'Add New Skill'}
            </DialogTitle>
            <DialogDescription className='text-xs text-muted-foreground'>
              {isId
                ? 'Definisikan skema fungsi read-only yang dapat diakses oleh Copilot.'
                : 'Define a read-only skill schema that Copilot is authorized to query.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddSkill} className='space-y-4 py-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='skill-name' className='text-xs font-semibold'>
                {isId ? 'Nama Skill (domain.aksi)' : 'Skill Name (domain.action)'}
              </Label>
              <Input
                id='skill-name'
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                required
                placeholder='e.g. inventory.lookup'
                className='text-xs font-mono'
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='skill-permission' className='text-xs font-semibold'>
                {isId ? 'Izin Akses' : 'Access Permission'}
              </Label>
              <select
                id='skill-permission'
                value={newSkillAllowed ? 'allowed' : 'denied'}
                onChange={(e) => setNewSkillAllowed(e.target.value === 'allowed')}
                className='w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary'
              >
                <option value='allowed'>{isId ? 'Izinkan (Read-Only)' : 'Allowed (Read-Only)'}</option>
                <option value='denied'>{isId ? 'Tolak (Dilarang)' : 'Denied (Forbidden)'}</option>
              </select>
            </div>

            <DialogFooter className='pt-2 gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setAddSkillOpen(false)}
                className='text-xs'
              >
                {isId ? 'Batal' : 'Cancel'}
              </Button>
              <Button
                type='submit'
                size='sm'
                className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-bold interactive-press'
              >
                {isId ? 'Tambah' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Example Skill Definition Modal (Moda contextual modal pattern) ── */}
      <Dialog open={exampleSkillOpen} onOpenChange={setExampleSkillOpen}>
        <DialogContent className='sm:max-w-lg border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <div className='flex items-center justify-between pr-4'>
              <DialogTitle className='text-base font-bold text-foreground flex items-center gap-2'>
                <Terminal className='size-4 text-[#7778FF]' />
                <span>skills/orders.js</span>
              </DialogTitle>
              <span className='font-mono text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20'>
                {isId ? 'Read-Only Validated' : 'Read-Only Validated'}
              </span>
            </div>
            <DialogDescription className='text-xs text-muted-foreground pt-1'>
              {isId
                ? 'Contoh spesifikasi skill read-only yang aman diekspos ke Copilot. Hanya mengembalikan data tanpa mutasi atau pembocoran kredensial.'
                : 'Example read-only skill specification safely queryable by Copilot. Returns data without mutating state or leaking credentials.'}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3 py-2'>
            {/* Code container */}
            <div className='relative rounded-xl border border-border/80 bg-muted/70 dark:bg-muted/30 text-foreground dark:text-slate-200 p-4 font-mono text-xs overflow-x-auto shadow-inner leading-relaxed'>
              <div className='flex justify-between items-center pb-2 mb-2 border-b border-border/60 text-[11px] text-muted-foreground'>
                <span>// Export default skill object</span>
                <Button
                  size='sm'
                  variant='ghost'
                  className='h-6 px-2 text-[11px] text-[#7778FF] hover:text-[#8F90FF]'
                  onClick={() => {
                    const code = `export default {\n  name: 'orders.lookup',\n  description: 'Lookup customer order status and delivery tracking',\n  parameters: {\n    type: 'object',\n    properties: {\n      order_id: { type: 'string', description: 'Order reference ID' }\n    },\n    required: ['order_id']\n  },\n  async handler({ order_id }, context) {\n    const order = await context.db.orders.findById(order_id);\n    if (!order) return { error: 'Order not found' };\n    return {\n      status: order.status,\n      items_count: order.items.length,\n      tracking_number: order.tracking_no\n    };\n  }\n};`
                    navigator.clipboard.writeText(code)
                    setCopiedSkillExample(true)
                    setTimeout(() => setCopiedSkillExample(false), 2000)
                  }}
                >
                  {copiedSkillExample ? (
                    <>
                      <Check className='size-3 text-emerald-500 mr-1' /> {isId ? 'Tersalin' : 'Copied'}
                    </>
                  ) : (
                    <>
                      <Copy className='size-3 mr-1' /> {t('btn_copy')}
                    </>
                  )}
                </Button>
              </div>

              <pre className='text-[11px] leading-relaxed text-indigo-300'>
{`export default {
  name: 'orders.lookup',
  description: 'Lookup order status & tracking',
  parameters: {
    type: 'object',
    properties: {
      order_id: { type: 'string' }
    },
    required: ['order_id']
  },
  async handler({ order_id }, context) {
    // READ-ONLY: Tidak boleh memanggil db.update atau db.delete
    const order = await context.db.orders.findById(order_id);
    if (!order) return { found: false };
    return {
      status: order.status,
      items_count: order.items.length,
      tracking_no: order.tracking_no
    };
  }
};`}
              </pre>
            </div>

            <div className='rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground border border-border/60 flex items-start gap-2'>
              <Shield className='size-4 text-[#7778FF] shrink-0 mt-0.5' />
              <span>
                {isId
                  ? 'Invarian keamanan: Handler dieksekusi di server lokal Anda secara terisolasi. Copilot tidak pernah menerima koneksi database langsung maupun kredensial .env.'
                  : 'Security invariant: Handler runs isolated on your local server. Copilot never receives raw database connections or .env secrets.'}
              </span>
            </div>
          </div>

          <DialogFooter className='pt-2'>
            <Button
              type='button'
              onClick={() => setExampleSkillOpen(false)}
              className='w-full sm:w-auto text-xs bg-[#7778FF] hover:bg-[#8F90FF] text-white font-semibold'
            >
              {isId ? 'Tutup' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
