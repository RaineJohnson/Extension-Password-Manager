import request from "supertest";
import { app, db, cleanDatabase, closeDatabase } from "./setup";

// Clean the database before each test so tests don't
// interfere with each other
beforeEach(async () => {
  await cleanDatabase();
});

// Close the database connection after all tests finish
afterAll(async () => {
  await closeDatabase();
});

/**
 * Helper that registers a test user and returns the response.
 * Used by most tests since login requires a registered user.
 */
async function registerTestUser() {
  return request(app).post("/auth/register").send({
    email: "test@example.com",
    authCredential: "test-auth-credential",
    saltA: "test-salt-a",
    saltB: "test-salt-b",
    encryptedVaultKey: "test-encrypted-vault-key",
  });
}

/**
 * Helper that registers and logs in a test user.
 * Returns the access token, refresh token, and user ID.
 */
async function loginTestUser() {
  await registerTestUser();

  const res = await request(app).post("/auth/login").send({
    email: "test@example.com",
    authCredential: "test-auth-credential",
  });

  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    encryptedVaultKey: res.body.encryptedVaultKey,
  };
}

describe("POST /auth/register", () => {
  it("creates a new user and returns 201", async () => {
    const res = await registerTestUser();

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.email).toBe("test@example.com");
    expect(res.body).toHaveProperty("created_at");
    // Should never return the auth hash
    expect(res.body).not.toHaveProperty("auth_hash");
  });

  it("returns 409 for duplicate email", async () => {
    await registerTestUser();
    const res = await registerTestUser();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email already in use");
  });

  it("returns 400 for missing fields", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "not-an-email",
      authCredential: "test",
      saltA: "test",
      saltB: "test",
      encryptedVaultKey: "test",
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /auth/salts", () => {
  it("returns real salts for existing user", async () => {
    await registerTestUser();

    const res = await request(app)
      .get("/auth/salts")
      .query({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.saltA).toBe("test-salt-a");
    expect(res.body.saltB).toBe("test-salt-b");
  });

  it("returns fake salts for non-existent user", async () => {
    const res = await request(app)
      .get("/auth/salts")
      .query({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    // Should return salts, not a 404
    expect(res.body).toHaveProperty("saltA");
    expect(res.body).toHaveProperty("saltB");
  });

  it("returns consistent fake salts for the same email", async () => {
    const res1 = await request(app)
      .get("/auth/salts")
      .query({ email: "nobody@example.com" });

    const res2 = await request(app)
      .get("/auth/salts")
      .query({ email: "nobody@example.com" });

    expect(res1.body.saltA).toBe(res2.body.saltA);
    expect(res1.body.saltB).toBe(res2.body.saltB);
  });
});

describe("POST /auth/login", () => {
  it("returns tokens and vault key on success", async () => {
    await registerTestUser();

    const res = await request(app).post("/auth/login").send({
      email: "test@example.com",
      authCredential: "test-auth-credential",
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    expect(res.body.encryptedVaultKey).toBe("test-encrypted-vault-key");
  });

  it("returns 401 for wrong credential", async () => {
    await registerTestUser();

    const res = await request(app).post("/auth/login").send({
      email: "test@example.com",
      authCredential: "wrong-credential",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns 401 for non-existent email", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "nobody@example.com",
      authCredential: "test-auth-credential",
    });

    expect(res.status).toBe(401);
    // Same error message — doesn't reveal whether email exists
    expect(res.body.error).toBe("Invalid email or password");
  });
});

describe("POST /auth/refresh", () => {
  it("returns new tokens on valid refresh", async () => {
    const { refreshToken } = await loginTestUser();

    const res = await request(app).post("/auth/refresh").send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    // New refresh token should differ from the old one
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it("rejects a used refresh token", async () => {
    const { refreshToken } = await loginTestUser();

    // Use the token once
    await request(app).post("/auth/refresh").send({ refreshToken });

    // Try to use it again — should be revoked
    const res = await request(app).post("/auth/refresh").send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it("invalidates all tokens when a revoked token is reused", async () => {
    const { refreshToken } = await loginTestUser();

    // First use — returns new tokens
    const firstRefresh = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken });

    const newRefreshToken = firstRefresh.body.refreshToken;

    // Reuse the old (now revoked) token — triggers theft detection
    await request(app).post("/auth/refresh").send({ refreshToken });

    // Even the legitimately issued new token should now be revoked
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: newRefreshToken });

    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid token", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: "completely-fake-token" });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("invalidates the refresh token", async () => {
    // Verify clean state
    const tokenCount = await db("refresh_tokens").count("* as count");
    console.log("refresh_tokens before login:", tokenCount);

    const { accessToken, refreshToken } = await loginTestUser();

    console.log("access token exists:", !!accessToken);
    console.log("refresh token exists:", !!refreshToken);

    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    console.log("logout status:", logoutRes.status);
    console.log("logout body:", logoutRes.body);

    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: "some-token" });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/change-password", () => {
  it("updates auth hash and vault key", async () => {
    const { accessToken } = await loginTestUser();

    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        oldAuthCredential: "test-auth-credential",
        newAuthCredential: "new-auth-credential",
        newEncryptedVaultKey: "new-encrypted-vault-key",
        newSaltA: "new-salt-a",
        newSaltB: "new-salt-b",
      });

    expect(res.status).toBe(200);

    // Old credential should no longer work
    const loginOld = await request(app).post("/auth/login").send({
      email: "test@example.com",
      authCredential: "test-auth-credential",
    });
    expect(loginOld.status).toBe(401);

    // New credential should work
    const loginNew = await request(app).post("/auth/login").send({
      email: "test@example.com",
      authCredential: "new-auth-credential",
    });
    expect(loginNew.status).toBe(200);
    expect(loginNew.body.encryptedVaultKey).toBe("new-encrypted-vault-key");
  });

  it("returns new salts after password change", async () => {
    const { accessToken } = await loginTestUser();

    await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        oldAuthCredential: "test-auth-credential",
        newAuthCredential: "new-auth-credential",
        newEncryptedVaultKey: "new-encrypted-vault-key",
        newSaltA: "new-salt-a",
        newSaltB: "new-salt-b",
      });

    const saltsRes = await request(app)
      .get("/auth/salts")
      .query({ email: "test@example.com" });

    expect(saltsRes.body.saltA).toBe("new-salt-a");
    expect(saltsRes.body.saltB).toBe("new-salt-b");
  });

  it("returns 401 for wrong old credential", async () => {
    const { accessToken } = await loginTestUser();

    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        oldAuthCredential: "wrong-credential",
        newAuthCredential: "new-auth-credential",
        newEncryptedVaultKey: "new-encrypted-vault-key",
        newSaltA: "new-salt-a",
        newSaltB: "new-salt-b",
      });

    expect(res.status).toBe(401);
  });

  it("invalidates all refresh tokens", async () => {
    const { accessToken, refreshToken } = await loginTestUser();

    await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        oldAuthCredential: "test-auth-credential",
        newAuthCredential: "new-auth-credential",
        newEncryptedVaultKey: "new-encrypted-vault-key",
        newSaltA: "new-salt-a",
        newSaltB: "new-salt-b",
      });

    // Old refresh token should be revoked
    const refreshRes = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });
});
