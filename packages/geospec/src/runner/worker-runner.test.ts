import { describe, expect, it, vi } from 'vitest';
import type { GeometrySubject, MeshTriangle, Vec3 } from '#mesh/types.js';
import type { VmFileSystem } from '@taucad/vm';
import { createGeoSpecNodeRunner } from '#runner/node/index.js';
import { createGeoSpecRunProfile } from '#runner/profile.js';
import { createGeoSpecWebRunner } from '#runner/web/index.js';
import type { GeoSpecRunner, GeoSpecRunnerEvent } from '#runner/worker/index.js';

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

const passingTestModule = (name: string): string => `
import { describe, it } from 'geospec';

describe('runner ${name}', () => {
  it('should pass ${name}', () => {});
});
`;

const createFilesystem = (): MemoryFileSystem => {
  const filesystem = new MemoryFileSystem();
  filesystem.setText('/first.geospec.ts', passingTestModule('first'));
  filesystem.setText('/second.geospec.ts', passingTestModule('second'));
  return filesystem;
};

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

const loadModelTestModule = (file: string): string => `
import { describe, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('runner load ${file}', () => {
  it('loads ${file}', async () => {
    await loadModel({ file: 'main.ts', format: 'glb' });
  });
});
`;

const sourceLoadTestModule = (file: string): string => `
import { describe, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('runner source load ${file}', () => {
  it('loads raw source ${file}', async () => {
    await loadModel({
      source: { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      format: 'mesh-buffer',
    });
  });
});
`;

const boxPositions = [
  0, 0, 0, 10, 20, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 10, 20, 0, 0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 0, 30, 10, 20, 30, 0,
  20, 30, 0, 0, 0, 10, 0, 0, 10, 0, 30, 0, 0, 0, 10, 0, 30, 0, 0, 30, 0, 20, 0, 10, 20, 30, 10, 20, 0, 0, 20, 0, 0, 20,
  30, 10, 20, 30, 0, 0, 0, 0, 0, 30, 0, 20, 30, 0, 0, 0, 0, 20, 30, 0, 20, 0, 10, 0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 0,
  10, 20, 30, 10, 0, 30,
];

const shiftBox = (x: number): number[] => boxPositions.map((value, index) => (index % 3 === 0 ? value + x : value));

type MutableVec3 = [number, number, number];

const center = (a: Vec3, b: Vec3, c: Vec3): MutableVec3 => [
  (a[0] + b[0] + c[0]) / 3,
  (a[1] + b[1] + c[1]) / 3,
  (a[2] + b[2] + c[2]) / 3,
];

const triangleArea = (a: Vec3, b: Vec3, c: Vec3): number => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return (
    Math.hypot(
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ) / 2
  );
};

const trianglesFromFlat = (primitive: string, values: readonly number[], startIndex = 0): MeshTriangle[] => {
  const triangles: MeshTriangle[] = [];
  for (let offset = 0; offset + 8 < values.length; offset += 9) {
    const a: MutableVec3 = [values[offset]!, values[offset + 1]!, values[offset + 2]!];
    const b: MutableVec3 = [values[offset + 3]!, values[offset + 4]!, values[offset + 5]!];
    const c: MutableVec3 = [values[offset + 6]!, values[offset + 7]!, values[offset + 8]!];
    triangles.push({
      primitive,
      triangleIndex: startIndex + triangles.length,
      a,
      b,
      c,
      center: center(a, b, c),
      area: triangleArea(a, b, c),
    });
  }
  return triangles;
};

const createOverlappingBoxSubject = (): GeometrySubject => {
  const triangles = [
    ...trianglesFromFlat('left-box#0', boxPositions),
    ...trianglesFromFlat('right-box#0', shiftBox(9), 12),
  ];
  return {
    ...createMockGeometrySubject('overlapping-boxes'),
    mesh: {
      format: 'mesh-buffer',
      stats: {
        vertexCount: triangles.length * 3,
        meshCount: 2,
        triangleCount: triangles.length,
        connectedComponents: () => 2,
        analyseConnectedComponents: () => ({ count: 2, clusters: [], gaps: [] }),
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
          triangleCount: triangles.length,
          nonFiniteVertices: [],
          degenerateTriangles: [],
          duplicateFaces: [],
          triangles,
          surfaceArea: triangles.reduce((sum, triangle) => sum + triangle.area, 0),
          signedVolume: 1,
          centerOfMass: [0, 0, 0],
        },
      },
    },
    capabilities: [{ kind: 'mesh', feature: 'component-overlap' }],
  };
};

