/**
 * In-memory stand-in for the Express server. Drop-in for `fetch` —
 * pass `server.fetch` as `fetchImpl` to `HttpClient`. Implements just
 * enough of `/auth/*` and `/vault/*` for orchestrator tests:
 *
 *   - Bcrypt is skipped: stored `authCredential` is compared as a plain
 *     string. The real server bcrypts; for tests we only care that
 *     correct credential ↔ user round-trips.
 *   - Refresh tokens are stored alongside a `revoked` flag, matching
 *     the server's rotation semantics.
 *   - `forceFirstAuth401` makes the next authenticated request 401 once,
 *     so tests can exercise the HttpClient's refresh-on-401 retry path
 *     without racing the server.
 */

import type {
  CreateVaultItemRequest,
  UpdateVaultItemRequest,
} from '@password-manager/shared';

interface UserRecord {
  id: string;
  email: string;
  authCredential: string;
  saltA: string;
  saltB: string;
  encryptedVaultKey: string;
}

interface ItemRecord {
  id: string;
  userId: string;
  site: string;
  encrypted_blob: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface RefreshTokenRecord {
  userId: string;
  revoked: boolean;
}

let nextIdCounter = 1;
function uid(prefix: string): string {
  return `${prefix}-${nextIdCounter++}`;
}

export class FakeServer {
  readonly users = new Map<string, UserRecord>();
  readonly items = new Map<string, ItemRecord>();
  readonly accessTokens = new Map<string, string>();
  readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  forceFirstAuth401 = false;
  private burned401 = false;

  fetch = async (
    input: string | URL | globalThis.Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const parsed = new URL(url);
    const method = init?.method ?? 'GET';
    const bodyText = typeof init?.body === 'string' ? init.body : undefined;
    const body =
      bodyText !== undefined && bodyText.length > 0
        ? (JSON.parse(bodyText) as Record<string, string>)
        : undefined;
    const headers = new Headers(init?.headers);
    const auth = headers.get('Authorization');
    const token =
      auth !== null && auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : null;

    if (method === 'POST' && parsed.pathname === '/auth/register') {
      return this.register(body!);
    }
    if (method === 'GET' && parsed.pathname === '/auth/salts') {
      return this.salts(parsed.searchParams.get('email') ?? '');
    }
    if (method === 'POST' && parsed.pathname === '/auth/login') {
      return this.login(body!);
    }
    if (method === 'POST' && parsed.pathname === '/auth/refresh') {
      return this.refresh(body!);
    }
    if (method === 'POST' && parsed.pathname === '/auth/change-password') {
      return this.withAuth(token, (userId) => this.changePassword(userId, body!));
    }
    if (method === 'GET' && parsed.pathname === '/vault') {
      return this.withAuth(token, (userId) => this.listItems(userId));
    }
    if (method === 'POST' && parsed.pathname === '/vault/item') {
      return this.withAuth(token, (userId) =>
        this.createItem(userId, body as unknown as CreateVaultItemRequest),
      );
    }
    const itemMatch = parsed.pathname.match(/^\/vault\/item\/(.+)$/);
    if (itemMatch !== null) {
      const id = decodeURIComponent(itemMatch[1]!);
      if (method === 'PUT') {
        return this.withAuth(token, (userId) =>
          this.updateItem(userId, id, body as unknown as UpdateVaultItemRequest),
        );
      }
      if (method === 'DELETE') {
        return this.withAuth(token, (userId) => this.deleteItem(userId, id));
      }
    }
    return this.json(404, { error: 'Not found' });
  };

