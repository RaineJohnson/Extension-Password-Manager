import { ApiError } from '../src/api/client';
import { MockApiClient } from '../src/api/mockClient';

describe('MockApiClient', () => {
  it('registers a new email then logs in with the same password', async () => {
    const client = new MockApiClient({ delayMs: 0 });
    await client.register('alice@example.com', 'correct horse battery staple');
    await expect(
      client.login('alice@example.com', 'correct horse battery staple'),
    ).resolves.toBeUndefined();
  });

  it('treats email as case-insensitive', async () => {
    const client = new MockApiClient({ delayMs: 0 });
    await client.register('Bob@Example.com', 'sufficiently long pw 123');
    await expect(
      client.login('bob@example.com', 'sufficiently long pw 123'),
    ).resolves.toBeUndefined();
  });

  it('rejects register when email is already taken', async () => {
    const client = new MockApiClient({ delayMs: 0 });
    await expect(
      client.register('taken@example.com', 'sufficiently long pw 123'),
    ).rejects.toMatchObject({
      name: 'ApiError',
      code: 'EMAIL_TAKEN',
    });
  });

  it('rejects login when email is unknown', async () => {
    const client = new MockApiClient({ delayMs: 0 });
    await expect(
      client.login('nobody@example.com', 'sufficiently long pw 123'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects login when password does not match', async () => {
    const client = new MockApiClient({ delayMs: 0 });
    await client.register('carol@example.com', 'sufficiently long pw 123');
    await expect(
      client.login('carol@example.com', 'a different password'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('simulates a network failure for the offline magic email', async () => {
    const client = new MockApiClient({ delayMs: 0 });
    await expect(
      client.register('offline@example.com', 'sufficiently long pw 123'),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(
      client.login('offline@example.com', 'sufficiently long pw 123'),
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('throws ApiError instances so the UI can branch on instanceof', async () => {
    const client = new MockApiClient({ delayMs: 0 });
    await expect(client.login('nobody@example.com', 'whatever')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
