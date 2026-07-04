import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it, vi } from 'vitest';
import { GeoSpecModelLoadError, createModelLoader, loadModel, parameterGroups, params } from '#model/index.js';
import type { GeoSpecModelLoader, GeoSpecRuntimeClient, GeoSpecRuntimeSourceAdapter } from '#model/index.js';
import type { GeometryDiagnostic, GeometrySubject } from '#mesh/types.js';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import {
  createCachedModelLoader,
  createModelLoadCacheKey,
  createModelLoadCacheStats,
} from '#runner/model-load-cache.js';
import { runGeoSpecModule } from '#runner/index.js';
import { openscad } from '@taucad/openscad';
import { createNodeClient } from '@taucad/runtime/node';
import { presets } from '@taucad/runtime/presets';
import { defineRuntime } from '@taucad/runtime/worker';
import type { VmFileSystem } from '@taucad/vm';

const replicadBoxCode = `
  import { makeBaseBox } from 'replicad';

  export default function main() {
    return makeBaseBox(10, 20, 30);
  }
`;
const mainFile = 'main.ts';
const openscadFile = 'main.scad';
const openscadCubeCutoutCode = `
$fa = 2;
$fs = 0.4;

difference() {
  cube([50, 50, 50], center = true);
  cylinder(h = 60, r = 10, center = true);
}
`;
const jscadCubeCutoutCode = `
  import { primitives, booleans } from '@jscad/modeling';
  import type { geometries } from '@jscad/modeling';

  export const defaultParams = {
    cubeSize: 50,
    cylinderRadius: 10,
    cylinderHeight: 60,
  };

  export default function main(p = defaultParams): geometries.geom3.Geom3 {
    const cube = primitives.cuboid({
      size: [p.cubeSize, p.cubeSize, p.cubeSize],
      center: [0, 0, p.cubeSize / 2],
    });

    const cylinder = primitives.cylinder({
      radius: p.cylinderRadius,
      height: p.cylinderHeight,
      center: [0, 0, p.cubeSize / 2],
      segments: 64,
    });

    return booleans.subtract(cube, cylinder);
  }
`;

class MemoryFileSystem implements VmFileSystem {
  private readonly files = new Map<string, string>();

  public setText(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(_path: string): Promise<void> {
    return undefined;
  }
}

const createTriangleGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array([0, 0, 0, 50, 0, 0, 0, 50, 0]));
  const indices = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(new Uint16Array([0, 1, 2]));
  const primitive = document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);
  return new WebIO().writeBinary(document);
};

const coerceRuntimeClient = (runtime: unknown): GeoSpecRuntimeClient => runtime as GeoSpecRuntimeClient;

const runtimeMock = (runtime: Record<string, unknown>): GeoSpecRuntimeClient => {
  const mergedRuntime = {
    connect: vi.fn(async () => undefined),
    terminate: vi.fn(),
    ...runtime,
  };
  return coerceRuntimeClient(mergedRuntime);
};

const createOpenScadSourceAdapter = (): GeoSpecRuntimeSourceAdapter => ({
  id: 'openscad',
  extensions: ['scad'],
  async createRuntime({ projectPath }) {
    const baseRuntime = presets.all();
    const runtime = defineRuntime({
      ...baseRuntime,
      kernels: [openscad(), ...baseRuntime.kernels],
    });
    return (await createNodeClient(projectPath, { runtime })) as GeoSpecRuntimeClient;
  },
});

const createMockGeometrySubject = (name: string): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: {
    format: 'mesh-buffer',
    stats: {
      vertexCount: 0,
      meshCount: 0,
      triangleCount: 0,
      connectedComponents: () => 0,
      analyseConnectedComponents: () => ({ count: 0, clusters: [], gaps: [] }),
      watertight: true,
      analyseWatertight: () => ({
        watertight: true,
        irregularEdges: 0,
        openBoundaryEdges: 0,
        nonManifoldEdges: 0,
        irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
        irregularEdgeClusters: [],
        totalEdges: 0,
        irregularEdgeFraction: 0,
        perPrimitive: [],
      }),
      meshQuality: {
        triangleCount: 0,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        triangles: [],
        surfaceArea: 0,
        signedVolume: 0,
        centerOfMass: [0, 0, 0],
      },
    },
  },
  provenance: {
    source: { kind: 'mesh-buffer', format: 'mesh-buffer', name },
    unit: 'mm',
    loader: 'in-memory',
  },
  capabilities: [],
  diagnostics: [],
});

