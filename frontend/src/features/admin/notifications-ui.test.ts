import { describe, expect, it } from 'vitest'
import headerSource from '../../components/layout/moda-header.tsx?raw'
import apiSource from '../../lib/grouter-api.ts?raw'
import settingsSource from './settings.tsx?raw'

describe('grouter-api notification helpers', () => {
  it('exports the six typed notification helpers hitting the correct paths', () => {
    expect(apiSource).toContain('export interface AppNotification')
    expect(apiSource).toContain('export async function fetchMyNotifications')
    expect(apiSource).toContain('`/me/notifications?limit=${limit}`')
    expect(apiSource).toContain('export async function markMyNotificationRead')
    expect(apiSource).toContain(
      '`/me/notifications/${encodeURIComponent(id)}/read`'
    )
    expect(apiSource).toContain(
      'export async function markAllMyNotificationsRead'
    )
    expect(apiSource).toContain("api.post('/me/notifications/read-all')")
    expect(apiSource).toContain('export async function fetchAdminNotifications')
    expect(apiSource).toContain('`/admin/notifications?limit=${limit}`')
    expect(apiSource).toContain(
      'export async function markAdminNotificationRead'
    )
    expect(apiSource).toContain(
      '`/admin/notifications/${encodeURIComponent(id)}/read`'
    )
    expect(apiSource).toContain(
      'export async function markAllAdminNotificationsRead'
    )
    expect(apiSource).toContain("api.post('/admin/notifications/read-all')")
  })

  it('models the full notification shape including email and link fields', () => {
    for (const field of [
      'id: string',
      'type: string',
      'title: string',
      'titleEn: string',
      'body: string',
      'bodyEn: string',
      'readAt: string | null',
      'createdAt: number | string',
      'emailStatus?: string | null',
      'emailedAt?: string | number | null',
      'emailAttempts?: number',
      'linkKind?: string | null',
      'linkId?: string | null',
    ]) {
      expect(apiSource).toContain(field)
    }
    expect(apiSource).toContain('unread: number')
    expect(apiSource).toContain('total?: number')
  })
})

describe('moda-header notification audiences', () => {
  it('enables admin notifications only in the admin area and customer only outside it', () => {
    expect(headerSource).toContain('fetchAdminNotifications(20)')
    expect(headerSource).toContain('fetchMyNotifications(20)')
    expect(headerSource).toContain('enabled: isAdmin')
    expect(headerSource).toContain('enabled: !isAdmin')
    expect(headerSource).toContain('refetchInterval: 60_000')
    // Admin area must not call /api/me: useMe stays gated off for admins.
    expect(headerSource).toContain('useMe(!isAdmin)')
  })

  it('has per-item read handlers for both audiences and context navigation', () => {
    expect(headerSource).toContain('markAdminNotificationRead(id)')
    expect(headerSource).toContain('markMyNotificationRead(id)')
    expect(headerSource).toContain('markAllAdminNotificationsRead')
    expect(headerSource).toContain('markAllMyNotificationsRead')
    expect(headerSource).toContain('handleNotificationClick')
    expect(headerSource).toContain("n.linkKind === 'order'")
    expect(headerSource).toContain("'/admin/orders'")
    expect(headerSource).toContain("'/user/payments'")
    expect(headerSource).toContain("n.linkKind === 'license'")
    expect(headerSource).toContain("'/admin/licenses'")
    expect(headerSource).toContain("'/user/licenses'")
  })

  it('renders real buttons with a numeric unread count badge for both audiences', () => {
    expect(headerSource).toContain("type='button'")
    expect(headerSource).toContain(
      'onClick={() => void handleNotificationClick(n)}'
    )
    expect(headerSource).toContain('{badgeLabel}')
    expect(headerSource).toContain("typeof serverUnread === 'number'")
    expect(headerSource).toContain('No admin notifications yet.')
    expect(headerSource).toContain('No notifications yet.')
  })
})

describe('admin settings notifications tab', () => {
  it("exists with tab id 'notifikasi' and patches the notifications section", () => {
    expect(settingsSource).toContain("id: 'notifikasi'")
    expect(settingsSource).toContain("{ id: 'notifikasi'")
    expect(settingsSource).toContain("activeTab === 'notifikasi'")
    expect(settingsSource).toContain("id='panel-notifikasi'")
    expect(settingsSource).toContain('cfg.notifications')
    expect(settingsSource).toContain(
      'patchAdminSettings({ notifications: payload })'
    )
    expect(settingsSource).toContain('schedulerIntervalMs')
    expect(settingsSource).toContain('quotaThresholdPercent')
    expect(settingsSource).toContain('expiringSoonDays')
    expect(settingsSource).toContain('BREVO_API_KEY / MAIL_FROM')
  })
})
