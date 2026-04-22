/**
 * Higher-level operations on top of the AES primitives:
 *
 *  - Wrap/unwrap the vault key (the middle layer of the three-layer key
 *    hierarchy). The vault key is encrypted under the derived key and
 *    stored on the server as `encrypted_vault_key`.
 *
 *  - Encrypt/decrypt a vault item payload. The payload (username,
 *    password, optional notes) is JSON-serialized and then encrypted
 *    under the vault key. The server only sees the site (plaintext for
 *    autofill lookup) and the opaque blob.
 */

import type { PlaintextPayload } from '@password-manager/shared';
import { EncryptedBlob } from './types';
import { decrypt, encrypt } from './aes';
import { utf8Decode, utf8Encode } from './encoding';

/**
 * Wrap (encrypt) the vault key with the derived key.
 *
 * Called once at registration and again on every password change. The
 * result is stored on the server as `encrypted_vault_key`.
 */
export async function wrapVaultKey(
  vaultKey: Uint8Array,
  derivedKey: Uint8Array,
): Promise<EncryptedBlob> {
  return encrypt(derivedKey, vaultKey);
}

/**
 * Unwrap (decrypt) the vault key using the derived key.
 *
 * Called on login, immediately after Argon2id derivation. The derived
 * key should be zeroed as soon as this returns; only the vault key is
 * held in memory for the remainder of the session.
 *
 * If the user entered the wrong master password, the derived key will
 * be wrong and GCM tag verification will fail — this throws. The caller
 * should surface "wrong master password" to the user.
 */
export async function unwrapVaultKey(
  encryptedVaultKey: EncryptedBlob,
  derivedKey: Uint8Array,
): Promise<Uint8Array> {
  return decrypt(derivedKey, encryptedVaultKey);
}

/**
 * Encrypt a vault item payload under the vault key.
 *
 * Every field (username, password, optional notes) is bundled into a
 * single JSON object before encryption, so the server sees only one
 * opaque blob per vault item — not one per field.
 */
export async function encryptVaultItem(
  vaultKey: Uint8Array,
  payload: PlaintextPayload,
): Promise<EncryptedBlob> {
  const json = JSON.stringify(payload);
  return encrypt(vaultKey, utf8Encode(json));
}

/**
 * Decrypt a vault item blob back into a PlaintextPayload.
 *
 * Throws on any failure — tag mismatch, invalid UTF-8, or invalid JSON.
 * The caller must not treat a thrown error as an empty payload.
 */
export async function decryptVaultItem(
  vaultKey: Uint8Array,
  blob: EncryptedBlob,
): Promise<PlaintextPayload> {
  const plaintext = await decrypt(vaultKey, blob);
  const json = utf8Decode(plaintext);
  return JSON.parse(json) as PlaintextPayload;
}
