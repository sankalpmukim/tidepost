// D1-backed AuthPersist: users, sessions and connected accounts.
// The per-account mail index lives in the Mailbox Durable Objects instead;
// this file holds only the small global tables.
import type { AccountPersistRow, AuthPersist } from "./persist";
import type { ProviderKind } from "../shared/types";

interface AccountSqlRow {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  name: string;
  tokens: string | null;
  cursor: string | null;
  sync: string;
  created_at: number;
}

function toAccount(r: AccountSqlRow): AccountPersistRow {
  return {
    id: r.id,
    user_id: r.user_id,
    provider: r.provider as ProviderKind,
    email: r.email,
    name: r.name,
    tokens: r.tokens,
    cursor: r.cursor,
    sync: r.sync,
    created_at: r.created_at,
  };
}

export function createD1AuthStore(db: D1Database): AuthPersist {
  return {
    async insertUser(row) {
      await db.prepare("INSERT INTO users (id, created_at, settings) VALUES (?, ?, ?)").bind(row.id, row.created_at, row.settings).run();
    },
    async getUser(id) {
      const r = await db.prepare("SELECT id, created_at, settings FROM users WHERE id = ?").bind(id).first<{ id: string; created_at: number; settings: string }>();
      return r ? { id: r.id, created_at: r.created_at, settings: r.settings } : null;
    },
    async updateUserSettings(id, settings) {
      await db.prepare("UPDATE users SET settings = ? WHERE id = ?").bind(settings, id).run();
    },
    async insertSession(row) {
      await db
        .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(row.id, row.user_id, row.created_at, row.expires_at)
        .run();
    },
    async getSession(id) {
      const r = await db
        .prepare("SELECT id, user_id, created_at, expires_at FROM sessions WHERE id = ?")
        .bind(id)
        .first<{ id: string; user_id: string; created_at: number; expires_at: number }>();
      return r ? { id: r.id, user_id: r.user_id, created_at: r.created_at, expires_at: r.expires_at } : null;
    },
    async deleteSession(id) {
      await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    },
    async purgeExpiredSessions(now) {
      await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
    },
    async putAccount(row) {
      // Upsert on the primary key; the (provider, email) unique index is
      // respected by the callers, who look the account up first.
      await db
        .prepare(
          `INSERT INTO accounts (id, user_id, provider, email, name, tokens, cursor, sync, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             user_id = excluded.user_id,
             provider = excluded.provider,
             email = excluded.email,
             name = excluded.name,
             tokens = excluded.tokens,
             cursor = excluded.cursor,
             sync = excluded.sync,
             created_at = excluded.created_at`,
        )
        .bind(row.id, row.user_id, row.provider, row.email, row.name, row.tokens, row.cursor, row.sync, row.created_at)
        .run();
    },
    async getAccount(id) {
      const r = await db
        .prepare("SELECT id, user_id, provider, email, name, tokens, cursor, sync, created_at FROM accounts WHERE id = ?")
        .bind(id)
        .first<AccountSqlRow>();
      return r ? toAccount(r) : null;
    },
    async listAccounts(userId) {
      const { results } = await db
        .prepare("SELECT id, user_id, provider, email, name, tokens, cursor, sync, created_at FROM accounts WHERE user_id = ? ORDER BY created_at ASC")
        .bind(userId)
        .all<AccountSqlRow>();
      return (results ?? []).map(toAccount);
    },
    async findAccountByIdentity(provider: ProviderKind, email: string) {
      const r = await db
        .prepare("SELECT id, user_id, provider, email, name, tokens, cursor, sync, created_at FROM accounts WHERE provider = ? AND email = ? LIMIT 1")
        .bind(provider, email)
        .first<AccountSqlRow>();
      return r ? toAccount(r) : null;
    },
    async findAccountByUserIdentity(userId, provider: ProviderKind, email: string) {
      const r = await db
        .prepare("SELECT id, user_id, provider, email, name, tokens, cursor, sync, created_at FROM accounts WHERE user_id = ? AND provider = ? AND email = ? LIMIT 1")
        .bind(userId, provider, email)
        .first<AccountSqlRow>();
      return r ? toAccount(r) : null;
    },
    async deleteAccount(id) {
      await db.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
    },
    async updateAccountTokens(id, tokens) {
      await db.prepare("UPDATE accounts SET tokens = ? WHERE id = ?").bind(tokens, id).run();
    },
    async updateAccountCursor(id, cursor) {
      await db.prepare("UPDATE accounts SET cursor = ? WHERE id = ?").bind(cursor, id).run();
    },
    async updateAccountSync(id, sync) {
      await db.prepare("UPDATE accounts SET sync = ? WHERE id = ?").bind(sync, id).run();
    },
  };
}
