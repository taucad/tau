/* eslint-disable @typescript-eslint/naming-convention -- package export maps use literal subpath keys */
/* oxlint-disable no-restricted-imports, import/extensions -- Standalone tool tests import their adjacent helper. */
import { describe, expect, it } from 'vitest';
import {
  bundledArtifactIssues,
  bundledWorkspaceMirrors,
  bundleDeclarationClosure,
  bundleOwnershipIssues,
  bundleWitnessIssues,
  copyTargetPaths,
  doubledPathSegments,
  emittedSpecifiers,
  hostTargetIssues,
  internalImportsIssues,
  libDependencyIssues,
  packageMetadataIssues,
  peerRules,
  peerDependencyIssues,
  pluginRuntimePeerDependencyIssues,
  probedSpecifiers,
  publishableManifestIssues,
  strictConsumerCompilerOptions,
  vendoredAssetIssues,
  vendoredNodeModulesIssues,
  workspaceRangeIssues,
} from './pkgcheck-metadata.js';

describe('pkgcheck metadata', () => {
  it('reports development/publish export drift and missing packed files', () => {
    const issues = packageMetadataIssues(
      {
        exports: { '.': './src/index.ts', './node': './src/node.ts' },
        files: ['dist', 'README.md'],
        publishConfig: { exports: { '.': './dist/index.mjs' } },
      },
      (path) => path === 'dist',
    );

    expect(issues).toEqual([
      'publishConfig.exports is missing development export: ./node',
      'files entry does not exist: README.md',
    ]);
  });

  it('requires the common publishable manifest fields and packs an existing changelog', () => {
    const manifest = {
      type: 'module',
      sideEffects: false,
      engines: { node: '>=24.0.0' },
      homepage: 'https://github.com/taucad/tau/tree/main/packages/example#readme',
      bugs: { url: 'https://github.com/taucad/tau/issues' },
      repository: { directory: 'packages/example' },
      files: ['dist', 'LICENSE', 'README.md', 'CHANGELOG.md'],
    };
    expect(
      publishableManifestIssues({
        packageName: '@taucad/example',
        projectDirectory: 'packages/example',
        manifest,
        pathExists: (path) => path === 'CHANGELOG.md',
      }),
    ).toEqual([]);
    expect(
      publishableManifestIssues({
        packageName: '@taucad/example',
        projectDirectory: 'packages/example',
        manifest: { ...manifest, sideEffects: undefined, files: ['dist'] },
        pathExists: (path) => path === 'CHANGELOG.md',
      }),
    ).toEqual([
      '@taucad/example: package.json files must include LICENSE',
      '@taucad/example: package.json files must include the existing CHANGELOG.md',
    ]);
  });

  it('reports workspace modules bundled by more than one publishable root', () => {
    expect(
      bundleOwnershipIssues([
        { owner: '@taucad/runtime', bundled: ['@taucad/vm'] },
        { owner: 'geospec', bundled: ['@taucad/vm'] },
      ]),
    ).toEqual(['@taucad/vm is bundled by both @taucad/runtime and geospec']);
  });

  it('reports a mirror the manifest/tag rule never permitted, and leaves multi-owner rules alone', () => {
    expect(
      bundleWitnessIssues(
        [
          { owner: '@taucad/runtime', bundled: ['@taucad/runtime', '@taucad/rpc', '@taucad/billing'] },
          { owner: '@taucad/esbuild', bundled: ['@taucad/vm'] },
        ],
        new Map([
          ['@taucad/runtime', ['@taucad/rpc']],
          // A library the rule permits two owners is the release resolver's own
          // invariant (`bundleOwnershipIssues`), not a mirror-side witness failure.
          ['@taucad/esbuild', ['@taucad/vm', '@taucad/rpc']],
        ]),
      ),
    ).toEqual([
      "@taucad/billing is mirrored into @taucad/runtime's dist but @taucad/runtime's manifest and tags do not permit bundling it",
    ]);
  });

  it('accepts transitive private-library declarations but never transitive devDependencies', () => {
    const closure = bundleDeclarationClosure(new Map([['@taucad/runtime', ['@taucad/types']]]), [
      {
        name: '@taucad/types',
        dependencies: { '@taucad/units': 'workspace:*' },
        devDependencies: { '@taucad/test-only': 'workspace:*' },
      },
      { name: '@taucad/units' },
      { name: '@taucad/test-only' },
    ]);

    expect(closure.get('@taucad/runtime')).toEqual(['@taucad/types', '@taucad/units']);
    expect(
      bundleWitnessIssues(
        [{ owner: '@taucad/runtime', bundled: ['@taucad/runtime', '@taucad/types', '@taucad/units'] }],
        closure,
      ),
    ).toEqual([]);
  });

  it('reports bundled production dependencies and emitted imports while ignoring JSDoc examples', () => {
    expect(
      bundledArtifactIssues(
        { '@taucad/filesystem': 'workspace:*' },
        [
          {
            path: 'dist/index.d.mts',
            source: `
              /** import { thing } from '@taucad/utils'; */
              export type { RuntimeFileSystem } from '@taucad/filesystem';
              export type Value = import('@taucad/utils').Value;
              const rpc = import('@taucad/rpc/bridge');
            `,
          },
        ],
        ['@taucad/filesystem', '@taucad/rpc', '@taucad/utils'],
      ),
    ).toEqual([
      'dist/index.d.mts: bundled package specifier remains: @taucad/filesystem',
      'dist/index.d.mts: bundled package specifier remains: @taucad/rpc/bridge',
      'dist/index.d.mts: bundled package specifier remains: @taucad/utils',
      'package.json: bundled package remains a production dependency: @taucad/filesystem',
    ]);
  });

  it('resolves copy targets as destination directories, honouring rename and the default outDir', () => {
    expect(
      copyTargetPaths(
        [
          { from: 'src/kernels/replicad/wasm', to: 'dist/kernels/replicad' },
          { from: '../../license', to: 'dist', rename: 'LICENSE' },
          { from: ['native/dist/init.js', 'native/dist/init.d.ts'], to: 'dist/native' },
          'assets/logo.svg',
          { from: 'src/**/*.wasm', to: 'dist' },
        ],
        'dist',
      ),
    ).toEqual([
      'dist/kernels/replicad/wasm',
      'dist/LICENSE',
      'dist/native/init.js',
      'dist/native/init.d.ts',
      'dist/logo.svg',
    ]);
  });

  it('reports an emitted path whose segment repeats its parent', () => {
    expect(
      doubledPathSegments([
        'dist/kernels/replicad/wasm/replicad_single.wasm',
        'dist/kernels/kernels/stub.mjs',
        'dist/fonts/fonts/HelvetikerRegular.json',
      ]),
    ).toEqual(['dist/fonts/fonts', 'dist/kernels/kernels']);
  });

  it('detects bundled workspace projects from the mirror directories unbundled builds emit', () => {
    expect(
      bundledWorkspaceMirrors(
        ['kernels', 'libs', 'libs/vm', 'libs/vm/src', 'libs/vm/src/wasm', 'packages/runtime'],
        [
          { name: '@taucad/vm', directory: 'libs/vm' },
          { name: '@taucad/chat', directory: 'libs/chat' },
          { name: '@taucad/billing', directory: 'apps/libs/billing' },
        ],
      ),
    ).toEqual(['@taucad/vm']);
  });

  it('probes every published subpath except the ones with a recorded reason', () => {
    expect(
      probedSpecifiers(
        '@taucad/runtime',
        {
          '.': './dist/index.mjs',
          './internal/*': './dist/internal/*.mjs',
          './nextjs': './dist/nextjs/index.mjs',
          './node': './dist/node.mjs',
          './package.json': './package.json',
        },
        { './nextjs': 'next ships declaration errors of its own' },
      ),
    ).toEqual({ specifiers: ['@taucad/runtime', '@taucad/runtime/node'], issues: [] });
  });

  it('reports a recorded reason for a subpath the package no longer publishes', () => {
    expect(
      probedSpecifiers(
        '@taucad/runtime',
        { '.': './dist/index.mjs' },
        { './gone': 'a reason that outlived its export' },
      ).issues,
    ).toEqual(['recorded strict-consumer exclusion names a subpath this package does not publish: ./gone']);
  });

  it('keeps both consumer probes strict with library checking enabled', () => {
    expect(strictConsumerCompilerOptions('bundler')).toMatchObject({
      module: 'ESNext',
      moduleResolution: 'bundler',
      skipLibCheck: false,
      strict: true,
    });
    expect(strictConsumerCompilerOptions('nodenext')).toMatchObject({
      module: 'NodeNext',
      moduleResolution: 'nodenext',
      skipLibCheck: false,
      strict: true,
    });
  });
});

