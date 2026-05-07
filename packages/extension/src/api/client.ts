/**
 * API client contract for the popup.
 *
 * The UI talks to auth via this interface only — never directly to fetch.
 * The mock implementation in `mockClient.ts` returns canned responses so
 * we can iterate on the screens without a live server. Once the real
 * endpoints are ready, a `httpClient.ts` will implement the same shape
 * (deriving auth credentials, calling /auth/* and unwrapping the vault
 * key) and the popup swap is a one-line change in `index.ts`.
 *
 * Inputs are user-facing (email + master password). Crypto and HTTP
 * details are the implementation's problem.
 */

export type ApiErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'WEAK_PASSWORD'
  | 'NETWORK'
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

export interface ApiClient {
  register(email: string, masterPassword: string): Promise<void>;
  login(email: string, masterPassword: string): Promise<void>;
}
