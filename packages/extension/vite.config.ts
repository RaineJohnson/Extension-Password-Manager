/**
 * Build the extension once per browser, keyed off the `BROWSER` env var.
 *
 * Two passes per browser:
 *   1. `ENTRY=extension` (default) emits the popup HTML/asset chunks and
 *      `background.js` as ES modules — that's what `popup.html` and the
 *      MV3 service worker entry expect.
 *   2. `ENTRY=content` emits `content.js` as a single self-contained IIFE
 *      into the same `dist-<browser>/` directory. Content scripts in
 *      MV3 don't have portable ESM support across Chrome and Firefox,
 *      so the content script is bundled standalone and registered via
 *      `content_scripts` in the manifest.
 *
 * `npm run build:chrome` chains both passes; the content pass uses
 * `emptyOutDir: false` so it doesn't clobber the extension pass.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

type Browser = 'chrome' | 'firefox';
type Entry = 'extension' | 'content';

const browser = (process.env.BROWSER ?? 'chrome') as Browser;
if (browser !== 'chrome' && browser !== 'firefox') {
  throw new Error(`Unsupported BROWSER=${browser as string}; expected chrome|firefox`);
}
const entry = (process.env.ENTRY ?? 'extension') as Entry;
if (entry !== 'extension' && entry !== 'content') {
  throw new Error(`Unsupported ENTRY=${entry as string}; expected extension|content`);
}

const outDir = `dist-${browser}`;

// API base URL is injected at build time via `define`. Override with
// `VITE_API_BASE_URL=https://... npm run build:chrome` for non-local builds.
// `src/config/env.ts` reads `__API_BASE_URL__` and falls back to localhost
// when the define is absent (Jest doesn't run this config).
const apiBaseUrl = process.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const sourcemap = process.env.VITE_SOURCEMAP === 'true';

const contentConfig = defineConfig({
  define: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl),
  },
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/autofill.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        inlineDynamicImports: true,
      },
    },
  },
});

const extensionConfig = defineConfig({
  define: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl),
  },
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      apply: 'build',
      closeBundle() {
        const src = resolve(__dirname, `manifests/${browser}.json`);
        const dst = resolve(__dirname, outDir, 'manifest.json');
        mkdirSync(resolve(__dirname, outDir), { recursive: true });
        copyFileSync(src, dst);
      },
    },
  ],
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/serviceWorker.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});

export default entry === 'content' ? contentConfig : extensionConfig;
