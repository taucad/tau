import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { KHRMaterialsAnisotropy, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { describe, expect, it, vi } from 'vitest';
import { readGltfSceneBounds } from '#gltf-scene-bounds.js';

describe('readGltfSceneBounds', () => {
  it('reads unaligned in-memory GLB bytes and converts their scene bounds into caller world', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setArray(new Float32Array([-1, -2, -3, 1, 4, 5]))
      .setBuffer(buffer);
    const mesh = document.createMesh().addPrimitive(document.createPrimitive().setAttribute('POSITION', position));
    const scene = document.createScene().addChild(document.createNode().setMesh(mesh).setTranslation([10, 0, 0]));
    document.getRoot().setDefaultScene(scene);
    const bytes = await new WebIO().writeBinary(document);
    const storage = new Uint8Array(bytes.byteLength + 1);
    storage.set(bytes, 1);

    await expect(
      readGltfSceneBounds({
        bytes: new Uint8Array(storage.buffer, 1, bytes.byteLength),
        targetWorld: { up: '+z', forward: '-y', metersPerUnit: 1 },
      }),
    ).resolves.toEqual({ min: [9, -5, -2], max: [11, 3, 4] });
  });

  it('loads supported optional extensions without warning', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setArray(new Float32Array([0, 0, 0, 1, 1, 1]))
      .setBuffer(buffer);
    const unlit = document.createExtension(KHRMaterialsUnlit).createUnlit();
    const anisotropy = document.createExtension(KHRMaterialsAnisotropy).createAnisotropy();
    const unlitMaterial = document.createMaterial().setExtension(KHRMaterialsUnlit.EXTENSION_NAME, unlit);
    const physicalMaterial = document.createMaterial().setExtension(KHRMaterialsAnisotropy.EXTENSION_NAME, anisotropy);
    const mesh = document
      .createMesh()
      .addPrimitive(document.createPrimitive().setAttribute('POSITION', position).setMaterial(unlitMaterial))
      .addPrimitive(document.createPrimitive().setAttribute('POSITION', position).setMaterial(physicalMaterial));
    document.getRoot().setDefaultScene(document.createScene().addChild(document.createNode().setMesh(mesh)));
    const bytes = await new WebIO()
      .registerExtensions([KHRMaterialsUnlit, KHRMaterialsAnisotropy])
      .writeBinary(document);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await readGltfSceneBounds({ bytes, targetWorld: { up: '+z', forward: '-y', metersPerUnit: 1 } });

    expect(warning).not.toHaveBeenCalled();
  });
});
