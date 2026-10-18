// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import * as adopter from '#adopter.js';
import * as entry from '#index.js';
import * as layer from '#layer.js';

type Manifest = {
  readonly exports: Readonly<Record<string, unknown>>;
  readonly publishConfig: { readonly exports: Readonly<Record<string, unknown>> };
};

describe('@taucad/dotnet-kernel-core', () => {
  it('should publish the session root, the light adopter entry and the layer rule as separate subpaths', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Manifest;

    expect(manifest.exports).toEqual({
      '.': './src/index.ts',
      './adopter': './src/adopter.ts',
      './layer': './src/layer.ts',
      './package.json': './package.json',
    });
    expect(Object.keys(manifest.publishConfig.exports)).toEqual(Object.keys(manifest.exports));
  });

  it('should keep a non-plugin root and give each entry its own exports', () => {
    expect(entry).not.toHaveProperty('plugin');
    expect(Object.keys(entry).toSorted()).toEqual([
      'bindDotnetKernel',
      'createDotnetSession',
      'createDotnetWorkspaceMirror',
    ]);
    expect(Object.keys(adopter).toSorted()).toEqual([
      'defineDotnetKernelAdopter',
      'dotnetClosureOptionsSchema',
      'dotnetClosureSchema',
      'dotnetKernelOptionsSchema',
      'dotnetLaunchSet',
      'dotnetOptionsFromClosure',
    ]);
    expect(Object.keys(layer).toSorted()).toEqual([
      'createDotnetLayer',
      'manifestText',
      'payloadCdnBase',
      'payloadKey',
      'runComposeTauPlugin',
    ]);
  });

  it('should keep the session out of the adopter entry, so a `/native` subpath loads no kernel code', async () => {
    const sources = await Promise.all(
      ['adopter.ts', 'dotnet-kernel-adopter.ts', 'dotnet-closure.ts', 'dotnet.schemas.ts'].map(async (name) =>
        readFile(new URL(name, import.meta.url), 'utf8'),
      ),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from '@taucad\/native-process-core'|#dotnet-session|#dotnet-workspace-mirror/u);
    }
  });
});
