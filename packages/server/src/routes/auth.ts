import { Router, Request, Response } from "express";
import { validateBody, validateQuery } from "../middleware/validate";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  saltsQuerySchema,
} from "../schemas/auth.schema";
import {
  registerUser,
  getSalts,
  loginUser,
  refreshTokens,
  logoutUser,
  changePassword,
} from "../services/auth.service";

const router = Router();

/** POST /auth/register */
router.post(
  "/register",
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    const result = await registerUser(req.body);

    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json(result.user);
  },
);

/** GET /auth/salts */
router.get(
  "/salts",
  authRateLimiter,
  validateQuery(saltsQuerySchema),
  async (req: Request, res: Response) => {
    const { email } = req.query as { email: string };
    const salts = await getSalts(email);
    res.status(200).json(salts);
  },
);

/** POST /auth/login */
router.post(
  "/login",
  authRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response) => {
    const result = await loginUser(req.body);

    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      encryptedVaultKey: result.encryptedVaultKey,
    });
  },
);

/** POST /auth/refresh */
router.post(
  "/refresh",
  validateBody(refreshSchema),
  async (req: Request, res: Response) => {
    const result = await refreshTokens(req.body.refreshToken);

    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  },
);

/** POST /auth/logout — requires JWT */
router.post(
  "/logout",
  requireAuth,
  validateBody(logoutSchema),
  async (req: Request, res: Response) => {
    await logoutUser(req.body.refreshToken);
    res.status(200).json({ message: "Logged out successfully" });
  },
);

/** POST /auth/change-password — requires JWT */
router.post(
  "/change-password",
  requireAuth,
  validateBody(changePasswordSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await changePassword(req.userId!, req.body);

    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(200).json({ message: "Password changed successfully" });
  },
);

export default router;