  /** Force the very next authenticated request to 401 once. */
  expireAccessTokenOnce(): void {
    this.forceFirstAuth401 = true;
    this.burned401 = false;
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private withAuth(
    token: string | null,
    next: (userId: string) => Response,
  ): Response {
    if (this.forceFirstAuth401 && !this.burned401) {
      this.burned401 = true;
      return this.json(401, { error: 'Token expired' });
    }
    if (token === null) return this.json(401, { error: 'Missing token' });
    const userId = this.accessTokens.get(token);
    if (userId === undefined) return this.json(401, { error: 'Invalid token' });
    return next(userId);
  }

  private register(body: Record<string, string>): Response {
    if (this.users.has(body.email!)) {
      return this.json(409, { error: 'Email already in use' });
    }
    const user: UserRecord = {
      id: uid('user'),
      email: body.email!,
      authCredential: body.authCredential!,
      saltA: body.saltA!,
      saltB: body.saltB!,
      encryptedVaultKey: body.encryptedVaultKey!,
    };
    this.users.set(user.email, user);
    return this.json(201, {
      id: user.id,
      email: user.email,
      created_at: new Date().toISOString(),
    });
  }

  private salts(email: string): Response {
    const user = this.users.get(email);
    if (user !== undefined) {
      return this.json(200, { saltA: user.saltA, saltB: user.saltB });
    }
    return this.json(200, { saltA: 'fake-saltA', saltB: 'fake-saltB' });
  }

  private login(body: Record<string, string>): Response {
    const user = this.users.get(body.email!);
    if (user === undefined || user.authCredential !== body.authCredential) {
      return this.json(401, { error: 'Invalid email or password' });
    }
    const accessToken = uid('at');
    const refreshToken = uid('rt');
    this.accessTokens.set(accessToken, user.id);
    this.refreshTokens.set(refreshToken, { userId: user.id, revoked: false });
    return this.json(200, {
      accessToken,
      refreshToken,
      encryptedVaultKey: user.encryptedVaultKey,
    });
  }

  private refresh(body: Record<string, string>): Response {
    const record = this.refreshTokens.get(body.refreshToken!);
    if (record === undefined || record.revoked) {
      return this.json(401, { error: 'Invalid refresh token' });
    }
    record.revoked = true;
    const accessToken = uid('at');
    const refreshToken = uid('rt');
    this.accessTokens.set(accessToken, record.userId);
    this.refreshTokens.set(refreshToken, { userId: record.userId, revoked: false });
    return this.json(200, { accessToken, refreshToken });
  }

  private changePassword(
    userId: string,
    body: Record<string, string>,
  ): Response {
    const user = Array.from(this.users.values()).find((u) => u.id === userId);
    if (user === undefined) {
      return this.json(401, { error: 'User not found' });
    }
    if (user.authCredential !== body.oldAuthCredential) {
      return this.json(401, { error: 'Invalid current password' });
    }
    user.authCredential = body.newAuthCredential!;
    user.encryptedVaultKey = body.newEncryptedVaultKey!;
    user.saltA = body.newSaltA!;
    user.saltB = body.newSaltB!;
    for (const record of this.refreshTokens.values()) {
      if (record.userId === userId) record.revoked = true;
    }
    return this.json(200, { message: 'Password changed' });
  }

  private listItems(userId: string): Response {
    const items = Array.from(this.items.values())
      .filter((i) => i.userId === userId)
      .map((i) => this.toWire(i));
    return this.json(200, { items });
  }

  private createItem(
    userId: string,
    body: CreateVaultItemRequest,
  ): Response {
    const id = uid('item');
    const now = new Date().toISOString();
    const record: ItemRecord = {
      id,
      userId,
      site: body.site,
      encrypted_blob: body.encryptedBlob,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    this.items.set(id, record);
    return this.json(201, this.toWire(record));
  }

  private updateItem(
    userId: string,
    id: string,
    body: UpdateVaultItemRequest,
  ): Response {
    const existing = this.items.get(id);
    if (existing === undefined || existing.userId !== userId) {
      return this.json(404, { error: 'Item not found' });
    }
    if (body.site !== undefined) existing.site = body.site;
    existing.encrypted_blob = body.encryptedBlob;
    existing.updated_at = new Date().toISOString();
    return this.json(200, this.toWire(existing));
  }

  private deleteItem(userId: string, id: string): Response {
    const existing = this.items.get(id);
    if (existing === undefined || existing.userId !== userId) {
      return this.json(404, { error: 'Item not found' });
    }
    this.items.delete(id);
    return this.json(200, { message: 'Deleted' });
  }

  private toWire(item: ItemRecord) {
    return {
      id: item.id,
      site: item.site,
      encrypted_blob: item.encrypted_blob,
      version: item.version,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }
}