const zodRules = [{ name: 'zod', reason: 'schema instance and type identity must not fork across an install' }];

/** What rolldown-dts bakes into a declaration when the package never declared zod. */
const vendoredZodSpecifier = './node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.mjs';

describe('emittedSpecifiers', () => {
  it('reads every module specifier form from the syntax tree and ignores prose', () => {
    expect(
      emittedSpecifiers([
        {
          path: 'dist/index.d.mts',
          source: `
            /** Absolute path (e.g., '/node_modules/lodash'). */
            import { a } from 'zod';
            export type { B } from './b.mjs';
            export type C = import('zod/v4/core').$strip;
            declare module 'virtual:tau';
            const d = import('./d.mjs');
            const e = require('node:fs');
            const notAnImport = '/node_modules/lodash/index.js';
          `,
        },
      ]),
    ).toEqual([
      { path: 'dist/index.d.mts', specifier: 'zod' },
      { path: 'dist/index.d.mts', specifier: './b.mjs' },
      { path: 'dist/index.d.mts', specifier: 'zod/v4/core' },
      { path: 'dist/index.d.mts', specifier: 'virtual:tau' },
      { path: 'dist/index.d.mts', specifier: './d.mjs' },
      { path: 'dist/index.d.mts', specifier: 'node:fs' },
    ]);
  });
});

