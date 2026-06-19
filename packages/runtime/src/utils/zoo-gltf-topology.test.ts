import { Document, NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { KittyCadBoundaryRepresentation, registerTauGltfExtensions } from '@taucad/gltf-extensions';
import type { TauCadTopologyRoot } from '@taucad/gltf-extensions';
import { kittyCadBoundaryRepresentationExtension, tauCadTopologyExtension } from '@taucad/types/constants';
import { enrichZooGltfTopology } from '#utils/zoo-gltf-topology.js';

const createPositionAccessor = (document: Document, buffer: ReturnType<Document['createBuffer']>, offset: number) =>
  document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0]))
    .setBuffer(buffer);

const createZooBrepDocument = (): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const mesh = document.createMesh('Solid');
  mesh.addPrimitive(document.createPrimitive().setAttribute('POSITION', createPositionAccessor(document, buffer, 0)));
  mesh.addPrimitive(document.createPrimitive().setAttribute('POSITION', createPositionAccessor(document, buffer, 1)));

  const node = document.createNode('Solid').setMesh(mesh);
  document.createScene('Scene').addChild(node);

  const kittyCadBrep = document.createExtension(KittyCadBoundaryRepresentation);
  document.getRoot().setExtension(
    kittyCadBoundaryRepresentationExtension,
    kittyCadBrep.createRoot().setPayload({
      solids: [{ shells: [0], mesh: 0 }],
      shells: [{ faces: [0, 1] }],
      faces: [{ loops: [0] }, { loops: [1] }],
      loops: [{ edges: [[0, false], 1] }, { edges: [1, 2] }],
      edges: [{}, {}, {}],
    }),
  );
  node.setExtension(kittyCadBoundaryRepresentationExtension, kittyCadBrep.createNode().setSolid(0));
  return document;
};

describe('enrichZooGltfTopology', () => {
  it('should translate Zoo BREP solids and faces into Tau topology components', async () => {
    const io = registerTauGltfExtensions(new NodeIO());
    const input = await io.writeBinary(createZooBrepDocument());

    const output = await enrichZooGltfTopology(input, { format: 'glb' });
    const document = await io.readBinary(output);
    const payload = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload();

    expect(payload).toMatchObject({
      schemaVersion: 1,
      sourceExtension: kittyCadBoundaryRepresentationExtension,
      components: [
        {
          id: 'component:zoo-solid-0',
          kind: 'body',
          childIds: ['component:zoo-solid-0:face-0', 'component:zoo-solid-0:face-1'],
          primitiveRefs: [
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
          ],
        },
        {
          id: 'component:zoo-solid-0:face-0',
          kind: 'face',
          parentId: 'component:zoo-solid-0',
          primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
        },
        {
          id: 'component:zoo-solid-0:face-1',
          kind: 'face',
          parentId: 'component:zoo-solid-0',
          primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 }],
        },
      ],
      sectionSources: [
        {
          ownerComponentId: 'component:zoo-solid-0',
          primitiveRefs: [
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
          ],
        },
      ],
    });
    expect(payload?.['warnings']).toEqual([]);

    const [node] = document.getRoot().listNodes();
    expect(node?.getExtras()).toMatchObject({
      tauComponentId: 'component:zoo-solid-0',
      tauComponentKind: 'body',
    });

    const primitives = document.getRoot().listMeshes()[0]?.listPrimitives() ?? [];
    expect(primitives[0]?.getExtras()).toMatchObject({
      tauComponentId: 'component:zoo-solid-0:face-0',
      tauComponentKind: 'face',
      tauSectionOwnerComponentId: 'component:zoo-solid-0',
    });
    expect(primitives[1]?.getExtras()).toMatchObject({
      tauComponentId: 'component:zoo-solid-0:face-1',
      tauComponentKind: 'face',
      tauSectionOwnerComponentId: 'component:zoo-solid-0',
    });
  });

  it('should leave GLBs without Zoo BREP topology unchanged', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const mesh = document
      .createMesh('Plain')
      .addPrimitive(document.createPrimitive().setAttribute('POSITION', createPositionAccessor(document, buffer, 0)));
    document.createScene('Scene').addChild(document.createNode('Plain').setMesh(mesh));
    const input = await registerTauGltfExtensions(new NodeIO()).writeBinary(document);

    const output = await enrichZooGltfTopology(input, { format: 'glb' });

    expect(output).toBe(input);
  });
});
