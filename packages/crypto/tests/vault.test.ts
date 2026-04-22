import type { PlaintextPayload } from '@password-manager/shared';
import { encrypt } from '../src/aes';
import { utf8Encode } from '../src/encoding';
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
    const payload: PlaintextPayload = {
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
    const payload: PlaintextPayload = { username: 'bob', password: '12345' };
    const blob = await encryptVaultItem(vaultKey, payload);
    const recovered = await decryptVaultItem(vaultKey, blob);
    expect(recovered).toEqual(payload);
  });

  it('handles unicode in every field', async () => {
    const vaultKey = generateVaultKey();
    const payload: PlaintextPayload = {
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
    const payload: PlaintextPayload = { username: 'u', password: 'p' };
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

  it('throws if the decrypted bytes are valid UTF-8 but not JSON', async () => {
    // GCM tag verification passes (right key), UTF-8 decoding passes, but
    // JSON.parse rejects the contents. Exercise the error path explicitly
    // so a future refactor can't silently turn it into a success.
    const vaultKey = generateVaultKey();
    const blob = await encrypt(vaultKey, utf8Encode('not valid json at all'));
    await expect(decryptVaultItem(vaultKey, blob)).rejects.toThrow();
  });

  it('throws if the decrypted bytes are not valid UTF-8', async () => {
    // GCM tag verification passes, but UTF-8 decoding fails because the
    // bytes are not a valid encoding. TextDecoder with fatal:true throws.
    const vaultKey = generateVaultKey();
    // 0xC3 0x28 is an invalid UTF-8 sequence (lone continuation byte).
    const blob = await encrypt(vaultKey, new Uint8Array([0xc3, 0x28]));
    await expect(decryptVaultItem(vaultKey, blob)).rejects.toThrow();
  });
});
