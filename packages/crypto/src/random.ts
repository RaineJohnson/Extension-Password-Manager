/**
 * Cryptographically secure random byte generation.
 *
 * All randomness flows through the platform CSPRNG via Web Crypto's
 * `crypto.getRandomValues`. In a Manifest V3 service worker, this is
 * available on the global `crypto`. In Node (for tests), it's exposed
 * on `globalThis.crypto` as of Node 19+.
 */

import { KEY_BYTES, NONCE_BYTES, SALT_BYTES } from './types';

/** Generate a fresh 128-bit salt for Argon2id. */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Generate a fresh 96-bit nonce for AES-GCM.
 *
 * MUST be called once per encryption. Reusing a nonce under the same key
 * is a catastrophic failure mode for GCM (it allows the attacker to
 * recover plaintext XOR differences and forge authentication tags).
 */
export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(nonce);
  return nonce;
}

/**
 * Generate a fresh 256-bit vault key.
 *
 * Called once at registration. The same vault key is used for the entire
 * lifetime of the account; a password change re-wraps it under a new
 * derived key but does not rotate the vault key itself.
 */
export function generateVaultKey(): Uint8Array {
  const key = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(key);
  return key;
}
