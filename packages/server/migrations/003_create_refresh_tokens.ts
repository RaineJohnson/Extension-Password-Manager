import { Knex } from "knex";

/**
 * Create the 'refresh_tokens' table.
 *
 * Stores opaque refresh tokens for session management.
 * Supports token rotation: each use revokes the old token
 * and issues a new one. Reuse of a revoked token triggers
 * invalidation of all tokens for that user.
 */
export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("refresh_tokens", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());

    // The opaque token string — indexed for fast lookups
    table.string("token").notNullable().unique();

    // Owner of this token
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // Whether this token has been used or invalidated
    table.boolean("revoked").notNullable().defaultTo(false);

    // When this token expires (7 days from creation)
    table.timestamp("expires_at").notNullable();

    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("refresh_tokens");
}
