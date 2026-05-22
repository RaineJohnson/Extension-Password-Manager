/**
 * Thin typed wrapper around the server's HTTP API.
 *
 * Transport only: no Argon2id, no AES, no token storage. The service
 * worker's auth and vault orchestrators do the crypto and supply the
 * access token via the injected `TokenStore`. We translate the server's
 * snake_case fields to camelCase here so callers see one consistent shape.
 *
 * On 401, we call `tokens.refresh()` once and retry the original request.
 * If the refresh fails or the retry still 401s, we throw
 * `ApiError('UNAUTHORIZED', ...)` — the caller is expected to lock the
 * vault and route the user back to login.
 */

import type {
  CreateVaultItemRequest,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  SaltsResponse,
  UpdateVaultItemRequest,
} from '@password-manager/shared';
import { ApiError, type ApiErrorCode } from '../shared/messages';

/** Wire-format vault item as the server emits it (snake_case). */
interface WireVaultItem {
  id: string;
  site: string;
  encrypted_blob: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Caller-facing vault item shape (camelCase). */
export interface ServerVaultItem {
  id: string;
  site: string;
  encryptedBlob: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function toServerVaultItem(w: WireVaultItem): ServerVaultItem {
  return {
    id: w.id,
    site: w.site,
    encryptedBlob: w.encrypted_blob,
    version: w.version,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

/**
 * Token storage contract. The service worker plugs in a session-backed
 * implementation; tests can pass an in-memory stub.
 */
export interface TokenStore {
  getAccessToken(): string | null;
  /**
   * Trade the stored refresh token for a fresh access+refresh pair.
   * Returns the new access token, or null if the refresh token is
   * missing/revoked/expired. Implementations persist the new pair.
   */
  refresh(): Promise<string | null>;
  /** Clear all tokens (called on hard logout / 401 after refresh). */
  clear(): Promise<void>;
}

interface RequestOpts {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  auth?: boolean;
}

export interface HttpClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Override `fetch` for tests. Defaults to the global. */
  fetchImpl?: typeof fetch;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenStore;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async register(body: RegisterRequest): Promise<void> {
    await this.send({ method: 'POST', path: '/auth/register', body });
  }

  async getSalts(email: string): Promise<SaltsResponse> {
    const params = new URLSearchParams({ email });
    return this.send<SaltsResponse>({
      method: 'GET',
      path: `/auth/salts?${params.toString()}`,
    });
  }

  async login(body: LoginRequest): Promise<LoginResponse> {
    return this.send<LoginResponse>({
      method: 'POST',
      path: '/auth/login',
      body,
    });
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return this.send<RefreshResponse>({
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken },
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.send({
      method: 'POST',
      path: '/auth/logout',
      body: { refreshToken },
      auth: true,
    });
  }

  async changePassword(body: {
    oldAuthCredential: string;
    newAuthCredential: string;
    newEncryptedVaultKey: string;
    newSaltA: string;
    newSaltB: string;
  }): Promise<void> {
    await this.send({
      method: 'POST',
      path: '/auth/change-password',
      body,
      auth: true,
    });
  }

  async listVaultItems(): Promise<ServerVaultItem[]> {
    const res = await this.send<{ items: WireVaultItem[] }>({
      method: 'GET',
      path: '/vault',
      auth: true,
    });
    return res.items.map(toServerVaultItem);
  }

  async createVaultItem(body: CreateVaultItemRequest): Promise<ServerVaultItem> {
    const w = await this.send<WireVaultItem>({
      method: 'POST',
      path: '/vault/item',
      body,
      auth: true,
    });
    return toServerVaultItem(w);
  }

  async updateVaultItem(
    id: string,
    body: UpdateVaultItemRequest,
  ): Promise<ServerVaultItem> {
    const w = await this.send<WireVaultItem>({
      method: 'PUT',
      path: `/vault/item/${encodeURIComponent(id)}`,
      body,
      auth: true,
    });
    return toServerVaultItem(w);
  }

  async deleteVaultItem(id: string): Promise<void> {
    await this.send({
      method: 'DELETE',
      path: `/vault/item/${encodeURIComponent(id)}`,
      auth: true,
    });
  }

  private async send<T = unknown>(opts: RequestOpts): Promise<T> {
    const first = await this.attempt(opts, this.tokens.getAccessToken());
    if (first.status !== 401 || !opts.auth) {
      return this.unwrap<T>(first);
    }
    const refreshed = await this.tokens.refresh();
    if (refreshed === null) {
      await this.tokens.clear();
      throw new ApiError('UNAUTHORIZED', 'Your session expired. Please sign in again.');
    }
    // Retry once with the fresh token. A second 401 is genuinely
    // ambiguous: the token *was* valid moments ago, so the more likely
    // cause is an in-payload check (e.g. /auth/change-password rejecting
    // a wrong `oldAuthCredential`). Surface it as UNAUTHORIZED and let
    // the orchestrator decide whether to lock or remap the error.
    const retry = await this.attempt(opts, refreshed);
    return this.unwrap<T>(retry);
  }

  private async attempt(
    opts: RequestOpts,
    accessToken: string | null,
  ): Promise<Response> {
    const headers = new Headers();
    if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
    if (opts.auth && accessToken !== null) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    try {
      return await this.fetchImpl(`${this.baseUrl}${opts.path}`, {
        method: opts.method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new ApiError(
        'NETWORK',
        `Could not reach the server (${e instanceof Error ? e.message : 'unknown error'}).`,
      );
    }
  }

  private async unwrap<T>(res: Response): Promise<T> {
    if (res.ok) {
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text.length === 0 ? undefined : JSON.parse(text)) as T;
    }
    let serverMessage = `Request failed with status ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error.length > 0) {
        serverMessage = body.error;
      }
    } catch {
      // body was not JSON; keep the generic message
    }
    throw new ApiError(httpStatusToCode(res.status), serverMessage);
  }
}

function httpStatusToCode(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'EMAIL_TAKEN';
  if (status >= 500) return 'NETWORK';
  return 'UNKNOWN';
}
