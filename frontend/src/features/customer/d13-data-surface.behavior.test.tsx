// Mounted behavioral coverage for D-13 (missing loading/error states).
//
// The register recorded that data surfaces rendered an empty layout while a
// request was still in flight, and rendered the same empty layout when the
// request FAILED — so a customer could not tell "no records" apart from
// "the server is down", and a failed fetch read as a truthful zero.
//
// These tests mount the real components in a real browser (Vitest browser
// mode) with the network layer stubbed, and assert what a user actually sees:
//
//  1. While the request is pending, the surface announces a busy/loading
//     state (role=status + aria-busy) instead of claiming "no data".
//  2. When the request fails, the surface renders role=alert with a retry
//     control, and never renders a success/empty claim.
//  3. Retry actually re-invokes the fetch.
//  4. The shared QuerySurface switches between loading / error / empty / ready
//     for the same inputs, so callers cannot accidentally collapse them.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { LanguageProvider } from '@/context/language-provider'
import {
  QuerySurface,
  SurfaceEmpty,
  SurfaceError,
  SurfaceSkeleton,
} from '@/components/ui/data-surface'
import { CustomerAccount } from './account'

function Harness({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={qc}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  )
}

// Hoisted so vi.mock (which vitest lifts above imports) can close over it.
const meState = vi.hoisted(() => ({
  fail: { current: true },
  calls: { current: 0 },
}))

vi.mock('@/lib/grouter-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grouter-api')>()
  return {
    ...actual,
    fetchMe: vi.fn(async () => {
      meState.calls.current += 1
      if (meState.fail.current) throw new Error('network down')
      return {
        account: { name: 'Real Customer', email: 'real@example.com' },
        licenses: [],
        usage: [],
      }
    }),
  }
})

beforeEach(() => {
  cleanup()
  localStorage.setItem('grouter_lang', 'en')
  vi.clearAllMocks()
})

describe('D-13 shared data surfaces', () => {
  test('SurfaceSkeleton announces a busy loading state, not empty data', async () => {
    await render(
      <Harness>
        <SurfaceSkeleton rows={3} />
      </Harness>,
    )
    const status = page.getByRole('status')
    await expect.element(status).toBeInTheDocument()
    expect(status.element().getAttribute('aria-busy')).toBe('true')
    // It must never claim there are no records while loading.
    await expect.element(page.getByText(/Nothing here yet/i)).not.toBeInTheDocument()
  })

  test('SurfaceError renders an alert with retry and calls the handler', async () => {
    const onRetry = vi.fn()
    await render(
      <Harness>
        <SurfaceError onRetry={onRetry} />
      </Harness>,
    )
    const alert = page.getByRole('alert')
    await expect.element(alert).toBeInTheDocument()
    await expect.element(page.getByText(/Could not load data/i)).toBeInTheDocument()
    await page.getByRole('button', { name: /Try again/i }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('SurfaceError without retry stays honest and offers no false action', async () => {
    await render(
      <Harness>
        <SurfaceError />
      </Harness>,
    )
    await expect.element(page.getByRole('alert')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: /Try again/i })).not.toBeInTheDocument()
  })

  test('SurfaceEmpty states "nothing here yet" and can carry a next action', async () => {
    await render(
      <Harness>
        <SurfaceEmpty action={<button type='button'>Create the first order</button>} />
      </Harness>,
    )
    await expect.element(page.getByText(/Nothing here yet/i)).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: /Create the first order/i })).toBeInTheDocument()
  })

  test('QuerySurface keeps loading, error and empty visually distinct', async () => {
    const { rerender } = await render(
      <Harness>
        <QuerySurface isLoading isError={false}>
          <p>real rows</p>
        </QuerySurface>
      </Harness>,
    )
    await expect.element(page.getByRole('status')).toBeInTheDocument()
    await expect.element(page.getByText('real rows')).not.toBeInTheDocument()

    await rerender(
      <Harness>
        <QuerySurface isLoading={false} isError>
          <p>real rows</p>
        </QuerySurface>
      </Harness>,
    )
    await expect.element(page.getByRole('alert')).toBeInTheDocument()
    await expect.element(page.getByText('real rows')).not.toBeInTheDocument()

    await rerender(
      <Harness>
        <QuerySurface isLoading={false} isError={false} isEmpty>
          <p>real rows</p>
        </QuerySurface>
      </Harness>,
    )
    await expect.element(page.getByText(/Nothing here yet/i)).toBeInTheDocument()
    await expect.element(page.getByText('real rows')).not.toBeInTheDocument()

    await rerender(
      <Harness>
        <QuerySurface isLoading={false} isError={false} isEmpty={false}>
          <p>real rows</p>
        </QuerySurface>
      </Harness>,
    )
    await expect.element(page.getByText('real rows')).toBeInTheDocument()
  })
})

describe('D-13 CustomerAccount failure is not rendered as an empty account', () => {
  test('a failed /me fetch shows an alert with retry, not a blank profile', async () => {
    meState.fail.current = true
    meState.calls.current = 0
    await render(
      <Harness>
        <CustomerAccount />
      </Harness>,
    )
    await expect.element(page.getByRole('alert')).toBeInTheDocument()
    await expect.element(page.getByText(/Could not load account data/i)).toBeInTheDocument()
    // The placeholder dash must not masquerade as a real (empty) identity.
    await expect.element(page.getByText('—')).not.toBeInTheDocument()

    const before = meState.calls.current
    meState.fail.current = false
    await page.getByRole('button', { name: /Try again/i }).click()
    expect(meState.calls.current).toBeGreaterThan(before)
    await expect.element(page.getByText('Real Customer')).toBeInTheDocument()
  })
})
