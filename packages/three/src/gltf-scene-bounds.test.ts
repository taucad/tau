import { Accessor, Document, Primitive } from '@gltf-transform/core';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createNodeIo, readGltfSceneBounds } from '@taucad/geometry-core';

const canonicalGltfWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;

const createPrimitive = (document: Document, positions: readonly number[], mode = Primitive.Mode['TRIANGLES']!) => {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const position = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  return document.createPrimitive().setMode(mode).setAttribute('POSITION', position);
};

describe('GLB conservative scene bounds parity', () => {
  it('matches Three non-precise bounds for transformed primitives and instances', async () => {
    const document = new Document();
    document.createBuffer();
    const mesh = document
      .createMesh()
      .addPrimitive(createPrimitive(document, [-2, -1, -0.5, -1, 1, 0.5]))
      .addPrimitive(createPrimitive(document, [1, -1, -0.5, 2, 1, 0.5], Primitive.Mode['LINES']));
    const parent = document
      .createNode()
      .setTranslation([10, 20, 30])
      .setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2])
      .addChild(document.createNode().setMesh(mesh).setTranslation([3, 0, 0]));
    const scene = document
      .createScene()
      .addChild(parent)
      .addChild(document.createNode().setMesh(mesh).setTranslation([-8, 4, -2]));
    document.getRoot().setDefaultScene(scene);
    const io = await createNodeIo();
    const bytes = await io.writeBinary(document);

    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
    gltf.scene.updateMatrixWorld(true);
    const threeBounds = new Box3().setFromObject(gltf.scene, false);
    const sharedBounds = await readGltfSceneBounds({ bytes, targetWorld: canonicalGltfWorld });

    expect(sharedBounds.min).toEqual([
      expect.closeTo(threeBounds.min.x, 12),
      expect.closeTo(threeBounds.min.y, 12),
      expect.closeTo(threeBounds.min.z, 12),
    ]);
    expect(sharedBounds.max).toEqual([
      expect.closeTo(threeBounds.max.x, 12),
      expect.closeTo(threeBounds.max.y, 12),
      expect.closeTo(threeBounds.max.z, 12),
    ]);
  });
});
