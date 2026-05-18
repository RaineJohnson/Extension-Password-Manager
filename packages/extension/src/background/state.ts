/**
 * Service-worker session state.
 *
 * Holds everything that survives a worker restart but not a browser close:
 *   - locked: is the vault locked?
 *   - accessToken / refreshToken: JWT pair from /auth/login
 *   - vaultKey: 32 bytes, base64-encoded for storage
 *
 * Everything is mirrored to `chrome.storage.session`. On cold start the
 * worker calls `rehydrate()` to repopulate the in-memory cache. The
 * vault key is held as raw bytes in memory but only ever base64'd into
 * storage — calling code uses `getVaultKey()` (returns Uint8Array) and
 * never touches the encoded form directly.
 *
 * Locking clears tokens and the vault key. The user must re-derive on
 * next unlock.
 */

import browser from 'webextension-polyfill';
import { fromBase64, toBase64 } from '@password-manager/crypto';

const STATE_KEY = 'state';

interface PersistedState {
  locked: boolean;
  /**
   * Logged-in user's email. Held in state because `changePassword` needs
   * to look up salts by email, and the popup shouldn't need to remember
   * it. Cleared on lock.
   */
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Base64-encoded 32-byte vault key, or null when locked. */
  vaultKey: string | null;
}

const lockedState: PersistedState = {
  locked: true,
  email: null,
  accessToken: null,
  refreshToken: null,
  vaultKey: null,
};

let cache: PersistedState = { ...lockedState };

export async function rehydrate(): Promise<void> {
  const stored = await browser.storage.session.get(STATE_KEY);
  const persisted = stored[STATE_KEY] as PersistedState | undefined;
  cache = persisted ?? { ...lockedState };
}

async function persist(): Promise<void> {
  await browser.storage.session.set({ [STATE_KEY]: cache });
}

export function isLocked(): boolean {
  return cache.locked;
}

export function getEmail(): string | null {
  return cache.email;
}

export function getAccessToken(): string | null {
  return cache.accessToken;
}

export function getRefreshToken(): string | null {
  return cache.refreshToken;
}

export function getVaultKey(): Uint8Array | null {
  return cache.vaultKey === null ? null : fromBase64(cache.vaultKey);
}

export async function setTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  cache = { ...cache, accessToken, refreshToken };
  await persist();
}

/**
 * Unlock the vault — sets the vault key, tokens, and clears the locked flag.
 * Replaces any previous session atomically.
 */
export async function unlock(input: {
  email: string;
  accessToken: string;
  refreshToken: string;
  vaultKey: Uint8Array;
}): Promise<void> {
  cache = {
    locked: false,
    email: input.email,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    vaultKey: toBase64(input.vaultKey),
  };
  await persist();
}

/** Lock the vault — wipes tokens and vault key. */
export async function lock(): Promise<void> {
  cache = { ...lockedState };
  await persist();
}

/** Reset state on extension install / update. */
export async function resetForInstall(): Promise<void> {
  cache = { ...lockedState };
  await persist();
}
