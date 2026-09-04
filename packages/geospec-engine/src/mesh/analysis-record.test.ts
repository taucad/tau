import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it, vi } from 'vitest';
import { TauCadTopology } from '@taucad/geometry-core';
import {
  analyseConnectedComponents,
  analyseWatertight,
  analyzeGlb,
  analyzeGltfDocument,
  analyzeMeshQuality,
  baseComponentLabel,
  buildMeshAnalysisRecord,
  buildMeshNodeNameMap,
  collectPrimitiveRecords,
  countConnectedComponents,
  decodeMeshAnalysisRecord,
  encodeMeshAnalysisRecord,
  isWatertight,
} from '#mesh/analysis-record.js';
import { encodeSections } from '#cache/section-codec.js';

type MeshSpec = {
  name?: string;
  positions: number[];
  indices?: number[];
  translation?: [number, number, number];
  mode?: 1 | 4;
  primitives?: number;
};

const documentOf = (meshes: MeshSpec[]): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene('scene');
  for (const [index, spec] of meshes.entries()) {
    const mesh = document.createMesh(spec.name ?? `mesh-${index}`);
    for (let copy = 0; copy < (spec.primitives ?? 1); copy++) {
      const positions = document
        .createAccessor()
        .setType(Accessor.Type['VEC3']!)
        .setBuffer(buffer)
        .setArray(new Float32Array(spec.positions));
      const primitive = document
        .createPrimitive()
        .setMode(spec.mode ?? 4)
        .setAttribute('POSITION', positions);
      if (spec.indices) {
        primitive.setIndices(
          document
            .createAccessor()
            .setType(Accessor.Type['SCALAR']!)
            .setBuffer(buffer)
            .setArray(new Uint32Array(spec.indices)),
        );
      }
      mesh.addPrimitive(primitive);
    }
    const node = document.createNode(spec.name ?? `mesh-${index}`).setMesh(mesh);
    if (spec.translation) {
      node.setTranslation(spec.translation);
    }
    scene.addChild(node);
  }
  return document;
};

const boxCorners = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const boxIndices = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
];

const boxSpec = (name: string, translation?: [number, number, number]): MeshSpec => ({
  name,
  positions: boxCorners,
  indices: boxIndices,
  ...(translation ? { translation } : {}),
});

const openSquare: MeshSpec = {
  name: 'open-square',
  positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0],
  indices: [0, 1, 2, 0, 2, 3],
};

describe('baseComponentLabel', () => {
  it('should strip the sub-piece suffix and leave authored names alone', () => {
    expect(baseComponentLabel('bracket#0')).toBe('bracket');
    expect(baseComponentLabel('bracket#12')).toBe('bracket');
    expect(baseComponentLabel('bracket')).toBe('bracket');
    expect(baseComponentLabel('rev#2 plate')).toBe('rev#2 plate');
  });
});

describe('buildMeshNodeNameMap', () => {
  it('should prefer the node name and generate one when nothing is authored', () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setBuffer(buffer)
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const mesh = document
      .createMesh('')
      .addPrimitive(document.createPrimitive().setMode(4).setAttribute('POSITION', positions));
    document.createScene('scene').addChild(document.createNode('').setMesh(mesh));

    expect([...buildMeshNodeNameMap(document).values()]).toEqual(['Shape 1']);
  });

  it('should map each mesh once and skip nodes without one', () => {
    const document = documentOf([boxSpec('left')]);
    document.getRoot().listScenes()[0]!.addChild(document.createNode('empty'));

    expect([...buildMeshNodeNameMap(document).values()]).toEqual(['left']);
  });
});

