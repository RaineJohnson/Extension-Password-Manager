/**
 * Minimal in-process stand-in for `webextension-polyfill`.
 *
 * `runtime.sendMessage` invokes the registered `runtime.onMessage`
 * listeners directly and returns the first non-undefined result, which is
 * enough to round-trip a popup→worker request inside Jest. The listener
 * receives a `sender` shaped like the real `MessageSender`, with
 * `sender.id === runtime.id` — that's what the worker uses to reject
 * messages from foreign extensions. Tests that need to simulate a
 * foreign sender call `__sendMessageWithSender` directly.
 * `storage.session` is backed by a Map. Reset between tests with `__reset()`.
 */

const TEST_EXTENSION_ID = 'test-extension-id';

type Listener = (
  msg: unknown,
  sender: { id?: string },
) => unknown | Promise<unknown>;

const messageListeners: Listener[] = [];
const installedListeners: Array<() => unknown> = [];
const sessionStore = new Map<string, unknown>();

async function dispatch(
  msg: unknown,
  sender: { id?: string },
): Promise<unknown> {
  for (const listener of messageListeners) {
    const result = await listener(msg, sender);
    if (result !== undefined) return result;
  }
  return undefined;
}

const polyfill = {
  runtime: {
    id: TEST_EXTENSION_ID,
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
      return dispatch(msg, { id: TEST_EXTENSION_ID });
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

/**
 * Dispatch a message with a caller-controlled sender. Real browsers
 * never let a webpage forge `sender.id`, so tests use this helper to
 * simulate the attack we're defending against.
 */
export async function __sendMessageWithSender(
  msg: unknown,
  sender: { id?: string },
): Promise<unknown> {
  return dispatch(msg, sender);
}

export default polyfill;