describe('GeoSpec worker-style runners', () => {
  it('should run GeoSpec files serially through the Node runner', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
      onEvent: (event) => events.push(event),
    });

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

    expect(result).toMatchObject({
      success: true,
      passed: 2,
      failed: 0,
      selectedTests: 2,
    });
    expect(events.map((event) => event.type)).toEqual([
      'run-start',
      'file-start',
      'file-complete',
      'file-start',
      'file-complete',
      'run-complete',
    ]);
    await runner.close();
  });

  it('should fail clearly when filters select no tests', async () => {
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });

    const result = await runner.run({
      files: ['/first.geospec.ts'],
      testNamePattern: 'does not exist',
    });

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.issues?.[0]).toMatchObject({
      code: 'NO_MATCHING_GEOSPEC_TESTS',
      severity: 'error',
    });
    await runner.close();
  });

  it('should return structured file issues when testNamePattern is invalid', async () => {
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });

    const result = await runner.run({
      files: ['/first.geospec.ts'],
      testNamePattern: '[',
    });

    expect(result.success).toBe(false);
    expect(result.files[0]?.result).toMatchObject({
      success: false,
      issues: [
        {
          code: 'INVALID_GEOSPEC_TEST_NAME_PATTERN',
          message: 'testNamePattern is not a valid JavaScript regular expression.',
          severity: 'error',
          type: 'runtime',
        },
      ],
    });
    await runner.close();
  });

  it('should abort before starting the next queued file', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const runner: GeoSpecRunner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'file-complete') {
          runner.abort('test requested stop');
        }
      },
    });

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

    expect(result.success).toBe(false);
    expect(result.files).toHaveLength(1);
    expect(result.issues?.[0]).toMatchObject({
      code: 'GEOSPEC_RUNNER_ABORTED',
      message: 'GeoSpec run aborted: test requested stop',
    });
    expect(events.some((event) => event.type === 'abort')).toBe(true);
    await runner.close();
  });

  it('should reject runs after close with a structured issue', async () => {
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });
    await runner.close();

    const result = await runner.run({ files: ['/first.geospec.ts'] });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]).toMatchObject({
      code: 'GEOSPEC_RUNNER_CLOSED',
      severity: 'error',
    });
  });

  it('should expose the same compact result shape through the web runner factory', async () => {
    const runner = createGeoSpecWebRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });

    const result = await runner.run({ files: ['/first.geospec.ts'] });

    expect(result).toMatchObject({
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
    });
    await runner.close();
  });

  it('should dedupe identical deterministic model loads across files in one runner invocation', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText('/first.geospec.ts', loadModelTestModule('first'));
    filesystem.setText('/second.geospec.ts', loadModelTestModule('second'));
    const modelLoader = vi.fn(async () => createMockGeometrySubject('deduped-cross-file'));
    const profile = createGeoSpecRunProfile();
    const runner = createGeoSpecNodeRunner({
      filesystem,
      projectPath: '/',
      modelLoader,
      internalProfile: profile,
    });

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

    expect(result).toMatchObject({
      success: true,
      passed: 2,
      failed: 0,
      selectedTests: 2,
    });
    expect(modelLoader).toHaveBeenCalledTimes(1);
    expect(profile.aggregateModelLoadCache).toEqual({
      hits: 1,
      misses: 1,
      bypasses: 0,
      failures: 0,
    });
    // R10: the runner's run-lifetime cached loader is branded, so the
    // per-module layer is skipped entirely — both loads hit the aggregate
    // cache directly and the module counters never move.
    expect(profile.moduleModelLoadCache).toEqual({
      hits: 0,
      misses: 0,
      bypasses: 0,
      failures: 0,
    });
    await runner.close();
  });

  it('should clear the aggregate model-load cache between separate runner invocations', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText('/main.geospec.ts', loadModelTestModule('main'));
    const modelLoader = vi.fn(async () => createMockGeometrySubject('per-run'));
    const profile = createGeoSpecRunProfile();
    const runner = createGeoSpecNodeRunner({
      filesystem,
      projectPath: '/',
      modelLoader,
      internalProfile: profile,
    });

    await runner.run({ files: ['/main.geospec.ts'] });
    await runner.run({ files: ['/main.geospec.ts'] });

    expect(modelLoader).toHaveBeenCalledTimes(2);
    expect(profile.aggregateModelLoadCache).toEqual({
      hits: 0,
      misses: 2,
      bypasses: 0,
      failures: 0,
    });
    await runner.close();
  });

  it('should keep raw source loads uncached across files', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText('/first.geospec.ts', sourceLoadTestModule('first'));
    filesystem.setText('/second.geospec.ts', sourceLoadTestModule('second'));
    const modelLoader = vi.fn(async () => createMockGeometrySubject('source'));
    const runner = createGeoSpecNodeRunner({
      filesystem,
      projectPath: '/',
      modelLoader,
    });

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

    expect(result.success).toBe(true);
    expect(modelLoader).toHaveBeenCalledTimes(2);
    await runner.close();
  });

  it('should dispose scoped overlap resources after assertion failures', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('overlap cleanup', () => {",
        "  it('fails after preparing overlap resources', async () => {",
        "    const model = await loadModel({ file: 'main.ts', format: 'glb' });",
        '    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.001 });',
        '  });',
        '});',
      ].join('\n'),
    );
    const profile = createGeoSpecRunProfile();
    const runner = createGeoSpecNodeRunner({
      filesystem,
      projectPath: '/',
      modelLoader: vi.fn(async () => createOverlappingBoxSubject()),
      internalProfile: profile,
    });

    const result = await runner.run({ files: ['/main.geospec.ts'], testTimeout: 10_000 });

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(profile.resourceScope).toMatchObject({
      trackedSubjects: 1,
      registeredDisposables: 1,
      disposedScopes: 1,
      disposedResources: 1,
      overlap: {
        cacheCreations: 1,
        cacheDisposals: 1,
        preparedComponentMisses: 2,
        pairVolumeMisses: 1,
      },
    });
    await runner.close();
  });

  it('should dispose the aggregate resource scope after VM execution failures', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText('/main.geospec.ts', "throw new Error('module crashed before tests');");
    const profile = createGeoSpecRunProfile();
    const runner = createGeoSpecNodeRunner({
      filesystem,
      projectPath: '/',
      internalProfile: profile,
    });

    const result = await runner.run({ files: ['/main.geospec.ts'] });

    expect(result.success).toBe(false);
    expect(profile.resourceScope).toMatchObject({
      trackedSubjects: 0,
      registeredDisposables: 0,
      disposedScopes: 1,
      disposedResources: 0,
    });
    await runner.close();
  });

  it('should dispose the aggregate resource scope after loader rejections', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText('/main.geospec.ts', loadModelTestModule('loader-rejection'));
    const profile = createGeoSpecRunProfile();
    const modelLoader = vi.fn(async () => {
      throw new Error('model loader rejected once');
    });
    const runner = createGeoSpecNodeRunner({
      filesystem,
      projectPath: '/',
      modelLoader,
      internalProfile: profile,
    });

    const result = await runner.run({ files: ['/main.geospec.ts'] });

    expect(result.success).toBe(false);
    expect(modelLoader).toHaveBeenCalledTimes(1);
    expect(profile.resourceScope).toMatchObject({
      trackedSubjects: 0,
      registeredDisposables: 0,
      disposedScopes: 1,
      disposedResources: 0,
    });
    expect(profile.aggregateModelLoadCache).toMatchObject({
      misses: 1,
      failures: 1,
    });
    await runner.close();
  });
});
