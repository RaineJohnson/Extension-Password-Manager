import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readManifest(name: 'chrome' | 'firefox') {
  const path = resolve(__dirname, '..', 'manifests', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as {
    content_scripts?: unknown;
    host_permissions?: unknown;
    permissions?: string[];
  };
}

describe('extension manifests', () => {
  it.each(['chrome', 'firefox'] as const)('%s manifest is valid JSON', (name) => {
    expect(readManifest(name)).toBeTruthy();
  });

  it.each(['chrome', 'firefox'] as const)(
    '%s manifest does not request page-wide access before autofill exists',
    (name) => {
      const manifest = readManifest(name);
      expect(manifest.content_scripts).toBeUndefined();
      expect(manifest.host_permissions).toBeUndefined();
      expect(manifest.permissions).toEqual(['storage']);
    },
  );
});
