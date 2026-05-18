import polyfill from './mocks/webextensionPolyfill';
import { FakeServer } from './fakeServer';
import { HttpClient, type TokenStore } from '../src/api/httpClient';
import * as state from '../src/background/state';
import * as auth from '../src/background/auth';
import * as vault from '../src/background/vault';
import { ApiError } from '../src/shared/messages';

// Argon2id default params take ~hundreds of ms per derivation. Tests
// override with the same fast params the @password-manager/crypto suite
// uses — fine for correctness, never lower in prod.
const FAST = {
  memorySize: 8,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
} as const;

const EMAIL = 'alice@example.com';
const PASSWORD = 'correct horse battery staple';

async function buildHarness() {
  await polyfill.storage.session.clear();
  await state.rehydrate();
  const server = new FakeServer();
  const tokens: TokenStore = {
    getAccessToken: () => state.getAccessToken(),
    async refresh() {
      const refreshToken = state.getRefreshToken();
      if (refreshToken === null) return null;
      try {
        const next = await http.refresh(refreshToken);
        await state.setTokens(next.accessToken, next.refreshToken);
        return next.accessToken;
      } catch {
        return null;
      }
    },
    async clear() {
      await state.lock();
    },
  };
  const http = new HttpClient({
    baseUrl: 'http://test.invalid',
    tokens,
    fetchImpl: server.fetch,
  });
  const deps = { http, argon2idParams: FAST };
  return { server, http, deps };
}

describe('auth orchestrator', () => {
  it('register then login unlocks the vault and stores tokens', async () => {
    const { server, deps } = await buildHarness();

    await auth.register(deps, EMAIL, PASSWORD);
    expect(server.users.has(EMAIL)).toBe(true);
    expect(state.isLocked()).toBe(true);

    await auth.login(deps, EMAIL, PASSWORD);
    expect(state.isLocked()).toBe(false);
    expect(state.getEmail()).toBe(EMAIL);
    expect(state.getAccessToken()).not.toBeNull();
    expect(state.getRefreshToken()).not.toBeNull();
    expect(state.getVaultKey()).not.toBeNull();
  });

  it('login with the wrong password throws INVALID_CREDENTIALS', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await expect(auth.login(deps, EMAIL, 'wrong password 12')).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(auth.login(deps, EMAIL, 'wrong password 12')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(state.isLocked()).toBe(true);
  });

  it('register with an existing email throws EMAIL_TAKEN', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await expect(auth.register(deps, EMAIL, PASSWORD)).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
  });

  it('lock clears tokens and the vault key', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);
    expect(state.isLocked()).toBe(false);

    await auth.lock();
    expect(state.isLocked()).toBe(true);
    expect(state.getVaultKey()).toBeNull();
    expect(state.getAccessToken()).toBeNull();
    expect(state.getRefreshToken()).toBeNull();
    expect(state.getEmail()).toBeNull();
  });

  it('change-password locks the vault and lets login succeed with the new password', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);

    await auth.changePassword(deps, PASSWORD, 'brand new master password');
    expect(state.isLocked()).toBe(true);

    await auth.login(deps, EMAIL, 'brand new master password');
    expect(state.isLocked()).toBe(false);
  });

  it('change-password with the wrong current password throws INVALID_CREDENTIALS', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);

    await expect(
      auth.changePassword(deps, 'wrong current pw', 'new master password 1'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    // Vault should remain unlocked — failed change must not log the user out.
    expect(state.isLocked()).toBe(false);
  });
});

describe('vault orchestrator', () => {
  it('create then list returns the same decrypted payload', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);

    const created = await vault.create(deps, {
      site: 'github.com',
      username: 'octocat',
      password: 'p@ss!23',
      notes: 'work account',
    });
    expect(created.id).toMatch(/^item-/);
    expect(created.site).toBe('github.com');
    expect(created.username).toBe('octocat');
    expect(created.password).toBe('p@ss!23');
    expect(created.notes).toBe('work account');

    const items = await vault.list(deps);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: created.id,
      site: 'github.com',
      username: 'octocat',
      password: 'p@ss!23',
      notes: 'work account',
    });
  });

  it('update overwrites fields and list reflects the change', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);

    const created = await vault.create(deps, {
      site: 'github.com',
      username: 'octocat',
      password: 'old',
    });
    await vault.update(deps, {
      id: created.id,
      site: 'github.com',
      username: 'octocat',
      password: 'rotated',
      notes: 'after rotation',
    });

    const [item] = await vault.list(deps);
    expect(item).toMatchObject({
      id: created.id,
      password: 'rotated',
      notes: 'after rotation',
    });
  });

  it('delete removes the item from the list', async () => {
    const { deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);

    const created = await vault.create(deps, {
      site: 'github.com',
      username: 'octocat',
      password: 'pw',
    });
    await vault.remove(deps, created.id);
    expect(await vault.list(deps)).toHaveLength(0);
  });

  it('vault operations on a locked vault throw LOCKED', async () => {
    const { deps } = await buildHarness();
    await expect(vault.list(deps)).rejects.toMatchObject({ code: 'LOCKED' });
    await expect(
      vault.create(deps, { site: 'x', username: 'y', password: 'z' }),
    ).rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('a 401 on a vault call triggers refresh + retry transparently', async () => {
    const { server, deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);
    const accessBefore = state.getAccessToken();

    server.expireAccessTokenOnce();
    const items = await vault.list(deps);
    expect(items).toHaveLength(0);
    // Access token was rotated by the refresh.
    expect(state.getAccessToken()).not.toBe(accessBefore);
  });

  it('refresh failing on a 401 locks the vault and surfaces UNAUTHORIZED', async () => {
    const { server, deps } = await buildHarness();
    await auth.register(deps, EMAIL, PASSWORD);
    await auth.login(deps, EMAIL, PASSWORD);

    // Invalidate both the access token and the refresh token so the
    // refresh-on-401 retry path can't recover.
    server.accessTokens.clear();
    server.refreshTokens.clear();

    await expect(vault.list(deps)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(state.isLocked()).toBe(true);
  });
});
