/**
 * Autofill lookup. Runs in the background service worker.
 *
 * Phase 3 stand-in for the eventual real vault query: an in-memory
 * list of credentials keyed by exact HTTPS origin. The shape of the
 * functions below — `listMatches` returns metadata only, `getCredentials`
 * returns plaintext for one item — is the contract we want to keep
 * once the real lookup lands; only the data source changes.
 *
 * TODO(phase-3.5): Replace the in-memory store with the real path:
 *   1. Call `vault.list(deps)` (or a future filtered variant) to fetch
 *      and decrypt items under the in-memory vault key.
 *   2. Filter by stored site origin (exact match for now — see
 *      the subdomain TODO in `matchesOrigin`).
 *   3. Map matches to `{ id, username }` for `listMatches`.
 *   4. For `getCredentials`, re-fetch the single item by id, re-verify
 *      its site against the caller-supplied hostname, and return
 *      `{ username, password }` from the decrypted payload.
 * The mock resets on every worker cold start; nothing here is persisted.
 */

import { ApiError, type AutofillMatch } from '../shared/messages';

interface MockVaultEntry {
  id: string;
  origin: string;
  username: string;
  password: string;
}

const mockStore: MockVaultEntry[] = [
  {
    id: 'mock-1',
    origin: 'https://example.com',
    username: 'alice@example.com',
    password: 'demo-password-1',
  },
  {
    id: 'mock-2',
    origin: 'https://example.com',
    username: 'bob@example.com',
    password: 'demo-password-2',
  },
  {
    id: 'mock-3',
    origin: 'https://github.com',
    username: 'octocat',
    password: 'demo-password-3',
  },
];

function matchesOrigin(entry: MockVaultEntry, origin: string): boolean {
  // TODO(phase-3.5): subdomain policy. Today an `accounts.google.com`
  // credential will not autofill on `mail.google.com`. A real
  // implementation needs the Public Suffix List plus a per-item match
  // policy (exact / parent-domain / regex) the user can configure.
  return entry.origin === origin;
}

export function listMatches(origin: string): AutofillMatch[] {
  return mockStore
    .filter((entry) => matchesOrigin(entry, origin))
    .map(({ id, username }) => ({ id, username }));
}

export function getCredentials(
  id: string,
  origin: string,
): { username: string; password: string } {
  const entry = mockStore.find((e) => e.id === id);
  // Collapse "unknown id" and "id belongs to a different origin" into
  // a single error so a probing caller can't distinguish the two and
  // can't request credentials for a site it isn't running on.
  if (entry === undefined || !matchesOrigin(entry, origin)) {
    throw new ApiError('NOT_FOUND', 'No matching credential.');
  }
  return { username: entry.username, password: entry.password };
}
