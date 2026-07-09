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

  it('should bind every node that references the same instanced solid', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const mesh = document.createMesh('Solid');
    mesh.addPrimitive(document.createPrimitive().setAttribute('POSITION', createPositionAccessor(document, buffer, 0)));
    mesh.addPrimitive(document.createPrimitive().setAttribute('POSITION', createPositionAccessor(document, buffer, 1)));

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

    // Two nodes reference the same solid (index 0) — glTF instancing.
    const scene = document.createScene('Scene');
    for (const label of ['InstanceA', 'InstanceB']) {
      const node = document.createNode(label).setMesh(mesh);
      node.setExtension(kittyCadBoundaryRepresentationExtension, kittyCadBrep.createNode().setSolid(0));
      scene.addChild(node);
    }

    const io = registerTauGltfExtensions(new NodeIO());
    const output = await enrichZooGltfTopology(await io.writeBinary(document), { format: 'glb' });
    const result = await io.readBinary(output);

    const nodes = result.getRoot().listNodes();
    expect(nodes).toHaveLength(2);
    // Both instances must carry the body binding; the first must not be dropped.
    for (const node of nodes) {
      expect(node.getExtras()).toMatchObject({
        tauComponentId: 'component:zoo-solid-0',
        tauComponentKind: 'body',
      });
    }
  });

  it('should keep entity indices stable when arrays contain non-record holes', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const mesh = document
      .createMesh('Solid')
      .addPrimitive(document.createPrimitive().setAttribute('POSITION', createPositionAccessor(document, buffer, 0)));
    const node = document.createNode('Solid').setMesh(mesh);
    document.createScene('Scene').addChild(node);

    const kittyCadBrep = document.createExtension(KittyCadBoundaryRepresentation);
    document.getRoot().setExtension(
      kittyCadBoundaryRepresentationExtension,
      kittyCadBrep.createRoot().setPayload({
        // Solid references shell index 1; a null hole sits before it. A shifting
        // compaction would bind the solid to the wrong shell (faces [1] not [0]).
        solids: [{ shells: [1], mesh: 0 }],
        shells: [null, { faces: [0] }, { faces: [1] }],
        faces: [{ loops: [0] }, { loops: [1] }],
        loops: [{ edges: [0] }, { edges: [1] }],
        edges: [{}, {}],
      }),
    );
    node.setExtension(kittyCadBoundaryRepresentationExtension, kittyCadBrep.createNode().setSolid(0));

    const io = registerTauGltfExtensions(new NodeIO());
    const input = await io.writeBinary(document);
    const output = await enrichZooGltfTopology(input, { format: 'glb' });
    const result = await io.readBinary(output);
    const payload = result.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload();

    // Shell 1 owns face 0, so the single face component must be face-0, not face-1.
    expect(payload).toMatchObject({
      components: [
        { id: 'component:zoo-solid-0', childIds: ['component:zoo-solid-0:face-0'] },
        { id: 'component:zoo-solid-0:face-0', kind: 'face' },
      ],
    });
    expect(payload?.['warnings']).toEqual([]);
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
