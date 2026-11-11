// Microsoft identity platform (v2) sign-in for work/school (Entra ID) and personal
// Outlook.com accounts: authorization-code flow with PKCE for a confidential web app.
import { config, redirectUri } from "../config";
import { AuthExpiredError } from "../providers/types";
import type { TokenSet } from "./types";

export const MICROSOFT_SCOPES = "openid profile email offline_access User.Read Mail.ReadWrite Mail.Send";

/** Errors from the token endpoint that mean the user has to sign in again. */
const REAUTH_ERRORS = new Set(["invalid_grant", "interaction_required", "consent_required", "login_required"]);

function authority(): string {
  const tenant = encodeURIComponent(config().microsoft.tenant || "common");
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

function requireClient(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = config().microsoft;
  const missing = [!clientId && "MICROSOFT_CLIENT_ID", !clientSecret && "MICROSOFT_CLIENT_SECRET"].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Microsoft sign-in is not configured: set ${missing.join(" and ")} in the server environment ` +
        `(register a web app in Microsoft Entra ID with redirect URI ${redirectUri(config(), "microsoft")}).`,
    );
  }
  return { clientId, clientSecret };
}

export function microsoftAuthUrl(opts: { state: string; codeChallenge: string; loginHint?: string }): string {
  const { clientId } = requireClient();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(config(), "microsoft"),
    response_mode: "query",
    scope: MICROSOFT_SCOPES,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    state: opts.state,
    prompt: "select_account",
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${authority()}/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function tokenRequest(form: Record<string, string>): Promise<TokenResponse & { access_token: string }> {
  let res: Response;
  try {
    res = await fetch(`${authority()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
    });
  } catch (err) {
    throw new Error(`Could not reach the Microsoft sign-in service: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error page; handled below
  }
  const body: TokenResponse = isRecord(json) ? (json as TokenResponse) : {};
  if (!res.ok || !body.access_token) {
    const code = body.error ?? `http_${res.status}`;
    // error_description carries the AADSTS code plus trace/correlation ids on extra lines.
    const desc = (body.error_description ?? text.slice(0, 200)).split(/\r?\n/)[0].trim();
    if (REAUTH_ERRORS.has(code)) throw new AuthExpiredError(`Microsoft sign-in expired (${code}): ${desc}. Sign in again.`);
    if (code === "invalid_client" || code === "unauthorized_client") {
      throw new Error(`Microsoft rejected the app credentials (${code}): ${desc}. Check MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET.`);
    }
    throw new Error(`Microsoft token request failed (${code}): ${desc}`);
  }
  return body as TokenResponse & { access_token: string };
}

function toTokenSet(r: TokenResponse & { access_token: string }, fallbackRefresh: string | null): TokenSet {
  const expiresIn = Number(r.expires_in ?? 3600);
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? fallbackRefresh,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    scope: r.scope ?? MICROSOFT_SCOPES,
    idToken: r.id_token ?? null,
  };
}

export async function microsoftExchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireClient();
  const r = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(config(), "microsoft"),
    code_verifier: codeVerifier,
    scope: MICROSOFT_SCOPES,
  });
  return toTokenSet(r, null);
}

/**
 * Microsoft rotates refresh tokens: callers must persist the returned
 * `refreshToken` (falls back to the old one when the response has none).
 * Throws AuthExpiredError when the grant is revoked/expired or needs interaction.
 */
export async function microsoftRefresh(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireClient();
  const r = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES,
  });
  return toTokenSet(r, refreshToken);
}

export function microsoftIdentityFromIdToken(idToken: string): { email: string; name: string; sub: string } {
  // The id_token came directly from the token endpoint over TLS in exchange for our
  // client secret + PKCE verifier, so we trust it without verifying the signature.
  const part = idToken.split(".")[1];
  if (!part) throw new Error("Microsoft returned a malformed id_token");
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new Error("Microsoft returned an unreadable id_token");
  }
  if (!isRecord(claims)) throw new Error("Microsoft returned an unreadable id_token");
  const str = (k: string): string => (typeof claims[k] === "string" ? (claims[k] as string).trim() : "");
  const email = (str("email") || str("preferred_username") || str("upn")).toLowerCase();
  if (!email) throw new Error("The Microsoft account did not provide an email address");
  const sub = str("sub") || str("oid");
  if (!sub) throw new Error("The Microsoft id_token has no subject");
  return { email, name: str("name") || email, sub };
}
