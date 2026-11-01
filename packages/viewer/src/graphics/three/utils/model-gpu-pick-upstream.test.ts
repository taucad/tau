import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { REVISION } from 'three';

it('should guard the installed cropped-camera depth flag and readback row stride', () => {
  expect(REVISION).toBe('184');
  const require = createRequire(import.meta.url);
  for (const [file, expected] of [
    ['cameras/Camera.js', '8a9cf79c111465425fc176d5f20d2f37a5640c2bdf4f58701db1f6e64e46bb01'],
    ['renderers/common/Renderer.js', '9fa3d8ecd179f9944beb42369a642a1e817d486fb12171f9c736d9cb972d075a'],
    [
      'renderers/webgpu/utils/WebGPUTextureUtils.js',
      '5f241b35187e26b1d1b56279330df466d55f62bdce4a53e0106835cacba06ce1',
    ],
  ]) {
    const source = readFileSync(require.resolve(`three/src/${file}`), 'utf8');
    expect(createHash('sha256').update(source).digest('hex'), file).toBe(expected);
  }
});
