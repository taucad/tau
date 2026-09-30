import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { picovoxelKernel } from '#picovoxel.kernel.js';

const source = readFileSync(new URL('picovoxel.kernel.ts', import.meta.url), 'utf8');
const packageRoot = dirname(fileURLToPath(import.meta.resolve('picovoxel/package.json')));
const installedVersion = (JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version: string })
  .version;

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const assetDigest = (specifier: string): string => sha256(readFileSync(fileURLToPath(import.meta.resolve(specifier))));

/** One SHA-256 over every shipped JavaScript file, in path order: `path NUL bytes NUL` each. */
const scriptsDigest = (): string => {
  const distribution = join(packageRoot, 'dist');
  const files = readdirSync(distribution, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.m?js$/u.test(file))
    .map((file) => file.split(sep).join('/'))
    .toSorted();
  const hash = createHash('sha256');
  for (const file of files) {
    hash
      .update(`${file}\0`)
      .update(readFileSync(join(distribution, file)))
      .update('\0');
  }
  return hash.digest('hex');
};

const declared = (key: string): string => new RegExp(`${key}: '([^']+)'`, 'u').exec(source)?.[1] ?? 'not declared';

describe('PicoVoxel asset ownership', () => {
  it('should load both artifacts through picovoxel asset subpaths the runtime asset plugin rewrites (D20)', () => {
    for (const specifier of ['picovoxel/wasm', 'picovoxel/multi/wasm', 'picovoxel/multi/worker']) {
      expect(source).toContain(`new URL(import.meta.resolve('${specifier}')).href`);
    }
  });

  // The kernel version keys cached geometry: a stale constant would reuse geometry built by another
  // PicoVoxel build, so every part of it tracks the installed package.
  it('should declare the version, artifact digests and script digest the installed package actually has', () => {
    expect(declared('version')).toBe(installedVersion);
    expect(declared('serial')).toBe(assetDigest('picovoxel/wasm'));
    expect(declared('multi')).toBe(assetDigest('picovoxel/multi/wasm'));
    expect(declared('scripts')).toBe(scriptsDigest());
  });

  // S-4: the constants describe exactly one build, so a range would let a consumer resolve another
  // PicoVoxel under this kernel version. Pin it exactly (as replicad-opencascadejs is) and bump the
  // constants with it.
  it('should depend on one exact PicoVoxel build, never a range', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const catalog = readFileSync(new URL('../../../../pnpm-workspace.yaml', import.meta.url), 'utf8');
    const declaredSpec = manifest.dependencies['picovoxel'];
    const spec = declaredSpec === 'catalog:' ? /^ {2}picovoxel: (\S+)$/mu.exec(catalog)?.[1] : declaredSpec;

    expect(spec).toMatch(/^(?:\d+\.\d+\.\d+(?:-[\w.-]+)?|https:\/\/pkg\.pr\.new\/picovoxel@[\da-f]{7,40})$/u);
  });

  it('should key the kernel version on all four', async () => {
    const { version } = await resolveRuntimePluginDefinition('kernel', picovoxelKernel());

    expect(version).toBe(
      `1.2.0+picovoxel.${installedVersion}.serial-${assetDigest('picovoxel/wasm').slice(0, 12)}.multi-${assetDigest('picovoxel/multi/wasm').slice(0, 12)}.scripts-${scriptsDigest().slice(0, 12)}`,
    );
  });
});
