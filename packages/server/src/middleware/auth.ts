import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Extends Express's Request type to include the authenticated user's ID.
 * After this middleware runs, req.userId is guaranteed to be set.
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * JWT verification middleware.
 * Reads the Authorization header, verifies the token, and attaches
 * the user ID to the request object for downstream handlers.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  // Expect format: "Bearer <token>"
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = header.split(" ")[1];

  try {
    // jwt.verify throws if the token is expired, malformed, or
    // signed with a different secret
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
