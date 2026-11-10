import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Build plugin tests live outside app aliases.
import { createPicogkBrowserAssets, readPicogkBrowserHostPin } from './picogk-browser-assets.vite-plugin.js';

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

  describe('digest mirror', () => {
    const manifestSha256 = 'b'.repeat(64);
    // The shape `scripts/src/picogk-browser-host-pin.ts` writes (schema version 1).
    const pin = {
      '//': 'Written by the release bot from a verified build; never edit by hand.',
      schemaVersion: 1,
      inputsKey: `picogk-browser-host-v2-${'9'.repeat(40)}-0.2.1-${'c'.repeat(64)}-${'d'.repeat(64)}`,
      manifest: { sha256: manifestSha256, byteLength: 4096 },
      files: { count: 471, byteLength: 193_000_000 },
    };
    const withPin = (value: unknown, run: (file: string, stage: string) => void): void => {
      const directory = mkdtempSync(path.join(tmpdir(), 'picogk-ui-pin-'));
      try {
        const file = path.join(directory, 'browser-host.pin.json');
        writeFileSync(file, JSON.stringify(value));
        run(file, directory);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    };

    it('should name the pinned manifest blob and copy nothing into the build', () => {
      withPin({ ...pin, producer: 'ignored' }, (file) => {
        const { assets, plugin } = createPicogkBrowserAssets(undefined, {
          base: 'https://dependencies.tau.new',
          pin: file,
        });
        expect(assets).toEqual({
          url: `https://dependencies.tau.new/blobs/sha256/${manifestSha256}`,
          sha256: manifestSha256,
        });
        expect(
          createPicogkBrowserAssets(undefined, { base: 'https://mirror.test/payloads/', pin: file }).assets?.url,
        ).toBe(`https://mirror.test/payloads/blobs/sha256/${manifestSha256}`);
        const emitted: string[] = [];
        if (typeof plugin.generateBundle !== 'function') {
          throw new TypeError('Missing asset emission hook');
        }
        Reflect.apply(
          plugin.generateBundle,
          {
            emitFile(emittedFile: { fileName: string }): string {
              emitted.push(emittedFile.fileName);
              return emittedFile.fileName;
            },
          },
          [{}, {}, false],
        );
        expect(emitted).toEqual([]);
      });
    });

    it('should read only the pinned manifest identity and nothing when no host is pinned', () => {
      withPin(pin, (file, directory) => {
        expect(readPicogkBrowserHostPin(file)).toEqual({ sha256: manifestSha256, byteLength: 4096 });
        expect(readPicogkBrowserHostPin(path.join(directory, 'absent.json'))).toBeUndefined();
      });
    });

    it('should leave the same-origin seed in charge when no mirror base is set', () => {
      withPin(pin, (file) => {
        expect(createPicogkBrowserAssets(undefined, { base: undefined, pin: file }).assets).toBeUndefined();
        expect(createPicogkBrowserAssets(undefined, { base: '', pin: file }).assets).toBeUndefined();
      });
    });

    it('should fail the build when both sources, no pin or an unusable base are named', () => {
      withPin(pin, (file, directory) => {
        expect(() => createPicogkBrowserAssets(directory, { base: 'https://dependencies.tau.new', pin: file })).toThrow(
          'not both',
        );
        expect(() =>
          createPicogkBrowserAssets(undefined, {
            base: 'https://dependencies.tau.new',
            pin: path.join(directory, 'absent.json'),
          }),
        ).toThrow('no browser host is pinned');
        for (const base of [
          'file:///mirror/',
          'https://user:pass@dependencies.tau.new/',
          'https://dependencies.tau.new/?v=1',
        ]) {
          expect(() => createPicogkBrowserAssets(undefined, { base, pin: file })).toThrow(
            'Invalid PICOGK_BROWSER_MIRROR_BASE',
          );
        }
      });
    });

    it.each([
      ['an upper-case manifest digest', { ...pin, manifest: { ...pin.manifest, sha256: 'B'.repeat(64) } }],
      ['no manifest byte length', { ...pin, manifest: { sha256: manifestSha256 } }],
      ['an empty manifest', { ...pin, manifest: { ...pin.manifest, byteLength: 0 } }],
      ['a bare hex inputs key', { ...pin, inputsKey: 'c'.repeat(64) }],
      ['another schema version', { ...pin, schemaVersion: 2 }],
      ['no schema version', { ...pin, schemaVersion: undefined }],
      ['no files', { ...pin, files: { count: 0, byteLength: 1 } }],
      ['the draft file count field', { ...pin, files: undefined, fileCount: 471 }],
    ])('should refuse a pin with %s', (_name, value) => {
      withPin(value, (file) => {
        expect(() => createPicogkBrowserAssets(undefined, { base: 'https://dependencies.tau.new', pin: file })).toThrow(
          expect.objectContaining({ name: 'ZodError' }),
        );
      });
    });
  });
});
