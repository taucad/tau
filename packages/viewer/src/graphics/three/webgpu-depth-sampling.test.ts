// @vitest-environment node
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVISION } from 'three';

it('should require requalification when Three sampled-view caching or texture lifetime changes', () => {
  expect(REVISION).toBe('184');
  const root = join(dirname(fileURLToPath(import.meta.resolve('three'))), '..', 'src/renderers/webgpu/utils');
  for (const [file, digest] of [
    ['WebGPUBindingUtils.js', '955dc9c79f58e7648fe2dc416c47c182eba1d22cb955467fb321ef1c7d550dff'],
    ['../WebGPUBackend.js', '7e716cda174a0f155d3f53f2290dbdbf719c414f01923bb118eb31c433a8347e'],
    ['WebGPUTextureUtils.js', '5f241b35187e26b1d1b56279330df466d55f62bdce4a53e0106835cacba06ce1'],
  ] as const) {
    expect(
      createHash('sha256')
        .update(readFileSync(join(root, file)))
        .digest('hex'),
    ).toBe(digest);
  }
});
