import { Document, NodeIO } from '@gltf-transform/core';
import type { Node } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { KittyCadBoundaryRepresentation, registerTauGltfExtensions } from '@taucad/geometry-core';
import type { TauCadTopologyRoot } from '@taucad/geometry-core';
import { kittyCadBoundaryRepresentationExtension, tauCadTopologyExtension } from '@taucad/runtime/types';
import { enrichZooGltfTopology, matchSolidNamesByBounds } from '#zoo-gltf-topology.utils.js';
import type { NamedSolidBounds } from '#zoo-gltf-topology.utils.js';

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

  it('should name a body from the engine box that contains its mesh', async () => {
    const io = registerTauGltfExtensions(new NodeIO());
    const input = await io.writeBinary(createZooBrepDocument());
    const bodyName = async (namedSolidBounds: NamedSolidBounds[]): Promise<unknown> => {
      const document = await io.readBinary(await enrichZooGltfTopology(input, { format: 'glb', namedSolidBounds }));
      const payload = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload();
      return (payload?.['components'] as Array<{ name: string }> | undefined)?.[0]?.name;
    };

    // The mesh spans x 0..2000 mm, y 0 mm and z 0..1000 mm once converted from metres, Y up.
    expect(await bodyName([{ name: 'ring', min: [-200, -100, -100], max: [2200, 100, 1100] }])).toBe('ring');
    expect(await bodyName([{ name: 'elsewhere', min: [5000, 0, 0], max: [6000, 1, 1] }])).toBe('Solid 1');
    expect(await bodyName([])).toBe('Solid 1');
  });

  it('should name a body from the box its node places it in', async () => {
    const io = registerTauGltfExtensions(new NodeIO());
    const bodyName = async (place: (node: Node) => void, namedSolidBounds: NamedSolidBounds[]): Promise<unknown> => {
      const source = createZooBrepDocument();
      place(source.getRoot().listNodes()[0]!);
      const output = await enrichZooGltfTopology(await io.writeBinary(source), { format: 'glb', namedSolidBounds });
      const document = await io.readBinary(output);
      const payload = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload();
      return (payload?.['components'] as Array<{ name: string }> | undefined)?.[0]?.name;
    };
    const moved = (node: Node) => node.setTranslation([1, 0, 0]);
    // A quarter turn about glTF Y turns the mesh's x 0..2000 mm into y 0..2000 mm, Z up.
    const turned = (node: Node) => node.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);

    expect(await bodyName(moved, [{ name: 'copy', min: [800, -100, -100], max: [3200, 100, 1100] }])).toBe('copy');
    expect(await bodyName(moved, [{ name: 'original', min: [-200, -100, -100], max: [2200, 100, 1100] }])).toBe(
      'Solid 1',
    );
    expect(await bodyName(turned, [{ name: 'turned', min: [-10, -10, -10], max: [10, 2010, 1010] }])).toBe('turned');
  });

  it('should pair same-size copies with the boxes they sit in, not a shifted neighbour', () => {
    const box = (low: number, high: number) => ({ min: [low, 0, 0], max: [high, 10, 10] });
    // Each copy also fits its neighbour's box within the tolerance, and all boxes are the same size.
    const named = [
      { name: 'second', ...box(0.05, 10.15) },
      { name: 'first', ...box(-0.05, 10.05) },
    ];

    expect(matchSolidNamesByBounds([box(0, 10), box(0.1, 10.1)], named)).toEqual(['first', 'second']);
  });

  it('should pair concentric and coincident solids with their tightest boxes', () => {
    const box = (low: number, high: number) => ({ min: [low, low, 0], max: [high, high, 8] });
    const solids = [box(-14, 14), box(-8.4, 8.4), box(-4, 4)];
    const named = [
      { name: 'inner', ...box(-10.08, 10.08) },
      { name: 'outer', ...box(-16.8, 16.8) },
      { name: 'housing', ...box(-60, 60) },
    ];

    expect(matchSolidNamesByBounds(solids, named)).toEqual(['outer', 'inner', 'housing']);
    expect(matchSolidNamesByBounds([undefined, box(-14, 14)], named)).toEqual([undefined, 'outer']);
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
