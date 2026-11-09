// Users, sessions, accounts, token storage and provider construction.
import { db, decrypt, encrypt, newId } from "./db";
import type { Account, ProviderKind, SyncState } from "../shared/types";
import type { MailProvider, TokenSource } from "./providers/types";
import { AuthExpiredError } from "./providers/types";
import type { TokenSet } from "./auth/types";

const SESSION_DAYS = 30;

export interface AccountRow {
  id: string;
  user_id: string;
  provider: ProviderKind;
  email: string;
  name: string;
  tokens: string | null;
  cursor: string | null;
  sync: string;
  created_at: number;
}

const DEFAULT_SYNC: SyncState = { phase: "idle", done: 0, total: 0, lastSyncedAt: null, error: null };

export function toAccount(r: AccountRow): Account {
  return { id: r.id, provider: r.provider, email: r.email, name: r.name, sync: { ...DEFAULT_SYNC, ...(JSON.parse(r.sync) as Partial<SyncState>) } };
}

// ---------- users & sessions ----------

export function createUser(): string {
  const id = newId("usr");
  db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(id, Date.now());
  return id;
}

export function createSession(userId: string): { id: string; maxAge: number } {
  const id = newId("ses");
  const maxAge = SESSION_DAYS * 24 * 3600;
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)").run(id, userId, Date.now(), Date.now() + maxAge * 1000);
  return { id, maxAge };
}

export function sessionUser(sessionId: string | undefined): string | null {
  if (!sessionId) return null;
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE id=?").get(sessionId) as { user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

export function deleteSession(sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id=?").run(sessionId);
}

// ---------- accounts ----------

export function listAccounts(userId: string): AccountRow[] {
  return db.prepare("SELECT * FROM accounts WHERE user_id=? ORDER BY created_at ASC").all(userId) as unknown as AccountRow[];
}

export function getAccount(accountId: string): AccountRow | null {
  return (db.prepare("SELECT * FROM accounts WHERE id=?").get(accountId) as AccountRow | undefined) ?? null;
}

/** Find the user that already owns this provider identity (to sign them back in). */
export function findAccountByIdentity(provider: ProviderKind, email: string): AccountRow | null {
  return (db.prepare("SELECT * FROM accounts WHERE provider=? AND email=? ORDER BY created_at ASC LIMIT 1").get(provider, email) as AccountRow | undefined) ?? null;
}

export function upsertAccount(userId: string, provider: ProviderKind, email: string, name: string, tokens: TokenSet | null): AccountRow {
  const existing = db.prepare("SELECT * FROM accounts WHERE user_id=? AND provider=? AND email=?").get(userId, provider, email) as AccountRow | undefined;
  const enc = tokens ? encrypt(JSON.stringify(tokens)) : null;
  if (existing) {
    db.prepare("UPDATE accounts SET name=?, tokens=COALESCE(?, tokens), sync=? WHERE id=?").run(name, enc, JSON.stringify({ ...JSON.parse(existing.sync), error: null }), existing.id);
    return getAccount(existing.id)!;
  }
  const id = newId("acc");
  db.prepare("INSERT INTO accounts (id, user_id, provider, email, name, tokens, cursor, sync, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
    id, userId, provider, email, name, enc, null, JSON.stringify(DEFAULT_SYNC), Date.now(),
  );
  return getAccount(id)!;
}

export function removeAccount(accountId: string): void {
  db.prepare("DELETE FROM search_fts WHERE account_id=?").run(accountId);
  db.prepare("DELETE FROM accounts WHERE id=?").run(accountId);
}

export function setCursor(accountId: string, cursor: string | null): void {
  db.prepare("UPDATE accounts SET cursor=? WHERE id=?").run(cursor, accountId);
}

export function setSync(accountId: string, patch: Partial<SyncState>): SyncState {
  const row = getAccount(accountId);
  if (!row) return DEFAULT_SYNC;
  const next = { ...DEFAULT_SYNC, ...(JSON.parse(row.sync) as Partial<SyncState>), ...patch };
  db.prepare("UPDATE accounts SET sync=? WHERE id=?").run(JSON.stringify(next), accountId);
  return next;
}

export function getUserSettings(userId: string): Record<string, unknown> {
  const row = db.prepare("SELECT settings FROM users WHERE id=?").get(userId) as { settings: string } | undefined;
  return row ? (JSON.parse(row.settings) as Record<string, unknown>) : {};
}

export function setUserSettings(userId: string, settings: Record<string, unknown>): void {
  db.prepare("UPDATE users SET settings=? WHERE id=?").run(JSON.stringify(settings), userId);
}

// ---------- token sources ----------

type Refresher = (refreshToken: string) => Promise<TokenSet>;

export class DbTokenSource implements TokenSource {
  private inflight: Promise<string> | null = null;
  constructor(private accountId: string, private refresher: Refresher) {}

  private read(): TokenSet {
    const row = getAccount(this.accountId);
    if (!row?.tokens) throw new AuthExpiredError();
    return JSON.parse(decrypt(row.tokens)) as TokenSet;
  }

  async getAccessToken(): Promise<string> {
    const t = this.read();
    if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
    return this.refresh();
  }

  refresh(): Promise<string> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const t = this.read();
        if (!t.refreshToken) throw new AuthExpiredError();
        const next = await this.refresher(t.refreshToken);
        const merged: TokenSet = { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
        db.prepare("UPDATE accounts SET tokens=? WHERE id=?").run(encrypt(JSON.stringify(merged)), this.accountId);
        return merged.accessToken;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}

// ---------- provider registry ----------

const providers = new Map<string, MailProvider>();

export async function providerFor(account: AccountRow): Promise<MailProvider> {
  const cached = providers.get(account.id);
  if (cached) return cached;
  let p: MailProvider;
  if (account.provider === "gmail") {
    const [{ GmailProvider }, { googleRefresh }] = await Promise.all([import("./providers/gmail"), import("./auth/google")]);
    p = new GmailProvider(new DbTokenSource(account.id, googleRefresh));
  } else if (account.provider === "outlook") {
    const [{ OutlookProvider }, { microsoftRefresh }] = await Promise.all([import("./providers/outlook"), import("./auth/microsoft")]);
    p = new OutlookProvider(new DbTokenSource(account.id, microsoftRefresh));
  } else {
    const { DemoProvider } = await import("./providers/demo/index");
    p = new DemoProvider({ me: { name: account.name, email: account.email } });
  }
  providers.set(account.id, p);
  return p;
}

export function dropProvider(accountId: string): void {
  providers.delete(accountId);
}
