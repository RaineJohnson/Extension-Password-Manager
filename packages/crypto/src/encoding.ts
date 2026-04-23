/**
 * Encoding helpers. Kept in one place so the rest of the module doesn't
 * have to branch on environment (Node vs. browser) every time it needs
 * base64 or UTF-8.
 */

/** UTF-8 encode a string into bytes. */
export function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * UTF-8 decode bytes into a string. Uses `fatal: true` so invalid UTF-8
 * (e.g. from a decryption that silently succeeded on the wrong data)
 * throws rather than returning replacement characters.
 */
export function utf8Decode(b: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(b);
}

/**
 * Encode bytes as standard base64 (with padding).
 * Prefers Node's Buffer when available, falls back to btoa in the browser.
 */
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    // `apply` is fine here — chunkSize is bounded.
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/** Decode a base64 string into bytes. */
export function fromBase64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Concatenate byte arrays into a single new Uint8Array. */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
