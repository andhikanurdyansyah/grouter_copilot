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
    const existing = this.store.getAccountByEmail(user.email);
    if (existing) {
      // keep external auth id in sync
      if (!existing.authUserId) {
        existing.authUserId = user.id;
        this.store._save();
      }
      return existing;
    }
    const account = {
      id: `acc_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      authUserId: user.id,
      name: user.name ?? '',
      email: user.email ?? '',
      createdAt: Date.now(),
    };
    return this.store.addAccount(account);
  }

  /** Resolve the store account for a Better Auth session user. */
  accountForUser(user) {
    return this.ensureAccount(user);
  }
}
