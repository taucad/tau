import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '#check-pack-install.js';
import {
  assetUrlSpecifiers,
  consumerZodVersion,
  fallbackZodFloor,
  packageAssetUrlSpecifiers,
  importableSpecifiers,
  isToleratedImportFailure,
  manifestViolations,
  previewPackages,
  requiredArtifactPaths,
  probeSource,
  tarballManifest,
  unrewrittenSiblings,
} from '#check-pack-install.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

it('loads JSON and documentation assets without suppressing broken modules or missing assets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-pack-probe-'));
  try {
    writeFileSync(join(directory, 'schema.json'), '{"type":"object"}');
    writeFileSync(join(directory, 'agent.md'), '# Plugin instructions');
    writeFileSync(join(directory, 'invalid.json'), '{');
    writeFileSync(join(directory, 'broken.mjs'), 'throw new Error("module failure");');
    writeFileSync(join(directory, 'probe.mjs'), probeSource);
    writeFileSync(
      join(directory, 'probe-plan.json'),
      JSON.stringify({
        specifiers: ['./schema.json', './agent.md', './invalid.json', './missing.md', './broken.mjs'],
        instantiations: {},
      }),
    );
    const result = spawnSync(process.execPath, ['probe.mjs'], {
      cwd: directory,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({ specifier: './invalid.json' }),
      expect.objectContaining({ specifier: './missing.md', code: 'ENOENT' }),
      expect.objectContaining({
        specifier: './broken.mjs',
        message: 'module failure',
      }),
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const readManifest = (packageDirectory: string): Manifest =>
  JSON.parse(readFileSync(join(repositoryRoot, packageDirectory, 'package.json'), 'utf8')) as Manifest & {
    publishConfig?: { exports?: Manifest['exports'] };
  };

/** `pnpm pack` folds `publishConfig.exports` into `exports`; the gate reads the packed shape. */
const publishedManifest = (packageDirectory: string): Manifest => {
  const manifest = readManifest(packageDirectory) as Manifest & {
    publishConfig?: { exports?: Manifest['exports'] };
  };
  return {
    ...manifest,
    exports: manifest.publishConfig?.exports ?? manifest.exports,
  };
};

describe('importableSpecifiers', () => {
  it('maps the root key to the package name and skips type-only and manifest entries', () => {
    const specifiers = importableSpecifiers({
      name: '@taucad/example',
      version: '1.0.0',
      exports: {
        '.': {
          types: './dist/index.d.mts',
          import: './dist/index.mjs',
          default: './dist/index.mjs',
        },
        './kernel': {
          types: './dist/kernel.d.mts',
          default: './dist/kernel.mjs',
        },
        './agent/*': './agent/*',
        './types': { types: './dist/types.d.mts' },
        './package.json': './package.json',
      },
    });

    expect(specifiers).toStrictEqual(['@taucad/example', '@taucad/example/kernel']);
  });

  it('enumerates every published subpath of the release train', () => {
    expect(importableSpecifiers(publishedManifest('packages/geospec-engine'))).toStrictEqual([
      '@taucad/geospec-engine/node-filesystem',
      '@taucad/geospec-engine/native-pool/node',
    ]);
    expect(importableSpecifiers(publishedManifest('packages/runtime'))).toContain('@taucad/runtime/plugin');
    expect(importableSpecifiers(publishedManifest('packages/runtime'))).not.toContain('@taucad/runtime/presets');
    expect(importableSpecifiers(publishedManifest('packages/plugins/middleware'))).toContain(
      '@taucad/middleware/parameter-units',
    );
  });
});

describe('requiredArtifactPaths', () => {
  it('collects files entries and every export condition target', () => {
    expect(
      requiredArtifactPaths({
        name: '@taucad/example',
        version: '1.0.0',
        files: ['dist', 'README.md'],
        exports: {
          '.': {
            types: './dist/index.d.mts',
            import: './dist/index.mjs',
            default: './dist/index.mjs',
          },
        },
      }),
    ).toStrictEqual(['dist', 'README.md', './dist/index.d.mts', './dist/index.mjs', './dist/index.mjs']);
  });

  it('keeps the geospec-engine files entries that only prepack produces', () => {
    expect(requiredArtifactPaths(publishedManifest('packages/geospec-engine'))).toContain('provenance.json');
  });

  it('leaves wildcard exports to concrete files entries', () => {
    expect(
      requiredArtifactPaths({
        name: '@taucad/example',
        version: '1.0.0',
        files: ['agent'],
        exports: { './agent/*': './agent/*' },
      }),
    ).toStrictEqual(['agent']);
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
        {
          name: '@taucad/example',
          version: '1.0.0',
          dependencies: { '@taucad/rpc': '0.1.0' },
        },
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

describe('previewPackages', () => {
  const runtimeUrl = 'https://pkg.pr.new/taucad/tau/@taucad/runtime@1f80f46';

  it('returns the name and URL of every package a pkg-pr-new run listed', () => {
    expect(
      previewPackages({
        packages: [{ name: '@taucad/runtime', url: runtimeUrl, shasum: 'abc' }],
        templates: [],
      }),
    ).toStrictEqual([{ name: '@taucad/runtime', url: runtimeUrl }]);
  });

  it('rejects a file with no packages', () => {
    expect(() => previewPackages({ packages: [] })).toThrow('The preview file lists no packages.');
    expect(() => previewPackages(null)).toThrow('The preview file lists no packages.');
  });

  it('rejects an entry whose URL is not a pkg.pr.new URL', () => {
    expect(() =>
      previewPackages({ packages: [{ name: '@taucad/runtime', url: 'https://registry.npmjs.org/x.tgz' }] }),
    ).toThrow('not a pkg.pr.new package');
  });
});

describe('unrewrittenSiblings', () => {
  const published = new Set(['@taucad/runtime', '@taucad/units']);
  const previewVersion = '0.0.0-preview-1f80f46';

  it('rejects a registry version, a dependency kept at a registry range and a peer not on the run version', () => {
    expect(
      unrewrittenSiblings(
        {
          name: '@taucad/replicad',
          version: '0.1.0-beta.0',
          dependencies: { '@taucad/units': '0.1.0-beta.0', zod: '^4.4.3' },
          peerDependencies: { '@taucad/runtime': '^0.1.0-beta.0' },
        },
        published,
      ),
    ).toStrictEqual([
      '@taucad/replicad carries version 0.1.0-beta.0, not a 0.0.0-preview-<sha> version.',
      '@taucad/replicad declares @taucad/units as 0.1.0-beta.0, not a pkg.pr.new URL.',
      "@taucad/replicad declares peer @taucad/runtime as ^0.1.0-beta.0, not the run's 0.1.0-beta.0.",
    ]);
  });

  it('accepts dependencies on run URLs and peers on the run version, and leaves other names alone', () => {
    expect(
      unrewrittenSiblings(
        {
          name: '@taucad/host',
          version: previewVersion,
          dependencies: {
            '@taucad/units': 'https://pkg.pr.new/taucad/tau/@taucad/units@1f80f46a34135790d19f791e8c305c044d1518fd',
          },
          peerDependencies: { '@taucad/runtime': previewVersion, '@taucad/geospec-engine': '^0.1.0-beta.0' },
        },
        published,
      ),
    ).toStrictEqual([]);
  });
});

describe('consumerZodVersion', () => {
  it('takes an exact pin when every caret floor admits it', () => {
    expect(
      consumerZodVersion([
        { name: '@taucad/cli', version: '1.0.0', dependencies: { zod: '4.4.3' } },
        { name: 'geospec', version: '1.0.0', dependencies: { zod: '^4.1.0' } },
      ]),
    ).toMatchObject({ version: '4.4.3', exact: true });
  });

  it('rejects an exact pin below another floor, and two different pins', () => {
    expect(() =>
      consumerZodVersion([
        { name: '@taucad/cli', version: '1.0.0', dependencies: { zod: '4.4.3' } },
        { name: 'geospec', version: '1.0.0', dependencies: { zod: '^4.10.0' } },
      ]),
    ).toThrow('pinned exactly');
    expect(() =>
      consumerZodVersion([
        { name: '@taucad/cli', version: '1.0.0', dependencies: { zod: '4.4.3' } },
        { name: 'geospec', version: '1.0.0', dependencies: { zod: '4.4.4' } },
      ]),
    ).toThrow('different zod versions');
  });

  it('pins the highest declared peer floor when no package depends on a newer Zod', () => {
    expect(
      consumerZodVersion([
        { name: '@taucad/runtime', version: '1.0.0', peerDependencies: { zod: '^4.1.0' } },
        { name: '@taucad/viewer', version: '1.0.0', peerDependencies: { zod: '^4.2.0' } },
        { name: '@taucad/units', version: '1.0.0', dependencies: { zod: '^4.0.0' } },
      ]),
    ).toStrictEqual({ version: '4.2.0', floor: '4.2.0', raisedBy: [], exact: false });
  });

  it('falls back to the default floor when no package peers Zod', () => {
    expect(consumerZodVersion([{ name: 'x', version: '1.0.0' }])).toStrictEqual({
      version: fallbackZodFloor,
      floor: fallbackZodFloor,
      raisedBy: [],
      exact: false,
    });
  });

  it('refuses a Zod peer that is not a caret range', () => {
    expect(() => consumerZodVersion([{ name: 'x', version: '1.0.0', peerDependencies: { zod: '4.1.0' } }])).toThrow(
      'a Zod peer is a caret range',
    );
  });

  it('raises the pin to the highest dependency floor and names who raised it', () => {
    expect(
      consumerZodVersion([
        { name: '@taucad/cli', version: '1.0.0', dependencies: { zod: '^4.4.3' } },
        { name: 'geospec', version: '1.0.0', dependencies: { zod: '^4.10.0' } },
      ]),
    ).toStrictEqual({
      version: '4.10.0',
      floor: fallbackZodFloor,
      raisedBy: ['@taucad/cli (zod ^4.4.3)', 'geospec (zod ^4.10.0)'],
      exact: false,
    });
  });

  it('refuses a Zod dependency range it cannot read a floor from', () => {
    expect(() => consumerZodVersion([{ name: 'x', version: '1.0.0', dependencies: { zod: '>=4' } }])).toThrow(
      'neither a caret range nor a version',
    );
  });
});

describe('tarballManifest', () => {
  it('reads package/package.json from an npm-packed tarball', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-pack-manifest-'));
    try {
      const packageDirectory = join(directory, 'source');
      mkdirSync(packageDirectory);
      writeFileSync(join(packageDirectory, 'README.md'), '# Example');
      writeFileSync(
        join(packageDirectory, 'package.json'),
        JSON.stringify({ name: '@taucad/example', version: '1.2.3', dependencies: { zod: '^4.4.3' } }),
      );
      const result = spawnSync('npm', ['pack', '--silent', '--pack-destination', directory], {
        cwd: packageDirectory,
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      const manifest = tarballManifest(readFileSync(join(directory, result.stdout.trim())));

      expect(manifest).toMatchObject({ name: '@taucad/example', version: '1.2.3', dependencies: { zod: '^4.4.3' } });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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

  it('rejects a missing sibling file of an instantiated native payload', () => {
    expect(
      isToleratedImportFailure(
        {
          specifier: '@taucad/example (instantiate)',
          code: 'ERR_MODULE_NOT_FOUND',
          message:
            "Cannot find module '/app/node_modules/@taucad/example/dist/native/example_multi.js' imported from /app/node_modules/@taucad/example/dist/native/init.js",
        },
        ['electron', 'vite'],
      ),
    ).toBe(false);
  });

  it('does not tolerate a CommonJS interop failure in a viewer parameter subpath', () => {
    expect(
      isToleratedImportFailure(
        {
          specifier: '@taucad/viewer/parameters/rjsf-validator',
          message:
            "Named export 'validationDataMerge' not found. The requested module '@rjsf/utils' is a CommonJS module, which may not support all module.exports as named exports.",
        },
        [],
      ),
    ).toBe(false);
  });

  it('does not tolerate removed environment-dependent subpaths', () => {
    expect(
      isToleratedImportFailure(
        {
          specifier: '@taucad/runtime/worker/node',
          message: 'removed worker entry',
        },
        [],
      ),
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
         const dynamic = new URL(import.meta.resolve(specifier));
         const template = new URL(import.meta.resolve(\`\${owner}/package.json\`));`,
      ),
    ).toStrictEqual(['replicad-opencascadejs/wasm', 'replicad-opencascadejs/multi/wasm']);
  });
});
