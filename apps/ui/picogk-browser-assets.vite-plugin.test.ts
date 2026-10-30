import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Build plugin tests live outside app aliases.
import { createPicogkBrowserAssets } from './picogk-browser-assets.vite-plugin.js';

const hash = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');

describe('PicoGK browser asset delivery', () => {
  it('should expose no prepared identity when the build has no bundle', () => {
    expect(createPicogkBrowserAssets(undefined).assets).toBeUndefined();
  });

  it('should preserve the verified resource layout and reject changed or escaping files', () => {
    const stage = mkdtempSync(path.join(tmpdir(), 'picogk-ui-assets-'));
    try {
      mkdirSync(path.join(stage, '_framework'));
      writeFileSync(path.join(stage, '_framework/dotnet.js'), 'host');
      const manifest = {
        single: {
          runtimeFiles: [{ path: '_framework/dotnet.js', sha256: hash('host'), byteLength: 4 }],
          references: [],
        },
      };
      const writeManifest = (): string => {
        const bytes = JSON.stringify(manifest);
        writeFileSync(path.join(stage, 'assets-manifest.json'), bytes);
        writeFileSync(path.join(stage, 'assets-receipt.json'), JSON.stringify({ sha256: hash(bytes) }));
        return hash(bytes);
      };
      const identity = writeManifest();
      const { assets, plugin } = createPicogkBrowserAssets(stage);
      expect(assets).toEqual({ url: `/picogk-browser/${identity}/assets-manifest.json`, sha256: identity });
      const emitted: string[] = [];
      if (typeof plugin.generateBundle !== 'function') {
        throw new TypeError('Missing asset emission hook');
      }
      Reflect.apply(
        plugin.generateBundle,
        {
          emitFile(file: { fileName: string }): string {
            emitted.push(file.fileName);
            return file.fileName;
          },
        },
        [{}, {}, false],
      );
      expect(emitted).toEqual([
        `picogk-browser/${identity}/assets-manifest.json`,
        `picogk-browser/${identity}/_framework/dotnet.js`,
      ]);
      writeFileSync(path.join(stage, '_framework/dotnet.js'), 'edit');
      expect(() => createPicogkBrowserAssets(stage)).toThrow('resource changed');
      manifest.single.runtimeFiles[0]!.path = '../escape';
      writeManifest();
      expect(() => createPicogkBrowserAssets(stage)).toThrow();
      writeFileSync(path.join(stage, 'assets-receipt.json'), JSON.stringify({ sha256: '0'.repeat(64) }));
      expect(() => createPicogkBrowserAssets(stage)).toThrow();
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});
