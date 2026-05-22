/**
 * Vault orchestrator. Runs in the background service worker.
 *
 * The popup hands us plaintext fields (site, username, password, notes).
 * We JSON-encode the username/password/notes, AES-256-GCM-encrypt it
 * under the vault key, and post `{site, encryptedBlob}` to the server.
 * The server never sees the plaintext.
 *
 * `list` decrypts every item; if a single blob's tag check fails we
 * skip that item rather than fail the whole list — a corrupt row
 * shouldn't lock the user out of the rest of the vault.
 */

import type { PlaintextPayload } from '@password-manager/shared';
import {
  decryptVaultItem,
  encryptVaultItem,
} from '@password-manager/crypto';
import { ApiError, type PopupVaultItem } from '../shared/messages';
import type { HttpClient, ServerVaultItem } from '../api/httpClient';
import * as state from './state';

export interface VaultDeps {
  http: HttpClient;
}

function requireVaultKey(): Uint8Array {
  const vaultKey = state.getVaultKey();
  if (vaultKey === null) {
    throw new ApiError('LOCKED', 'The vault is locked. Sign in first.');
  }
  return vaultKey;
}

function toPayload(input: {
  username: string;
  password: string;
  notes?: string;
}): PlaintextPayload {
  if (input.notes !== undefined && input.notes.length > 0) {
    return {
      username: input.username,
      password: input.password,
      notes: input.notes,
    };
  }
  return { username: input.username, password: input.password };
}

async function decryptToPopup(
  vaultKey: Uint8Array,
  item: ServerVaultItem,
): Promise<PopupVaultItem | null> {
  try {
    const payload = await decryptVaultItem(vaultKey, item.encryptedBlob);
    const result: PopupVaultItem = {
      id: item.id,
      site: item.site,
      username: payload.username,
      password: payload.password,
    };
    if (payload.notes !== undefined && payload.notes.length > 0) {
      result.notes = payload.notes;
    }
    return result;
  } catch {
    return null;
  }
}

export async function list(deps: VaultDeps): Promise<PopupVaultItem[]> {
  const vaultKey = requireVaultKey();
  try {
    const items = await deps.http.listVaultItems();
    const decrypted = await Promise.all(
      items.map((i) => decryptToPopup(vaultKey, i)),
    );
    return decrypted.filter((i): i is PopupVaultItem => i !== null);
  } finally {
    // `requireVaultKey` returns a fresh copy from state; zero it after use.
    vaultKey.fill(0);
  }
}

export async function create(
  deps: VaultDeps,
  input: {
    site: string;
    username: string;
    password: string;
    notes?: string;
  },
): Promise<PopupVaultItem> {
  const vaultKey = requireVaultKey();
  try {
    const encryptedBlob = await encryptVaultItem(vaultKey, toPayload(input));
    const created = await deps.http.createVaultItem({
      site: input.site,
      encryptedBlob,
    });
    const popupItem = await decryptToPopup(vaultKey, created);
    if (popupItem === null) {
      throw new ApiError(
        'DECRYPT_FAILED',
        'Server returned an item we could not decrypt.',
      );
    }
    return popupItem;
  } finally {
    vaultKey.fill(0);
  }
}

export async function update(
  deps: VaultDeps,
  input: {
    id: string;
    site: string;
    username: string;
    password: string;
    notes?: string;
  },
): Promise<PopupVaultItem> {
  const vaultKey = requireVaultKey();
  try {
    const encryptedBlob = await encryptVaultItem(vaultKey, toPayload(input));
    const updated = await deps.http.updateVaultItem(input.id, {
      site: input.site,
      encryptedBlob,
    });
    const popupItem = await decryptToPopup(vaultKey, updated);
    if (popupItem === null) {
      throw new ApiError(
        'DECRYPT_FAILED',
        'Server returned an item we could not decrypt.',
      );
    }
    return popupItem;
  } finally {
    vaultKey.fill(0);
  }
}

export async function remove(deps: VaultDeps, id: string): Promise<void> {
  // Doesn't strictly need the vault key, but locked vaults shouldn't
  // be allowed to mutate the server either.
  requireVaultKey().fill(0);
  await deps.http.deleteVaultItem(id);
}
