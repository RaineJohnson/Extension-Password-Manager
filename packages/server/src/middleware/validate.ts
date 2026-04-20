import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

/**
 * Returns Express middleware that validates req.body against the given schema.
 * On success, replaces req.body with the parsed (typed) data.
 * On failure, returns 400 with the validation error details.
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.issues[0].message });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Same as validateBody but validates req.query instead.
 * Stores validated data in res.locals.query since req.query
 * has a fixed type (ParsedQs) that can't be reassigned.
 */
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: result.error.issues[0].message });
      return;
    }
    res.locals.query = result.data;
    next();
  };
}
