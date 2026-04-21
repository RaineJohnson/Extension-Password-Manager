import request from "supertest";
import { app, cleanDatabase, closeDatabase } from "./setup";

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

/**
 * Helper that registers, logs in, and returns auth tokens.
 */
async function getAuthTokens() {
  await request(app).post("/auth/register").send({
    email: "test@example.com",
    authCredential: "test-auth-credential",
    saltA: "test-salt-a",
    saltB: "test-salt-b",
    encryptedVaultKey: "test-encrypted-vault-key",
  });

  const res = await request(app).post("/auth/login").send({
    email: "test@example.com",
    authCredential: "test-auth-credential",
  });

  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/**
 * Helper that creates a vault item and returns it.
 */
async function createTestItem(accessToken: string, site = "github.com") {
  const res = await request(app)
    .post("/vault/item")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      site,
      encryptedBlob: `encrypted-blob-for-${site}`,
    });

  return res.body;
}

describe("POST /vault/item", () => {
  it("creates a vault item and returns 201", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .post("/vault/item")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        site: "github.com",
        encryptedBlob: "test-encrypted-blob",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.site).toBe("github.com");
    expect(res.body.encrypted_blob).toBe("test-encrypted-blob");
    expect(res.body.version).toBe(1);
    expect(res.body).toHaveProperty("created_at");
    expect(res.body).toHaveProperty("updated_at");
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).post("/vault/item").send({
      site: "github.com",
      encryptedBlob: "test-encrypted-blob",
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .post("/vault/item")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ site: "github.com" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for empty site", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .post("/vault/item")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        site: "",
        encryptedBlob: "test-blob",
      });

    expect(res.status).toBe(400);
  });

  it("allows multiple items for the same site", async () => {
    const { accessToken } = await getAuthTokens();
    await createTestItem(accessToken, "github.com");
    await createTestItem(accessToken, "github.com");

    const res = await request(app)
      .get("/vault")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });
});

describe("GET /vault", () => {
  it("returns all items for the user", async () => {
    const { accessToken } = await getAuthTokens();
    await createTestItem(accessToken, "github.com");
    await createTestItem(accessToken, "gitlab.com");

    const res = await request(app)
      .get("/vault")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("filters by site when query param provided", async () => {
    const { accessToken } = await getAuthTokens();
    await createTestItem(accessToken, "github.com");
    await createTestItem(accessToken, "gitlab.com");

    const res = await request(app)
      .get("/vault")
      .query({ site: "github.com" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].site).toBe("github.com");
  });

  it("returns empty array when no items exist", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .get("/vault")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("does not return other users items", async () => {
    // Create and populate user 1
    const { accessToken: token1 } = await getAuthTokens();
    await createTestItem(token1, "github.com");

    // Create user 2
    await request(app).post("/auth/register").send({
      email: "other@example.com",
      authCredential: "other-credential",
      saltA: "other-salt-a",
      saltB: "other-salt-b",
      encryptedVaultKey: "other-vault-key",
    });

    const loginRes = await request(app).post("/auth/login").send({
      email: "other@example.com",
      authCredential: "other-credential",
    });
    const token2 = loginRes.body.accessToken;

    // User 2 should see no items
    const res = await request(app)
      .get("/vault")
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("returns no items for unmatched site filter", async () => {
    const { accessToken } = await getAuthTokens();
    await createTestItem(accessToken, "github.com");

    const res = await request(app)
      .get("/vault")
      .query({ site: "gitlab.com" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});

describe("PUT /vault/item/:id", () => {
  it("updates the encrypted blob", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.status).toBe(200);
    expect(res.body.encrypted_blob).toBe("updated-blob");
  });

  it("updates the site when provided", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        site: "new-site.com",
        encryptedBlob: "updated-blob",
      });

    expect(res.status).toBe(200);
    expect(res.body.site).toBe("new-site.com");
  });

  it("does not change the version", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.body.version).toBe(1);
  });

  it("returns 404 for non-existent item", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .put("/vault/item/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid UUID", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .put("/vault/item/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.status).toBe(400);
  });

  it("cannot update another users item", async () => {
    // User 1 creates an item
    const { accessToken: token1 } = await getAuthTokens();
    const item = await createTestItem(token1);

    // User 2 registers and logs in
    await request(app).post("/auth/register").send({
      email: "other@example.com",
      authCredential: "other-credential",
      saltA: "other-salt-a",
      saltB: "other-salt-b",
      encryptedVaultKey: "other-vault-key",
    });

    const loginRes = await request(app).post("/auth/login").send({
      email: "other@example.com",
      authCredential: "other-credential",
    });
    const token2 = loginRes.body.accessToken;

    // User 2 tries to update user 1's item
    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ encryptedBlob: "hacked-blob" });

    // Returns 404, not 403 — doesn't reveal the item exists
    expect(res.status).toBe(404);
  });

  it("preserves site when only blob is updated", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken, "github.com");

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.status).toBe(200);
    expect(res.body.site).toBe("github.com");
    expect(res.body.encrypted_blob).toBe("updated-blob");
  });

  it("updates the updated_at timestamp", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    // Small delay to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 50));

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.status).toBe(200);
    expect(new Date(res.body.updated_at).getTime()).toBeGreaterThan(
      new Date(item.updated_at).getTime(),
    );
  });

  it("returns 400 for missing encryptedBlob", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ site: "new-site.com" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /vault/item/:id", () => {
  it("deletes the item and returns 200", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    const deleteRes = await request(app)
      .delete(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(200);

    // Verify it's gone
    const getRes = await request(app)
      .get("/vault")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getRes.body.items).toHaveLength(0);
  });

  it("returns 404 for non-existent item", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .delete("/vault/item/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid UUID", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await request(app)
      .delete("/vault/item/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });

  it("cannot delete another users item", async () => {
    const { accessToken: token1 } = await getAuthTokens();
    const item = await createTestItem(token1);

    await request(app).post("/auth/register").send({
      email: "other@example.com",
      authCredential: "other-credential",
      saltA: "other-salt-a",
      saltB: "other-salt-b",
      encryptedVaultKey: "other-vault-key",
    });

    const loginRes = await request(app).post("/auth/login").send({
      email: "other@example.com",
      authCredential: "other-credential",
    });
    const token2 = loginRes.body.accessToken;

    const res = await request(app)
      .delete(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(404);

    // Verify the item still exists for user 1
    const getRes = await request(app)
      .get("/vault")
      .set("Authorization", `Bearer ${token1}`);

    expect(getRes.body.items).toHaveLength(1);
  });

  it("preserves site when only blob is updated", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken, "github.com");

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.status).toBe(200);
    expect(res.body.site).toBe("github.com");
    expect(res.body.encrypted_blob).toBe("updated-blob");
  });

  it("updates the updated_at timestamp", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    // Small delay to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 50));

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ encryptedBlob: "updated-blob" });

    expect(res.status).toBe(200);
    expect(new Date(res.body.updated_at).getTime()).toBeGreaterThan(
      new Date(item.updated_at).getTime(),
    );
  });

  it("returns 400 for missing encryptedBlob", async () => {
    const { accessToken } = await getAuthTokens();
    const item = await createTestItem(accessToken);

    const res = await request(app)
      .put(`/vault/item/${item.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ site: "new-site.com" });

    expect(res.status).toBe(400);
  });
});
