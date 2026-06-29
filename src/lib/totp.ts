// RFC 6238 TOTP code generation using Web Crypto (HMAC-SHA1). Secrets are
// base32 (RFC 4648), the format authenticator apps use.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode a base32 string into bytes. Ignores spaces and padding. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Whether a string looks like a valid base32 TOTP secret. */
export function isValidSecret(secret: string): boolean {
  return base32Decode(secret).length >= 10;
}

export interface TotpResult {
  code: string;
  /** Seconds until the current code expires. */
  secondsRemaining: number;
}

/** Generate the current TOTP code for a base32 secret (30s period, 6 digits). */
export async function generateTotp(
  secret: string,
  period = 30,
  digits = 6,
): Promise<TotpResult> {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / period);

  // 8-byte big-endian counter.
  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      counterBytes.buffer as ArrayBuffer,
    ),
  );

  // Dynamic truncation (RFC 4226).
  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  const code = (binary % 10 ** digits).toString().padStart(digits, "0");

  return { code, secondsRemaining: period - (epoch % period) };
}
