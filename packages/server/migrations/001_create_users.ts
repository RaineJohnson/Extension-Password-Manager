import { Knex } from "knex";

/**
 * Create the 'users' table.
 *
 * Stores account credentials and the encrypted vault key.
 * The server never sees plaintext passwords or encryption keys —
 * auth_hash is a bcrypt hash of the auth credential,
 * and encrypted_vault_key is the vault key wrapped under the derived key.
 */
export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("users", (table) => {
    // Primary key — uuid is a 128-bit random identifier, avoids
    // sequential IDs that leak user count
    table.uuid("id").primary().defaultTo(knex.fn.uuid());

    // Email must be unique — used for login and salt lookup
    table.string("email").notNullable().unique();

    // bcrypt hash of the auth credential (NOT the master password)
    table.string("auth_hash").notNullable();

    // Salts for Argon2id — not secret, but per-user
    table.string("salt_a").notNullable();
    table.string("salt_b").notNullable();

    // Vault key encrypted with the derived key (base64 blob)
    table.text("encrypted_vault_key").notNullable();

    // Timestamp — defaults to current time
    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
  });
}

/**
 * Drop the 'users' table.
 * Called when rolling back this migration.
 */
export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("users");
}
