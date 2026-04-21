import { db } from "../config/db";

/**
 * Fetch all vault items for a user.
 * Optionally filters by site hostname for autofill.
 */
export async function getVaultItems(userId: string, site?: string) {
  const query = db("vault_items")
    .where({ user_id: userId })
    .select(
      "id",
      "site",
      "encrypted_blob",
      "version",
      "created_at",
      "updated_at",
    );

  if (site) {
    query.andWhere({ site });
  }

  return query;
}

/**
 * Create a new vault item.
 * Sets version to 1 and generates timestamps automatically.
 */
export async function createVaultItem(
  userId: string,
  data: { site: string; encryptedBlob: string },
) {
  const [item] = await db("vault_items")
    .insert({
      user_id: userId,
      site: data.site,
      encrypted_blob: data.encryptedBlob,
      version: 1,
    })
    .returning([
      "id",
      "site",
      "encrypted_blob",
      "version",
      "created_at",
      "updated_at",
    ]);

  return item;
}

/**
 * Update an existing vault item.
 *
 * The WHERE clause includes user_id to prevent a user from
 * modifying another user's items. Returns null if no matching
 * item is found (either it doesn't exist or it belongs to
 * someone else — we don't distinguish, to avoid leaking
 * item existence).
 */
export async function updateVaultItem(
  userId: string,
  itemId: string,
  data: { site?: string; encryptedBlob: string },
) {
  const updateFields: Record<string, unknown> = {
    encrypted_blob: data.encryptedBlob,
    updated_at: db.fn.now(),
  };

  if (data.site) {
    updateFields.site = data.site;
  }

  const [item] = await db("vault_items")
    .where({ id: itemId, user_id: userId })
    .update(updateFields)
    .returning([
      "id",
      "site",
      "encrypted_blob",
      "version",
      "created_at",
      "updated_at",
    ]);

  return item || null;
}

/**
 * Delete a vault item.
 * Returns true if a row was deleted, false if no matching item
 * was found (wrong ID or wrong user).
 */
export async function deleteVaultItem(userId: string, itemId: string) {
  const count = await db("vault_items")
    .where({ id: itemId, user_id: userId })
    .del();

  // count is the number of rows deleted — 0 means not found
  return count > 0;
}
