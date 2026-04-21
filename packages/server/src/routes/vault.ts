import { Router, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validate";
import {
  createVaultItemSchema,
  updateVaultItemSchema,
  vaultItemParamSchema,
} from "../schemas/vault.schema";
import {
  getVaultItems,
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
} from "../services/vault.service";

const router = Router();

// All vault routes require authentication
router.use(requireAuth);

/**
 * GET /vault
 * Fetch all vault items, optionally filtered by ?site=hostname
 */
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  const site = req.query.site as string | undefined;
  const items = await getVaultItems(req.userId!, site);
  res.status(200).json({ items });
});

/**
 * POST /vault/item
 * Create a new vault item
 */
router.post(
  "/item",
  validateBody(createVaultItemSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const item = await createVaultItem(req.userId!, req.body);
    res.status(201).json(item);
  },
);

/**
 * PUT /vault/item/:id
 * Update an existing vault item
 */
router.put(
  "/item/:id",
  validateParams(vaultItemParamSchema),
  validateBody(updateVaultItemSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const itemId = req.params.id as string;
    const item = await updateVaultItem(req.userId!, itemId, req.body);

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.status(200).json(item);
  },
);

/**
 * DELETE /vault/item/:id
 * Delete a vault item permanently
 */
router.delete(
  "/item/:id",
  validateParams(vaultItemParamSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const itemId = req.params.id as string;
    const deleted = await deleteVaultItem(req.userId!, itemId);

    if (!deleted) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.status(200).json({ message: "Item deleted successfully" });
  },
);

export default router;
