/**
 * Build-time environment knobs.
 *
 * Vite's `define` plugin substitutes `__API_BASE_URL__` with a string
 * literal at build time (see `vite.config.ts`). Under Jest, no substitution
 * happens, so the `typeof` guard falls back to the localhost default —
 * tests can construct an HTTP client with their own base URL and never
 * touch this constant.
 */

declare const __API_BASE_URL__: string | undefined;

const FALLBACK_API_BASE_URL = 'http://localhost:3000';

export const API_BASE_URL: string =
  typeof __API_BASE_URL__ === 'string' && __API_BASE_URL__.length > 0
    ? __API_BASE_URL__
    : FALLBACK_API_BASE_URL;
