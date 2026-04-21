import { z } from "zod";

/** Validate :id param is a valid UUID */
export const vaultItemParamSchema = z.object({
  id: z.uuid(),
});

/** POST /vault/item */
export const createVaultItemSchema = z.object({
  site: z.string().min(1),
  encryptedBlob: z.string().min(1),
});

/** PUT /vault/item/:id */
export const updateVaultItemSchema = z.object({
  site: z.string().min(1).optional(),
  encryptedBlob: z.string().min(1),
});
