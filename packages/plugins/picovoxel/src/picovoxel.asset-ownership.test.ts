import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { picovoxelKernel } from '#picovoxel.kernel.js';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

// ponytail: resolved beside the root entry until picovoxel exports `./wasm`, `./multi/wasm` and
// `./package.json` (blueprint D13); then resolve those subpaths directly.
const installed = (file: string): URL => new URL(file, import.meta.resolve('picovoxel'));
const digest = (file: string): string =>
  createHash('sha256')
    .update(readFileSync(fileURLToPath(installed(file))))
    .digest('hex');
const installedVersion = (
  JSON.parse(readFileSync(fileURLToPath(installed('../package.json')), 'utf8')) as { version: string }
).version;

describe('PicoVoxel asset ownership', () => {
  // The kernel version keys cached geometry: a stale constant would reuse geometry built by another
  // PicoVoxel build, so it tracks the installed package and both artifacts.
  it('should declare the version and artifact digests the installed package actually has', async () => {
    const { version } = await resolveRuntimePluginDefinition('kernel', picovoxelKernel());

    expect(version).toBe(
      `1.1.0+picovoxel.${installedVersion}.serial-${digest('pico.wasm').slice(0, 12)}.multi-${digest('pico-multi.wasm').slice(0, 12)}`,
    );
  });

  it('should keep the full digests in the kernel source', () => {
    const source = readFileSync(new URL('picovoxel.kernel.ts', import.meta.url), 'utf8');

    expect(source).toContain(`serial: '${digest('pico.wasm')}'`);
    expect(source).toContain(`multi: '${digest('pico-multi.wasm')}'`);
    expect(source).toContain(`version: '${installedVersion}'`);
  });
});
