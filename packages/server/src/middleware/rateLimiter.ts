import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

/**
 * Rate limiter for login and salt endpoints.
 * Allows 10 requests per IP per 15-minute window.
 * Returns 429 (Too Many Requests) when exceeded.
 * Skipped entirely in test environment.
 */
export const authRateLimiter =
  process.env.NODE_ENV === "test"
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: { error: "Too many attempts. Try again later." },
        standardHeaders: true,
        legacyHeaders: false,
      });