describe('buildMeshAnalysisRecord', () => {
  it('should label primitives name#index and apply the node transform and scale', () => {
    const record = buildMeshAnalysisRecord(documentOf([{ ...boxSpec('part'), primitives: 2 }]), 1000);

    expect(record.primitives.map((primitive) => primitive.name)).toEqual(['part#0', 'part#1']);
    expect(record.positions[0]).toBe(0);
    // The 1 mm corner scaled to micrometres.
    expect(record.positions[3]).toBe(1000);
    expect(record.trianglePrimitives.length).toBe(24);
  });

  it('should place a translated node in world space', () => {
    const record = buildMeshAnalysisRecord(documentOf([boxSpec('shifted', [5, 0, 0])]));

    expect(record.positions[0]).toBe(5);
  });

  it('should skip non-triangle and position-less primitives', () => {
    const lines = documentOf([{ name: 'lines', positions: boxCorners, mode: 1 }]);
    expect(buildMeshAnalysisRecord(lines).primitives).toEqual([]);

    const document = new Document();
    const mesh = document.createMesh('empty').addPrimitive(document.createPrimitive().setMode(4));
    document.createScene('scene').addChild(document.createNode('empty').setMesh(mesh));
    expect(buildMeshAnalysisRecord(document).primitives).toEqual([]);
  });

  it('should skip a node that carries no mesh', () => {
    const document = documentOf([boxSpec('left')]);
    document.getRoot().listScenes()[0]!.addChild(document.createNode('empty'));

    expect(buildMeshAnalysisRecord(document).primitives.map((primitive) => primitive.name)).toEqual(['left#0']);
  });

  it('should synthesize sequential indices for a non-indexed primitive', () => {
    const record = buildMeshAnalysisRecord(documentOf([{ name: 'soup', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] }]));

    expect([...record.triangles]).toEqual([0, 1, 2]);
  });

  it('should transform a position accessor shared by material primitives only once', () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setBuffer(buffer)
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]));
    const mesh = document.createMesh('shared');
    for (const values of [new Uint32Array([0, 1, 2]), new Uint32Array([0, 2, 3])]) {
      const indices = document.createAccessor().setType(Accessor.Type['SCALAR']!).setBuffer(buffer).setArray(values);
      mesh.addPrimitive(document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices));
    }
    document.createScene().addChild(document.createNode('shared').setMesh(mesh));

    const record = buildMeshAnalysisRecord(document);

    expect(record.positions).toHaveLength(12);
    expect([...record.triangles]).toEqual([0, 1, 2, 0, 2, 3]);
    expect(record.primitives).toMatchObject([
      { vertexStart: 0, vertexCount: 4 },
      { vertexStart: 0, vertexCount: 4 },
    ]);
  });
});

describe('mesh-record codec', () => {
  it('should round-trip a record through exactly three binary sections', () => {
    const record = buildMeshAnalysisRecord(documentOf([boxSpec('part')]));
    const decoded = decodeMeshAnalysisRecord(encodeMeshAnalysisRecord(record));

    expect(decoded).toBeDefined();
    expect([...decoded!.positions]).toEqual([...record.positions]);
    expect([...decoded!.triangles]).toEqual([...record.triangles]);
    expect([...decoded!.trianglePrimitives]).toEqual([...record.trianglePrimitives]);
    expect(decoded!.primitives).toEqual(record.primitives);
  });

  it('should refuse a frame that is not a mesh record', () => {
    expect(decodeMeshAnalysisRecord(new Uint8Array(4))).toBeUndefined();
    // Right shape, wrong section count: never a partial read.
    expect(decodeMeshAnalysisRecord(encodeSections({ version: 1, primitives: [] }, []))).toBeUndefined();
    expect(
      decodeMeshAnalysisRecord(
        encodeSections({ version: 2, primitives: [] }, [
          new Uint8Array(0),
          new Uint8Array(0),
          new Uint8Array(0),
        ] as Array<Uint8Array<ArrayBuffer>>),
      ),
    ).toBeUndefined();
    expect(
      decodeMeshAnalysisRecord(
        encodeSections({ version: 1 }, [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)] as Array<
          Uint8Array<ArrayBuffer>
        >),
      ),
    ).toBeUndefined();
  });
});

