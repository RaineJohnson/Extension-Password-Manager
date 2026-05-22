/**
 * Background service worker — top-level message dispatcher.
 *
 * Builds an `HttpClient` against the configured API base URL and a
 * `TokenStore` backed by `state.ts`, then routes each incoming Request
 * through the auth or vault orchestrator. Every reply is wrapped in an
 * `Envelope`; `ApiError`s become `{ ok: false, code, message }` and any
 * other exception becomes `{ ok: false, code: 'UNKNOWN', ... }` so the
 * popup never sees a raw stack trace.
 *
 * Lifecycle: in Chrome MV3 the worker is unloaded after ~30s of idle.
 * `rehydrate()` runs on every cold start so the vault stays unlocked
 * across worker restarts within a browser session (see README).
 */

import browser from 'webextension-polyfill';
import { API_BASE_URL } from '../config/env';
import { HttpClient, type TokenStore } from '../api/httpClient';
import {
  ApiError,
  type Envelope,
  type Request,
  type Success,
} from '../shared/messages';
import * as state from './state';
import * as auth from './auth';
import * as vault from './vault';

const tokens: TokenStore = {
  getAccessToken: () => state.getAccessToken(),
  async refresh(): Promise<string | null> {
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

const http = new HttpClient({ baseUrl: API_BASE_URL, tokens });
const deps = { http };

export const ready = state.initialize();
export const rehydrate = state.initialize;

async function dispatch(req: Request): Promise<Success> {
  switch (req.type) {
    case 'ping':
      return { type: 'ping', receivedAt: Date.now() };
    case 'getStatus':
      return { type: 'getStatus', locked: state.isLocked() };
    case 'auth/register':
      await auth.register(deps, req.email, req.password);
      return { type: 'auth/register' };
    case 'auth/login':
      await auth.login(deps, req.email, req.password);
      return { type: 'auth/login' };
    case 'auth/lock':
      await auth.lock();
      return { type: 'auth/lock' };
    case 'auth/changePassword':
      await auth.changePassword(deps, req.current, req.next);
      return { type: 'auth/changePassword' };
    case 'vault/list': {
      const items = await vault.list(deps);
      return { type: 'vault/list', items };
    }
    case 'vault/create': {
      const item = await vault.create(deps, {
        site: req.site,
        username: req.username,
        password: req.password,
        ...(req.notes !== undefined ? { notes: req.notes } : {}),
      });
      return { type: 'vault/create', item };
    }
    case 'vault/update': {
      const item = await vault.update(deps, {
        id: req.id,
        site: req.site,
        username: req.username,
        password: req.password,
        ...(req.notes !== undefined ? { notes: req.notes } : {}),
      });
      return { type: 'vault/update', item };
    }
    case 'vault/delete':
      await vault.remove(deps, req.id);
      return { type: 'vault/delete' };
  }
}

export async function handle(req: Request): Promise<Envelope> {
  await ready;
  await state.expireIfNeeded();
  try {
    const data = await dispatch(req);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiError) {
      // UNAUTHORIZED leaks out only when an in-flight request couldn't
      // be recovered via refresh — the session is dead. Lock the vault
      // so the next popup open starts at Login. Orchestrators that mean
      // "wrong in-payload credential" remap to INVALID_CREDENTIALS first
      // and never reach here.
      if (e.code === 'UNAUTHORIZED') {
        await state.lock();
      }
      return { ok: false, code: e.code, message: e.message };
    }
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    return { ok: false, code: 'UNKNOWN', message };
  }
}

browser.runtime.onInstalled.addListener(() => {
  void state.resetForInstall();
});

browser.runtime.onMessage.addListener((raw: unknown) => handle(raw as Request));
