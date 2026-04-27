/**
 * Build the extension once per browser, keyed off the `BROWSER` env var.
 *
 * `npm run build:chrome` → `dist-chrome/`, `npm run build:firefox` →
 * `dist-firefox/`. The popup is an HTML entry; the background script and
 * content script are emitted at fixed top-level paths so the manifests can
 * reference them by name (`background.js`, `content.js`). A small inline
 * plugin copies the matching `manifests/<browser>.json` to
 * `dist-<browser>/manifest.json` after the bundle is written.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

type Browser = 'chrome' | 'firefox';
const browser = (process.env.BROWSER ?? 'chrome') as Browser;
if (browser !== 'chrome' && browser !== 'firefox') {
  throw new Error(`Unsupported BROWSER=${browser as string}; expected chrome|firefox`);
}

const outDir = `dist-${browser}`;

export default defineConfig({
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
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/serviceWorker.ts'),
        content: resolve(__dirname, 'src/content/autofill.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
