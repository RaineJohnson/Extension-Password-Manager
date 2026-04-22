import { generateNonce, generateSalt, generateVaultKey } from '../src/random';
import { KEY_BYTES, NONCE_BYTES, SALT_BYTES } from '../src/types';

describe('random', () => {
  it('generates a salt of the expected size', () => {
    expect(generateSalt().length).toBe(SALT_BYTES);
  });

  it('generates a nonce of the expected size', () => {
    expect(generateNonce().length).toBe(NONCE_BYTES);
  });

  it('generates a vault key of the expected size', () => {
    expect(generateVaultKey().length).toBe(KEY_BYTES);
  });

  it('produces distinct nonces across many calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const hex = Buffer.from(generateNonce()).toString('hex');
      expect(seen.has(hex)).toBe(false);
      seen.add(hex);
    }
  });

  it('produces distinct vault keys across many calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const hex = Buffer.from(generateVaultKey()).toString('hex');
      expect(seen.has(hex)).toBe(false);
      seen.add(hex);
    }
  });
});