describe('vendoredNodeModulesIssues', () => {
  it('reports the vendored tree and every specifier that reaches into it', () => {
    expect(
      vendoredNodeModulesIssues(
        '@taucad/gltf',
        [
          { path: 'dist/plugin.d.mts', specifier: vendoredZodSpecifier },
          { path: 'dist/plugin.mjs', specifier: 'zod' },
        ],
        ['node_modules', 'node_modules/.pnpm', 'assets'],
      ),
    ).toEqual([
      '@taucad/gltf: dist/node_modules exists; declare the vendored dependencies so the build keeps them external',
      `@taucad/gltf: dist/plugin.d.mts imports a vendored specifier: ${vendoredZodSpecifier}`,
    ]);
  });

  it('ignores the runtime prose that describes its own virtual /node_modules/ mount', () => {
    expect(
      vendoredNodeModulesIssues(
        '@taucad/runtime',
        emittedSpecifiers([
          {
            path: 'dist/libs/utils/src/import.utils.d.mts',
            source: `
              /** Absolute path (e.g., '/node_modules/lodash'). */
              export declare const cdnPath: (specifier: string) => string;
              export const mount = '/node_modules/lodash/index.js';
            `,
          },
        ]),
        ['libs', 'libs/utils'],
      ),
    ).toEqual([]);
  });
});

