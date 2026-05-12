/**
 * In-memory mock of the API client.
 *
 * Lets us iterate on the popup's auth screens without a live server. Stores
 * registered emails in a Map so register/login can interact (register an
 * email, then log in with it). Simulates latency with `delayMs` so loading
 * states are exercisable.
 *
 * Magic inputs to drive UI states:
 *   - email "taken@example.com" is pre-registered → register fails 409.
 *   - email "offline@example.com" → both calls reject with NETWORK.
 *   - password "wrongpass" on login → INVALID_CREDENTIALS.
 *
 * Otherwise: register stores the email; login succeeds iff the email is
 * registered and password matches what register saw.
 */

import { ApiClient, ApiError } from './client';

export interface MockApiClientOptions {
  /** Artificial latency in ms applied to every call. Default: 400. */
  delayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockApiClient implements ApiClient {
  private readonly users = new Map<string, string>();
  private readonly delayMs: number;

  constructor(opts: MockApiClientOptions = {}) {
    this.delayMs = opts.delayMs ?? 400;
    this.users.set('taken@example.com', 'correct horse battery staple');
  }

  async register(email: string, masterPassword: string): Promise<void> {
    await sleep(this.delayMs);
    if (email === 'offline@example.com') {
      throw new ApiError('NETWORK', 'Could not reach the server.');
    }
    if (this.users.has(email.toLowerCase())) {
      throw new ApiError(
        'EMAIL_TAKEN',
        'An account with that email already exists.',
      );
    }
    this.users.set(email.toLowerCase(), masterPassword);
  }

  async login(email: string, masterPassword: string): Promise<void> {
    await sleep(this.delayMs);
    if (email === 'offline@example.com') {
      throw new ApiError('NETWORK', 'Could not reach the server.');
    }
    const stored = this.users.get(email.toLowerCase());
    if (stored === undefined || stored !== masterPassword) {
      throw new ApiError(
        'INVALID_CREDENTIALS',
        'That email and master password did not match.',
      );
    }
  }
}
