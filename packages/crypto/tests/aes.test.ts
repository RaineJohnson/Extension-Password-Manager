import { decrypt, encrypt, parseBlob } from '../src/aes';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from '../src/encoding';
import { generateVaultKey } from '../src/random';
import { NONCE_BYTES, TAG_BYTES } from '../src/types';

describe('AES-256-GCM', () => {
  it('round-trips plaintext through encrypt/decrypt', async () => {
    const key = generateVaultKey();
    const blob = await encrypt(key, utf8Encode('hello world'));
    const recovered = await decrypt(key, blob);
    expect(utf8Decode(recovered)).toBe('hello world');
  });

  it('produces a different ciphertext each time for the same plaintext', async () => {
    const key = generateVaultKey();
    const a = await encrypt(key, utf8Encode('same message'));
    const b = await encrypt(key, utf8Encode('same message'));
    expect(a).not.toBe(b);
  });

  it('blob layout: 12-byte nonce + ciphertext + 16-byte tag', async () => {
    const key = generateVaultKey();
    const blob = await encrypt(key, utf8Encode('x'));
    const parsed = parseBlob(blob);
    expect(parsed.nonce.length).toBe(NONCE_BYTES);
    expect(parsed.tag.length).toBe(TAG_BYTES);
    expect(parsed.ciphertext.length).toBe(1);
  });

  it('rejects a ciphertext tampered in any byte', async () => {
    const key = generateVaultKey();
    const blob = await encrypt(key, utf8Encode("don't tamper with me"));
    const bytes = fromBase64(blob);
    // Flip one bit in the ciphertext region (just after the nonce).
    bytes[NONCE_BYTES + 1] = (bytes[NONCE_BYTES + 1] ?? 0) ^ 0x01;
    const tamperedBlob = toBase64(bytes);
    await expect(decrypt(key, tamperedBlob)).rejects.toThrow();
  });

  it('rejects a tampered tag', async () => {
    const key = generateVaultKey();
    const blob = await encrypt(key, utf8Encode('integrity matters'));
    const bytes = fromBase64(blob);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0x01;
    await expect(decrypt(key, toBase64(bytes))).rejects.toThrow();
  });

  it('rejects a blob decrypted under the wrong key', async () => {
    const keyA = generateVaultKey();
    const keyB = generateVaultKey();
    const blob = await encrypt(keyA, utf8Encode('secret'));
    await expect(decrypt(keyB, blob)).rejects.toThrow();
  });

  it('rejects a blob too short to be valid', async () => {
    const key = generateVaultKey();
    await expect(decrypt(key, 'AAAA')).rejects.toThrow();
  });

  it('handles empty plaintext', async () => {
    const key = generateVaultKey();
    const blob = await encrypt(key, new Uint8Array(0));
    const recovered = await decrypt(key, blob);
    expect(recovered.length).toBe(0);
  });

  it('handles large plaintext (1 MiB of random bytes)', async () => {
    const key = generateVaultKey();
    const plaintext = new Uint8Array(1024 * 1024);
    // Web Crypto caps getRandomValues at 65,536 bytes per call. Fill in chunks.
    const CHUNK = 65536;
    for (let offset = 0; offset < plaintext.length; offset += CHUNK) {
      crypto.getRandomValues(plaintext.subarray(offset, offset + CHUNK));
    }
    const blob = await encrypt(key, plaintext);
    const recovered = await decrypt(key, blob);

    // Avoid Jest's deep-equality walk over a million elements — compare
    // length plus a cryptographic digest, which is effectively free.
    expect(recovered.length).toBe(plaintext.length);
    const [expectedHash, actualHash] = await Promise.all([
      crypto.subtle.digest('SHA-256', plaintext),
      crypto.subtle.digest('SHA-256', recovered),
    ]);
    expect(new Uint8Array(actualHash)).toEqual(new Uint8Array(expectedHash));
  });

  it('rejects keys that are not 32 bytes', async () => {
    await expect(
      encrypt(new Uint8Array(16), utf8Encode('x')),
    ).rejects.toThrow();
    await expect(
      encrypt(new Uint8Array(64), utf8Encode('x')),
    ).rejects.toThrow();
  });
});
