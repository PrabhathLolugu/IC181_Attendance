const encoder = new TextEncoder();

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface QrPayload {
  sid: string;
  rot: string;
  exp: number;
}

export async function signQrToken(payload: QrPayload, secret: string): Promise<string> {
  const json = JSON.stringify(payload);
  const payloadB64 = toBase64Url(encoder.encode(json));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyQrToken(
  token: string,
  secret: string,
): Promise<{ valid: true; payload: QrPayload } | { valid: false; error: string }> {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, error: "Malformed QR code." };
  const [payloadB64, sigB64] = parts;
  try {
    const key = await getKey(secret);
    const sigBytes = fromBase64Url(sigB64);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payloadB64));
    if (!ok) return { valid: false, error: "Invalid QR code." };
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as QrPayload;
    if (!payload.sid || !payload.exp) return { valid: false, error: "Malformed QR code." };
    if (Date.now() > payload.exp) {
      return { valid: false, error: "This QR code has expired. Ask your instructor to refresh it." };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: "Invalid QR code." };
  }
}
