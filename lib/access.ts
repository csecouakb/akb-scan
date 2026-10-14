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

export async function changeScannerPin(_pin: string) {
  throw new Error("Netlify deployment uses the SCANNER_PIN environment variable. Change the PIN from Netlify environment variables and redeploy.");
}

export function isAdminEmail(email?: string | null) {
  return Boolean(email && process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase());
}