describe('analyzeMeshQuality', () => {
  it('should report scalars and a centre of mass without treating part contacts as duplicate faces', () => {
    const quality = analyzeMeshQuality(documentOf([{ ...boxSpec('part'), primitives: 2 }]));

    expect(quality.triangleCount).toBe(24);
    expect(quality.surfaceArea).toBeCloseTo(12, 9);
    // Two coincident copies of the same unit box: volume counts twice.
    expect(quality.signedVolume).toBeCloseTo(2, 9);
    expect(quality.centerOfMass?.map((value) => Number(value.toFixed(6)))).toEqual([0.5, 0.5, 0.5]);
    expect(quality.duplicateFaces).toHaveLength(0);
    // Lazy and memoized: the weld behind it must not run twice per record.
    expect(quality.duplicateFaces).toBe(quality.duplicateFaces);
  });

  it('should report a repeated triangle inside one primitive', () => {
    const quality = analyzeMeshQuality(
      documentOf([{ name: 'bad', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2, 2, 1, 0] }]),
    );

    expect(quality.duplicateFaces).toStrictEqual([{ primitive: 'bad#0', triangleIndex: 1, firstTriangleIndex: 0 }]);
  });

  it('should not call nearby but distinct triangles duplicates', () => {
    const quality = analyzeMeshQuality(
      documentOf([
        {
          name: 'skinny',
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0.000001],
          indices: [0, 1, 2, 3, 4, 5],
        },
      ]),
    );

    expect(quality.duplicateFaces).toHaveLength(0);
  });

  it('should flag non-finite vertices and degenerate triangles', () => {
    const quality = analyzeMeshQuality(
      documentOf([
        {
          name: 'bad',
          positions: [0, 0, 0, 0, 0, 0, 0, 0, 0, Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2, 3, 4, 5],
        },
      ]),
    );

    // The NaN triangle has a NaN area, not a zero one: only the collapsed
    // triangle is degenerate, and the NaN corner is reported on its own axis.
    expect(quality.degenerateTriangles).toHaveLength(1);
    expect(quality.nonFiniteVertices).toHaveLength(1);
    expect(quality.centerOfMass).toBeUndefined();
  });

  it('should report no centre of mass for a soup that encloses nothing', () => {
    expect(analyzeMeshQuality(documentOf([openSquare])).centerOfMass).toBeUndefined();
  });
});

