/**
 * Shared types and constants for the crypto module.
 *
 * All size constants match the values specified in the design document:
 *  - 128-bit salts (16 bytes)
 *  - 96-bit AES-GCM nonces (12 bytes)
 *  - 128-bit AES-GCM authentication tags (16 bytes)
 *  - 256-bit keys (32 bytes) for both the derived key and the vault key
 */

export const SALT_BYTES = 16;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;

/**
 * A base64-encoded blob of the form: nonce || ciphertext || tag.
 *
 * This is the format stored as `encrypted_blob` for each vault item and
 * as `encrypted_vault_key` for the wrapped vault key.
 */
export type EncryptedBlob = string;

/**
 * The plaintext payload that lives inside each vault item's encrypted blob.
 *
 * The server never sees this shape — only the JSON-serialized, encrypted bytes.
 */
export interface PlaintextPayload {
  username: string;
  password: string;
  notes?: string;
}

/**
 * Raw bytes of an EncryptedBlob broken into its three components.
 */
export interface ParsedBlob {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

/**
 * Argon2id parameters.
 *
 * Defaults match the production security baseline. Tests override these
 * to keep the suite fast; the extension must never lower them.
 */
export interface Argon2idParams {
  memorySize: number; // KiB
  iterations: number;
  parallelism: number;
  hashLength: number; // bytes
}

export const DEFAULT_ARGON2ID_PARAMS: Argon2idParams = {
  memorySize: 65536, // 64 MiB
  iterations: 3,
  parallelism: 1,
  hashLength: KEY_BYTES,
};

/**
 * The two independent outputs of deriving from the master password.
 *
 *  - `derivedKey` is used only to wrap/unwrap the vault key. It never
 *    leaves the client.
 *  - `authCredential` is sent to the server, which bcrypt-hashes it for
 *    identity verification. It is not a key and cannot decrypt anything.
 */
export interface DerivedMaterial {
  derivedKey: Uint8Array;
  authCredential: Uint8Array;
}
