// At-rest encryption, signed cookies, and ids. Durable data lives in Convex
// (or the in-memory store used by tests).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

function loadKey(): Buffer {
  if (config.secret) return crypto.createHash("sha256").update(config.secret).digest();
  if (process.env.VERCEL) throw new Error("TIDEPOST_SECRET is required on Vercel");
  const keyFile = path.join(config.dataDir, "secret.key");
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(keyFile)) {
    fs.writeFileSync(keyFile, crypto.randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(keyFile, "utf8").trim(), "base64");
}

const KEY = loadKey();

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** HMAC for short-lived signed cookies (OAuth state). */
export function sign(value: string): string {
  const mac = crypto.createHmac("sha256", KEY).update(value).digest("base64url");
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
