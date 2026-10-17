// Mounted behavioral coverage for the CustomerOrders success/receipt dialog.
//
// The existing print-receipt.test.ts asserts source-string contracts. These
// tests instead mount CustomerOrders in a real browser (Vitest browser mode)
// with the network layer mocked, and assert what a customer actually sees:
//
//  1. A merely historical PAID latest order must NOT auto-open the success
//     dialog on page visit, while the plan catalogue still renders.
//  2. A PENDING latest order resumed via "Continue payment" whose poll then
//     settles PAID must auto-open the success dialog; clicking the Radix
//     close button dismisses it for that order and it stays closed.
//  3. When the receipt fetch fails, the dialog shows an alert with a Retry
//     button and keeps "Print receipt" disabled; a successful Retry renders
//     the receipt license reference and enables printing.
//  4. When the receipt payload omits licenseReference, the dialog falls back
//     to the paid order's licenseId known from latest/poll data.
//
// Language is pinned to English via localStorage ('grouter_lang') so labels
// are deterministic, and each render uses a fresh QueryClient with retries
// disabled so failures surface immediately instead of being retried.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { LanguageProvider } from '@/context/language-provider'
import { CustomerOrders } from './orders'

type LatestPayload = {
  order: Record<string, unknown> | null
  license?: { id?: string | null } | null
}

type ReceiptPayload = {
  receipt: {
    orderId: string
    planName: string | null
    packageKey: string | null
    amount: number | null
    status: 'PAID'
    createdAt: number | string | null
    paidAt: number | string | null
    licenseReference?: string
  }
}

const mocks = vi.hoisted(() => ({
  latest: { current: { order: null, license: null } as LatestPayload },
  poll: { current: null as { order: Record<string, unknown> } | null },
  receipt: vi.fn(),
}))

vi.mock('@/lib/grouter-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grouter-api')>()
  return {
    ...actual,
    api: {
      get: vi.fn(async (url: string) => {
        if (url === '/orders/latest') return { data: mocks.latest.current }
        if (url.startsWith('/orders/') && mocks.poll.current)
          return { data: mocks.poll.current }
        throw new Error(`Unexpected api.get in test: ${url}`)
      }),
      post: vi.fn(async () => ({ data: {} })),
    },
    fetchPlans: vi.fn(async () => ({
      plans: [
        {
          key: 'pro',
          name: 'Pro',
          amount: 150000,
          currency: 'IDR',
          expiresInDays: 90,
          quota: 1000000,
          features: ['gateway'],
        },
      ],
    })),
    fetchMe: vi.fn(async () => ({
      account: { id: 'acc_test', name: 'Test', email: 'test@example.com' },
      licenses: [],
      usage: [],
    })),
    fetchCustomerReceipt: mocks.receipt,
    downloadCustomerExport: vi.fn(async () => {}),
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    className,
    children,
  }: {
    to?: string
    className?: string
    children?: ReactNode
  }) => (
    <a href={typeof to === 'string' ? to : '#'} className={className}>
      {children}
    </a>
  ),
}))

const PAID_RECEIPT: ReceiptPayload = {
  receipt: {
    orderId: 'ord_poll',
    planName: 'Pro',
    packageKey: 'pro',
    amount: 150000,
    status: 'PAID',
    createdAt: '2026-01-01T00:00:00.000Z',
    paidAt: '2026-01-01T00:05:00.000Z',
    licenseReference: 'lic_receipt',
  },
}

