/**
 * API client entrypoint for the popup.
 *
 * Today this returns the mock client. When Sebastian's backend is wired
 * up, replace the body of `getApiClient` with the real HTTP implementation
 * — the popup imports `getApiClient()` and nothing in the UI changes.
 */

import { ApiClient } from './client';
import { MockApiClient } from './mockClient';

export { ApiError } from './client';
export type { ApiClient, ApiErrorCode } from './client';

let instance: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (instance === null) instance = new MockApiClient();
  return instance;
}

export function __setApiClientForTests(client: ApiClient | null): void {
  instance = client;
}
