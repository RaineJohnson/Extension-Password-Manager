import { env } from "./src/config/env";

export default {
  client: "pg",
  connection: env.DATABASE_URL,
  migrations: {
    directory: "./migrations",
    extension: "ts",
  },
};