function pendingLatest() {
  mocks.latest.current = {
    order: {
      id: 'ord_poll',
      status: 'PENDING',
      amount: 150000,
      packageKey: 'pro',
      qrImage: 'data:image/png;base64,iVBORw0KGgo=',
      expiredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    license: null,
  }
}

function paidPoll() {
  mocks.poll.current = {
    order: {
      id: 'ord_poll',
      status: 'PAID',
      licenseId: 'lic_poll',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

async function renderOrders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CustomerOrders />
      </LanguageProvider>
    </QueryClientProvider>
  )
}

/**
 * Open the checkout for the pending latest order and wait for PAID success.
 */
async function openSettledSuccessDialog(
  screen: Awaited<ReturnType<typeof renderOrders>>
) {
  await expect
    .element(screen.getByRole('button', { name: 'Continue payment' }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Continue payment' }).click()
  await expect
    .element(screen.getByRole('dialog', { name: 'Payment successful' }))
    .toBeVisible()
}

describe('CustomerOrders success/receipt dialog (mounted)', () => {
  beforeEach(async () => {
    await cleanup()
    localStorage.setItem('grouter_lang', 'en')
    mocks.latest.current = { order: null, license: null }
    mocks.poll.current = null
    mocks.receipt.mockReset()
  })

  test('historical PAID latest order does not auto-open a dialog', async () => {
    mocks.latest.current = {
      order: {
        id: 'ord_hist',
        status: 'PAID',
        amount: 150000,
        packageKey: 'pro',
        licenseId: 'lic_hist',
        paidAt: '2025-12-01T00:00:00.000Z',
        createdAt: '2025-12-01T00:00:00.000Z',
      },
      license: { id: 'lic_hist' },
    }
    mocks.receipt.mockResolvedValue({
      receipt: { ...PAID_RECEIPT.receipt, orderId: 'ord_hist' },
    })

    const screen = await renderOrders()

    // The plan catalogue renders from the (mocked) server catalogue…
    await expect.element(screen.getByText('Pro', { exact: true })).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Buy plan' }))
      .toBeVisible()
    // …but no dialog of any kind is opened for a historical PAID order.
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    // Receipt data is still fetched for the paid order (background only).
    await expect.poll(() => mocks.receipt.mock.calls.length).toBe(1)
    expect(mocks.receipt).toHaveBeenCalledWith('ord_hist')
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  })

  test('in-session PAID settlement auto-opens, and close dismisses it for that order', async () => {
    pendingLatest()
    paidPoll()
    mocks.receipt.mockResolvedValue(PAID_RECEIPT)

    const screen = await renderOrders()
    await openSettledSuccessDialog(screen)

    const dialog = screen.getByRole('dialog', { name: 'Payment successful' })
    await expect.element(dialog.getByText('lic_receipt')).toBeVisible()
    await expect
      .element(dialog.getByRole('button', { name: 'Print receipt' }))
      .toBeEnabled()

    // Radix renders the close control with an sr-only "Close" label.
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()

    // Poll/latest data remain PAID, so only the dismissed-order guard keeps
    // the dialog closed; give effects a chance to (incorrectly) reopen it.
    await expect
      .element(screen.getByRole('button', { name: 'Continue payment' }))
      .toBeVisible()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
  })

  test('receipt failure shows alert + Retry with Print disabled, then Retry succeeds', async () => {
    pendingLatest()
    paidPoll()
    mocks.receipt
      .mockRejectedValueOnce(new Error('receipt unavailable'))
      .mockResolvedValue(PAID_RECEIPT)

    const screen = await renderOrders()
    await openSettledSuccessDialog(screen)

    const dialog = screen.getByRole('dialog', { name: 'Payment successful' })
    await expect.element(dialog.getByRole('alert')).toBeVisible()
    await expect
      .element(dialog.getByText('Receipt could not be loaded.'))
      .toBeVisible()
    const printButton = dialog.getByRole('button', { name: 'Print receipt' })
    await expect.element(printButton).toBeDisabled()
    expect(mocks.receipt.mock.calls.length).toBe(1)

    await dialog.getByRole('button', { name: 'Retry' }).click()

    await expect.element(dialog.getByText('lic_receipt')).toBeVisible()
    await expect.element(printButton).toBeEnabled()
    await expect.element(dialog.getByRole('alert')).not.toBeInTheDocument()
    expect(mocks.receipt.mock.calls.length).toBe(2)
    expect(mocks.receipt).toHaveBeenCalledWith('ord_poll')
  })

  test('falls back to the paid order licenseId when the receipt omits licenseReference', async () => {
    pendingLatest()
    paidPoll()
    mocks.receipt.mockResolvedValue({
      receipt: {
        orderId: 'ord_poll',
        planName: 'Pro',
        packageKey: 'pro',
        amount: 150000,
        status: 'PAID',
        createdAt: '2026-01-01T00:00:00.000Z',
        paidAt: '2026-01-01T00:05:00.000Z',
        // licenseReference intentionally omitted (older receipt payload).
      },
    })

    const screen = await renderOrders()
    await openSettledSuccessDialog(screen)

    const dialog = screen.getByRole('dialog', { name: 'Payment successful' })
    // lic_poll comes from the poll settlement (paidOrder.licenseId).
    await expect.element(dialog.getByText('lic_poll')).toBeVisible()
    await expect
      .element(dialog.getByRole('button', { name: 'Print receipt' }))
      .toBeEnabled()
  })
})
