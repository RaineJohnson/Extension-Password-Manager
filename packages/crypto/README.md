# @password-manager/crypto

Client-side cryptographic primitives for the password manager extension.
This package is a pure library — no extension APIs, no network, no
storage. The extension imports these functions; that's the entire
interface.

See the [design document][design] for the three-layer key hierarchy
(master password → derived key → vault key → vault items) and the
threat model this module implements.

[design]: https://docs.google.com/document/d/1bBKy-_0sNsH421WW63CQSVsW-JPp1lLEvCM6vf3tGWk/edit?usp=sharing

## Scope

- **Argon2id key derivation** (via `hash-wasm`). Default parameters:
  64 MiB memory, 3 iterations, parallelism 1, 32-byte output.
- **AES-256-GCM authenticated encryption** (via Web Crypto's `subtle`).
  12-byte random nonces, 16-byte tags.
- **Secure random bytes** for salts, nonces, and vault keys.
- **Vault key wrapping / unwrapping** under the derived key.
- **Vault item encryption / decryption** with JSON payloads.

The `PlaintextPayload` type (the decrypted shape of a vault item) is
defined in `@password-manager/shared` and imported from there — it is
the single source of truth shared with the server schema.

## Install & test

This is a workspace package. From the repo root:

```bash
npm install
npm test --workspace @password-manager/crypto
```

Or from inside `packages/crypto`:

```bash
npm test
```

Tests run against reduced Argon2id parameters (`memorySize: 8`,
`iterations: 1`) to keep the suite fast. The defaults exported from
`src/types.ts` remain at production values and are what the extension
uses at runtime.

## Usage

### Registration

```typescript
import {
  deriveMaterial,
  generateSalt,
  generateVaultKey,
  wrapVaultKey,
  zeroBuffer,
} from '@password-manager/crypto';

const saltA = generateSalt();
const saltB = generateSalt();
const { derivedKey, authCredential } = await deriveMaterial(
  masterPassword,
  saltA,
  saltB,
);
const vaultKey = generateVaultKey();
const encryptedVaultKey = await wrapVaultKey(vaultKey, derivedKey);

// POST /auth/register with:
//   email, authCredential, saltA, saltB, encryptedVaultKey
zeroBuffer(derivedKey);
// Keep `vaultKey` in service-worker memory for the session.
```

### Login

```typescript
import {
  deriveMaterial,
  unwrapVaultKey,
  zeroBuffer,
} from '@password-manager/crypto';

// After GET /auth/salts → { saltA, saltB }:
const { derivedKey, authCredential } = await deriveMaterial(
  masterPassword,
  saltA,
  saltB,
);

// POST /auth/login with authCredential
//   → server returns { accessToken, refreshToken, encryptedVaultKey }
const vaultKey = await unwrapVaultKey(encryptedVaultKey, derivedKey);
zeroBuffer(derivedKey);
```

### Encrypting a vault item

```typescript
import { encryptVaultItem } from '@password-manager/crypto';
import type { PlaintextPayload } from '@password-manager/shared';

const payload: PlaintextPayload = {
  username: 'alice@example.com',
  password: 'hunter2',
  notes: 'optional',
};
const blob = await encryptVaultItem(vaultKey, payload);
// POST /vault/item with { site, encryptedBlob: blob }
```

### Decrypting a vault item

```typescript
import { decryptVaultItem } from '@password-manager/crypto';

const { username, password, notes } = await decryptVaultItem(vaultKey, blob);
```

## Module layout

```
src/
  index.ts       # public API
  types.ts       # size constants, default params, blob/material types
  random.ts      # salt / nonce / vault key generation
  encoding.ts    # base64, UTF-8, byte concatenation
  buffer.ts      # zeroBuffer (best-effort memory scrub)
  kdf.ts         # Argon2id — deriveKey, deriveMaterial
  aes.ts         # AES-256-GCM — encrypt, decrypt, parseBlob
  vault.ts       # wrap/unwrap vault key, encrypt/decrypt vault item

tests/
  setup.ts              # polyfills globalThis.crypto for old Node
  random.test.ts        # size and uniqueness checks
  aes.test.ts           # round-trip, tampering, wrong-key, edge sizes
  kdf.test.ts           # determinism, salt/password sensitivity, independence
  vault.test.ts         # wrap/unwrap + payload round-trip + bad-JSON path
  roundtrip.test.ts     # full register/login/encrypt/decrypt flow
```

## Caveats

- **`zeroBuffer` is best-effort.** JavaScript gives no guarantee that
  every copy of the bytes has been scrubbed from the V8 heap. Strings
  are immutable and the GC may have made copies during normal operation.
  Always hold key material in `Uint8Array` (never strings) and zero the
  buffer as soon as the material is no longer needed. Treat this as
  defense-in-depth, not a guarantee.

- **AES-GCM nonce reuse is catastrophic.** Reusing a nonce under the
  same key lets an attacker recover XOR differences between plaintexts
  and forge authentication tags. This module generates nonces via the
  CSPRNG on every `encrypt()` call — never hand-roll calls to
  `crypto.subtle.encrypt` elsewhere in the codebase.

- **The default Argon2id parameters are not decorative.** They're what
  makes offline brute-force attacks expensive. Tests override them for
  speed; the extension must not.

- **Web Crypto availability.** In the service worker, `crypto.subtle`
  is present. In Node ≥ 19, `globalThis.crypto` is present. The Jest
  setup polyfills it on older Node versions.
