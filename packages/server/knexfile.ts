import "dotenv/config";
import { env } from "./src/config/env";

/**
 * Knex CLI configuration.
 * Used by commands like `npx knex migrate:latest`.
 * Reuses the same DATABASE_URL from env for single source of truth.
 */
export default {
  client: "pg",
  connection: env.DATABASE_URL,
  migrations: {
    directory: "./migrations",
    extension: "ts",
  },
};
