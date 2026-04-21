import request from "supertest";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import { corsOptions } from "../src/config/cors";
import { rateLimitConfig } from "../src/middleware/rateLimiter";
import { cleanDatabase, closeDatabase } from "./setup";

/**
 * Create a separate app with rate limiting enabled.
 * Uses the same config as production, with a keyGenerator
 * added for supertest compatibility and a lower max for
 * faster tests.
 */
const rateLimitedApp = (() => {
  const app = express();
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json());

  const testLimiter = rateLimit({
    ...rateLimitConfig,
    keyGenerator: () => "test-client",
  });

  app.get("/auth/salts", testLimiter, async (_req, res) => {
    res.status(200).json({ saltA: "test", saltB: "test" });
  });

  return app;
})();

beforeAll(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("Rate limiting", () => {
  it("allows requests under the limit", async () => {
    const res = await request(rateLimitedApp)
      .get("/auth/salts")
      .query({ email: "test@example.com" });

    expect(res.status).toBe(200);
  });

  it("blocks requests over the limit with 429", async () => {
    const limit = rateLimitConfig.limit as number;
    for (let i = 0; i < limit; i++) {
      await request(rateLimitedApp)
        .get("/auth/salts")
        .query({ email: "test@example.com" });
    }

    const res = await request(rateLimitedApp)
      .get("/auth/salts")
      .query({ email: "test@example.com" });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Too many attempts. Try again later.");
  });

  it("returns rate limit headers", async () => {
    const res = await request(rateLimitedApp)
      .get("/auth/salts")
      .query({ email: "test@example.com" });

    expect(res.headers).toHaveProperty("ratelimit-limit");
    expect(res.headers).toHaveProperty("ratelimit-remaining");
  });
});