describe('watertightness', () => {
  it('should call a closed box watertight', () => {
    expect(isWatertight(documentOf([boxSpec('part')]))).toBe(true);
  });

  it('should evaluate coincident assembly components independently', () => {
    expect(isWatertight(documentOf([boxSpec('left'), boxSpec('right')]))).toBe(true);
  });

  it('should localize open boundary edges per primitive and in clusters', () => {
    const result = analyseWatertight(documentOf([openSquare]));

    expect(result).toMatchObject({
      watertight: false,
      irregularEdges: 4,
      openBoundaryEdges: 4,
      nonManifoldEdges: 0,
      irregularEdgeFraction: 0.8,
    });
    expect(result.perPrimitive).toEqual([{ name: 'open-square#0', boundaryEdges: 4, loopCentroid: [5, 5, 0] }]);
    expect(result.irregularEdgeClusters).toHaveLength(1);
    expect(result.irregularEdgeClusters[0]).toMatchObject({ kind: 'open-boundary', edgeCount: 4 });
    expect(result.irregularEdgeClusters[0]!.samples).toHaveLength(4);
    expect(result.irregularEdgeClusters[0]!.samples[0]!.primitives).toEqual(['open-square#0']);
  });

  it('should classify an over-adjacent edge as non-manifold', () => {
    // Three triangles sharing one edge.
    const result = analyseWatertight(
      documentOf([
        {
          name: 'fin',
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0],
          indices: [0, 1, 2, 0, 1, 3, 0, 1, 4],
        },
      ]),
    );

    expect(result.nonManifoldEdges).toBe(1);
    expect(result.irregularEdgeKindCounts.nonManifold).toBe(1);
    expect(result.irregularEdgeClusters.some((cluster) => cluster.kind === 'non-manifold')).toBe(true);
  });

  it('should NEVER report an empty document as watertight', () => {
    // No surface is not a closed solid. "No irregular edges" is vacuously true
    // of nothing, and a vacuous pass is the one answer this layer must not give.
    expect(analyseWatertight(new Document())).toMatchObject({
      watertight: false,
      totalEdges: 0,
      irregularEdgeFraction: 0,
    });
  });

  it('should order clusters and name every primitive on a shared irregular edge', () => {
    const result = analyseWatertight(
      documentOf([
        // Two coincident primitives of one component: an irregular edge with
        // two owning primitives.
        {
          name: 'fin',
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2],
          primitives: 3,
        },
      ]),
    );

    const nonManifold = result.irregularEdgeClusters.find((cluster) => cluster.kind === 'non-manifold');
    expect(nonManifold?.samples[0]?.primitives).toEqual(['fin#0', 'fin#1', 'fin#2']);
  });

  it('should order equal-sized clusters by position, never by discovery', () => {
    const far: MeshSpec = { ...openSquare, name: 'far-square', translation: [100, 0, 0] };
    const clusters = analyseWatertight(documentOf([far, openSquare])).irregularEdgeClusters;

    expect(clusters.map((cluster) => cluster.edgeCount)).toEqual([4, 4]);
    expect(clusters[0]!.aabb.min[0]).toBeLessThan(clusters[1]!.aabb.min[0]);
  });

  it('should drop a degenerate triangle WHOLE, not just its collapsed edge', () => {
    // Keeping the surviving two edges would count one real edge twice, which
    // is how a UV sphere's poles used to read as two non-manifold edges.
    const result = analyseWatertight(
      documentOf([{ name: 'sliver', positions: [0, 0, 0, 0, 0, 0, 1, 0, 0], indices: [0, 1, 2] }]),
    );

    expect(result.totalEdges).toBe(0);
  });

  it('should keep a closed surface watertight when a degenerate triangle sits on it', () => {
    // Two triangles closing a degenerate "sheet" plus a sliver sharing an edge:
    // the sliver must not turn that shared edge non-manifold.
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0];
    const withSliver = analyseWatertight(documentOf([{ name: 'sheet', positions, indices: [0, 1, 2, 3, 4, 3] }]));
    const withoutSliver = analyseWatertight(documentOf([{ name: 'sheet', positions, indices: [0, 1, 2] }]));

    expect(withSliver.nonManifoldEdges).toBe(0);
    expect(withSliver.totalEdges).toBe(withoutSliver.totalEdges);
  });
});

