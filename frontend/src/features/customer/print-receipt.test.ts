/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import paymentsSource from './payments.tsx?raw'
import ordersSource from './orders.tsx?raw'

const stylesSource = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')

const receiptSources = `${paymentsSource}\n${ordersSource}`

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('}', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end + 1)
}

describe('scoped customer receipt printing contract', () => {
  it('isolates the receipt dialog and hides interactive payment chrome', () => {
    expect(receiptSources).toContain('receipt-print-dialog')
    expect(receiptSources).toContain('receipt-print-content')
    expect(receiptSources).toContain('data-receipt-hide-on-print')
    expect(receiptSources).toContain('window.print()')
  })

  it('keeps the broad dialog visibility reset from undoing print exclusions', () => {
    expect(stylesSource).toContain('.receipt-print-dialog * { visibility: visible !important; }')
    const hideMarked = cssBlock(
      stylesSource,
      '.receipt-print-dialog [data-receipt-hide-on-print],',
    )
    expect(hideMarked).toContain('[data-receipt-hide-on-print] *')
    expect(hideMarked).toContain('visibility: hidden !important')
    expect(stylesSource.indexOf('.receipt-print-dialog [data-receipt-hide-on-print]')).toBeGreaterThan(
      stylesSource.indexOf('.receipt-print-dialog * { visibility: visible !important; }'),
    )
    const closeSelector = ".receipt-print-dialog [data-slot='dialog-close'] { visibility: hidden !important; }"
    expect(stylesSource).toContain(closeSelector)
    expect(stylesSource.indexOf(closeSelector)).toBeGreaterThan(
      stylesSource.indexOf('.receipt-print-dialog * { visibility: visible !important; }'),
    )
  })

  it('maps the authoritative createdAt from order creation and paid polling', () => {
    expect(ordersSource).toContain('createdAt?: string | number | null')
    expect(ordersSource).toContain('createdAt: data.order.createdAt ?? null')
    expect(ordersSource).toContain('order?: { createdAt?: string | number | null }')
    expect(ordersSource).toContain('createdAt: settledCreatedAt')
    expect(ordersSource).toContain('fmtDate(paidOrder.createdAt ?? null)')
    expect(ordersSource).not.toContain('createdAt: data.qr')
  })
  it('keeps payment receipts limited to non-secret settlement references', () => {
    expect(paymentsSource).toContain('receipt-print-dialog')
    expect(paymentsSource).toContain('receipt-print-content')
    expect(paymentsSource).toContain('data-receipt-hide-on-print')
    expect(paymentsSource).toContain('Status:')
    expect(paymentsSource).toContain('License reference:')
    expect(paymentsSource).not.toContain('selectedReceipt.signature')
  })

  it('prints the paid order success receipt with stable settlement fields', () => {
    expect(ordersSource).toContain('receipt-print-dialog')
    expect(ordersSource).toContain('receipt-print-content')
    expect(ordersSource).toContain('data-receipt-hide-on-print')
    expect(ordersSource).toContain('Status')
    expect(ordersSource).toContain('License reference')
    expect(ordersSource).not.toContain('paidOrder.signature')
  })
})
