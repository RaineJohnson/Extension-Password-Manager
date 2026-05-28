import polyfill, { __sendMessageWithSender } from './mocks/webextensionPolyfill';
import { ApiError, sendMessage } from '../src/shared/messages';
import type { Envelope } from '../src/shared/messages';
import { rehydrate } from '../src/background/serviceWorker';
import * as state from '../src/background/state';

async function unlockVault(): Promise<void> {
  await state.unlock({
    email: 'alice@example.com',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    vaultKey: new Uint8Array(32).fill(7),
  });
}

describe('autofill messaging', () => {
  beforeEach(async () => {
    await polyfill.storage.session.clear();
    await rehydrate();
  });

  it('returns hostname matches as metadata only (no passwords)', async () => {
    await unlockVault();
    const res = await sendMessage({
      type: 'autofill/matches',
      hostname: 'example.com',
    });
    expect(res.type).toBe('autofill/matches');
    expect(res.matches.length).toBeGreaterThan(0);
    for (const match of res.matches) {
      expect(typeof match.id).toBe('string');
      expect(typeof match.username).toBe('string');
      expect(match).not.toHaveProperty('password');
    }
  });

  it('returns an empty match list for an unknown hostname', async () => {
    await unlockVault();
    const res = await sendMessage({
      type: 'autofill/matches',
      hostname: 'no-such-site.invalid',
    });
    expect(res.matches).toEqual([]);
  });

  it('returns plaintext credentials for a valid (id, hostname) pair', async () => {
    await unlockVault();
    const { matches } = await sendMessage({
      type: 'autofill/matches',
      hostname: 'github.com',
    });
    expect(matches).toHaveLength(1);
    const res = await sendMessage({
      type: 'autofill/credentials',
      id: matches[0]!.id,
      hostname: 'github.com',
    });
    expect(res.username).toBe('octocat');
    expect(typeof res.password).toBe('string');
    expect(res.password.length).toBeGreaterThan(0);
  });

  it('rejects a credential request whose hostname does not match the id', async () => {
    await unlockVault();
    const { matches } = await sendMessage({
      type: 'autofill/matches',
      hostname: 'github.com',
    });
    await expect(
      sendMessage({
        type: 'autofill/credentials',
        id: matches[0]!.id,
        // A compromised content script that gets hold of a leaked
        // match id can't redeem it on the wrong page.
        hostname: 'attacker.example',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects autofill requests when the vault is locked', async () => {
    // No `unlockVault()` — vault is locked by default after rehydrate.
    await expect(
      sendMessage({
        type: 'autofill/matches',
        hostname: 'example.com',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      sendMessage({
        type: 'autofill/matches',
        hostname: 'example.com',
      }),
    ).rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('rejects messages from a sender that is not this extension', async () => {
    await unlockVault();
    // Simulate a webpage that managed to call `runtime.sendMessage` —
    // real browsers wouldn't surface our extension id as the sender,
    // and the SW must refuse to release any plaintext to it.
    const envelope = (await __sendMessageWithSender(
      { type: 'autofill/matches', hostname: 'example.com' },
      { id: 'foreign-extension-id' },
    )) as Envelope;
    expect(envelope.ok).toBe(false);
    if (envelope.ok) throw new Error('envelope should be error');
    expect(envelope.code).toBe('UNAUTHORIZED');
  });

  it('also rejects messages from an undefined sender id', async () => {
    await unlockVault();
    const envelope = (await __sendMessageWithSender(
      { type: 'autofill/matches', hostname: 'example.com' },
      {},
    )) as Envelope;
    expect(envelope.ok).toBe(false);
  });
});
