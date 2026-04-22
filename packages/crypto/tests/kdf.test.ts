import { deriveKey, deriveMaterial } from '../src/kdf';
import { Argon2idParams } from '../src/types';

/**
 * Reduced parameters for test speed. Production uses the defaults
 * exported from `../src/types` (64 MiB / 3 iterations). The KDF tests
 * are concerned with behaviour — determinism, salt/password sensitivity,
 * independence of outputs — which is the same at any cost setting.
 */
const FAST_PARAMS: Argon2idParams = {
  memorySize: 8,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('Argon2id key derivation', () => {
  it('produces a 32-byte key', async () => {
    const key = await deriveKey('password', new Uint8Array(16), FAST_PARAMS);
    expect(key.length).toBe(32);
  });

  it('is deterministic for the same password + salt + params', async () => {
    const salt = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    const a = await deriveKey('hunter2', salt, FAST_PARAMS);
    const b = await deriveKey('hunter2', salt, FAST_PARAMS);
    expect(hex(a)).toBe(hex(b));
  });

  it('produces different keys for different salts', async () => {
    const saltA = new Uint8Array(16).fill(1);
    const saltB = new Uint8Array(16).fill(2);
    const a = await deriveKey('same-password', saltA, FAST_PARAMS);
    const b = await deriveKey('same-password', saltB, FAST_PARAMS);
    expect(hex(a)).not.toBe(hex(b));
  });

  it('produces different keys for different passwords', async () => {
    const salt = new Uint8Array(16);
    const a = await deriveKey('password-1', salt, FAST_PARAMS);
    const b = await deriveKey('password-2', salt, FAST_PARAMS);
    expect(hex(a)).not.toBe(hex(b));
  });

  it('deriveMaterial produces two independent outputs', async () => {
    const saltA = new Uint8Array(16).fill(10);
    const saltB = new Uint8Array(16).fill(20);
    const { derivedKey, authCredential } = await deriveMaterial(
      'master-password',
      saltA,
      saltB,
      FAST_PARAMS,
    );
    expect(derivedKey.length).toBe(32);
    expect(authCredential.length).toBe(32);
    expect(hex(derivedKey)).not.toBe(hex(authCredential));
  });

  it('deriveMaterial is deterministic for fixed inputs', async () => {
    const saltA = new Uint8Array(16).fill(1);
    const saltB = new Uint8Array(16).fill(2);
    const m1 = await deriveMaterial('pw', saltA, saltB, FAST_PARAMS);
    const m2 = await deriveMaterial('pw', saltA, saltB, FAST_PARAMS);
    expect(hex(m1.derivedKey)).toBe(hex(m2.derivedKey));
    expect(hex(m1.authCredential)).toBe(hex(m2.authCredential));
  });

  it('swapping salt_a and salt_b produces swapped outputs', async () => {
    // Confirms the two derivations are truly independent: swapping the
    // salts between the two outputs yields the same pair of bytes in
    // reverse order. If one derivation leaked into the other, this
    // invariant would break.
    const saltA = new Uint8Array(16).fill(5);
    const saltB = new Uint8Array(16).fill(6);
    const original = await deriveMaterial('pw', saltA, saltB, FAST_PARAMS);
    const swapped = await deriveMaterial('pw', saltB, saltA, FAST_PARAMS);
    expect(hex(original.derivedKey)).toBe(hex(swapped.authCredential));
    expect(hex(original.authCredential)).toBe(hex(swapped.derivedKey));
  });
});
