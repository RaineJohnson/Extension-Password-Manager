/**
 * AES-256-GCM authenticated encryption via Web Crypto.
 *
 * The blob format on the wire is: nonce (12 bytes) || ciphertext || tag
 * (16 bytes), base64-encoded. The nonce is prepended so the blob is
 * self-contained: given the key, decryption needs no other inputs.
 */

import { EncryptedBlob, KEY_BYTES, NONCE_BYTES, ParsedBlob, TAG_BYTES } from './types';
import { concatBytes, fromBase64, toBase64 } from './encoding';
import { generateNonce } from './random';

/**
 * Import raw key bytes as a non-extractable AES-GCM CryptoKey.
 *
 * `extractable: false` means an attacker who captures a reference to
 * the CryptoKey object cannot call `subtle.exportKey` to get the raw
 * bytes back. The caller's Uint8Array is still the canonical copy and
 * is their responsibility to zero when finished.
 */
async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  if (keyBytes.length !== KEY_BYTES) {
    throw new Error(
      `AES-256 key must be ${KEY_BYTES} bytes, got ${keyBytes.length}`,
    );
  }
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * A fresh nonce is generated on every call from the CSPRNG. Web Crypto
 * returns `ciphertext || tag` as a single buffer; we prepend the nonce
 * to produce the wire-format blob.
 */
export async function encrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
): Promise<EncryptedBlob> {
  const key = await importAesKey(keyBytes);
  const nonce = generateNonce();
  const ciphertextAndTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext),
  );
  return toBase64(concatBytes(nonce, ciphertextAndTag));
}

/**
 * Decrypt a blob produced by `encrypt`, verifying the auth tag.
 *
 * Throws on any failure: malformed blob, tag mismatch (i.e. tampering
 * or wrong key), or a key of the wrong length. No plaintext is ever
 * returned when decryption fails.
 */
export async function decrypt(
  keyBytes: Uint8Array,
  blob: EncryptedBlob,
): Promise<Uint8Array> {
  const parsed = parseBlob(blob);
  const key = await importAesKey(keyBytes);
  const ciphertextAndTag = concatBytes(parsed.ciphertext, parsed.tag);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: parsed.nonce },
    key,
    ciphertextAndTag,
  );
  return new Uint8Array(plaintext);
}

/**
 * Parse the raw bytes of a blob into `{ nonce, ciphertext, tag }`.
 *
 * Exposed mainly for tests and diagnostics; callers normally just use
 * `decrypt`. Throws if the blob is too short to contain both the nonce
 * and the tag.
 */
export function parseBlob(blob: EncryptedBlob): ParsedBlob {
  const bytes = fromBase64(blob);
  if (bytes.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error('Ciphertext blob is too short to contain nonce + tag');
  }
  const nonce = bytes.subarray(0, NONCE_BYTES);
  const tag = bytes.subarray(bytes.length - TAG_BYTES);
  const ciphertext = bytes.subarray(NONCE_BYTES, bytes.length - TAG_BYTES);
  return { nonce, ciphertext, tag };
}
