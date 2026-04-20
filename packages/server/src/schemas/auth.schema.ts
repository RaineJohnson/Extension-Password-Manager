import { z } from "zod";

/** POST /auth/register */
export const registerSchema = z.object({
  email: z.email(),
  authCredential: z.string().min(1),
  saltA: z.string().min(1),
  saltB: z.string().min(1),
  encryptedVaultKey: z.string().min(1),
});

/** POST /auth/login */
export const loginSchema = z.object({
  email: z.email(),
  authCredential: z.string().min(1),
});

/** POST /auth/refresh */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/** POST /auth/logout */
export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

/** POST /auth/change-password */
export const changePasswordSchema = z.object({
  oldAuthCredential: z.string().min(1),
  newAuthCredential: z.string().min(1),
  newEncryptedVaultKey: z.string().min(1),
  newSaltA: z.string().min(1),
  newSaltB: z.string().min(1),
});

/** GET /auth/salts — query parameter */
export const saltsQuerySchema = z.object({
  email: z.email(),
});
