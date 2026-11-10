// SQLite storage (node:sqlite): users, sessions, accounts, the local message
// index, materialized threads, cached bodies, the send queue and settings.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, "tidepost.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  tokens TEXT,
  cursor TEXT,
  sync TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(provider, email, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL,
  bcc_json TEXT NOT NULL,
  reply_to_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL,
  date_ms INTEGER NOT NULL,
  unread INTEGER NOT NULL,
  starred INTEGER NOT NULL,
  folders TEXT NOT NULL,
  has_att INTEGER NOT NULL,
  msgid_hdr TEXT,
  in_reply_to TEXT,
  refs TEXT,
  bulk_json TEXT NOT NULL,
  category TEXT,
  importance TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(account_id, thread_id);
CREATE INDEX IF NOT EXISTS messages_date ON messages(account_id, date_ms DESC);
CREATE INDEX IF NOT EXISTS messages_from ON messages(account_id, from_email);

CREATE TABLE IF NOT EXISTS threads (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL,
  participants TEXT NOT NULL,
  last_from_name TEXT NOT NULL,
  last_from_email TEXT NOT NULL,
  last_from_me INTEGER NOT NULL,
  last_date_ms INTEGER NOT NULL,
  first_date_ms INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  unread_count INTEGER NOT NULL,
  starred INTEGER NOT NULL,
  has_att INTEGER NOT NULL,
  folders TEXT NOT NULL,
  in_inbox INTEGER NOT NULL,
  to_me_direct INTEGER NOT NULL,
  is_bulk INTEGER NOT NULL,
  audience INTEGER NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS threads_inbox ON threads(account_id, in_inbox, last_date_ms DESC);
CREATE INDEX IF NOT EXISTS threads_date ON threads(account_id, last_date_ms DESC);

CREATE TABLE IF NOT EXISTS thread_state (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  snoozed_until INTEGER,
  remind_at INTEGER,
  nudged INTEGER NOT NULL DEFAULT 0,
  waiting_dismissed_at INTEGER,
  brief TEXT,
  PRIMARY KEY (account_id, thread_id)
);

CREATE TABLE IF NOT EXISTS bodies (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (account_id, message_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  account_id UNINDEXED, message_id UNINDEXED, subject, people, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS send_queue (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  thread_id TEXT,
  created_at INTEGER NOT NULL
);
`);

// ---------- encryption for tokens and queued mail at rest ----------

function loadKey(): Buffer {
  if (config.secret) return crypto.createHash("sha256").update(config.secret).digest();
  const keyFile = path.join(config.dataDir, "secret.key");
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

/** Run fn inside a transaction. */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