// The document-level analysers take a MILLIMETRE tolerance against a glTF
// document in METRES, so a tolerance in these synthetic unit-sized layouts is
// 1,000× the coordinate gap it has to cover, and a reported `gapMm` is 1,000×
// the coordinate gap it measured.
describe('connected components', () => {
  it('should separate two boxes and report the gap with its witnesses', () => {
    const document = documentOf([boxSpec('left'), boxSpec('right', [5, 0, 0])]);

    expect(countConnectedComponents(document, 0.1)).toBe(2);
    const result = analyseConnectedComponents(document, 0.1);
    expect(result.clusters.map((cluster) => cluster.label)).toEqual(['left', 'right']);
    expect(result.gaps).toEqual([
      {
        fromLabel: 'left',
        toLabel: 'right',
        axis: 'x',
        gapMm: 4000,
        fromPrimitive: 'left',
        toPrimitive: 'right',
      },
    ]);
  });

  it('should merge boxes whose gap sits inside the tolerance', () => {
    expect(countConnectedComponents(documentOf([boxSpec('left'), boxSpec('right', [5, 0, 0])]), 5000)).toBe(1);
  });

  it('should stay axis-independent on a colinear stack', () => {
    // Five boxes sharing one x interval, stacked along y with a 0.5 gap: an
    // x-only sweep cannot prune here, and the partition must still be five.
    const stack = Array.from({ length: 5 }, (_unused, level) => boxSpec(`level-${level}`, [0, level * 1.5, 0]));
    expect(countConnectedComponents(documentOf(stack), 0.1)).toBe(5);
    expect(countConnectedComponents(documentOf(stack), 600)).toBe(1);
  });

  it('should prune, tie-break and witness across a mixed layout', () => {
    // `a`/`b`/`c` mutually overlap (so the third union finds one root already);
    // `d` and `f` share `b`'s sweep-axis start (a tie) while clearing it in y
    // (a candidate the sweep reaches but the 3-axis test rejects); `h` sits far
    // enough along x to end the scan and gives each cluster primitive a
    // different gap, so the witness search actually improves on its first pick.
    const document = documentOf([
      boxSpec('a'),
      boxSpec('b', [0.5, 0, 0]),
      boxSpec('c', [0.25, 0, 0]),
      boxSpec('d', [0.5, 20, 0]),
      boxSpec('f', [0.5, -20, 0]),
      boxSpec('h', [10, 0, 0]),
    ]);

    const result = analyseConnectedComponents(document, 0.1);

    expect(result.count).toBe(4);
    expect(result.clusters[0]).toMatchObject({ label: 'a', totalVertices: 108 });
    expect(result.clusters[0]!.primitives.map((primitive) => primitive.name)).toEqual(['a', 'b', 'c']);
    const toH = result.gaps.find((gap) => gap.toLabel === 'h' && gap.fromLabel === 'a');
    // The nearest member of the cluster is `b`, not the first one scanned.
    expect(toH).toMatchObject({ axis: 'x', fromPrimitive: 'b', toPrimitive: 'h' });
    // `d` and `f` are equidistant from the cluster: the tie resolves by label.
    const ties = result.gaps.filter((gap) => gap.fromLabel === 'a' && gap.gapMm === 19_000);
    expect(ties.map((gap) => gap.toLabel)).toEqual(['d', 'f']);
  });

  it('should split ONE primitive that holds two disjoint chunks into #part records', () => {
    // An OpenSCAD colour bin is one primitive per colour, not per solid. Both
    // clusters would otherwise report the shared parent box and witness a
    // NEGATIVE gap between two obviously separated chunks.
    const twoChunks: MeshSpec = {
      name: 'bin',
      positions: [...boxCorners, ...boxCorners.map((value, index) => (index % 3 === 0 ? value + 5 : value))],
      indices: [...boxIndices, ...boxIndices.map((index) => index + 8)],
    };
    const result = analyseConnectedComponents(documentOf([twoChunks]), 0.1);

    expect(result.count).toBe(2);
    expect(result.clusters.flatMap((cluster) => cluster.primitives.map((primitive) => primitive.name))).toEqual([
      'bin#part0',
      'bin#part1',
    ]);
    expect(result.gaps).toEqual([
      {
        fromLabel: 'bin',
        toLabel: 'bin',
        axis: 'x',
        gapMm: 4000,
        fromPrimitive: 'bin#part0',
        toPrimitive: 'bin#part1',
      },
    ]);
  });

  it('should label a cluster by the base name of its heaviest primitive', () => {
    const document = documentOf([{ ...boxSpec('bracket'), primitives: 2 }]);
    const result = analyseConnectedComponents(document, 0.1);

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.label).toBe('bracket');
    // Both primitives are one authored shape, so both report that shape's name.
    expect(result.clusters[0]!.primitives.map((primitive) => primitive.name)).toEqual(['bracket', 'bracket']);
  });
});

