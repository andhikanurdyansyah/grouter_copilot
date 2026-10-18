/**
 * Account service — bridge Better Auth users to store.accounts (D-017: 1 account = N licenses).
 *
 * When a Better Auth user exists, ensure a matching store account exists so
 * licenses can be owned (accountId). Returns the account record.
 */

export class AccountService {
  constructor({ store }) {
    this.store = store;
  }

  /**
   * Ensure a store account exists for a Better Auth user (by email).
   * Idempotent: returns existing account if email already mapped.
   */
  ensureAccount(user) {
    if (!user || !user.id) return null;
    // Normalize once, here (A-15): emails arrive from providers with
    // arbitrary case/whitespace. An empty email must never become a
    // cross-linkable store account.
    const email = String(user.email ?? '').trim().toLowerCase();
    if (!email) return null;
    // Prefer the durable auth identity over the (recyclable) email address.
    let existing = this.store.data.accounts.find((a) => a.authUserId === user.id) ?? null;
    if (!existing) {
      const byEmail = this.store.getAccountByEmail(email);
      // Never merge a second auth identity into an account that already
      // belongs to someone else — that is an account takeover by email.
      if (byEmail && !byEmail.authUserId) existing = byEmail;
      else if (byEmail && byEmail.authUserId !== user.id) existing = null;
      else existing = byEmail;
    }
    if (existing) {
      // keep external auth id in sync
      if (!existing.authUserId) {
        existing.authUserId = user.id;
        this.store._save();
      }
      // keep display name in sync with the auth source (Better Auth user table)
      // — update-user changes auth.sqlite, the store mirror must follow.
      if (user.name && existing.name !== user.name) {
        existing.name = user.name;
        this.store._save();
      }
      return existing;
    }
    const account = {
      id: `acc_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      authUserId: user.id,
      name: user.name ?? '',
      email,
      createdAt: Date.now(),
    };
    return this.store.addAccount(account);
  }

  /** Resolve the store account for a Better Auth session user. */
  accountForUser(user) {
    return this.ensureAccount(user);
  }
}
