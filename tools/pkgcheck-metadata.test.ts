/* eslint-disable @typescript-eslint/naming-convention -- package export maps use literal subpath keys */
/* oxlint-disable no-restricted-imports, import/extensions -- Standalone tool tests import their adjacent helper. */
import { describe, expect, it } from 'vitest';
import {
  bundledArtifactIssues,
  bundleOwnershipIssues,
  packageMetadataIssues,
  strictConsumerCompilerOptions,
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

  it('reports workspace modules bundled by more than one publishable root', () => {
    expect(
      bundleOwnershipIssues([
        { owner: '@taucad/runtime', bundled: ['@taucad/vm'] },
        { owner: 'geospec', bundled: ['@taucad/vm'] },
      ]),
    ).toEqual(['@taucad/vm is bundled by both @taucad/runtime and geospec']);
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
