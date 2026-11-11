// At-rest encryption, signed cookies, and ids. Durable data lives in D1
// (users, sessions, accounts) and the Mailbox Durable Objects (the index).
// The key comes from TIDEPOST_SECRET via config, so tokens stay decryptable
// across deploys.
import crypto from "node:crypto";
import { config } from "./config";

let KEY: Buffer | null = null;

function key(): Buffer {
  if (!KEY) {
    const secret = config().secret;
    if (!secret) throw new Error("TIDEPOST_SECRET is required (npx wrangler secret put TIDEPOST_SECRET)");
    KEY = crypto.createHash("sha256").update(secret).digest();
  }
  return KEY;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** HMAC for short-lived signed cookies (OAuth state). */
export function sign(value: string): string {
  const mac = crypto.createHmac("sha256", key()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = sign(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signed);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
