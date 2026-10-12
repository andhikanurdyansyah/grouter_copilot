// app.js — frontend Mini CRM demo (vanilla JS, tanpa build step)
// Slot Copilot: panel/widget ditambahkan oleh integrasi — file ini TIDAK memanggil /api/copilot/*.
(() => {
  'use strict'

  const $ = (sel) => document.querySelector(sel)

  // ---------- helpers ----------
  const IDR = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
  const fmtIDR = (n) => IDR.format(n)
  const fmtDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const badge = (text, cls) => `<span class="badge ${cls || text}">${esc(text)}</span>`
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  function setLoading(el, message) {
    el.innerHTML = `<div class="state state-loading"><span class="skeleton" style="width:60%"></span><br><span class="skeleton" style="width:40%"></span><br><span class="skeleton" style="width:50%"></span>${message ? `<div style="margin-top:10px">${esc(message)}</div>` : ''}</div>`
  }
  function setError(el, message) {
    el.innerHTML = `<div class="state state-error">${esc(message)} <button class="btn-link" data-retry>Coba lagi</button></div>`
    const retry = el.querySelector('[data-retry]')
    if (retry) retry.addEventListener('click', () => renderActive())
  }
  function setEmpty(el, message) {
    el.innerHTML = `<div class="state">${esc(message)}</div>`
  }
  function showToast(message, isError) {
    const t = $('#toast')
    t.textContent = message
    t.classList.toggle('toast-error', !!isError)
    t.hidden = false
    clearTimeout(showToast._timer)
    showToast._timer = setTimeout(() => { t.hidden = true }, 3200)
  }

  async function api(path, opts) {
    const res = await fetch(path, opts)
    let body = null
    try { body = await res.json() } catch { /* non-JSON */ }
    if (!res.ok) {
      throw new Error((body && body.error) || `HTTP ${res.status}`)
    }
    return body
  }

  // ---------- state ----------
  const state = {
    tab: 'dashboard',
    customers: { q: '', status: '', rows: null },
    leads: { q: '', status: '', rows: null },
    deals: { q: '', stage: '', rows: null },
    activities: { q: '', rows: null },
    detailId: null,
  }

  // ---------- tabs ----------
  const TABS = ['dashboard', 'customers', 'leads', 'deals', 'activities', 'customer-detail']
  function showTab(tab) {
    state.tab = tab
    for (const t of TABS) {
      const panel = $(`#panel-${t}`)
      if (panel) panel.hidden = t !== tab
    }
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab || (tab === 'customer-detail' && b.dataset.tab === 'customers')))
    window.scrollTo({ top: 0 })
    renderActive()
  }
  function renderActive() {
    switch (state.tab) {
      case 'dashboard': return renderDashboard()
      case 'customers': return renderCustomers()
      case 'leads': return renderLeads()
      case 'deals': return renderDeals()
      case 'activities': return renderActivities()
      case 'customer-detail': return renderDetail(state.detailId)
    }
  }

  // ---------- dashboard ----------
  async function renderDashboard() {
    for (const id of ['ov-total', 'ov-active', 'ov-open-deals', 'ov-open-value']) $(`#${id}`).textContent = '…'
    try {
      const ov = await api('/api/overview')
      $('#ov-total').textContent = String(ov.totalCustomers)
      $('#ov-active').textContent = String(ov.activeCustomers)
      $('#ov-open-deals').textContent = String(ov.openDeals)
      $('#ov-open-value').textContent = fmtIDR(ov.openValue)
      renderDist('#ov-leads', ov.leadsByStatus)
      renderDist('#ov-deals', ov.dealsByStage)
    } catch (err) {
      ['#ov-leads', '#ov-deals'].forEach((s) => {
        $(s).innerHTML = `<div class="state state-error">${esc(err.message)}</div>`
      })
      showToast(`Gagal memuat overview: ${err.message}`, true)
    }
  }
  function renderDist(sel, byKey) {
    const entries = Object.entries(byKey || {})
    if (!entries.length) { setEmpty($(sel), 'Belum ada data.'); return }
    const max = Math.max(...entries.map(([, n]) => n), 1)
    $(sel).innerHTML = entries.map(([k, n]) => `
      <div class="dist-row">
        <div class="dist-label">${esc(k)}</div>
        <div class="dist-bar"><div class="dist-fill" style="width:${Math.round((n / max) * 100)}%"></div></div>
        <div class="dist-count">${n}</div>
      </div>`).join('')
  }

  // ---------- customers ----------
  async function renderCustomers() {
    const { q, status } = state.customers
    const listEl = $('#cus-list')
    setLoading(listEl, 'Memuat customers…')
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (status) params.set('status', status)
      const qs = params.toString()
      const body = await api(`/api/customers${qs ? `?${qs}` : ''}`)
      state.customers.rows = body.customers
      $('#cus-count').textContent = `${body.customers.length} customer`
      if (!body.customers.length) return setEmpty(listEl, 'Tidak ada customer yang cocok dengan pencarian/filter.')
      listEl.innerHTML = `
        <table>
          <thead><tr><th>Nama</th><th>Perusahaan</th><th>Segment</th><th>Status</th><th>Kontak</th></tr></thead>
          <tbody>
            ${body.customers.map((c) => `
              <tr class="row-click" data-id="${c.id}" tabindex="0" role="button" aria-label="Buka detail ${esc(c.name)}">
                <td><div class="cell-main">${esc(c.name)}</div><div class="cell-sub">${esc(c.email)}</div></td>
                <td>${esc(c.company)}</td>
                <td>${badge(c.segment)}</td>
                <td>${badge(c.status)}</td>
                <td class="cell-sub">${esc(c.phone)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
      listEl.querySelectorAll('tr.row-click').forEach((tr) => {
        const open = () => { state.detailId = tr.dataset.id; showTab('customer-detail') }
        tr.addEventListener('click', open)
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open() })
      })
    } catch (err) {
      setError(listEl, `Gagal memuat customers: ${err.message}`)
    }
  }

  // ---------- detail customer ----------
  async function renderDetail(id) {
    const bodyEl = $('#detail-body')
    if (!id) return setEmpty(bodyEl, 'Tidak ada customer dipilih.')
    setLoading(bodyEl, 'Memuat detail customer…')
    try {
      const { customer: c, deals, activities } = await api(`/api/customers/${encodeURIComponent(id)}`)
      $('#detail-back').textContent = '← Kembali ke daftar customers'
      bodyEl.innerHTML = `
        <div class="detail-head">
          <div>
            <h2 class="detail-name">${esc(c.name)}</h2>
            <p class="detail-company">${esc(c.company)}</p>
          </div>
          <div>${badge(c.segment)} ${badge(c.status)}</div>
        </div>
        <div class="detail-meta">
          <span>Email: <b>${esc(c.email)}</b></span>
          <span>Telepon: <b>${esc(c.phone)}</b></span>
          <span>Customer sejak: <b>${fmtDate(c.createdAt)}</b></span>
        </div>
        <div class="box" style="margin-bottom:14px">
          <h3 class="box-title">Deals (${deals.length})</h3>
          ${deals.length ? `
            <table>
              <thead><tr><th>Judul</th><th>Stage</th><th>Nilai</th><th>Est. Close</th></tr></thead>
              <tbody>${deals.map((d) => `
                <tr>
                  <td>${esc(d.title)}</td>
                  <td>${badge(d.stage)}</td>
                  <td class="num">${fmtIDR(d.value)}</td>
                  <td class="num">${fmtDate(d.expectedClose)}</td>
                </tr>`).join('')}</tbody>
            </table>` : '<div class="state">Belum ada deal untuk customer ini.</div>'}
        </div>
        <div class="box">
          <h3 class="box-title">Activities (${activities.length})</h3>
          ${activities.length ? `
            <table>
              <thead><tr><th>Tanggal</th><th>Tipe</th><th>Catatan</th><th>Sentimen</th></tr></thead>
              <tbody>${activities.map((a) => `
                <tr>
                  <td class="num">${fmtDate(a.at)}</td>
                  <td>${badge(a.type)}</td>
                  <td>${esc(a.note)}</td>
                  <td>${badge(a.sentiment)}</td>
                </tr>`).join('')}</tbody>
            </table>` : '<div class="state">Belum ada aktivitas.</div>'}
        </div>`
    } catch (err) {
      setError(bodyEl, `Gagal memuat detail: ${err.message}`)
    }
  }

  // ---------- leads ----------
  async function renderLeads() {
    const { q, status } = state.leads
    const listEl = $('#lead-list')
    setLoading(listEl, 'Memuat leads…')
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      const qs = params.toString()
      const body = await api(`/api/leads${qs ? `?${qs}` : ''}`)
      state.leads.rows = body.leads
      const rows = body.leads.filter((l) => !q || `${l.name} ${l.company}`.toLowerCase().includes(q.toLowerCase()))
      $('#lead-count').textContent = `${rows.length} lead`
      if (!rows.length) return setEmpty(listEl, 'Tidak ada lead yang cocok dengan pencarian/filter.')
      listEl.innerHTML = `
        <table>
          <thead><tr><th>Nama</th><th>Perusahaan</th><th>Source</th><th>Score</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            ${rows.map((l) => `
              <tr>
                <td><div class="cell-main">${esc(l.name)}</div></td>
                <td>${esc(l.company)}</td>
                <td>${badge(l.source)}</td>
                <td class="num">${l.score}</td>
                <td>${badge(l.status)}</td>
                <td>
                  <select class="lead-status-select" data-id="${l.id}" aria-label="Ubah status ${esc(l.name)}">
                    ${['new', 'contacted', 'qualified', 'unqualified', 'lost'].map((s) => `<option value="${s}" ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`
      listEl.querySelectorAll('.lead-status-select').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const id = sel.dataset.id
          const newStatus = sel.value
          sel.disabled = true
          try {
            const res = await api(`/api/leads/${encodeURIComponent(id)}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus }),
            })
            const lead = state.leads.rows.find((x) => x.id === id)
            if (lead) lead.status = res.lead.status
            showToast(`Status lead ${res.lead.name} diubah menjadi "${res.lead.status}"`)
            renderLeads()
          } catch (err) {
            showToast(`Gagal ubah status: ${err.message}`, true)
            renderLeads()
          }
        })
      })
    } catch (err) {
      setError(listEl, `Gagal memuat leads: ${err.message}`)
    }
  }

  // ---------- deals ----------
  async function renderDeals() {
    const { q, stage } = state.deals
    const listEl = $('#deal-list')
    setLoading(listEl, 'Memuat deals…')
    try {
      const params = new URLSearchParams()
      if (stage) params.set('stage', stage)
      const qs = params.toString()
      const body = await api(`/api/deals${qs ? `?${qs}` : ''}`)
      state.deals.rows = body.deals
      const rows = body.deals.filter((d) => !q || d.title.toLowerCase().includes(q.toLowerCase()))
      $('#deal-count').textContent = `${rows.length} deal`
      if (!rows.length) return setEmpty(listEl, 'Tidak ada deal yang cocok dengan pencarian/filter.')
      listEl.innerHTML = `
        <table>
          <thead><tr><th>Judul</th><th>Stage</th><th>Nilai</th><th>Est. Close</th></tr></thead>
          <tbody>
            ${rows.map((d) => `
              <tr>
                <td><div class="cell-main">${esc(d.title)}</div></td>
                <td>${badge(d.stage)}</td>
                <td class="num">${fmtIDR(d.value)}</td>
                <td class="num">${fmtDate(d.expectedClose)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
    } catch (err) {
      setError(listEl, `Gagal memuat deals: ${err.message}`)
    }
  }

  // ---------- activities ----------
  async function renderActivities() {
    const { q } = state.activities
    const listEl = $('#act-list')
    setLoading(listEl, 'Memuat activities…')
    try {
      const body = await api('/api/activities?limit=200')
      state.activities.rows = body.activities
      const rows = body.activities.filter((a) => !q || a.note.toLowerCase().includes(q.toLowerCase()))
      $('#act-count').textContent = `${rows.length} aktivitas`
      if (!rows.length) return setEmpty(listEl, 'Tidak ada aktivitas yang cocok dengan pencarian.')
      listEl.innerHTML = `
        <table>
          <thead><tr><th>Tanggal</th><th>Tipe</th><th>Catatan</th><th>Sentimen</th></tr></thead>
          <tbody>
            ${rows.map((a) => `
              <tr>
                <td class="num">${fmtDate(a.at)}</td>
                <td>${badge(a.type)}</td>
                <td>${esc(a.note)}</td>
                <td>${badge(a.sentiment)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
    } catch (err) {
      setError(listEl, `Gagal memuat activities: ${err.message}`)
    }
  }

  // ---------- wiring ----------
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)))

  let searchTimer
  function debounced(input, apply) {
    input.addEventListener('input', () => {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(apply, 250)
    })
  }
  debounced($('#cus-search'), () => { state.customers.q = $('#cus-search').value.trim(); renderCustomers() })
  $('#cus-status').addEventListener('change', () => { state.customers.status = $('#cus-status').value; renderCustomers() })
  debounced($('#lead-search'), () => { state.leads.q = $('#lead-search').value.trim(); renderLeads() })
  $('#lead-status').addEventListener('change', () => { state.leads.status = $('#lead-status').value; renderLeads() })
  debounced($('#deal-search'), () => { state.deals.q = $('#deal-search').value.trim(); renderDeals() })
  $('#deal-stage').addEventListener('change', () => { state.deals.stage = $('#deal-stage').value; renderDeals() })
  debounced($('#act-search'), () => { state.activities.q = $('#act-search').value.trim(); renderActivities() })

  $('#detail-back').addEventListener('click', () => showTab('customers'))

  // copilot: bridge untuk panel demo (use case 6 — apply proposal setelah konfirmasi manusia)
  window.crmApplyLeadUpdate = async function (leadId, newStatus, done) {
    try {
      await api(`/api/leads/${encodeURIComponent(leadId)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      state.leads.rows = null
      if (state.tab === 'leads') renderLeads()
      done?.(null, true)
    } catch (e) {
      done?.(e)
    }
  }

  showTab('dashboard')
})()
