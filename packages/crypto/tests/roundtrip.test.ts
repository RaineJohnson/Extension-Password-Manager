/**
 * End-to-end tests for the full authentication and vault flow as
 * described in the design document. These act as a living spec: if a
 * refactor breaks the register → login → encrypt → decrypt pipeline,
 * these tests fail loudly.
 */

import { deriveMaterial } from '../src/kdf';
import { generateSalt, generateVaultKey } from '../src/random';
import { Argon2idParams } from '../src/types';
import {
  decryptVaultItem,
  encryptVaultItem,
  unwrapVaultKey,
  wrapVaultKey,
} from '../src/vault';

const FAST_PARAMS: Argon2idParams = {
  memorySize: 8,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('full auth flow', () => {
  it('register → login → encrypt → decrypt', async () => {
    const masterPassword = 'correct horse battery staple';

    // --- REGISTRATION ---
    // Client generates salts locally and derives both outputs.
    const saltA = generateSalt();
    const saltB = generateSalt();
    const reg = await deriveMaterial(
      masterPassword,
      saltA,
      saltB,
      FAST_PARAMS,
    );
    // Client generates a fresh vault key and wraps it under derivedKey.
    const vaultKey = generateVaultKey();
    const encryptedVaultKey = await wrapVaultKey(vaultKey, reg.derivedKey);
    // Server would persist: saltA, saltB, bcrypt(reg.authCredential),
    // encryptedVaultKey. Client discards reg.derivedKey.

    // Store an item while logged in.
    const item = { username: 'alice', password: 'hunter2', notes: 'test' };
    const encryptedItem = await encryptVaultItem(vaultKey, item);

    // --- LOGOUT: client discards vaultKey. ---

    // --- LOGIN on a fresh session ---
    // Client re-derives from the same master password + server-supplied salts.
    const login = await deriveMaterial(
      masterPassword,
      saltA,
      saltB,
      FAST_PARAMS,
    );
    // authCredential must reproduce exactly — that's what the server
    // bcrypt-verifies against the stored auth_hash.
    expect(hex(login.authCredential)).toBe(hex(reg.authCredential));

    // Client unwraps the vault key.
    const recoveredVaultKey = await unwrapVaultKey(
      encryptedVaultKey,
      login.derivedKey,
    );
    // Client discards login.derivedKey.

    // Decrypt the previously-stored item.
    const recoveredItem = await decryptVaultItem(
      recoveredVaultKey,
      encryptedItem,
    );
    expect(recoveredItem).toEqual(item);
  });

  it('login with wrong password fails to unwrap the vault key', async () => {
    const saltA = generateSalt();
    const saltB = generateSalt();
    const { derivedKey } = await deriveMaterial(
      'correct-password',
      saltA,
      saltB,
      FAST_PARAMS,
    );
    const vaultKey = generateVaultKey();
    const encryptedVaultKey = await wrapVaultKey(vaultKey, derivedKey);

    const wrong = await deriveMaterial(
      'wrong-password',
      saltA,
      saltB,
      FAST_PARAMS,
    );
    await expect(
      unwrapVaultKey(encryptedVaultKey, wrong.derivedKey),
    ).rejects.toThrow();
  });

  it('password change: re-wraps the vault key, vault items untouched', async () => {
    const oldPassword = 'old-password';
    const newPassword = 'new-password';

    // Initial registration.
    const saltA = generateSalt();
    const saltB = generateSalt();
    const { derivedKey: oldDerivedKey } = await deriveMaterial(
      oldPassword,
      saltA,
      saltB,
      FAST_PARAMS,
    );
    const vaultKey = generateVaultKey();
    const oldEncryptedVaultKey = await wrapVaultKey(vaultKey, oldDerivedKey);

    // Encrypt an item under the vault key — this stays put across a
    // password change.
    const item = { username: 'u', password: 'p' };
    const encryptedItem = await encryptVaultItem(vaultKey, item);

    // Password change: fresh salts, derive new material, re-wrap the SAME
    // vault key. No vault items are re-encrypted.
    const newSaltA = generateSalt();
    const newSaltB = generateSalt();
    const { derivedKey: newDerivedKey } = await deriveMaterial(
      newPassword,
      newSaltA,
      newSaltB,
      FAST_PARAMS,
    );
    const newEncryptedVaultKey = await wrapVaultKey(vaultKey, newDerivedKey);

    // The existing encrypted item still decrypts — the vault key didn't change.
    expect(await decryptVaultItem(vaultKey, encryptedItem)).toEqual(item);

    // The old encrypted_vault_key cannot be unwrapped with the new derived key.
    await expect(
      unwrapVaultKey(oldEncryptedVaultKey, newDerivedKey),
    ).rejects.toThrow();

    // The new encrypted_vault_key unwraps to the same vault key as before.
    const recoveredVaultKey = await unwrapVaultKey(
      newEncryptedVaultKey,
      newDerivedKey,
    );
    expect(hex(recoveredVaultKey)).toBe(hex(vaultKey));
  });
});