describe('peerDependencyIssues', () => {
  it('rejects a production dependency and demands the peer', () => {
    expect(
      peerDependencyIssues({
        packageName: '@taucad/image',
        manifest: { dependencies: { zod: 'catalog:' } },
        emitted: [{ path: 'dist/image-export-options.mjs', specifier: 'zod' }],
        rules: zodRules,
      }),
    ).toEqual([
      '@taucad/image: zod is a production dependency; it must be a required peerDependency with a workspace devDependency — schema instance and type identity must not fork across an install',
      '@taucad/image: zod must be declared in peerDependencies (witness: dist/image-export-options.mjs imports "zod")',
    ]);
  });

  it('accepts the peer plus workspace devDependency shape a subpath witness demands', () => {
    expect(
      peerDependencyIssues({
        packageName: '@taucad/gltf',
        manifest: { peerDependencies: { zod: '^4.0.0' }, devDependencies: { zod: 'catalog:' } },
        emitted: [{ path: 'dist/plugin.d.mts', specifier: 'zod/v4/core' }],
        rules: zodRules,
      }),
    ).toEqual([]);
  });

  it('rejects an optional peer: a forked schema instance is not a degraded mode', () => {
    expect(
      peerDependencyIssues({
        packageName: '@taucad/zoo',
        manifest: {
          peerDependencies: { zod: '^4.0.0' },
          peerDependenciesMeta: { zod: { optional: true } },
          devDependencies: { zod: 'catalog:' },
        },
        emitted: [{ path: 'dist/plugin.mjs', specifier: 'zod' }],
        rules: zodRules,
      }),
    ).toEqual([
      '@taucad/zoo: peerDependenciesMeta.zod.optional is true; the peer is required — schema instance and type identity must not fork across an install',
    ]);
  });

  it('rejects a peer nothing in the emit imports', () => {
    expect(
      peerDependencyIssues({
        packageName: '@taucad/react',
        manifest: { peerDependencies: { zod: '^4.0.0' }, devDependencies: { zod: 'catalog:' } },
        emitted: [{ path: 'dist/index.mjs', specifier: '@taucad/runtime' }],
        rules: zodRules,
      }),
    ).toEqual(['@taucad/react: zod is a peerDependency but no emitted file imports it; drop the peer or fix the emit']);
  });

  it('rejects a peer without the workspace devDependency that develops against it', () => {
    expect(
      peerDependencyIssues({
        packageName: '@taucad/brep',
        manifest: { peerDependencies: { zod: '^4.0.0' } },
        emitted: [{ path: 'dist/brep-kernel.d.mts', specifier: 'zod' }],
        rules: zodRules,
      }),
    ).toEqual([
      '@taucad/brep: zod is a peerDependency without a matching devDependency; the workspace must develop against the peer it declares',
    ]);
  });

  it('reads a baked store path as the same witness and rejects an optionalDependency', () => {
    expect(
      peerDependencyIssues({
        packageName: '@taucad/rhino',
        manifest: { optionalDependencies: { zod: 'catalog:' } },
        emitted: [{ path: 'dist/plugin.d.mts', specifier: vendoredZodSpecifier }],
        rules: zodRules,
      }),
    ).toEqual([
      '@taucad/rhino: zod is an optionalDependency; it must be a required peerDependency with a workspace devDependency — schema instance and type identity must not fork across an install',
      `@taucad/rhino: zod must be declared in peerDependencies (witness: dist/plugin.d.mts imports "${vendoredZodSpecifier}")`,
    ]);
  });

  it('accepts a leaf dependency whose own emit never imports the peer it satisfies', () => {
    expect(
      peerDependencyIssues({
        packageName: '@taucad/cli',
        manifest: { dependencies: { zod: 'catalog:', '@taucad/runtime': 'workspace:*' } },
        emitted: [{ path: 'dist/index.mjs', specifier: '@taucad/runtime' }],
        rules: zodRules,
      }),
    ).toEqual([]);
  });

  it('requires runtime as a peer except for the named leaf dependency allowlist', () => {
    const runtimeWitness = [{ path: 'dist/index.mjs', specifier: '@taucad/runtime/worker' }];
    expect(
      peerDependencyIssues({
        packageName: '@taucad/image',
        manifest: { dependencies: { '@taucad/runtime': 'workspace:*' } },
        emitted: runtimeWitness,
        rules: peerRules,
      }),
    ).toEqual([
      '@taucad/image: @taucad/runtime is a production dependency; it must be a required peerDependency with a workspace devDependency — one runtime instance must own protocol and type identity across an install',
      '@taucad/image: @taucad/runtime must be declared in peerDependencies (witness: dist/index.mjs imports "@taucad/runtime/worker")',
    ]);
    expect(
      peerDependencyIssues({
        packageName: '@taucad/cli',
        manifest: { dependencies: { '@taucad/runtime': 'workspace:*' } },
        emitted: runtimeWitness,
        rules: peerRules,
      }),
    ).toEqual([]);
  });
});

