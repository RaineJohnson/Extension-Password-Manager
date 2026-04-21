import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "../config/db";
import { env } from "../config/env";

/** Number of bcrypt salt rounds */
const BCRYPT_ROUNDS = 12;

/** JWT access token lifetime */
const ACCESS_TOKEN_EXPIRY = "15m";

/**
 * Register a new user.
 * Hashes the auth credential with bcrypt and stores the user record.
 * Returns the created user (without auth_hash).
 */
export async function registerUser(data: {
  email: string;
  authCredential: string;
  saltA: string;
  saltB: string;
  encryptedVaultKey: string;
}) {
  // Check if email is already registered
  const existing = await db("users").where({ email: data.email }).first();
  if (existing) {
    return { error: "Email already in use", status: 409 };
  }

  // Hash the auth credential — this is what the server stores
  // and compares against on login
  const authHash = await bcrypt.hash(data.authCredential, BCRYPT_ROUNDS);

  const [user] = await db("users")
    .insert({
      email: data.email,
      auth_hash: authHash,
      salt_a: data.saltA,
      salt_b: data.saltB,
      encrypted_vault_key: data.encryptedVaultKey,
    })
    .returning(["id", "email", "created_at"]);

  return { user, status: 201 };
}

/**
 * Look up salts for a given email.
 * Returns real salts for existing users, deterministic fake salts
 * for non-existent users (prevents email enumeration).
 */
export async function getSalts(email: string) {
  const user = await db("users").where({ email }).first();

  if (user) {
    return { saltA: user.salt_a, saltB: user.salt_b };
  }

  // Generate deterministic fake salts using HMAC-SHA256.
  // Same email always produces the same fake salts, making the
  // response indistinguishable from a real user's salts.
  const fakeSaltA = crypto
    .createHmac("sha256", env.SALT_HMAC_SECRET)
    .update(email + ":salt_a")
    .digest("hex");

  const fakeSaltB = crypto
    .createHmac("sha256", env.SALT_HMAC_SECRET)
    .update(email + ":salt_b")
    .digest("hex");

  return { saltA: fakeSaltA, saltB: fakeSaltB };
}

/**
 * Authenticate a user.
 * Verifies the auth credential against the stored bcrypt hash.
 * On success, returns JWT access token, refresh token, and encrypted vault key.
 */
export async function loginUser(data: {
  email: string;
  authCredential: string;
}) {
  const user = await db("users").where({ email: data.email }).first();

  // Deliberately vague error — don't reveal whether the email exists
  if (!user) {
    return { error: "Invalid email or password", status: 401 };
  }

  const valid = await bcrypt.compare(data.authCredential, user.auth_hash);
  if (!valid) {
    return { error: "Invalid email or password", status: 401 };
  }

  // Generate JWT with user ID in the payload
  const accessToken = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  // Generate an opaque refresh token — a random string with no
  // embedded data, stored in the database
  const refreshToken = crypto.randomBytes(48).toString("hex");

  // Store the refresh token with a 7-day expiry
  await db("refresh_tokens").insert({
    token: refreshToken,
    user_id: user.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken,
    encryptedVaultKey: user.encrypted_vault_key,
    status: 200,
  };
}

/**
 * Exchange a refresh token for a new access token and rotated refresh token.
 * Invalidates the old refresh token on each use.
 * If a revoked token is reused, invalidates ALL tokens for that user
 * (potential theft detected).
 */
export async function refreshTokens(token: string) {
  const existing = await db("refresh_tokens").where({ token }).first();

  if (!existing) {
    // Token doesn't exist — could be a replay of a revoked token.
    return { error: "Invalid refresh token", status: 401 };
  }

  // Check if the token was already revoked (used before)
  if (existing.revoked) {
    // Potential token theft — invalidate ALL tokens for this user
    await db("refresh_tokens")
      .where({ user_id: existing.user_id })
      .update({ revoked: true });
    return { error: "Invalid refresh token", status: 401 };
  }

  // Check expiry
  if (new Date(existing.expires_at) < new Date()) {
    return { error: "Invalid refresh token", status: 401 };
  }

  // Revoke the old token (rotation)
  await db("refresh_tokens").where({ token }).update({ revoked: true });

  // Issue new tokens
  const accessToken = jwt.sign({ userId: existing.user_id }, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const newRefreshToken = crypto.randomBytes(48).toString("hex");

  await db("refresh_tokens").insert({
    token: newRefreshToken,
    user_id: existing.user_id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken: newRefreshToken, status: 200 };
}

/**
 * Invalidate a specific refresh token (logout).
 */
export async function logoutUser(token: string) {
  await db("refresh_tokens").where({ token }).update({ revoked: true });
}

/**
 * Change master password.
 * Verifies the old auth credential, then atomically updates
 * auth_hash, encrypted_vault_key, salt_a, and salt_b.
 * Invalidates all refresh tokens to force re-auth on other devices.
 */
export async function changePassword(
  userId: string,
  data: {
    oldAuthCredential: string;
    newAuthCredential: string;
    newEncryptedVaultKey: string;
    newSaltA: string;
    newSaltB: string;
  },
) {
  const user = await db("users").where({ id: userId }).first();

  if (!user) {
    return { error: "User not found", status: 401 };
  }

  const valid = await bcrypt.compare(data.oldAuthCredential, user.auth_hash);
  if (!valid) {
    return { error: "Invalid current password", status: 401 };
  }

  const newAuthHash = await bcrypt.hash(data.newAuthCredential, BCRYPT_ROUNDS);

  // Atomic transaction — all four fields update together or none do.
  // db.transaction gives us a transaction object (trx) that we pass
  // to each query. If any query fails, all changes are rolled back.
  await db.transaction(async (trx) => {
    await trx("users").where({ id: userId }).update({
      auth_hash: newAuthHash,
      encrypted_vault_key: data.newEncryptedVaultKey,
      salt_a: data.newSaltA,
      salt_b: data.newSaltB,
    });

    // Force all devices to re-authenticate
    await trx("refresh_tokens")
      .where({ user_id: userId })
      .update({ revoked: true });
  });

  return { status: 200 };
}