describe('collectPrimitiveRecords', () => {
  it('should report one record per primitive with its own box', () => {
    expect(collectPrimitiveRecords(documentOf([boxSpec('left'), boxSpec('right', [5, 0, 0])]))).toEqual([
      { name: 'left#0', vertices: 8, aabb: { min: [0, 0, 0], max: [1, 1, 1] } },
      { name: 'right#0', vertices: 8, aabb: { min: [5, 0, 0], max: [6, 1, 1] } },
    ]);
  });

  it('should report a zeroed box for an empty document', () => {
    expect(analyzeGltfDocument(new Document()).boundingBox).toEqual({
      size: [0, 0, 0],
      center: [0, 0, 0],
      primitives: [],
    });
  });
});

describe('analyzeGltfDocument', () => {
  it('reads supported topology extensions without warnings and derives measurements only from the mesh', async () => {
    const document = documentOf([boxSpec('box')]);
    const expected = analyzeGltfDocument(document);
    const extension = document.createExtension(TauCadTopology);
    document
      .getRoot()
      .setExtension(
        TauCadTopology.EXTENSION_NAME,
        extension.createRoot().setPayload({ schemaVersion: 1, triangleCount: 999, watertight: false }),
      );
    const bytes = await new WebIO().registerExtensions([TauCadTopology]).writeBinary(document);
    const warning = vi.spyOn(console, 'warn');
    try {
      const actual = await analyzeGlb(bytes);
      expect(actual.triangleCount).toBe(12);
      expect(actual.meshQuality).toEqual(expected.meshQuality);
      expect(actual.boundingBox).toEqual(expected.boundingBox);
      expect(actual.watertight).toBe(true);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
  it('should publish memoized analyses over one record', () => {
    const stats = analyzeGltfDocument(documentOf([boxSpec('left'), boxSpec('right', [5, 0, 0])]));

    expect(stats.vertexCount).toBe(16);
    expect(stats.meshCount).toBe(2);
    expect(stats.triangleCount).toBe(24);
    expect(stats.watertight).toBe(true);
    expect(stats.analyseWatertight()).toBe(stats.analyseWatertight());
    expect(stats.analyseConnectedComponents(0.1)).toBe(stats.analyseConnectedComponents(0.1));
    expect(stats.connectedComponents(0.1)).toBe(2);
    expect(stats.boundingBox?.size).toEqual([6, 1, 1]);
  });

  it('should build the lazy mesh-quality and bounding-box facets at most once', () => {
    const stats = analyzeGltfDocument(documentOf([boxSpec('left'), boxSpec('right', [5, 0, 0])]));

    // Identity, not equality: a second read must return the first build, or the
    // 650-part assembly pays the triangle materialization again per consumer.
    expect(stats.meshQuality).toBe(stats.meshQuality);
    expect(stats.boundingBox).toBe(stats.boundingBox);
    // And the eagerly-reported count still agrees with the lazy facet's.
    expect(stats.triangleCount).toBe(stats.meshQuality.triangleCount);
  });

  it('should analyze GLB bytes through the same record', async () => {
    const document = documentOf([boxSpec('left')]);
    const bytes = await new WebIO().writeBinary(document);

    const stats = await analyzeGlb(bytes);

    expect(stats.triangleCount).toBe(12);
    expect(stats.meshQuality.triangles[0]?.primitive).toBe('left#0');
  });

  it('should read a MISALIGNED GLB view rather than throwing at the header', async () => {
    // What a GLB looks like after a socket hands you a slice of its own buffer.
    const document = documentOf([boxSpec('left')]);
    const bytes = await new WebIO().writeBinary(document);
    const padded = new Uint8Array(new ArrayBuffer(bytes.byteLength + 3), 3);
    padded.set(bytes);

    await expect(analyzeGlb(padded)).resolves.toMatchObject({ triangleCount: 12 });
  });
});
