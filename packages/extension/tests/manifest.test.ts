import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ManifestContentScript {
  matches?: string[];
  js?: string[];
  run_at?: string;
  all_frames?: boolean;
}

interface Manifest {
  content_scripts?: ManifestContentScript[];
  host_permissions?: unknown;
  permissions?: string[];
}

function readManifest(name: 'chrome' | 'firefox'): Manifest {
  const path = resolve(__dirname, '..', 'manifests', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

describe('extension manifests', () => {
  it.each(['chrome', 'firefox'] as const)('%s manifest is valid JSON', (name) => {
    expect(readManifest(name)).toBeTruthy();
  });

  it.each(['chrome', 'firefox'] as const)(
    '%s manifest keeps the permission surface minimal',
    (name) => {
      const manifest = readManifest(name);
      // Storage is still the only top-level permission — autofill is
      // served via declared content_scripts, which doesn't require
      // host_permissions or activeTab.
      expect(manifest.permissions).toEqual(['storage']);
      expect(manifest.host_permissions).toBeUndefined();
    },
  );

  it.each(['chrome', 'firefox'] as const)(
    '%s manifest registers the autofill content script with conservative defaults',
    (name) => {
      const manifest = readManifest(name);
      expect(manifest.content_scripts).toHaveLength(1);
      const [script] = manifest.content_scripts!;
      expect(script).toBeDefined();
      expect(script!.matches).toEqual(['<all_urls>']);
      expect(script!.js).toEqual(['content.js']);
      // Wait for DOM/layout so form detection sees the real fields.
      expect(script!.run_at).toBe('document_idle');
      // Top-frame only — SSO iframes are a phase-3.5 problem.
      expect(script!.all_frames).toBe(false);
    },
  );
});
