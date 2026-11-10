// Users, sessions, accounts, token storage and provider construction.
import { decrypt, encrypt, newId } from "./db";
import { persist, type AccountPersistRow } from "./persist";
import type { Account, ProviderKind, SyncState } from "../shared/types";
import type { MailProvider, TokenSource } from "./providers/types";
import { AuthExpiredError } from "./providers/types";
import type { TokenSet } from "./auth/types";

const SESSION_DAYS = 30;

export type AccountRow = AccountPersistRow;

const DEFAULT_SYNC: SyncState = { phase: "idle", done: 0, total: 0, lastSyncedAt: null, error: null };

export function toAccount(r: AccountRow): Account {
  return { id: r.id, provider: r.provider, email: r.email, name: r.name, sync: { ...DEFAULT_SYNC, ...(JSON.parse(r.sync) as Partial<SyncState>) } };
}

export async function createUser(): Promise<string> {
  const id = newId("usr");
  await persist().insertUser({ id, created_at: Date.now(), settings: "{}" });
  return id;
}

export async function createSession(userId: string): Promise<{ id: string; maxAge: number }> {
  const id = newId("ses");
  const maxAge = SESSION_DAYS * 24 * 3600;
  await persist().insertSession({ id, user_id: userId, created_at: Date.now(), expires_at: Date.now() + maxAge * 1000 });
  return { id, maxAge };
}

export async function sessionUser(sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const row = await persist().getSession(sessionId);
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await persist().deleteSession(sessionId);
}

export async function listAccounts(userId: string): Promise<AccountRow[]> {
  return persist().listAccounts(userId);
}

export async function getAccount(accountId: string): Promise<AccountRow | null> {
  return persist().getAccount(accountId);
}

export async function findAccountByIdentity(provider: ProviderKind, email: string): Promise<AccountRow | null> {
  return persist().findAccountByIdentity(provider, email);
}

export async function upsertAccount(userId: string, provider: ProviderKind, email: string, name: string, tokens: TokenSet | null): Promise<AccountRow> {
  const existing = await persist().findAccountByUserIdentity(userId, provider, email);
  const enc = tokens ? encrypt(JSON.stringify(tokens)) : null;
  if (existing) {
    const next: AccountRow = {
      ...existing,
      name,
      tokens: enc ?? existing.tokens,
      sync: JSON.stringify({ ...JSON.parse(existing.sync), error: null }),
    };
    await persist().putAccount(next);
    return (await persist().getAccount(existing.id))!;
  }
  const id = newId("acc");
  const row: AccountRow = {
    id, user_id: userId, provider, email, name, tokens: enc, cursor: null, sync: JSON.stringify(DEFAULT_SYNC), created_at: Date.now(),
  };
  await persist().putAccount(row);
  return (await persist().getAccount(id))!;
}

export async function removeAccount(accountId: string): Promise<void> {
  await persist().removeAccount(accountId);
}

export async function setCursor(accountId: string, cursor: string | null): Promise<void> {
  const row = await persist().getAccount(accountId);
  if (!row) return;
  await persist().putAccount({ ...row, cursor });
}

export async function setSync(accountId: string, patch: Partial<SyncState>): Promise<SyncState> {
  const row = await getAccount(accountId);
  if (!row) return DEFAULT_SYNC;
  const next = { ...DEFAULT_SYNC, ...(JSON.parse(row.sync) as Partial<SyncState>), ...patch };
  await persist().putAccount({ ...row, sync: JSON.stringify(next) });
  return next;
}

export async function getUserSettings(userId: string): Promise<Record<string, unknown>> {
  const row = await persist().getUser(userId);
  return row ? (JSON.parse(row.settings) as Record<string, unknown>) : {};
}

export async function setUserSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
  await persist().updateUserSettings(userId, JSON.stringify(settings));
}

type Refresher = (refreshToken: string) => Promise<TokenSet>;

export class DbTokenSource implements TokenSource {
  private inflight: Promise<string> | null = null;
  constructor(private accountId: string, private refresher: Refresher) {}

  private async read(): Promise<TokenSet> {
    const row = await getAccount(this.accountId);
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
        const next = await this.refresher(t.refreshToken);
        const merged: TokenSet = { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
        const row = await getAccount(this.accountId);
        if (row) await persist().putAccount({ ...row, tokens: encrypt(JSON.stringify(merged)) });
        return merged.accessToken;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}

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
