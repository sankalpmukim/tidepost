import fs from "node:fs";
import path from "node:path";
import { importPKCS8, SignJWT } from "jose";

const ISSUER = "https://tidepost.app";
const AUD = "tidepost";
const KID = "tidepost-es256-1";

let keyPromise: Promise<CryptoKey> | null = null;

function pem(): string | null {
  const fromEnv = process.env.TIDEPOST_JWT_PRIVATE_KEY;
  if (fromEnv) return fromEnv.replace(/\\n/g, "\n");
  const file = path.resolve(".jwt-private.pem");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  return null;
}

async function privateKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const text = pem();
    if (!text) throw new Error("TIDEPOST_JWT_PRIVATE_KEY is not set");
    keyPromise = importPKCS8(text, "ES256");
  }
  return keyPromise;
}

export async function convexToken(userId: string): Promise<string> {
  const key = await privateKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: KID })
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

export function jwtConfigured(): boolean {
  return !!pem();
}
