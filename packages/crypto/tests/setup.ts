/**
 * Polyfill `globalThis.crypto` for Node < 19 where it isn't a global.
 * On Node 19+ this is a no-op.
 */
import { webcrypto } from 'node:crypto';

if (typeof (globalThis as { crypto?: unknown }).crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  });
}
