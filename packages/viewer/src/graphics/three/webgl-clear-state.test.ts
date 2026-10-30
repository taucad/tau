// @vitest-environment node
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVISION } from 'three';

it('should require requalification when Three color-clear or mask caching changes', () => {
  expect(REVISION).toBe('184');
  const root = join(dirname(fileURLToPath(import.meta.resolve('three'))), '..', 'src/renderers/webgl-fallback');
  for (const [file, digest] of [
    ['WebGLBackend.js', '453ebc61fe7acf2530e6570a5a12699947fdca5dcbd02c092496c1b8363b82f8'],
    ['utils/WebGLState.js', 'b2d1a7e517e19122c13a541e273377c22fa55fa98c7bcf86423354b5eb02d85f'],
  ] as const) {
    expect(
      createHash('sha256')
        .update(readFileSync(join(root, file)))
        .digest('hex'),
    ).toBe(digest);
  }
});
