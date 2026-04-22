import { generateVaultKey } from '../src/random';
import {
  decryptVaultItem,
  encryptVaultItem,
  unwrapVaultKey,
  wrapVaultKey,
} from '../src/vault';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('vault key wrapping', () => {
  it('round-trips a vault key through wrap/unwrap', async () => {
    const vaultKey = generateVaultKey();
    const derivedKey = generateVaultKey(); // any 32-byte key stands in for one
    const wrapped = await wrapVaultKey(vaultKey, derivedKey);
    const unwrapped = await unwrapVaultKey(wrapped, derivedKey);
    expect(hex(unwrapped)).toBe(hex(vaultKey));
  });

  it('fails to unwrap with the wrong derived key', async () => {
    const vaultKey = generateVaultKey();
    const derivedKey = generateVaultKey();
    const wrongKey = generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, derivedKey);
    await expect(unwrapVaultKey(wrapped, wrongKey)).rejects.toThrow();
  });
});

describe('vault item encryption', () => {
  it('round-trips a full payload', async () => {
    const vaultKey = generateVaultKey();
    const payload = {
      username: 'alice@example.com',
      password: 'correct horse battery staple',
      notes: 'recovery code: ABCD-EFGH',
    };
    const blob = await encryptVaultItem(vaultKey, payload);
    const recovered = await decryptVaultItem(vaultKey, blob);
    expect(recovered).toEqual(payload);
  });

  it('round-trips a payload without notes', async () => {
    const vaultKey = generateVaultKey();
    const payload = { username: 'bob', password: '12345' };
    const blob = await encryptVaultItem(vaultKey, payload);
    const recovered = await decryptVaultItem(vaultKey, blob);
    expect(recovered).toEqual(payload);
  });

  it('handles unicode in every field', async () => {
    const vaultKey = generateVaultKey();
    const payload = {
      username: '👤 Renée',
      password: '密码-пароль-كلمة المرور',
      notes: 'emojis: 🔐 🔑 💾',
    };
    const blob = await encryptVaultItem(vaultKey, payload);
    const recovered = await decryptVaultItem(vaultKey, blob);
    expect(recovered).toEqual(payload);
  });

  it('produces a different blob each time for the same payload', async () => {
    const vaultKey = generateVaultKey();
    const payload = { username: 'u', password: 'p' };
    const a = await encryptVaultItem(vaultKey, payload);
    const b = await encryptVaultItem(vaultKey, payload);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong vault key', async () => {
    const vaultKey = generateVaultKey();
    const wrongKey = generateVaultKey();
    const blob = await encryptVaultItem(vaultKey, {
      username: 'u',
      password: 'p',
    });
    await expect(decryptVaultItem(wrongKey, blob)).rejects.toThrow();
  });
});
