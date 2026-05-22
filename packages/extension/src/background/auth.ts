/**
 * Auth orchestrator. Runs in the background service worker.
 *
 * Owns the cryptographic side of register / login / change-password / lock:
 * derives Argon2id material from the master password, wraps and unwraps
 * the vault key under the derived key, and asks the HTTP client to talk
 * to /auth/*. The master password and the derived key never leave this
 * module — only the auth credential (the *other* Argon2id output) goes
 * over the wire, and only the wrapped vault key is stored on the server.
 *
 * Sensitive byte buffers (derived key, auth credential, vault key) are
 * zeroed via `zeroBuffer` as soon as they're no longer needed. We use
 * `try/finally` rather than a `using` block because TS lib lacks
 * Symbol.dispose at the project target.
 */

import {
  deriveMaterial,
  fromBase64,
  generateSalt,
  generateVaultKey,
  toBase64,
  unwrapVaultKey,
  wrapVaultKey,
  zeroBuffer,
  type Argon2idParams,
} from '@password-manager/crypto';
import { ApiError } from '../shared/messages';
import type { HttpClient } from '../api/httpClient';
import * as state from './state';

export interface AuthDeps {
  http: HttpClient;
  /**
   * Override Argon2id parameters. Production code leaves this unset so the
   * library defaults (64 MiB / 3 iterations) apply; tests dial it down to
   * keep the suite fast. NEVER weaken in prod — see crypto/src/types.ts.
   */
  argon2idParams?: Argon2idParams;
}

/**
 * Create a fresh account. Does not log the user in — the popup routes
 * back to the Login screen on success.
 */
export async function register(
  deps: AuthDeps,
  email: string,
  password: string,
): Promise<void> {
  const saltA = generateSalt();
  const saltB = generateSalt();
  const vaultKey = generateVaultKey();
  const { derivedKey, authCredential } = await deriveMaterial(
    password,
    saltA,
    saltB,
    deps.argon2idParams,
  );
  try {
    const encryptedVaultKey = await wrapVaultKey(vaultKey, derivedKey);
    await deps.http.register({
      email,
      authCredential: toBase64(authCredential),
      saltA: toBase64(saltA),
      saltB: toBase64(saltB),
      encryptedVaultKey,
    });
  } finally {
    zeroBuffer(derivedKey);
    zeroBuffer(authCredential);
    zeroBuffer(vaultKey);
  }
}

/**
 * Unlock the vault. Fetches the user's salts, derives the auth credential
 * and derived key, exchanges credentials for tokens + the wrapped vault
 * key, then unwraps the vault key into worker memory.
 */
export async function login(
  deps: AuthDeps,
  email: string,
  password: string,
): Promise<void> {
  const salts = await deps.http.getSalts(email);
  const saltA = fromBase64(salts.saltA);
  const saltB = fromBase64(salts.saltB);
  const { derivedKey, authCredential } = await deriveMaterial(
    password,
    saltA,
    saltB,
    deps.argon2idParams,
  );
  let loginResult;
  try {
    loginResult = await deps.http.login({
      email,
      authCredential: toBase64(authCredential),
    });
  } catch (e) {
    zeroBuffer(derivedKey);
    if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
      throw new ApiError(
        'INVALID_CREDENTIALS',
        'That email and master password did not match.',
      );
    }
    throw e;
  } finally {
    zeroBuffer(authCredential);
  }
  let vaultKey: Uint8Array;
  try {
    vaultKey = await unwrapVaultKey(loginResult.encryptedVaultKey, derivedKey);
  } catch {
    throw new ApiError(
      'DECRYPT_FAILED',
      'Vault key did not decrypt — the server may have returned a tampered blob.',
    );
  } finally {
    zeroBuffer(derivedKey);
  }
  try {
    await state.unlock({
      email,
      accessToken: loginResult.accessToken,
      refreshToken: loginResult.refreshToken,
      vaultKey,
    });
  } finally {
    zeroBuffer(vaultKey);
  }
}

/** Clear tokens and the vault key. The user must unlock again. */
export async function lock(): Promise<void> {
  await state.lock();
}

/**
 * Change master password. Re-derives both halves under fresh salts and
 * re-wraps the existing vault key under the new derived key, so existing
 * items don't need re-encryption. The server invalidates all refresh
 * tokens on success, so we lock the vault and the user signs back in.
 */
export async function changePassword(
  deps: AuthDeps,
  current: string,
  next: string,
): Promise<void> {
  const email = state.getEmail();
  const vaultKey = state.getVaultKey();
  if (email === null || vaultKey === null) {
    throw new ApiError(
      'LOCKED',
      'The vault is locked. Sign in before changing your password.',
    );
  }

  const oldSalts = await deps.http.getSalts(email);
  const oldSaltA = fromBase64(oldSalts.saltA);
  const oldSaltB = fromBase64(oldSalts.saltB);
  const oldMaterial = await deriveMaterial(
    current,
    oldSaltA,
    oldSaltB,
    deps.argon2idParams,
  );
  zeroBuffer(oldMaterial.derivedKey);

  const newSaltA = generateSalt();
  const newSaltB = generateSalt();
  const newMaterial = await deriveMaterial(
    next,
    newSaltA,
    newSaltB,
    deps.argon2idParams,
  );

  try {
    const newEncryptedVaultKey = await wrapVaultKey(
      vaultKey,
      newMaterial.derivedKey,
    );
    try {
      await deps.http.changePassword({
        oldAuthCredential: toBase64(oldMaterial.authCredential),
        newAuthCredential: toBase64(newMaterial.authCredential),
        newEncryptedVaultKey,
        newSaltA: toBase64(newSaltA),
        newSaltB: toBase64(newSaltB),
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
        throw new ApiError(
          'INVALID_CREDENTIALS',
          'Current master password did not match.',
        );
      }
      throw e;
    }
  } finally {
    zeroBuffer(oldMaterial.authCredential);
    zeroBuffer(newMaterial.authCredential);
    zeroBuffer(newMaterial.derivedKey);
    zeroBuffer(vaultKey);
  }

  await state.lock();
}
