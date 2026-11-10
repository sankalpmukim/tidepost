export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  scope: string;
  idToken: string | null;
}

export interface OAuthStart {
  url: string;
}