describe('libDependencyIssues', () => {
  it('rejects identity singletons in private-library runtime buckets and keeps ordinary dependencies', () => {
    expect(
      libDependencyIssues([
        { name: '@taucad/chat', dependencies: { zod: 'catalog:', 'safe-regex': 'catalog:' } },
        { name: '@taucad/lsp', optionalDependencies: { '@taucad/runtime': 'workspace:*' } },
      ]),
    ).toEqual([
      '@taucad/chat: zod must not be declared in dependencies; its bundle owner or leaf supplies it',
      '@taucad/lsp: @taucad/runtime must not be declared in optionalDependencies; its bundle owner or leaf supplies it',
    ]);
  });
});

describe('workspaceRangeIssues', () => {
  it('accepts uniform workspace:* dependencies beside a real peer range', () => {
    expect(
      workspaceRangeIssues([
        {
          name: '@taucad/manifold',
          dependencies: { '@taucad/geometry-core': 'workspace:*', 'manifold-3d': 'catalog:' },
          devDependencies: { '@taucad/runtime': 'workspace:*' },
          peerDependencies: { '@taucad/runtime': '^0.1.0-beta.0' },
        },
      ]),
    ).toEqual([]);
  });

  it('reports a caret workspace range and a peer declared through the workspace protocol', () => {
    expect(
      workspaceRangeIssues([
        { name: '@taucad/assimp', dependencies: { '@taucad/geometry-core': 'workspace:^' } },
        { name: '@taucad/brep', peerDependencies: { '@taucad/runtime': 'workspace:*' } },
      ]),
    ).toEqual([
      '@taucad/assimp: @taucad/geometry-core is declared "workspace:^" in dependencies; workspace ranges must be uniform "workspace:*"',
      '@taucad/brep: @taucad/runtime is declared "workspace:*" in peerDependencies; a peer must publish a real semver range, not the workspace protocol',
    ]);
  });
});

describe('internalImportsIssues', () => {
  it('accepts the canonical map and an absent one', () => {
    expect(
      internalImportsIssues(
        [
          { name: '@taucad/image', imports: { '#*.js': './src/*.ts', '#*': './src/*' } },
          { name: '@taucad/oxlint', imports: undefined },
        ],
        {},
      ),
    ).toEqual([]);
  });

  it('reports package-specific aliases, retargets, and missing canonical entries', () => {
    expect(
      internalImportsIssues(
        [
          { name: '@taucad/occt-core', imports: { '#oc-init.js': './src/oc-init.ts' } },
          {
            name: '@taucad/tau-examples',
            imports: { '#scripts/*.js': './scripts/*.ts', '#*.js': './src/*.ts', '#*': './dist/*' },
          },
        ],
        {},
      ),
    ).toEqual([
      '@taucad/occt-core: package.json imports is missing the canonical entry "#*.js": "./src/*.ts"',
      '@taucad/occt-core: package.json imports is missing the canonical entry "#*": "./src/*"',
      '@taucad/occt-core: package.json imports declares a package-specific alias: "#oc-init.js": "./src/oc-init.ts" (allowed keys: "#*.js", "#*")',
      '@taucad/tau-examples: package.json imports retargets "#*" to "./dist/*" (expected "./src/*")',
      '@taucad/tau-examples: package.json imports declares a package-specific alias: "#scripts/*.js": "./scripts/*.ts" (allowed keys: "#*.js", "#*")',
    ]);
  });

  it('rejects a conditional object in place of a canonical string target', () => {
    expect(
      internalImportsIssues(
        [
          {
            name: '@taucad/geospec-engine',
            imports: { '#*.js': { browser: './src/browser/*.ts', default: './src/*.ts' }, '#*': './src/*' },
          },
        ],
        {},
      ),
    ).toEqual([
      '@taucad/geospec-engine: package.json imports retargets "#*.js" to {"browser":"./src/browser/*.ts","default":"./src/*.ts"} (expected "./src/*.ts")',
    ]);
  });

  it('honours a recorded exception and reports one that outlived the key it excused', () => {
    const canonical = { '#*.js': './src/*.ts', '#*': './src/*' };
    expect(
      internalImportsIssues(
        [
          {
            name: '@taucad/geospec-engine',
            imports: {
              '#cache/node-evidence-store.js': {
                browser: './src/cache/browser-evidence-store.ts',
                default: './src/cache/node-evidence-store.ts',
              },
              ...canonical,
            },
          },
          { name: '@taucad/image', imports: canonical },
        ],
        {
          '@taucad/geospec-engine': { '#cache/node-evidence-store.js': 'browser/default platform swap' },
          '@taucad/image': { '#gone.js': 'an exception that outlived its key' },
        },
      ),
    ).toEqual(['@taucad/image: recorded imports exception names a key this package does not declare: "#gone.js"']);
  });
});

