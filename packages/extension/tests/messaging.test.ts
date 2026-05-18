import polyfill from './mocks/webextensionPolyfill';
import { sendMessage } from '../src/shared/messages';
import { rehydrate } from '../src/background/serviceWorker';

describe('popup ↔ background messaging', () => {
  beforeEach(async () => {
    await polyfill.storage.session.clear();
    await rehydrate();
  });

  it('round-trips a ping through the background handler', async () => {
    const before = Date.now();
    const res = await sendMessage({ type: 'ping' });
    const after = Date.now();

    expect(res.type).toBe('ping');
    expect(res.receivedAt).toBeGreaterThanOrEqual(before);
    expect(res.receivedAt).toBeLessThanOrEqual(after);
  });

  it('defaults to locked when storage.session is empty', async () => {
    const res = await sendMessage({ type: 'getStatus' });
    expect(res).toEqual({ type: 'getStatus', locked: true });
  });

  it('rehydrates lock status from storage.session on cold start', async () => {
    await polyfill.storage.session.set({
      state: {
        locked: false,
        email: 'alice@example.com',
        accessToken: 'token',
        refreshToken: 'refresh',
        vaultKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        unlockedUntil: Date.now() + 60_000,
      },
    });
    await rehydrate();

    const res = await sendMessage({ type: 'getStatus' });
    expect(res).toEqual({ type: 'getStatus', locked: false });
  });

  it('locks an expired rehydrated session', async () => {
    await polyfill.storage.session.set({
      state: {
        locked: false,
        email: 'alice@example.com',
        accessToken: 'token',
        refreshToken: 'refresh',
        vaultKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        unlockedUntil: Date.now() - 1,
      },
    });
    await rehydrate();

    const res = await sendMessage({ type: 'getStatus' });
    expect(res).toEqual({ type: 'getStatus', locked: true });
  });

  it('locks a legacy unlocked session with no auto-lock deadline', async () => {
    await polyfill.storage.session.set({
      state: {
        locked: false,
        email: 'alice@example.com',
        accessToken: 'token',
        refreshToken: 'refresh',
        vaultKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
    });
    await rehydrate();

    const res = await sendMessage({ type: 'getStatus' });
    expect(res).toEqual({ type: 'getStatus', locked: true });
  });
});
