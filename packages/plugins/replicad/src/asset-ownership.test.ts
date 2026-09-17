import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { createTestGeometry } from '@taucad/runtime-testing';
import type * as RuntimeKernel from '@taucad/runtime/kernel';
import { defineRuntime } from '@taucad/runtime/worker';

import { replicadKernel } from '#replicad.kernel.js';

const loadBinaryFile = vi.hoisted(() => vi.fn<(url: string) => Promise<ArrayBuffer | undefined>>());

vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeKernel>();
  loadBinaryFile.mockImplementation(actual.loadBinaryFile);
  return { ...actual, loadBinaryFile };
});

const source = readFileSync(new URL('replicad.kernel.ts', import.meta.url), 'utf8');
const copyConfig = readFileSync(new URL('../copy-files-from-to.cjson', import.meta.url), 'utf8');

const installedDigest = (specifier: string): string =>
  `sha256:${createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.resolve(specifier))))
    .digest('hex')}`;

const declaredDigest = (variant: string): string =>
  new RegExp(`${variant}: '(sha256:[0-9a-f]{64})'`, 'u').exec(source)?.[1] ?? 'not declared';

describe('Replicad asset ownership', () => {
  it('keeps both loaders and upstream WASM exports statically visible', () => {
    expect(source).toMatch(/from ["']#replicad-wasm-multi-loader\.js["']/u);
    expect(source).toMatch(/new URL\(\s*import\.meta\.resolve\(["']replicad-opencascadejs\/wasm["']\),?\s*\)/u);
    expect(source).toMatch(/new URL\(\s*import\.meta\.resolve\(["']replicad-opencascadejs\/multi\/wasm["']\),?\s*\)/u);
    expect(copyConfig).not.toContain('.wasm');
    expect(copyConfig).toContain('src/sourcemaps/replicad.js.map');
    // Declarations come from the `replicad-opencascadejs` dependency, never a vendored copy.
    expect(copyConfig).not.toContain('types.d.ts');
  });

  // The declared digests are the compute-reuse implementation identity: a stale constant would
  // reuse geometry computed by a different OCCT build, so they track the installed binaries.
  it('declares the digests the installed OCCT binaries actually have', () => {
    expect(declaredDigest('single')).toBe(installedDigest('replicad-opencascadejs/wasm'));
    expect(declaredDigest('multi')).toBe(installedDigest('replicad-opencascadejs/multi/wasm'));
  });

  it('renders without reading the OCCT binary a second time to digest it', async () => {
    const geometry = await createTestGeometry({
      runtime: defineRuntime({
        kernels: [replicadKernel({ wasm: 'single' })],
        bundlers: [esbuildBundler()],
      }),
      files: {
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(20, 10).sketchOnPlane().extrude(5);
          }
        `,
      },
      mainFile: 'box.ts',
    });

    expect(geometry.success).toBe(true);
    // Emscripten already fetched and compiled the 23 MB binary; the kernel reads the font only.
    expect(loadBinaryFile.mock.calls.map(([url]) => url).filter((url) => url.endsWith('.wasm'))).toEqual([]);
  }, 60_000);
});