const createReplicadStepOverlapAssemblyCode = (
  parts: ReadonlyArray<{ name: string; x: number }>,
): string => `import { makeBaseBox, type ShapeConfig } from 'replicad';

const part = (name: string, x: number): ShapeConfig => ({
  shape: makeBaseBox(10, 10, 10).translate([x, 0, 0]),
  name,
});

export default function main(): ShapeConfig[] {
  return [
${parts.map((part) => `    part(${JSON.stringify(part.name)}, ${part.x}),`).join('\n')}
  ];
}`;

const runComponentOverlapAssertion = async (subject: GeometrySubject) => {
  const collector = createCollector();
  installCollector(collector);
  try {
    collector.it('should report authored component names for overlap failures', async () => {
      collector.expectGeo(subject).toHaveNoComponentInterference({ tolerance: 0.001 });
    });
    await collector.waitForCompletion(120_000);
    return collector.tests[0]!;
  } finally {
    clearCollectorGlobals();
  }
};

const getComponentOverlapDetails = (
  details: unknown,
): {
  componentSource: unknown;
  overlaps: Array<{ leftLabel: string; rightLabel: string; intersectionVolume: number }>;
} => {
  if (typeof details !== 'object' || details === null || !('overlaps' in details)) {
    throw new Error('Expected component-overlap diagnostic details.');
  }
  const overlapDetails = details as { componentSource?: unknown; overlaps?: unknown };
  if (!Array.isArray(overlapDetails.overlaps)) {
    throw new TypeError('Expected component-overlap diagnostic details to include overlaps.');
  }
  return {
    componentSource: overlapDetails.componentSource,
    overlaps: overlapDetails.overlaps as Array<{
      leftLabel: string;
      rightLabel: string;
      intersectionVolume: number;
    }>,
  };
};

const expectStepOverlapFailureNames = async (options: {
  code: string;
  expectedPairs: ReadonlyArray<{ left: string; right: string }>;
}): Promise<void> => {
  const subject = await loadModel({
    code: { [mainFile]: options.code },
    file: mainFile,
    format: 'step',
  });

  const test = await runComponentOverlapAssertion(subject);

  expect(test.status).toBe('failed');
  const diagnostic = test.assertions[0]?.diagnostics?.[0];
  expect(diagnostic?.code).toBe('GEOSPEC_COMPONENT_INTERFERENCE_DETECTED');
  expect(diagnostic?.message).not.toContain('connected-component-');
  for (const pair of options.expectedPairs) {
    expect(diagnostic?.message).toContain(`${pair.left} to ${pair.right}: volume`);
  }

  const details = getComponentOverlapDetails(diagnostic?.details);
  expect(details.componentSource).toBe('named');
  expect(
    details.overlaps.map((overlap) => ({
      left: overlap.leftLabel,
      right: overlap.rightLabel,
    })),
  ).toEqual(options.expectedPairs);
  for (const overlap of details.overlaps) {
    expect(overlap.intersectionVolume).toBeGreaterThan(0);
  }
};

