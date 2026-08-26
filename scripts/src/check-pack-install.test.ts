import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '#check-pack-install.js';
import {
  assetUrlSpecifiers,
  packageAssetUrlSpecifiers,
  importableSpecifiers,
  isToleratedImportFailure,
  manifestViolations,
  requiredArtifactPaths,
} from '#check-pack-install.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const readManifest = (packageDirectory: string): Manifest =>
  JSON.parse(readFileSync(join(repositoryRoot, packageDirectory, 'package.json'), 'utf8')) as Manifest & {
    publishConfig?: { exports?: Manifest['exports'] };
  };

/** `pnpm pack` folds `publishConfig.exports` into `exports`; the gate reads the packed shape. */
const publishedManifest = (packageDirectory: string): Manifest => {
  const manifest = readManifest(packageDirectory) as Manifest & { publishConfig?: { exports?: Manifest['exports'] } };
  return { ...manifest, exports: manifest.publishConfig?.exports ?? manifest.exports };
};

describe('importableSpecifiers', () => {
  it('maps the root key to the package name and skips type-only and manifest entries', () => {
    const specifiers = importableSpecifiers({
      name: '@taucad/example',
      version: '1.0.0',
      exports: {
        '.': { types: './dist/index.d.mts', import: './dist/index.mjs', default: './dist/index.mjs' },
        './kernel': { types: './dist/kernel.d.mts', default: './dist/kernel.mjs' },
        './types': { types: './dist/types.d.mts' },
        './package.json': './package.json',
      },
    });

    expect(specifiers).toStrictEqual(['@taucad/example', '@taucad/example/kernel']);
  });

  it('enumerates every published subpath of the release train', () => {
    expect(importableSpecifiers(publishedManifest('packages/geospec-engine'))).toStrictEqual([
      '@taucad/geospec-engine',
      '@taucad/geospec-engine/register',
      '@taucad/geospec-engine/register/node',
      '@taucad/geospec-engine/native/opencascade/single',
      '@taucad/geospec-engine/native/opencascade/single/wasm-url',
    ]);
    expect(importableSpecifiers(publishedManifest('packages/runtime'))).toContain('@taucad/runtime/plugin');
    expect(importableSpecifiers(publishedManifest('packages/runtime'))).not.toContain('@taucad/runtime/presets');
  });
});

describe('requiredArtifactPaths', () => {
  it('collects files entries and every export condition target', () => {
    expect(
      requiredArtifactPaths({
        name: '@taucad/example',
        version: '1.0.0',
        files: ['dist', 'README.md'],
        exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs', default: './dist/index.mjs' } },
      }),
    ).toStrictEqual(['dist', 'README.md', './dist/index.d.mts', './dist/index.mjs', './dist/index.mjs']);
  });

  it('keeps the geospec-engine files entries that only prepack produces', () => {
    expect(requiredArtifactPaths(publishedManifest('packages/geospec-engine'))).toContain('provenance.json');
  });
});

const bundledLibraryNames = new Set(['@taucad/rpc', '@taucad/vm']);

describe('manifestViolations', () => {
  it('rejects unrewritten workspace, file, and catalog specifiers', () => {
    expect(
      manifestViolations(
        {
          name: '@taucad/example',
          version: '1.0.0',
          dependencies: { '@taucad/runtime': 'workspace:*' },
          optionalDependencies: { sharp: 'file:../sharp' },
          peerDependencies: { zod: 'catalog:' },
        },
        bundledLibraryNames,
      ),
    ).toStrictEqual([
      '@taucad/example declares @taucad/runtime as workspace:*.',
      '@taucad/example declares sharp as file:../sharp.',
      '@taucad/example declares zod as catalog:.',
    ]);
  });

  it('rejects a bundled private library that escaped into a published manifest', () => {
    expect(
      manifestViolations(
        { name: '@taucad/example', version: '1.0.0', dependencies: { '@taucad/rpc': '0.1.0' } },
        bundledLibraryNames,
      ),
    ).toStrictEqual(['@taucad/example leaks bundled private dependency @taucad/rpc.']);
  });

  it('accepts a rewritten manifest', () => {
    expect(
      manifestViolations(
        {
          name: '@taucad/example',
          version: '1.0.0',
          dependencies: { '@taucad/runtime': '0.1.0-beta.1', zod: '^4.4.3' },
        },
        bundledLibraryNames,
      ),
    ).toStrictEqual([]);
  });
});

describe('isToleratedImportFailure', () => {
  it('tolerates a missing external optional peer', () => {
    expect(
      isToleratedImportFailure(
        {
          specifier: '@taucad/runtime/electron/main',
          code: 'ERR_MODULE_NOT_FOUND',
          message:
            "Cannot find package 'electron' imported from /app/node_modules/@taucad/runtime/dist/electron/main.mjs",
        },
        ['electron', 'vite'],
      ),
    ).toBe(true);
  });

  it('rejects a missing package that is not a declared peer', () => {
    expect(
      isToleratedImportFailure(
        {
          specifier: '@taucad/react',
          code: 'ERR_MODULE_NOT_FOUND',
          message: "Cannot find package '@taucad/runtime' imported from /app/node_modules/@taucad/react/dist/index.mjs",
        },
        ['react'],
      ),
    ).toBe(false);
  });

  it('rejects a missing sibling file — the F2 native variant break', () => {
    expect(
      isToleratedImportFailure(
        {
          specifier: '@taucad/geospec-engine (instantiate)',
          code: 'ERR_MODULE_NOT_FOUND',
          message:
            "Cannot find module '/app/node_modules/@taucad/geospec-engine/dist/native/opencascade/geospec_opencascade_multi.js' imported from /app/node_modules/@taucad/geospec-engine/dist/native/opencascade/init.js",
        },
        ['electron', 'vite'],
      ),
    ).toBe(false);
  });

  it('does not tolerate removed environment-dependent subpaths', () => {
    expect(
      isToleratedImportFailure({ specifier: '@taucad/runtime/worker/node', message: 'removed worker entry' }, []),
    ).toBe(false);
  });
});

describe('assetUrlSpecifiers', () => {
  it('collects the relative asset URLs a published module resolves against itself', () => {
    expect(
      assetUrlSpecifiers(
        `const wasm = new URL("./wasm/replicad_single.wasm", import.meta.url);
         const font = new URL('fonts/Geist-Regular.ttf', import.meta.url);
         const cdn = new URL('https://cdn.example/x.wasm', import.meta.url);
         const dynamic = new URL(name, import.meta.url);
         const other = new URL('./x.wasm', base);`,
      ),
    ).toStrictEqual(['./wasm/replicad_single.wasm', 'fonts/Geist-Regular.ttf']);
  });

  it('collects exported package assets and ignores dynamic resolution', () => {
    expect(
      packageAssetUrlSpecifiers(
        `const single = new URL(import.meta.resolve('replicad-opencascadejs/wasm'));
         const multi = new URL(import.meta.resolve("replicad-opencascadejs/multi/wasm")).href;
         const dynamic = new URL(import.meta.resolve(specifier));`,
      ),
    ).toStrictEqual(['replicad-opencascadejs/wasm', 'replicad-opencascadejs/multi/wasm']);
  });
});
