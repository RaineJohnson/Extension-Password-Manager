/**
 * Typed message protocol between popup and background service worker.
 *
 * Wire format: every reply is an `Envelope<S>` — either `{ ok: true, data }`
 * or `{ ok: false, code, message }`. The popup-side `sendMessage` helper
 * unwraps the envelope and throws an `ApiError` on the error branch so
 * pages can `try/catch` without inspecting tagged unions.
 *
 * The protocol is intentionally high-level: auth and vault operations
 * (re)derive Argon2id material, talk HTTP, and run AES-GCM inside the
 * service worker. The popup never sees the vault key, the derived key,
 * salts, tokens, or encrypted blobs — only plaintext fields it already
 * has from user input.
 */

import browser from 'webextension-polyfill';

export type ApiErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'WEAK_PASSWORD'
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'LOCKED'
  | 'NOT_FOUND'
  | 'DECRYPT_FAILED'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Decrypted vault item as seen by the popup. The wrapped/encrypted form
 * never leaves the service worker.
 */
export interface PopupVaultItem {
  id: string;
  site: string;
  username: string;
  password: string;
  notes?: string;
}

export type PingRequest = { type: 'ping' };
export type PingSuccess = { type: 'ping'; receivedAt: number };

export type GetStatusRequest = { type: 'getStatus' };
export type GetStatusSuccess = { type: 'getStatus'; locked: boolean };

export type AuthRegisterRequest = {
  type: 'auth/register';
  email: string;
  password: string;
};
export type AuthRegisterSuccess = { type: 'auth/register' };

export type AuthLoginRequest = {
  type: 'auth/login';
  email: string;
  password: string;
};
export type AuthLoginSuccess = { type: 'auth/login' };

export type AuthLockRequest = { type: 'auth/lock' };
export type AuthLockSuccess = { type: 'auth/lock' };

export type AuthChangePasswordRequest = {
  type: 'auth/changePassword';
  current: string;
  next: string;
};
export type AuthChangePasswordSuccess = { type: 'auth/changePassword' };

export type VaultListRequest = { type: 'vault/list' };
export type VaultListSuccess = { type: 'vault/list'; items: PopupVaultItem[] };

export type VaultCreateRequest = {
  type: 'vault/create';
  site: string;
  username: string;
  password: string;
  notes?: string;
};
export type VaultCreateSuccess = { type: 'vault/create'; item: PopupVaultItem };

export type VaultUpdateRequest = {
  type: 'vault/update';
  id: string;
  site: string;
  username: string;
  password: string;
  notes?: string;
};
export type VaultUpdateSuccess = { type: 'vault/update'; item: PopupVaultItem };

export type VaultDeleteRequest = { type: 'vault/delete'; id: string };
export type VaultDeleteSuccess = { type: 'vault/delete' };

export type Request =
  | PingRequest
  | GetStatusRequest
  | AuthRegisterRequest
  | AuthLoginRequest
  | AuthLockRequest
  | AuthChangePasswordRequest
  | VaultListRequest
  | VaultCreateRequest
  | VaultUpdateRequest
  | VaultDeleteRequest;

export type Success =
  | PingSuccess
  | GetStatusSuccess
  | AuthRegisterSuccess
  | AuthLoginSuccess
  | AuthLockSuccess
  | AuthChangePasswordSuccess
  | VaultListSuccess
  | VaultCreateSuccess
  | VaultUpdateSuccess
  | VaultDeleteSuccess;

export type SuccessFor<R extends Request> = Extract<Success, { type: R['type'] }>;

export type Envelope<S extends Success = Success> =
  | { ok: true; data: S }
  | { ok: false; code: ApiErrorCode; message: string };

/**
 * Send a typed request to the background worker and unwrap the envelope.
 *
 * Throws `ApiError` if the worker returned a non-ok envelope (e.g. invalid
 * credentials, network failure, vault locked). Throws a plain `Error` if
 * the underlying `runtime.sendMessage` call fails (extension uninstalled,
 * worker crashed mid-call) — those are non-retryable from the popup's
 * perspective.
 */
export async function sendMessage<R extends Request>(req: R): Promise<SuccessFor<R>> {
  const env = (await browser.runtime.sendMessage(req)) as Envelope<SuccessFor<R>>;
  if (!env.ok) throw new ApiError(env.code, env.message);
  return env.data;
}
