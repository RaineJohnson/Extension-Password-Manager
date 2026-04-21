import app from "../src/app";
import { db } from "../src/config/db";

/**
 * Clears all rows from every table (except migrations).
 * Called before each test to ensure a clean state.
 * Order matters — delete from child tables first to
 * respect foreign key constraints.
 */
export async function cleanDatabase() {
  await db("refresh_tokens").del();
  await db("vault_items").del();
  await db("users").del();
}

/**
 * Closes the database connection pool.
 * Called once after all tests finish to prevent
 * Jest from hanging on open connections.
 */
export async function closeDatabase() {
  await db.destroy();
}

export { app, db };
