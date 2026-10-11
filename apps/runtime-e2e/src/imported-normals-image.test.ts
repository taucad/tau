import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { assimp } from '@taucad/assimp';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { expect, it } from 'vitest';

// The glTF format gives triangles without NORMAL implicit flat normals, and OBJ may omit `vn`;
// the headless renderer needs authored normals, so the import kernels supply them.
const bareGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document
    .createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
  const indices = document
    .createAccessor()
    .setType('SCALAR')
    .setBuffer(buffer)
    .setArray(new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]));
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
  document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));
  return new NodeIO().writeBinary(document);
};

const importRuntime = defineRuntime({ plugins: [gltf(), assimp({ preset: 'import' }), image()] });

const bareObject = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'v 0 0 1', 'f 1 3 2', 'f 1 2 4', 'f 1 4 3', 'f 2 3 4', ''].join(
  '\n',
);

it.each([
  ['model.glb', bareGlb],
  ['model.obj', async () => bareObject],
] as const)('renders an imported %s that has no normals to an image', async (name, source) => {
  const root = await mkdtemp(join(tmpdir(), 'imported-normals-image-'));
  await writeFile(join(root, name), await source());
  const client = await createNodeClient({ runtime: importRuntime, projectPath: root });
  const document = client.open({ source: { path: name }, watch: false });
  try {
    const exported = await document.export('glb');
    expect(exported.success, exported.success ? '' : exported.issues.map(({ message }) => message).join('; ')).toBe(
      true,
    );
    if (!exported.success) {
      return;
    }
    const image = await client.transcode({
      from: 'glb',
      to: 'webp',
      files: [...exported.files],
      options: { mode: 'single', width: 128, height: 96, camera: { framing: 'bounds' } },
    });
    expect(image.success, image.success ? '' : image.issues.map(({ message }) => message).join('; ')).toBe(true);
  } finally {
    document.close();
    await client.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
