import rateLimit from "express-rate-limit";

/**
 * Rate limiter for login and salt endpoints.
 * Allows 10 requests per IP per 15-minute window.
 * Returns 429 (Too Many Requests) when exceeded.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 10,
  message: { error: "Too many attempts. Try again later." },
  standardHeaders: true, // Sends rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disables the older X-RateLimit-* headers
});
