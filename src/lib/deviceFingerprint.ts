/**
 * Generates a stable SHA-256 browser fingerprint from passive, non-sensitive
 * browser signals. This does NOT use cookies, localStorage, or any persistent
 * storage — it's purely computed from the current environment.
 *
 * Fingerprint is stable for the same browser on the same device.
 * A different browser or incognito window on the same device yields a different
 * fingerprint (acceptable tradeoff for a class-setting proxy check).
 *
 * Result is cached module-level so it's computed at most once per page load.
 */

let cached: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (cached) return cached;

  const signals = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(navigator.hardwareConcurrency ?? ''),
    navigator.platform ?? '',
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(screen.pixelDepth ?? ''),
    navigator.vendor ?? '',
  ].join('|');

  const encoder = new TextEncoder();
  const data = encoder.encode(signals);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  cached = hex;
  return hex;
}
