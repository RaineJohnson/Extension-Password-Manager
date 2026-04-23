/**
 * @password-manager/crypto
 *
 * Client-side cryptographic primitives for the password manager extension.
 * Pure library: no extension APIs, no network calls, no storage.
 *
 * See the design document for the three-layer key hierarchy (master
 * password → derived key → vault key → vault items) and the threat model.
 *
 * `PlaintextPayload` (the decrypted shape of a vault item) lives in
 * `@password-manager/shared`. Import it from there.
 */

export * from './types';
export { generateSalt, generateNonce, generateVaultKey } from './random';
export { deriveKey, deriveMaterial } from './kdf';
export { encrypt, decrypt, parseBlob } from './aes';
export {
  wrapVaultKey,
  unwrapVaultKey,
  encryptVaultItem,
  decryptVaultItem,
} from './vault';
export { zeroBuffer } from './buffer';
export {
  utf8Encode,
  utf8Decode,
  toBase64,
  fromBase64,
  concatBytes,
} from './encoding';
