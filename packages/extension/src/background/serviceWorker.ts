/**
 * Background service worker.
 *
 * Lifecycle: in Chrome MV3 the worker is unloaded after ~30s of idle. To
 * avoid forcing the user to re-derive their master password every time
 * that happens, sensitive state lives in `chrome.storage.session` (memory-
 * resident, encrypted at rest by Chrome since v111, wiped on browser
 * close). On every cold start we rehydrate from that store. See README.
 *
 * This file is the message dispatcher. It does not implement auth — it
 * exposes `ping` (for connectivity tests) and `getStatus` (which exercises
 * the rehydration path). Real handlers will be added in later PRs.
 */

import browser from 'webextension-polyfill';
import type { Request, ResponseFor } from '../shared/messages';

type WorkerState = { locked: boolean };
const STATE_KEY = 'state';
const initialState: WorkerState = { locked: true };
let state: WorkerState = initialState;

export async function rehydrate(): Promise<void> {
  const stored = await browser.storage.session.get(STATE_KEY);
  const persisted = stored[STATE_KEY] as WorkerState | undefined;
  state = persisted ?? { ...initialState };
}

export async function persist(): Promise<void> {
  await browser.storage.session.set({ [STATE_KEY]: state });
}

export async function handle<R extends Request>(req: R): Promise<ResponseFor<R>> {
  switch (req.type) {
    case 'ping':
      return { type: 'pong', receivedAt: Date.now() } as ResponseFor<R>;
    case 'getStatus':
      return { type: 'status', locked: state.locked } as ResponseFor<R>;
  }
}

browser.runtime.onInstalled.addListener(() => {
  void browser.storage.session.set({ [STATE_KEY]: initialState });
});

browser.runtime.onMessage.addListener((raw: unknown) => handle(raw as Request));

const ready = rehydrate();

// In handle():
await ready;
