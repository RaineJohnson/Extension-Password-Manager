import { Knex } from "knex";

/**
 * Create the 'vault_items' table.
 *
 * Each row is one saved credential. The server stores the site
 * in plaintext (for filtering) and everything else as an opaque
 * encrypted blob that only the client can decrypt.
 */
export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("vault_items", (table) => {
    // Primary key
    table.uuid("id").primary().defaultTo(knex.fn.uuid());

    // Foreign key — links this item to its owner.
    // onDelete("CASCADE") means if a user is deleted,
    // all their vault items are automatically deleted too.
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // Plaintext hostname — enables server-side filtering
    // for the GET /vault?site=hostname query
    table.string("site").notNullable();

    // The encrypted payload containing username, password, and notes.
    // Opaque to the server — base64(nonce + ciphertext + auth_tag)
    table.text("encrypted_blob").notNullable();

    // Incremented on every update — provides a migration path
    // if the encryption scheme changes in the future
    table.integer("version").notNullable().defaultTo(1);

    // Timestamps
    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
    table.timestamp("updated_at").defaultTo(knex.fn.now()).notNullable();

    // Index on user_id + site for fast lookups during autofill.
    // The autofill query is: WHERE user_id = ? AND site = ?
    table.index(["user_id", "site"]);
  });
}

/**
 * Drop the 'vault_items' table.
 */
export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("vault_items");
}
