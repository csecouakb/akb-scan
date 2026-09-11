import { env } from "cloudflare:workers";

const PIN_KEY = "scanner_pin_hash";

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin: string) {
  const pepper = process.env.SCANNER_ACCESS_TOKEN;
  if (!pepper) throw new Error("Scanner access token is not configured");
  return digest(`akb-scan-pin:${pepper}:${pin}`);
}

export async function currentPinHash() {
  const db = env.DB;
  if (db) {
    const row = await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(PIN_KEY).first<{ value: string }>();
    if (row?.value) return row.value;
  }
  if (!process.env.SCANNER_PIN) throw new Error("Scanner PIN is not configured");
  return hashPin(process.env.SCANNER_PIN);
}

export async function verifyPin(pin: string) {
  return (await hashPin(pin)) === (await currentPinHash());
}

export async function scannerSessionToken() {
  const secret = process.env.SCANNER_ACCESS_TOKEN;
  if (!secret) throw new Error("Scanner access token is not configured");
  return digest(`akb-scan-session:${secret}:${await currentPinHash()}`);
}

export async function changeScannerPin(pin: string) {
  if (!env.DB) throw new Error("Settings database is unavailable");
  const value = await hashPin(pin);
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(PIN_KEY, value, Date.now()).run();
}

export function isAdminEmail(email?: string | null) {
  return Boolean(email && process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase());
}
