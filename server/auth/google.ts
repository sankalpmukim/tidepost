// Google OAuth 2.0: authorization-code flow with PKCE for a confidential web client.
// Docs: https://developers.google.com/identity/protocols/oauth2/web-server
import { config, redirectUri } from "../config";
import { AuthExpiredError } from "../providers/types";
import type { TokenSet } from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.modify"];

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

function requireCredentials(needSecret: boolean): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = config.google;
  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (needSecret && !clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(
      `Google sign-in is not configured: set ${missing.join(" and ")} in the environment ` +
        `(create an OAuth client of type "Web application" in Google Cloud Console and add ` +
        `${redirectUri("google")} as an authorized redirect URI).`,
    );
  }
  return { clientId, clientSecret };
}

export function googleAuthUrl(opts: { state: string; codeChallenge: string; loginHint?: string }): string {
  const { clientId } = requireCredentials(false);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri("google"),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // Always show consent so Google issues a refresh token even on re-authorisation.
    prompt: "consent",
    include_granted_scopes: "true",
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(form: Record<string, string>): Promise<GoogleTokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
    });
  } catch (err) {
    throw new Error(`Could not reach Google's token endpoint: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let json: GoogleTokenResponse = {};
  try {
    json = text ? (JSON.parse(text) as GoogleTokenResponse) : {};
  } catch {
    // non-JSON error page; handled below
  }
  if (!res.ok || json.error) {
    if (json.error === "invalid_grant") {
      throw new AuthExpiredError(
        `Google rejected the sign-in (${json.error_description ?? "invalid_grant"}). Sign in again.`,
      );
    }
    const detail = json.error ? `${json.error}${json.error_description ? `: ${json.error_description}` : ""}` : text.slice(0, 300);
    throw new Error(`Google token request failed (HTTP ${res.status}): ${detail}`);
  }
  if (!json.access_token) throw new Error("Google token response did not include an access token.");
  return json;
}

function toTokenSet(json: GoogleTokenResponse, fallbackRefresh: string | null): TokenSet {
  return {
    accessToken: json.access_token ?? "",
    refreshToken: json.refresh_token ?? fallbackRefresh,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope ?? "",
    idToken: json.id_token ?? null,
  };
}

export async function googleExchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireCredentials(true);
  const json = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri("google"),
  });
  return toTokenSet(json, null);
}

export async function googleRefresh(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireCredentials(true);
  const json = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  // Google usually omits refresh_token on refresh; keep the one we have.
  return toTokenSet(json, refreshToken);
}

/**
 * Read the identity claims from an ID token.
 * No signature verification: the token was received directly from Google's
 * token endpoint over TLS in the code exchange, so it is trusted as-is
 * (see OpenID Connect Core §3.1.3.7). Never use this on tokens from a browser.
 */
export function googleIdentityFromIdToken(idToken: string): { email: string; name: string; sub: string } {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("Malformed Google ID token.");
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Could not decode the Google ID token payload.");
  }
  if (!payload || typeof payload !== "object") throw new Error("Google ID token payload is not an object.");
  const p = payload as Record<string, unknown>;
  const email = typeof p.email === "string" ? p.email.toLowerCase() : "";
  const sub = typeof p.sub === "string" ? p.sub : "";
  if (!email || !sub) throw new Error("Google ID token is missing the email or subject claim.");
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : email.split("@")[0];
  return { email, name, sub };
}