describe('vendoredAssetIssues', () => {
  const manifoldEntry = {
    project: '@taucad/manifold',
    root: 'packages/plugins/manifold',
    from: '../../../node_modules/manifold-3d/manifold.wasm',
    to: 'src/wasm/manifold.wasm',
  };
  const manifoldExport = {
    package: 'manifold-3d',
    subpath: 'manifold-3d/manifold.wasm',
    file: '../../../node_modules/manifold-3d/manifold.wasm',
  };

  it('reports a copy destination that is tracked in git', () => {
    expect(
      vendoredAssetIssues({
        entries: [
          {
            project: 'libs/vm',
            root: 'libs/vm',
            from: './node_modules/esbuild-wasm/esbuild.wasm',
            to: 'src/wasm/esbuild.wasm',
          },
        ],
        trackedPaths: ['libs/vm/src/wasm/esbuild.wasm', 'libs/vm/package.json'],
        ignoredPaths: ['libs/vm/src/wasm/esbuild.wasm'],
        assetFiles: [],
        upstreamExports: [],
        reasons: {
          'libs/vm': { './node_modules/esbuild-wasm/esbuild.wasm': 'esbuild-wasm declares no exports field' },
        },
      }),
    ).toEqual([
      'libs/vm: copy-assets writes src/wasm/esbuild.wasm, but that path is tracked in git; ignore it instead',
    ]);
  });

  it('reports a copy destination that is not git-ignored', () => {
    expect(
      vendoredAssetIssues({
        entries: [manifoldEntry],
        trackedPaths: [],
        ignoredPaths: [],
        assetFiles: [],
        upstreamExports: [manifoldExport],
        reasons: {},
      }),
    ).toEqual([
      '@taucad/manifold: copy-assets reads ../../../node_modules/manifold-3d/manifold.wasm, but manifold-3d exports it as "manifold-3d/manifold.wasm"; load the exported WASM directly and delete the copy',
      '@taucad/manifold: copy-assets writes src/wasm/manifold.wasm, but that path is not git-ignored',
    ]);
  });

  const rhinoEntry = {
    project: '@taucad/rhino',
    root: 'packages/plugins/rhino',
    from: 'node_modules/rhino3dm/rhino3dm.wasm',
    to: 'src/wasm/rhino3dm.wasm',
  };

  it('reports a vendored binary no copy entry writes', () => {
    expect(
      vendoredAssetIssues({
        entries: [rhinoEntry],
        trackedPaths: [],
        ignoredPaths: ['packages/plugins/rhino/src/wasm/rhino3dm.wasm'],
        assetFiles: [
          { project: '@taucad/rhino', path: 'src/wasm/rhino3dm.wasm' },
          { project: '@taucad/gltf', path: 'src/wasm/draco_decoder_gltf.wasm' },
        ],
        upstreamExports: [],
        reasons: {
          '@taucad/rhino': { 'node_modules/rhino3dm/rhino3dm.wasm': 'rhino3dm declares no exports field' },
        },
      }),
    ).toEqual([
      '@taucad/gltf: src/wasm/draco_decoder_gltf.wasm is not written by any copy-assets entry; vendored binaries must be generated from a declared dependency',
    ]);
  });

  it('reports a copy whose file no upstream exports subpath covers', () => {
    expect(
      vendoredAssetIssues({
        entries: [rhinoEntry],
        trackedPaths: [],
        ignoredPaths: ['packages/plugins/rhino/src/wasm/rhino3dm.wasm'],
        assetFiles: [],
        upstreamExports: [],
        reasons: {},
      }),
    ).toEqual([
      '@taucad/rhino: copy-assets reads node_modules/rhino3dm/rhino3dm.wasm, which rhino3dm does not expose through package.json#exports; record a reason in vendoredAssetReasons or move the asset behind an exported subpath',
    ]);
  });

  it('accepts an uncovered deep path and an unrecipied binary that carry a recorded reason', () => {
    expect(
      vendoredAssetIssues({
        entries: [rhinoEntry],
        trackedPaths: [],
        ignoredPaths: ['packages/plugins/rhino/src/wasm/rhino3dm.wasm'],
        assetFiles: [{ project: '@taucad/example', path: 'src/wasm/private.wasm' }],
        upstreamExports: [],
        reasons: {
          '@taucad/rhino': { 'node_modules/rhino3dm/rhino3dm.wasm': 'rhino3dm declares no exports field' },
          '@taucad/example': { 'src/wasm/private.wasm': 'private generated test fixture' },
        },
      }),
    ).toEqual([]);
  });

  it('reports a reason for a file an upstream export does cover', () => {
    expect(
      vendoredAssetIssues({
        entries: [manifoldEntry],
        trackedPaths: [],
        ignoredPaths: ['packages/plugins/manifold/src/wasm/manifold.wasm'],
        assetFiles: [],
        upstreamExports: [manifoldExport],
        reasons: {
          '@taucad/manifold': {
            '../../../node_modules/manifold-3d/manifold.wasm': 'pinned to the deep path until the repoint lands',
          },
        },
      }),
    ).toEqual([
      '@taucad/manifold: copy-assets reads ../../../node_modules/manifold-3d/manifold.wasm, but manifold-3d exports it as "manifold-3d/manifold.wasm"; load the exported WASM directly and delete the copy',
      '@taucad/manifold: vendoredAssetReasons records a reason for ../../../node_modules/manifold-3d/manifold.wasm, but manifold-3d exports it as "manifold-3d/manifold.wasm"; delete the stale reason',
    ]);
  });

  it('reports a reason that outlived the defect it excused', () => {
    expect(
      vendoredAssetIssues({
        entries: [],
        trackedPaths: [],
        ignoredPaths: [],
        assetFiles: [],
        upstreamExports: [],
        reasons: {
          '@taucad/replicad': { 'src/wasm/types.d.ts': 'replicad-opencascadejs does not export its declarations' },
        },
      }),
    ).toEqual([
      '@taucad/replicad: recorded vendored-asset reason names a path that no longer needs one: src/wasm/types.d.ts',
    ]);
  });
});

