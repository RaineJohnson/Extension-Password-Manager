/**
 * Minimal in-process stand-in for `webextension-polyfill`.
 *
 * `runtime.sendMessage` invokes the registered `runtime.onMessage`
 * listeners directly and returns the first non-undefined result, which is
 * enough to round-trip a popup→worker request inside Jest. `storage.session`
 * is backed by a Map. Reset between tests with `__reset()`.
 */

type Listener = (msg: unknown, sender: object) => unknown | Promise<unknown>;

const messageListeners: Listener[] = [];
const installedListeners: Array<() => unknown> = [];
const sessionStore = new Map<string, unknown>();

const polyfill = {
  runtime: {
    onInstalled: {
      addListener(fn: () => unknown) {
        installedListeners.push(fn);
      },
    },
    onMessage: {
      addListener(fn: Listener) {
        messageListeners.push(fn);
      },
    },
    async sendMessage(msg: unknown): Promise<unknown> {
      for (const listener of messageListeners) {
        const result = await listener(msg, {});
        if (result !== undefined) return result;
      }
      return undefined;
    },
  },
  storage: {
    session: {
      async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
        if (typeof keys === 'string') {
          return sessionStore.has(keys) ? { [keys]: sessionStore.get(keys) } : {};
        }
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {};
          for (const k of keys) {
            if (sessionStore.has(k)) out[k] = sessionStore.get(k);
          }
          return out;
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of sessionStore) out[k] = v;
        return out;
      },
      async set(values: Record<string, unknown>): Promise<void> {
        for (const [k, v] of Object.entries(values)) sessionStore.set(k, v);
      },
      async remove(keys: string | string[]): Promise<void> {
        for (const k of Array.isArray(keys) ? keys : [keys]) sessionStore.delete(k);
      },
      async clear(): Promise<void> {
        sessionStore.clear();
      },
    },
  },
};

export function __reset(): void {
  messageListeners.length = 0;
  installedListeners.length = 0;
  sessionStore.clear();
}

export function __fireInstalled(): void {
  for (const fn of installedListeners) fn();
}

export default polyfill;
