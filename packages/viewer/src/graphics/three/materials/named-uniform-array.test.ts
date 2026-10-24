// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { REVISION, Vector4, WebGLCoordinateSystem } from 'three';
import type { NodeBuilder } from 'three/webgpu';
import { namedUniformArray } from '#graphics/three/materials/named-uniform-array.js';

it('should pin the upstream uniform declaration and binding contract', () => {
  expect(REVISION).toBe('184');
  const root = join(dirname(fileURLToPath(import.meta.resolve('three'))), '..');
  for (const [file, digest] of [
    [
      'src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js',
      '83786cd71b8a83a29bcaedfb5cd2549becb28b0068f8aee326a892b099388f04',
    ],
    ['src/nodes/core/UniformNode.js', '8d32d2fc0b66e3992303643ff4bd5dcf35cbed83f7e18e2247764431abfa516f'],
    ['src/nodes/accessors/UniformArrayNode.js', 'ec9eb124b1806baeda8b13cc32b87f086c96e9290f28b530a7317a6136ec7a4d'],
  ]) {
    expect(
      createHash('sha256')
        .update(readFileSync(join(root, file!)))
        .digest('hex'),
    ).toBe(digest);
  }
});

it('should restore the builder after failed generation without sharing owner data', () => {
  const first = namedUniformArray([new Vector4(1, 0, 0, 1)], 'testPlanes');
  const second = namedUniformArray([new Vector4(1, 0, 0, 2)], 'testPlanes');
  expect(first.uuid).not.toBe(second.uuid);
  expect(first.array).not.toBe(second.array);
  const failure = new Error('generation failed');
  const builder = mock<NodeBuilder & { context: Record<string, unknown> }>();
  builder.getUniformFromNode.mockImplementation(() => {
    throw failure;
  });
  const original = builder.getUniformFromNode;
  builder.renderer = mock<NodeBuilder['renderer']>({ coordinateSystem: WebGLCoordinateSystem });
  builder.context = {};
  builder.getDataFromNode.mockReturnValue(mock<ReturnType<NodeBuilder['getDataFromNode']>>());
  expect(() => first.generate(builder, 'vec4')).toThrow(failure);
  expect(builder.getUniformFromNode).toBe(original);
});