describe('pluginRuntimePeerDependencyIssues', () => {
  it('requires the runtime peer independently of emitted imports', () => {
    expect(pluginRuntimePeerDependencyIssues('@taucad/image', undefined)).toEqual([
      '@taucad/image: package.json peerDependencies must declare @taucad/runtime',
    ]);
    expect(pluginRuntimePeerDependencyIssues('@taucad/image', { '@taucad/runtime': '^0.1.0-beta.0' })).toEqual([]);
  });
});

describe('hostTargetIssues', () => {
  it('requires the declaration', () => {
    expect(
      hostTargetIssues({
        packageName: '@taucad/occt-core',
        hostTarget: undefined,
        dependencyNames: [],
        hasPayloadGuardTest: false,
      }),
    ).toEqual(['@taucad/occt-core: package.json taucad.hostTarget is not declared (expected "browser" or "node")']);
  });

  it('holds a browser package to its guard test and to browser-safe dependencies', () => {
    expect(
      hostTargetIssues({
        packageName: '@taucad/zoo',
        hostTarget: 'browser',
        dependencyNames: ['@taucad/runtime', 'ws'],
        hasPayloadGuardTest: false,
      }),
    ).toEqual([
      '@taucad/zoo: taucad.hostTarget is "browser" but src/ carries no payload-isolation guard test',
      '@taucad/zoo: taucad.hostTarget is "browser" but ws is declared as a node-only dependency',
    ]);
    expect(
      hostTargetIssues({
        packageName: '@taucad/image',
        hostTarget: 'browser',
        dependencyNames: ['@taucad/runtime'],
        hasPayloadGuardTest: true,
      }),
    ).toEqual([]);
  });

  it('asks nothing extra of a node package', () => {
    expect(
      hostTargetIssues({
        packageName: '@taucad/cli',
        hostTarget: 'node',
        dependencyNames: ['fs-extra'],
        hasPayloadGuardTest: false,
      }),
    ).toEqual([]);
  });
});
