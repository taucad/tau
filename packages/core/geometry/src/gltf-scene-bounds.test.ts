import { Accessor, Document, Primitive } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { createNodeIo, readGltfSceneBounds } from '#index.js';

const canonicalGltfWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
const tauWorld = { up: '+z', forward: '-y', metersPerUnit: 1 } as const;

const createPrimitive = (document: Document, positions: readonly number[], mode = Primitive.Mode['TRIANGLES']!) => {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const position = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  return document.createPrimitive().setMode(mode).setAttribute('POSITION', position);
};

const writeDocument = async (document: Document): Promise<Uint8Array<ArrayBuffer>> => {
  const io = await createNodeIo();
  return io.writeBinary(document);
};

const replaceFloat = (bytes: Uint8Array<ArrayBuffer>, value: number, replacement: number): void => {
  const source = new Uint8Array(new Float32Array([value]).buffer);
  const offset = bytes.findIndex((_byte, index) =>
    source.every((candidate, part) => bytes[index + part] === candidate),
  );
  if (offset === -1) {
    throw new Error(`Could not find float ${value} in GLB fixture`);
  }
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setFloat32(offset, replacement, true);
};

describe('readGltfSceneBounds', () => {
  it('matches conservative primitive AABBs through nested node transforms', async () => {
    const document = new Document();
    document.createBuffer();
    const mesh = document
      .createMesh()
      .addPrimitive(createPrimitive(document, [-2, -1, -0.5, -1, 1, 0.5]))
      .addPrimitive(createPrimitive(document, [1, -1, -0.5, 2, 1, 0.5], Primitive.Mode['LINES']));
    const child = document.createNode().setMesh(mesh).setTranslation([3, 0, 0]);
    const parent = document
      .createNode()
      .setTranslation([10, 20, 30])
      .setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2])
      .addChild(child);
    const scene = document.createScene().addChild(parent);
    document.getRoot().setDefaultScene(scene);

    await expect(
      readGltfSceneBounds({ bytes: await writeDocument(document), targetWorld: canonicalGltfWorld }),
    ).resolves.toEqual({ min: [9, 21, 29.5], max: [11, 25, 30.5] });
  });

  it('includes shared mesh instances and converts the result into the caller world', async () => {
    const document = new Document();
    document.createBuffer();
    const mesh = document.createMesh().addPrimitive(createPrimitive(document, [-1, -2, -3, 1, 2, 3]));
    const scene = document
      .createScene()
      .addChild(document.createNode().setMesh(mesh).setTranslation([10, 0, 0]))
      .addChild(document.createNode().setMesh(mesh).setTranslation([-10, 0, 0]));
    document.getRoot().setDefaultScene(scene);
    const bytes = await writeDocument(document);

    await expect(readGltfSceneBounds({ bytes, targetWorld: tauWorld })).resolves.toEqual({
      min: [-11, -3, -2],
      max: [11, 3, 2],
    });
    await expect(readGltfSceneBounds({ bytes, targetWorld: { ...tauWorld, metersPerUnit: 0.001 } })).resolves.toEqual({
      min: [-11_000, -3000, -2000],
      max: [11_000, 3000, 2000],
    });
  });

  it('uses scene zero when no default is declared and rejects an empty document', async () => {
    const document = new Document();
    document.createBuffer();
    document
      .createScene()
      .addChild(
        document.createNode().setMesh(document.createMesh().addPrimitive(createPrimitive(document, [1, 2, 3]))),
      );

    await expect(
      readGltfSceneBounds({ bytes: await writeDocument(document), targetWorld: canonicalGltfWorld }),
    ).resolves.toEqual({ min: [1, 2, 3], max: [1, 2, 3] });

    const empty = new Document();
    empty.createBuffer();
    empty.getRoot().setDefaultScene(empty.createScene());
    await expect(
      readGltfSceneBounds({ bytes: await writeDocument(empty), targetWorld: canonicalGltfWorld }),
    ).rejects.toThrow('GLB default scene contains no finite POSITION bounds');
  });

  it('rejects non-finite POSITION data', async () => {
    const document = new Document();
    document.createBuffer();
    const scene = document
      .createScene()
      .addChild(
        document.createNode().setMesh(document.createMesh().addPrimitive(createPrimitive(document, [1, 2, 3]))),
      );
    document.getRoot().setDefaultScene(scene);
    const bytes = await writeDocument(document);
    replaceFloat(bytes, 1, Number.NaN);

    await expect(readGltfSceneBounds({ bytes, targetWorld: canonicalGltfWorld })).rejects.toThrow(
      'GLB default scene contains non-finite POSITION bounds',
    );
  });
});
