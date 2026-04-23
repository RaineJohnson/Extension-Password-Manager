/**
 * Argon2id key derivation.
 *
 * The master password is never used directly as an encryption key. It
 * is run through Argon2id with a per-user salt to produce a derived key.
 * Argon2id is memory-hard (default 64 MiB), making GPU/ASIC brute-force
 * substantially more expensive than bcrypt or PBKDF2 at comparable
 * wall-clock times.
 */

import { argon2id } from 'hash-wasm';
import {
  Argon2idParams,
  DEFAULT_ARGON2ID_PARAMS,
  DerivedMaterial,
} from './types';

/**
 * Derive a key from a password and salt using Argon2id.
 *
 * Deterministic for fixed (password, salt, params). Two calls with the
 * same inputs always produce the same output — this is what makes login
 * work: the client re-derives the same key every time the user logs in.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  params: Argon2idParams = DEFAULT_ARGON2ID_PARAMS,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: 'binary',
  });
  return new Uint8Array(hash);
}

/**
 * Derive both outputs — derivedKey and authCredential — from the master
 * password using two independent salts.
 *
 *  - `derivedKey` (from salt_a) is used only to wrap/unwrap the vault
 *    key. It MUST NEVER leave the client.
 *  - `authCredential` (from salt_b) is sent to the server, which
 *    bcrypt-hashes it and uses it only to verify identity at login.
 *
 * Because the salts are independent, the two outputs are cryptographically
 * unrelated. A server compromise exposes only `bcrypt(authCredential)`,
 * which reveals nothing about `derivedKey` and therefore nothing about
 * the vault key.
 */
export async function deriveMaterial(
  masterPassword: string,
  saltA: Uint8Array,
  saltB: Uint8Array,
  params: Argon2idParams = DEFAULT_ARGON2ID_PARAMS,
): Promise<DerivedMaterial> {
  const [derivedKey, authCredential] = await Promise.all([
    deriveKey(masterPassword, saltA, params),
    deriveKey(masterPassword, saltB, params),
  ]);
  return { derivedKey, authCredential };
}
