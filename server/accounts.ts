// Users, sessions, accounts and worker-side provider construction. The
// functions take their AuthPersist explicitly (D1 in production, memory in
// tests). Mailbox-scoped provider work runs inside the Mailbox Durable
// Object; the worker-side providerFor exists for attachment streaming, which
// crosses the DO boundary as bytes rather than structured-clone data.
import { decrypt, encrypt, newId } from "./db";
import type { AccountPersistRow, AuthPersist } from "./persist";
import type { Account, ProviderKind, SyncState } from "../shared/types";
import type { MailProvider, TokenSource } from "./providers/types";
import { AuthExpiredError } from "./providers/types";
import type { TokenSet } from "./auth/types";
import type { Config } from "./config";

const SESSION_DAYS = 30;

export type AccountRow = AccountPersistRow;

const DEFAULT_SYNC: SyncState = { phase: "idle", done: 0, total: 0, lastSyncedAt: null, error: null };

export function toAccount(r: AccountRow): Account {
  return { id: r.id, provider: r.provider, email: r.email, name: r.name, sync: { ...DEFAULT_SYNC, ...(JSON.parse(r.sync) as Partial<SyncState>) } };
}

export async function createUser(auth: AuthPersist): Promise<string> {
  const id = newId("usr");
  await auth.insertUser({ id, created_at: Date.now(), settings: "{}" });
  return id;
}

export async function createSession(auth: AuthPersist, userId: string): Promise<{ id: string; maxAge: number }> {
  const id = newId("ses");
  const maxAge = SESSION_DAYS * 24 * 3600;
  await auth.insertSession({ id, user_id: userId, created_at: Date.now(), expires_at: Date.now() + maxAge * 1000 });
  return { id, maxAge };
}

export async function sessionUser(auth: AuthPersist, sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const row = await auth.getSession(sessionId);
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

export async function deleteSession(auth: AuthPersist, sessionId: string): Promise<void> {
  await auth.deleteSession(sessionId);
}

export async function listAccounts(auth: AuthPersist, userId: string): Promise<AccountRow[]> {
  return auth.listAccounts(userId);
}

export async function getAccount(auth: AuthPersist, accountId: string): Promise<AccountRow | null> {
  return auth.getAccount(accountId);
}

export async function findAccountByIdentity(auth: AuthPersist, provider: ProviderKind, email: string): Promise<AccountRow | null> {
  return auth.findAccountByIdentity(provider, email);
}

export async function upsertAccount(auth: AuthPersist, userId: string, provider: ProviderKind, email: string, name: string, tokens: TokenSet | null): Promise<AccountRow> {
  const existing = await auth.findAccountByUserIdentity(userId, provider, email);
  const enc = tokens ? encrypt(JSON.stringify(tokens)) : null;
  if (existing) {
    const next: AccountRow = {
      ...existing,
      name,
      tokens: enc ?? existing.tokens,
      sync: JSON.stringify({ ...JSON.parse(existing.sync), error: null }),
    };
    await auth.putAccount(next);
    return (await auth.getAccount(existing.id))!;
  }
  const id = newId("acc");
  const row: AccountRow = {
    id, user_id: userId, provider, email, name, tokens: enc, cursor: null, sync: JSON.stringify(DEFAULT_SYNC), created_at: Date.now(),
  };
  await auth.putAccount(row);
  return (await auth.getAccount(id))!;
}

export async function removeAccount(auth: AuthPersist, accountId: string): Promise<void> {
  await auth.deleteAccount(accountId);
}

export async function getUserSettings(auth: AuthPersist, userId: string): Promise<Record<string, unknown>> {
  const row = await auth.getUser(userId);
  return row ? (JSON.parse(row.settings) as Record<string, unknown>) : {};
}

export async function setUserSettings(auth: AuthPersist, userId: string, settings: Record<string, unknown>): Promise<void> {
  await auth.updateUserSettings(userId, JSON.stringify(settings));
}

// ---------- worker-side providers (attachments) ----------

/** Token source over the D1 account row; refreshes are persisted directly. */
export class WorkerTokenSource implements TokenSource {
  private inflight: Promise<string> | null = null;
  constructor(private auth: AuthPersist, private accountId: string, private provider: ProviderKind) {}

  private async read(): Promise<TokenSet> {
    const row = await this.auth.getAccount(this.accountId);
    if (!row?.tokens) throw new AuthExpiredError();
    return JSON.parse(decrypt(row.tokens)) as TokenSet;
  }

  async getAccessToken(): Promise<string> {
    const t = await this.read();
    if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
    return this.refresh();
  }

  refresh(): Promise<string> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const t = await this.read();
        if (!t.refreshToken) throw new AuthExpiredError();
        const { googleRefresh } = await import("./auth/google");
        const { microsoftRefresh } = await import("./auth/microsoft");
        const next = this.provider === "gmail" ? await googleRefresh(t.refreshToken) : await microsoftRefresh(t.refreshToken);
        const merged: TokenSet = { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
        await this.auth.updateAccountTokens(this.accountId, encrypt(JSON.stringify(merged)));
        return merged.accessToken;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}

const providers = new Map<string, MailProvider>();

export async function providerFor(auth: AuthPersist, cfg: Config, account: AccountRow): Promise<MailProvider> {
  const cached = providers.get(account.id);
  if (cached) return cached;
  let p: MailProvider;
  if (account.provider === "gmail") {
    const { GmailProvider } = await import("./providers/gmail");
    p = new GmailProvider(new WorkerTokenSource(auth, account.id, "gmail"));
  } else if (account.provider === "outlook") {
    const { OutlookProvider } = await import("./providers/outlook");
    p = new OutlookProvider(new WorkerTokenSource(auth, account.id, "outlook"));
  } else {
    const { DemoProvider } = await import("./providers/demo/index");
    p = new DemoProvider({ me: { name: account.name, email: account.email }, seed: 42, now: new Date(account.created_at) });
  }
  void cfg;
  providers.set(account.id, p);
  return p;
}

export function dropProvider(accountId: string): void {
  providers.delete(accountId);
}
