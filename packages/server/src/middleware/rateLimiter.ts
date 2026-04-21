import rateLimit, { Options } from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

/**
 * Shared rate limit configuration.
 * Exported so tests can use the same settings.
 */
export const rateLimitConfig: Partial<Options> = {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * Rate limiter for login and salt endpoints.
 * Skipped entirely in test environment.
 */
export const authRateLimiter =
  process.env.NODE_ENV === "test"
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : rateLimit(rateLimitConfig);
