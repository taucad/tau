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
    ['renderers/common/Renderer.js', '24a8580179438da25865c986c298e29c3ceadf270bd6625cc849bbd17aaf6e2e'],
    [
      'renderers/webgpu/utils/WebGPUTextureUtils.js',
      '5f241b35187e26b1d1b56279330df466d55f62bdce4a53e0106835cacba06ce1',
    ],
  ]) {
    const source = readFileSync(require.resolve(`three/src/${file}`), 'utf8');
    expect(createHash('sha256').update(source).digest('hex'), file).toBe(expected);
  }
});