describe('loadModel', () => {
  it('should create order-stable deterministic cache keys and reject non-deterministic source loads', () => {
    const mainFile = 'main.ts';
    expect(
      createModelLoadCacheKey({
        format: 'glb',
        file: mainFile,
        parameters: { depth: 20, width: 10 },
      }),
    ).toBe(
      createModelLoadCacheKey({
        parameters: { width: 10, depth: 20 },
        file: mainFile,
        format: 'glb',
      }),
    );
    expect(createModelLoadCacheKey({ file: mainFile, format: 'glb' })).not.toBe(
      createModelLoadCacheKey({ file: mainFile, format: 'step' }),
    );
    expect(createModelLoadCacheKey({ code: { [mainFile]: 'export default () => 1' }, file: mainFile })).not.toBe(
      createModelLoadCacheKey({ code: { [mainFile]: 'export default () => 2' }, file: mainFile }),
    );
    expect(
      createModelLoadCacheKey({
        source: { format: 'mesh-buffer', positions: [0, 0, 0] },
        format: 'mesh-buffer',
      }),
    ).toBeUndefined();
    expect(createModelLoadCacheKey({ file: mainFile, runtime: () => undefined })).toBeUndefined();
  });

  it('should cache deterministic loader promises while bypassing raw source loads', async () => {
    const stats = createModelLoadCacheStats();
    const modelLoader = vi.fn(async (options: Parameters<GeoSpecModelLoader>[0]) =>
      createMockGeometrySubject('source' in options ? 'source' : options.file),
    );
    const cached = createCachedModelLoader(modelLoader, { stats });
    if (!cached) {
      throw new Error('Expected cached loader');
    }

    const first = await cached({ file: 'main.ts', format: 'glb' });
    const second = await cached({ format: 'glb', file: 'main.ts' });
    const sourceOptions = {
      source: { format: 'mesh-buffer', positions: [0, 0, 0] },
      format: 'mesh-buffer',
    } satisfies Parameters<GeoSpecModelLoader>[0];
    await cached(sourceOptions);
    await cached(sourceOptions);

    expect(first).toBe(second);
    expect(modelLoader).toHaveBeenCalledTimes(3);
    expect(stats).toEqual({
      hits: 1,
      misses: 1,
      bypasses: 2,
      failures: 0,
    });
  });

  it('should fan out identical loader failures from the shared cache utility', async () => {
    const stats = createModelLoadCacheStats();
    const loadError = new Error('render exploded once');
    const modelLoader = vi.fn(async () => {
      throw loadError;
    });
    const cached = createCachedModelLoader(modelLoader as GeoSpecModelLoader, { stats });
    if (!cached) {
      throw new Error('Expected cached loader');
    }

    await expect(cached({ file: 'main.ts', format: 'glb' })).rejects.toBe(loadError);
    await expect(cached({ format: 'glb', file: 'main.ts' })).rejects.toBe(loadError);
    expect(modelLoader).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({
      hits: 1,
      misses: 1,
      bypasses: 0,
      failures: 1,
    });
  });

  it('should load direct mesh-buffer sources as geometry subjects', async () => {
    const subject = await loadModel({
      source: {
        format: 'mesh-buffer',
        name: 'triangle',
        positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
        indices: [0, 1, 2],
      },
      parameters: { variant: 'direct' },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.parameters).toEqual({ variant: 'direct' });
    expect(subject.provenance.source).toEqual(
      expect.objectContaining({
        kind: 'mesh-buffer',
        name: 'triangle',
      }),
    );
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should load Replicad code through the Tau runtime as mesh evidence', { timeout: 30_000 }, async () => {
    const subject = await loadModel({
      code: { [mainFile]: replicadBoxCode },
      file: mainFile,
      format: 'glb',
      parameters: { width: 10 },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.parameters).toEqual({ width: 10 });
    expect(subject.provenance.unit).toBe('mm');
    const sortedSize = [...(subject.mesh.stats.boundingBox?.size ?? [])].sort((a, b) => a - b);
    expect(sortedSize[0]).toBeCloseTo(10, 5);
    expect(sortedSize[1]).toBeCloseTo(20, 5);
    expect(sortedSize[2]).toBeCloseTo(30, 5);
    expect(subject.mesh.stats.meshQuality.surfaceArea).toBeGreaterThan(0);
    expect(Math.abs(subject.mesh.stats.meshQuality.signedVolume)).toBeGreaterThan(0);
  });

  it('should load JSCAD cube cutout through runtime import inference', { timeout: 60_000 }, async () => {
    const subject = await loadModel({
      code: { [mainFile]: jscadCubeCutoutCode },
      file: mainFile,
      format: 'glb',
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.unit).toBe('mm');
    expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(50, 1);
    expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(50, 1);
    expect(subject.mesh.stats.boundingBox?.size[2]).toBeCloseTo(50, 1);
    expect(subject.mesh.stats.boundingBox?.center[0]).toBeCloseTo(0, 1);
    expect(subject.mesh.stats.boundingBox?.center[1]).toBeCloseTo(0, 1);
    expect(subject.mesh.stats.boundingBox?.center[2]).toBeCloseTo(25, 1);
    expect(subject.mesh.stats.watertight).toBe(true);
    expect(subject.mesh.stats.connectedComponents(0.5)).toBe(1);
  });

  it('should load adapter-backed source files as millimetre mesh evidence', { timeout: 120_000 }, async () => {
    const subject = await loadModel({
      code: { [openscadFile]: openscadCubeCutoutCode },
      file: openscadFile,
      sourceAdapters: [createOpenScadSourceAdapter()],
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.source.format).toBe('glb');
    expect(subject.provenance.unit).toBe('mm');
    expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(50, 1);
    expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(50, 1);
    expect(subject.mesh.stats.boundingBox?.size[2]).toBeCloseTo(50, 1);
    expect(subject.mesh.stats.boundingBox?.center[0]).toBeCloseTo(0, 1);
    expect(subject.mesh.stats.boundingBox?.center[1]).toBeCloseTo(0, 1);
    expect(subject.mesh.stats.boundingBox?.center[2]).toBeCloseTo(0, 1);
    expect(subject.mesh.stats.watertight).toBe(true);
    expect(subject.mesh.stats.connectedComponents(0.1)).toBe(1);
  });

  it('should report a generic source-adapter diagnostic for unsupported runtime-backed source files', async () => {
    await expect(
      loadModel({
        code: { [openscadFile]: openscadCubeCutoutCode },
        file: openscadFile,
      }),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_RUNTIME_SOURCE_ADAPTER_UNAVAILABLE',
          severity: 'error',
          details: {
            file: openscadFile,
            extension: 'scad',
          },
        }),
      ],
    });
  });

  it('should request canonical z-up millimeter exports from runtime route metadata', async () => {
    const bytes = await createTriangleGlb();
    const exportMock = vi.fn(async (_format: string, _input: unknown) => ({
      success: true,
      data: { bytes, name: 'model.glb' },
      issues: [],
    }));
    const runtime = runtimeMock({
      export: exportMock,
      bestRouteFor: vi.fn(() => ({
        kernelId: 'replicad',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        schema: {
          properties: {
            coordinateSystem: {},
            unit: {},
          },
        },
        defaults: {
          coordinateSystem: 'z-up',
          unit: { length: 'meter' },
        },
      })),
    });

    const subject = await loadModel({
      file: mainFile,
      runtime,
    });

    expect(exportMock).toHaveBeenCalledWith(
      'glb',
      expect.objectContaining({
        source: { path: mainFile },
        exportOptions: {
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        },
      }),
    );
    expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(50, 5);
    expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(50, 5);
    const honoredIntent = subject.provenance.exportIntent?.honored;
    expect(honoredIntent).toBeDefined();
    if (!honoredIntent) {
      throw new Error('Expected loadModel to record honored export intent');
    }
    expect(honoredIntent.coordinateSystem).toBe('z-up');
    expect(honoredIntent.sourceUnit).toBe('mm');
    expect(honoredIntent.unit).toEqual({ length: 'millimeter' });
  });

  it('should treat custom runtimes without route metadata as canonical millimeter exporters', async () => {
    const bytes = await createTriangleGlb();
    const exportMock = vi.fn(async (_format: string, _input: unknown) => ({
      success: true,
      data: { bytes, name: 'model.glb' },
      issues: [],
    }));

    const subject = await loadModel({
      file: mainFile,
      runtime: runtimeMock({
        export: exportMock,
      }),
    });

    expect(exportMock).toHaveBeenCalledWith('glb', {
      source: { path: mainFile },
      parameters: undefined,
      exportOptions: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      },
    });
    expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(50, 5);
    expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(50, 5);
    expect(subject.provenance.exportIntent?.honored).toEqual({
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      sourceUnit: 'mm',
    });
  });

  it('should preserve successful runtime export warnings as subject diagnostics', async () => {
    const bytes = await createTriangleGlb();
    const runtimeIssue = {
      code: 'GEOMETRY_INVALID',
      severity: 'warning',
      message: "JSCAD part 'Housing' is not a closed oriented solid: non-manifold edges 164.",
      details: {
        producer: {
          kernelId: 'jscad',
          validator: 'geom3.validate',
        },
        geometry: {
          partName: 'Housing',
          topology: {
            aabb: {
              min: [0, 0, 0],
              max: [10, 20, 0],
              center: [5, 10, 0],
            },
          },
          hints: ['Use one valid extrusion.'],
        },
      },
    };

    const subject = await loadModel({
      file: mainFile,
      runtime: runtimeMock({
        export: vi.fn(async () => ({
          success: true,
          data: { bytes, name: 'model.glb' },
          issues: [runtimeIssue],
        })),
      }),
    });

    expect(subject.diagnostics).toEqual([
      expect.objectContaining({
        code: 'GEOMETRY_INVALID',
        severity: 'warning',
        message: "JSCAD part 'Housing' is not a closed oriented solid: non-manifold edges 164.",
        spatial: {
          min: [0, 0, 0],
          max: [10, 20, 0],
          center: [5, 10, 0],
        },
        details: {
          file: mainFile,
          format: 'glb',
          issueIndex: 0,
          facet: {
            kind: 'source-validity',
            valid: false,
            partName: 'Housing',
            partIndex: undefined,
            topology: runtimeIssue.details.geometry.topology,
            hints: ['Use one valid extrusion.'],
          },
          issue: runtimeIssue,
        },
      }),
    ]);
  });

  it('should preserve runtime export issues as structured model-load diagnostics', async () => {
    const runtimeIssue = {
      code: 'UNKNOWN',
      message: "Cannot destructure property 'geom2' of 'jscadModeling.geometries' as it is undefined.",
      type: 'kernel',
      severity: 'error',
      details: { kernelId: 'jscad' },
    };

    await expect(
      loadModel({
        file: mainFile,
        runtime: runtimeMock({
          export: vi.fn(async () => ({
            success: false,
            issues: [runtimeIssue],
          })),
        }),
      }),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        {
          code: 'MODEL_EXPORT_FAILED',
          severity: 'error',
          message: 'Tau runtime did not produce geometry bytes for this model.',
          suggestion:
            'Inspect the runtime export diagnostics, kernel import/export support, and model code identified by those diagnostics.',
          details: {
            file: mainFile,
            format: 'glb',
            issues: [runtimeIssue],
          },
        },
      ],
    });
  });

  it('should report unsupported canonical exports when route-aware mesh routes lack unit intent', async () => {
    const exportMock = vi.fn();
    const runtime = runtimeMock({
      export: exportMock,
      bestRouteFor: vi.fn(() => ({
        kernelId: 'legacy',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        schema: { properties: { coordinateSystem: {} } },
      })),
    });

    let thrown: unknown;
    try {
      await loadModel({
        file: mainFile,
        runtime,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GeoSpecModelLoadError);
    const { diagnostics } = thrown as GeoSpecModelLoadError;
    const [diagnostic] = diagnostics;
    expect(diagnostic).toMatchObject({
      code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED',
      severity: 'error',
      details: {
        format: 'glb',
        missing: ['unit'],
        route: {
          kernelId: 'legacy',
          fidelity: 'mesh',
          direct: true,
        },
      },
    });
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('should reject mesh-fidelity STEP transcodes for exact BRep evidence', async () => {
    const exportMock = vi.fn();
    const runtime = runtimeMock({
      export: exportMock,
      bestRouteFor: vi.fn(() => ({
        kernelId: 'replicad',
        sourceFormat: 'glb',
        targetFormat: 'step',
        transcoderId: 'converter',
        fidelity: 'mesh',
        schema: { properties: {} },
        defaults: {},
      })),
    });

    let thrown: unknown;
    try {
      await loadModel({
        file: mainFile,
        format: 'step',
        runtime,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GeoSpecModelLoadError);
    const { diagnostics } = thrown as GeoSpecModelLoadError;
    const [diagnostic] = diagnostics;
    expect(diagnostic).toMatchObject({
      code: 'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED',
      severity: 'error',
    });
    expect(exportMock).not.toHaveBeenCalled();
  });

  it(
    'should run source-adapter GeoSpec modules without treating adapter files as mesh files',
    { timeout: 120_000 },
    async () => {
      const filesystem = new MemoryFileSystem();
      filesystem.setText(
        '/project/main.geospec.ts',
        [
          "import { describe, expectGeo, it } from 'geospec';",
          "import { loadModel } from 'geospec/model';",
          "describe('cube with cylinder cutout', () => {",
          "  it('should have bounding box approximately 50mm cubic', async () => {",
          "    const model = await loadModel({ file: 'main.scad' });",
          '    expectGeo(model).toHaveBoundingBox({ size: { x: 50, y: 50, z: 50 }, tolerance: 1 });',
          '  });',
          "  it('should be centered at origin', async () => {",
          "    const model = await loadModel({ file: 'main.scad' });",
          '    expectGeo(model).toHaveBoundingBox({ center: { x: 0, y: 0, z: 0 }, tolerance: 0.5 });',
          '  });',
          "  it('should be a single watertight solid', async () => {",
          "    const model = await loadModel({ file: 'main.scad' });",
          '    expectGeo(model).toBeWatertight();',
          '  });',
          "  it('should be one connected component', async () => {",
          "    const model = await loadModel({ file: 'main.scad' });",
          '    expectGeo(model).toHaveConnectedComponents({ count: 1 });',
          '  });',
          '});',
        ].join('\n'),
      );

      let subjectPromise: Promise<Awaited<ReturnType<typeof loadModel>>> | undefined;
      const result = await runGeoSpecModule({
        filesystem,
        projectPath: '/project',
        entryPath: '/project/main.geospec.ts',
        modelLoader: async (input) => {
          if ('source' in input) {
            return loadModel(input);
          }
          if ('code' in input) {
            return loadModel(input);
          }
          subjectPromise ??= loadModel({
            code: { [openscadFile]: openscadCubeCutoutCode },
            file: openscadFile,
            format: input.format,
            parameters: input.parameters,
            sourceAdapters: [createOpenScadSourceAdapter()],
          });
          return subjectPromise;
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.tests.map((test) => test.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
      }
    },
  );

  it('should dedupe identical loadModel calls inside one GeoSpec run', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('shared load path', () => {",
        "  it('uses the first model', async () => { await loadModel({ file: 'main.ts', format: 'glb' }); });",
        "  it('uses the same model again', async () => { await loadModel({ format: 'glb', file: 'main.ts' }); });",
        "  it('shares in-flight loads', async () => {",
        '    await Promise.all([',
        "      loadModel({ file: 'main.ts', format: 'glb' }),",
        "      loadModel({ format: 'glb', file: 'main.ts' }),",
        '    ]);',
        '  });',
        '});',
      ].join('\n'),
    );
    const modelLoader = vi.fn(async () => createMockGeometrySubject('deduped'));

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/main.geospec.ts',
      modelLoader,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tests.map((test) => test.status)).toEqual(['passed', 'passed', 'passed']);
    }
    expect(modelLoader).toHaveBeenCalledTimes(1);
  });

  it('should give per-test loadModel calls the same cache behavior as a module-level promise', async () => {
    const styles = [
      {
        name: 'per-test',
        lines: [
          "import { describe, it } from 'geospec';",
          "import { loadModel } from 'geospec/model';",
          "describe('per-test direct loads', () => {",
          "  it('loads in the first test', async () => { await loadModel({ file: 'main.ts', format: 'glb' }); });",
          "  it('loads in the second test', async () => { await loadModel({ format: 'glb', file: 'main.ts' }); });",
          "  it('loads in the third test', async () => { await loadModel({ file: 'main.ts', format: 'glb' }); });",
          '});',
        ],
      },
      {
        name: 'module-promise',
        lines: [
          "import { describe, it } from 'geospec';",
          "import { loadModel } from 'geospec/model';",
          "const sharedModel = loadModel({ file: 'main.ts', format: 'glb' });",
          "describe('module-level promise loads', () => {",
          "  it('uses the first model', async () => { await sharedModel; });",
          "  it('uses the second model', async () => { await sharedModel; });",
          "  it('uses the third model', async () => { await sharedModel; });",
          '});',
        ],
      },
    ];

    await Promise.all(
      styles.map(async (style) => {
        const filesystem = new MemoryFileSystem();
        filesystem.setText('/project/main.geospec.ts', style.lines.join('\n'));
        const modelLoader = vi.fn(async () => createMockGeometrySubject(style.name));

        const result = await runGeoSpecModule({
          filesystem,
          projectPath: '/project',
          entryPath: '/project/main.geospec.ts',
          modelLoader,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.tests.map((test) => test.status)).toEqual(['passed', 'passed', 'passed']);
        }
        expect(modelLoader, style.name).toHaveBeenCalledTimes(1);
      }),
    );
  });

  it('should keep distinct loadModel parameter sets as separate run-scoped cache entries', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('parameter cache boundary', () => {",
        "  it('loads the wide variant', async () => { await loadModel({ file: 'main.ts', format: 'glb', parameters: { width: 10 } }); });",
        "  it('loads the narrow variant', async () => { await loadModel({ file: 'main.ts', format: 'glb', parameters: { width: 20 } }); });",
        "  it('reuses the wide variant', async () => { await loadModel({ format: 'glb', parameters: { width: 10 }, file: 'main.ts' }); });",
        '});',
      ].join('\n'),
    );
    const modelLoader = vi.fn(async (_options: Parameters<GeoSpecModelLoader>[0]) =>
      createMockGeometrySubject('variant'),
    );

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/main.geospec.ts',
      modelLoader,
    });

    expect(result.success).toBe(true);
    expect(modelLoader).toHaveBeenCalledTimes(2);
    expect(
      modelLoader.mock.calls.map(([options]) => ('parameters' in options ? options.parameters : undefined)),
    ).toEqual([{ width: 10 }, { width: 20 }]);
  });

  it('should fan out identical loadModel failures from the run-scoped cache', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('cached load failures', () => {",
        "  it('fails the first load', async () => { await loadModel({ file: 'main.ts', format: 'glb' }); });",
        "  it('fails the second load with the same rejection', async () => { await loadModel({ format: 'glb', file: 'main.ts' }); });",
        '});',
      ].join('\n'),
    );
    const loadError = new Error('render failed once');
    const modelLoader = vi.fn(async () => {
      throw loadError;
    });

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/main.geospec.ts',
      modelLoader,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.passed).toBe(false);
      expect(result.tests.map((test) => test.status)).toEqual(['failed', 'failed']);
    }
    expect(modelLoader).toHaveBeenCalledTimes(1);
  });

  it('should throw typed diagnostics for invalid STEP sources', async () => {
    await expect(
      loadModel({
        source: new Uint8Array([1, 2, 3]),
        format: 'step',
      }),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        {
          code: 'STEP_LOAD_FAILED',
          severity: 'error',
          suggestion: 'Check that the STEP bytes are valid and that the configured STEP loader can parse this source.',
        },
      ],
    });
  });

  it('should load Replicad code through the Tau runtime as STEP and BRep evidence', { timeout: 60_000 }, async () => {
    const subject = await loadModel({
      code: { [mainFile]: replicadBoxCode },
      file: mainFile,
      format: 'step',
      parameters: { width: 10 },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.step?.unit).toBe('mm');
    expect(typeof subject.step?.readStrategy.bytesRead).toBe('number');
    expect(subject.brep?.validity).toEqual({ valid: true });
    expect(typeof subject.brep?.massProperties?.volume).toBe('number');
    expect(typeof subject.brep?.massProperties?.surfaceArea).toBe('number');
    expect(subject.mesh.stats.triangleCount).toBeGreaterThan(0);
  });

  it('should skip the runtime-backed STEP mesh supplement when mesh loading is disabled', async () => {
    const stepBytes = new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;');
    const exportMock = vi.fn(async () => ({
      success: true,
      data: { bytes: stepBytes, name: 'assembly.step' },
      issues: [],
    }));
    let parsedOptions: unknown;
    const reader = {
      readText: vi.fn((_data: string, optionsJson: string) => {
        parsedOptions = JSON.parse(optionsJson);
        return {
          success: true,
          evidenceJson: () =>
            JSON.stringify({
              brep: { validity: { valid: true } },
              diagnostics: [],
            }),
          delete: vi.fn(),
        };
      }),
    };
    const stepStreamReaderKey = 'GeoSpecStepStreamReader';

    const subject = await loadModel({
      file: mainFile,
      format: 'step',
      mesh: false,
      runtime: runtimeMock({ export: exportMock }),
      nativeStepBackend: { [stepStreamReaderKey]: reader },
    });

    expect(exportMock).toHaveBeenCalledOnce();
    expect(exportMock).toHaveBeenCalledWith('step', {
      source: { path: mainFile },
      parameters: undefined,
      exportOptions: {},
    });
    expect(parsedOptions).toMatchObject({ mesh: false });
    expect(subject.mesh.stats.triangleCount).toBe(0);
    expect(subject.capabilities).not.toContainEqual({ kind: 'mesh', feature: 'component-overlap' });
  });

  it(
    'should report authored names for a STEP-backed two-component Replicad overlap failure',
    { timeout: 120_000 },
    async () => {
      await expectStepOverlapFailureNames({
        code: createReplicadStepOverlapAssemblyCode([
          { name: 'Housing and Ring Gear', x: 0 },
          { name: 'Planet Gear', x: 9 },
        ]),
        expectedPairs: [{ left: 'Housing and Ring Gear', right: 'Planet Gear' }],
      });
    },
  );

  it(
    'should report authored names for a STEP-backed three-component Replicad assembly with one overlapping pair',
    { timeout: 120_000 },
    async () => {
      await expectStepOverlapFailureNames({
        code: createReplicadStepOverlapAssemblyCode([
          { name: 'Housing and Ring Gear', x: 0 },
          { name: 'Planet Gear', x: 9 },
          { name: 'Planet Carrier', x: 30 },
        ]),
        expectedPairs: [{ left: 'Housing and Ring Gear', right: 'Planet Gear' }],
      });
    },
  );

  it(
    'should report authored names for a STEP-backed three-component Replicad assembly with every pair overlapping',
    { timeout: 120_000 },
    async () => {
      await expectStepOverlapFailureNames({
        code: createReplicadStepOverlapAssemblyCode([
          { name: 'Housing and Ring Gear', x: 0 },
          { name: 'Planet Gear', x: 3 },
          { name: 'Planet Carrier', x: 6 },
        ]),
        expectedPairs: [
          { left: 'Housing and Ring Gear', right: 'Planet Gear' },
          { left: 'Housing and Ring Gear', right: 'Planet Carrier' },
          { left: 'Planet Gear', right: 'Planet Carrier' },
        ],
      });
    },
  );

  it('should expose merged parameter groups for model tests', () => {
    const groups = parameterGroups(
      {
        activeGroup: 'wide',
        order: ['wide', 'narrow'],
        groups: {
          wide: { values: { base: { width: 20 } } },
          narrow: { values: { base: { width: 10 } } },
        },
      },
      { defaults: { base: { width: 5, depth: 7 } }, parameterFile: '.tau/parameters/main.ts.json' },
    );

    expect(groups).toEqual([
      {
        name: 'wide',
        active: true,
        values: { base: { width: 20, depth: 7 } },
        overrides: { base: { width: 20 } },
        provenance: {
          parameterFile: '.tau/parameters/main.ts.json',
          activeGroup: 'wide',
          groupName: 'wide',
        },
      },
      {
        name: 'narrow',
        active: false,
        values: { base: { width: 10, depth: 7 } },
        overrides: { base: { width: 10 } },
        provenance: {
          parameterFile: '.tau/parameters/main.ts.json',
          activeGroup: 'wide',
          groupName: 'narrow',
        },
      },
    ]);
  });

  it('should expose a typed model-load error for instanceof checks', async () => {
    await expect(
      loadModel({
        source: new Uint8Array([1, 2, 3]),
        format: 'step',
      }),
    ).rejects.toBeInstanceOf(GeoSpecModelLoadError);
  });

  it('should snapshot and freeze model-load diagnostics', () => {
    const diagnostics: GeometryDiagnostic[] = [
      {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'runtime failed',
        severity: 'error',
        details: { reason: 'initial' },
      },
    ];

    const error = new GeoSpecModelLoadError(diagnostics);
    diagnostics[0]!.message = 'mutated after construction';
    (diagnostics[0]!.details as { reason: string }).reason = 'mutated';

    expect(Object.isFrozen(error.diagnostics)).toBe(true);
    expect(error.diagnostics[0]).toEqual({
      code: 'RUNTIME_UNAVAILABLE',
      message: 'runtime failed',
      severity: 'error',
      details: { reason: 'initial' },
    });
    expect(() => {
      (error.diagnostics as GeometryDiagnostic[]).push({
        code: 'EXTRA',
        message: 'should fail',
        severity: 'error',
      });
    }).toThrow(TypeError);
  });

  it('should wrap runtime factory failures in typed model-load diagnostics', async () => {
    await expect(
      loadModel({
        file: mainFile,
        runtime: async () => {
          throw new Error('factory offline');
        },
      }),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        expect.objectContaining({
          code: 'RUNTIME_UNAVAILABLE',
          severity: 'error',
          message: 'factory offline',
        }),
      ],
    });
  });

  it('should create a configured model loader with shared defaults', async () => {
    const loadTriangle = createModelLoader({
      format: 'mesh-buffer',
    });

    const subject = await loadTriangle({
      source: {
        format: 'mesh-buffer',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      },
      unit: 'cm',
      parameters: { case: 'factory' },
    });

    expect(subject.provenance.unit).toBe('cm');
    expect(subject.provenance.parameters).toEqual({ case: 'factory' });
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should deep-clone parameter defaults and overrides for isolated test cases', () => {
    const entry = {
      activeGroup: 'wide',
      groups: {
        wide: { values: { base: { width: 20 } } },
      },
    };
    const defaults = { base: { width: 5, depth: 7 } };

    const resolved = params(entry, { defaults });
    (resolved.active.values as { base: { depth: number } }).base.depth = 99;
    (resolved.active.overrides as { base: { width: number } }).base.width = 99;

    expect(defaults).toEqual({ base: { width: 5, depth: 7 } });
    expect(entry.groups.wide.values).toEqual({ base: { width: 20 } });
    expect(params(entry, { defaults }).active.values).toEqual({ base: { width: 20, depth: 7 } });
  });

  it('should reject path-like parameter strings before JSON parsing', () => {
    expect(() => params('.tau/parameters/main.ts.json')).toThrow('pass parsed JSON or raw JSON text');
  });

  it('should reject runtime-backed unit and scale workarounds with structured diagnostics', async () => {
    const bytes = await createTriangleGlb();
    const runtime = runtimeMock({
      export: vi.fn(async () => ({
        success: true,
        data: { bytes, name: 'model.glb' },
        issues: [],
      })),
    });

    await expect(
      loadModel({
        file: mainFile,
        runtime,
        unit: 'm',
        scale: 0.001,
        coordinateSystem: 'z-up',
        sourceUnit: 'm',
      } as Parameters<typeof loadModel>[0]),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_INVALID_LOAD_MODEL_OPTIONS',
          severity: 'error',
          details: {
            forbidden: ['unit', 'sourceUnit', 'scale', 'coordinateSystem'],
          },
        }),
      ],
    });
    expect(runtime.export).not.toHaveBeenCalled();
  });
});
