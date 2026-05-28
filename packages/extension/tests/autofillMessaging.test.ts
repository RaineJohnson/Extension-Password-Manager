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
    const envelope = (await __sendMessageWithSender(
      { type: 'autofill/matches' },
      { id: polyfill.runtime.id, url: 'https://no-such-site.invalid/login' },
    )) as Envelope;
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) throw new Error('envelope should be ok');
    expect(envelope.data.type).toBe('autofill/matches');
    expect(envelope.data.matches).toEqual([]);
  });

  it('returns plaintext credentials for a valid (id, sender origin) pair', async () => {
    await unlockVault();
    const matchesEnvelope = (await __sendMessageWithSender(
      { type: 'autofill/matches' },
      { id: polyfill.runtime.id, url: 'https://github.com/session' },
    )) as Envelope;
    expect(matchesEnvelope.ok).toBe(true);
    if (!matchesEnvelope.ok) throw new Error('matches should be ok');
    expect(matchesEnvelope.data.type).toBe('autofill/matches');
    expect(matchesEnvelope.data.matches).toHaveLength(1);
    const credentialsEnvelope = (await __sendMessageWithSender(
      {
        type: 'autofill/credentials',
        id: matchesEnvelope.data.matches[0]!.id,
      },
      { id: polyfill.runtime.id, url: 'https://github.com/session' },
    )) as Envelope;
    expect(credentialsEnvelope.ok).toBe(true);
    if (!credentialsEnvelope.ok) throw new Error('credentials should be ok');
    expect(credentialsEnvelope.data.type).toBe('autofill/credentials');
    expect(credentialsEnvelope.data.username).toBe('octocat');
    expect(typeof credentialsEnvelope.data.password).toBe('string');
    expect(credentialsEnvelope.data.password.length).toBeGreaterThan(0);
  });

  it('rejects a credential request whose sender origin does not match the id', async () => {
    await unlockVault();
    const matchesEnvelope = (await __sendMessageWithSender(
      { type: 'autofill/matches' },
      { id: polyfill.runtime.id, url: 'https://github.com/session' },
    )) as Envelope;
    expect(matchesEnvelope.ok).toBe(true);
    if (!matchesEnvelope.ok) throw new Error('matches should be ok');
    expect(matchesEnvelope.data.type).toBe('autofill/matches');
    const envelope = (await __sendMessageWithSender(
      {
        type: 'autofill/credentials',
        id: matchesEnvelope.data.matches[0]!.id,
      },
      { id: polyfill.runtime.id, url: 'https://attacker.example/login' },
    )) as Envelope;
    expect(envelope.ok).toBe(false);
    if (envelope.ok) throw new Error('envelope should be error');
    expect(envelope.code).toBe('NOT_FOUND');
  });

  it('ignores any caller-supplied hostname and derives the origin from sender.url', async () => {
    await unlockVault();
    const envelope = (await __sendMessageWithSender(
      {
        type: 'autofill/matches',
        // Simulate a compromised content script trying to claim a
        // different site. The worker must ignore this untyped extra
        // property and use MessageSender.url instead.
        hostname: 'github.com',
      },
      { id: polyfill.runtime.id, url: 'https://example.com/login' },
    )) as Envelope;
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) throw new Error('envelope should be ok');
    expect(envelope.data.type).toBe('autofill/matches');
    expect(envelope.data.matches).toHaveLength(2);
    expect(envelope.data.matches.map((match) => match.username)).toEqual([
      'alice@example.com',
      'bob@example.com',
    ]);
  });

  it('rejects autofill on non-HTTPS sender URLs', async () => {
    await unlockVault();
    const envelope = (await __sendMessageWithSender(
      { type: 'autofill/matches' },
      { id: polyfill.runtime.id, url: 'http://example.com/login' },
    )) as Envelope;
    expect(envelope.ok).toBe(false);
    if (envelope.ok) throw new Error('envelope should be error');
    expect(envelope.code).toBe('UNAUTHORIZED');
  });

  it('rejects autofill requests when the vault is locked', async () => {
    // No `unlockVault()` — vault is locked by default after rehydrate.
    await expect(
      sendMessage({
        type: 'autofill/matches',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      sendMessage({
        type: 'autofill/matches',
      }),
    ).rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('rejects messages from a sender that is not this extension', async () => {
    await unlockVault();
    // Simulate a webpage that managed to call `runtime.sendMessage` —
    // real browsers wouldn't surface our extension id as the sender,
    // and the SW must refuse to release any plaintext to it.
    const envelope = (await __sendMessageWithSender(
      { type: 'autofill/matches' },
      { id: 'foreign-extension-id', url: 'https://example.com/login' },
    )) as Envelope;
    expect(envelope.ok).toBe(false);
    if (envelope.ok) throw new Error('envelope should be error');
    expect(envelope.code).toBe('UNAUTHORIZED');
  });

  it('also rejects messages from an undefined sender id', async () => {
    await unlockVault();
    const envelope = (await __sendMessageWithSender(
      { type: 'autofill/matches' },
      { url: 'https://example.com/login' },
    )) as Envelope;
    expect(envelope.ok).toBe(false);
  });
});
