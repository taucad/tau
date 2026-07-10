// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- file-path keys (e.g. 'main.geospec.ts') aren't camelCase */
import type { ToolRuntime } from '@langchain/core/tools';
import { rpcName } from '@taucad/chat/constants';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import type { TauModelRendererOutput } from '@taucad/testing/tau';
import { runTauGeoSpecTests } from '@taucad/testing/tau';
import { discoverGeoSpecFiles } from 'geospec/runner';
import type { GeoSpecDiscoveryFileStat } from 'geospec/runner';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestModelTool } from '#api/tools/tools/tool-test-model.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';

type TestVmFileSystem = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
};

type HarnessRenderInput = {
  file: string;
  format?: string;
  parameters?: Record<string, unknown>;
};

class MemoryGeoSpecFileSystem implements TestVmFileSystem {
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

  public async readdir(path: string): Promise<readonly string[]> {
    const prefix = path.endsWith('/') ? path : `${path}/`;
    const entries = new Set<string>();
    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) {
        continue;
      }
      const relative = file.slice(prefix.length);
      const [entry] = relative.split('/');
      if (entry) {
        entries.add(entry);
      }
    }
    if (entries.size === 0 && !this.files.has(path)) {
      throw new Error(`ENOENT: ${path}`);
    }
    return [...entries].sort((left, right) => left.localeCompare(right));
  }

  public async stat(path: string): Promise<GeoSpecDiscoveryFileStat> {
    if (this.files.has(path)) {
      return { kind: 'file' };
    }
    const prefix = path.endsWith('/') ? path : `${path}/`;
    if ([...this.files.keys()].some((file) => file.startsWith(prefix))) {
      return { kind: 'directory' };
    }
    throw new Error(`ENOENT: ${path}`);
  }
}

const boxPositions = [
  0, 0, 0, 10, 20, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 10, 20, 0, 0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 0, 30, 10, 20, 30, 0,
  20, 30, 0, 0, 0, 10, 0, 0, 10, 0, 30, 0, 0, 0, 10, 0, 30, 0, 0, 30, 0, 20, 0, 10, 20, 30, 10, 20, 0, 0, 20, 0, 0, 20,
  30, 10, 20, 30, 0, 0, 0, 0, 0, 30, 0, 20, 30, 0, 0, 0, 0, 20, 30, 0, 20, 0, 10, 0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 0,
  10, 20, 30, 10, 0, 30,
];

type Vec3 = [number, number, number];

const vecSub = (left: Vec3, right: Vec3): Vec3 => [left[0] - right[0], left[1] - right[1], left[2] - right[2]];

const vecCross = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const vecLength = (value: Vec3): number => Math.hypot(value[0], value[1], value[2]);

const triangleArea = (a: Vec3, b: Vec3, c: Vec3): number => vecLength(vecCross(vecSub(b, a), vecSub(c, a))) / 2;

const boxTriangles = (primitive: string, x: number, triangleOffset: number) =>
  Array.from({ length: boxPositions.length / 9 }, (_, triangleIndex) => {
    const offset = triangleIndex * 9;
    const a: Vec3 = [boxPositions[offset]! + x, boxPositions[offset + 1]!, boxPositions[offset + 2]!];
    const b: Vec3 = [boxPositions[offset + 3]! + x, boxPositions[offset + 4]!, boxPositions[offset + 5]!];
    const c: Vec3 = [boxPositions[offset + 6]! + x, boxPositions[offset + 7]!, boxPositions[offset + 8]!];
    return {
      primitive,
      triangleIndex: triangleOffset + triangleIndex,
      a,
      b,
      c,
      center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3] as Vec3,
      area: triangleArea(a, b, c),
    };
  });

const createComponentOverlapSubject = (rightBoxX: number): TauModelRendererOutput => {
  const leftTriangles = boxTriangles('sun#0', 0, 0);
  const rightTriangles = boxTriangles('ring#0', rightBoxX, leftTriangles.length);
  const triangles = [...leftTriangles, ...rightTriangles];
  const subject = {
    kind: 'geometry-subject',
    capabilities: [
      { kind: 'mesh', feature: 'triangles' },
      { kind: 'mesh', feature: 'component-overlap' },
    ],
    provenance: {
      source: { kind: 'mesh-buffer', format: 'mesh-buffer', path: 'main.scad' },
      unit: 'mm',
      loader: 'api-headless-geospec-harness',
      parameters: { fixture: 'component-overlap' },
    },
    diagnostics: [],
    mesh: {
      format: 'mesh-buffer',
      stats: {
        vertexCount: triangles.length * 3,
        meshCount: 1,
        triangleCount: triangles.length,
        boundingBox: {
          center: [(rightBoxX + 10) / 2, 10, 15],
          size: [rightBoxX + 10, 20, 30],
          primitives: [
            { name: 'sun#0', color: '#ffcc00', vertices: 36, aabb: { min: [0, 0, 0], max: [10, 20, 30] } },
            {
              name: 'ring#0',
              color: '#224466',
              vertices: 36,
              aabb: { min: [rightBoxX, 0, 0], max: [rightBoxX + 10, 20, 30] },
            },
          ],
        },
        meshQuality: {
          triangleCount: triangles.length,
          nonFiniteVertices: [],
          degenerateTriangles: [],
          duplicateFaces: [],
          triangles,
          surfaceArea: 4400,
          signedVolume: 12_000,
          centerOfMass: [(rightBoxX + 10) / 2, 10, 15],
        },
        connectedComponents: (_toleranceMm: number) => 2,
        analyseConnectedComponents: (_toleranceMm: number) => ({ count: 2, clusters: [], gaps: [] }),
        watertight: true,
        analyseWatertight: () => ({
          watertight: true,
          irregularEdges: 0,
          openBoundaryEdges: 0,
          totalEdges: 36,
          irregularEdgeFraction: 0,
          perPrimitive: [],
        }),
      },
    },
  };

  return subject as unknown as TauModelRendererOutput;
};

const createBrepSubject = (): TauModelRendererOutput => {
  const subject = {
    kind: 'geometry-subject',
    capabilities: [
      { kind: 'mesh', feature: 'mass-properties' },
      { kind: 'brep', feature: 'planar-faces' },
      { kind: 'brep', feature: 'cylindrical-faces' },
      { kind: 'brep', feature: 'circular-holes' },
      { kind: 'brep', feature: 'chamfer-features' },
      { kind: 'brep', feature: 'wall-thickness' },
    ],
    provenance: {
      source: { kind: 'bytes', format: 'glb', path: 'main.ts' },
      unit: 'mm',
      loader: 'api-headless-geospec-harness',
      parameters: {},
    },
    diagnostics: [],
    mesh: {
      format: 'mesh-buffer',
      stats: {
        vertexCount: 8,
        meshCount: 1,
        triangleCount: 12,
        boundingBox: { center: [0, 0, 10], size: [40, 30, 20], primitives: [] },
        meshQuality: {
          triangleCount: 12,
          nonFiniteVertices: [],
          degenerateTriangles: [],
          duplicateFaces: [],
          triangles: [
            {
              primitive: 'main',
              triangleIndex: 0,
              a: [-20, -15, 0],
              b: [20, -15, 0],
              c: [20, 15, 0],
              center: [20 / 3, -5, 0],
              area: 1200,
            },
            {
              primitive: 'main',
              triangleIndex: 1,
              a: [-20, -15, 0],
              b: [20, 15, 0],
              c: [-20, 15, 0],
              center: [-20 / 3, 5, 0],
              area: 1200,
            },
          ],
          surfaceArea: 5200,
          signedVolume: 24_000,
          centerOfMass: [0, 0, 10],
        },
        connectedComponents: (_toleranceMm: number) => 1,
        analyseConnectedComponents: (_toleranceMm: number) => ({ count: 1, clusters: [], gaps: [] }),
        watertight: true,
        analyseWatertight: () => ({
          watertight: true,
          irregularEdges: 0,
          openBoundaryEdges: 0,
          totalEdges: 18,
          irregularEdgeFraction: 0,
          perPrimitive: [],
        }),
      },
    },
    brep: {
      planarFaces: [{ normal: [0, 0, 1], offset: 20, area: 6000 }],
      cylindricalFaces: [{ radius: 15, axis: 'z' }],
      circularHoles: [{ diameter: 8, through: true, axis: 'z', center: [25, 15, 0] }],
      chamferFeatures: [{ distance: 2, selection: 'outer top perimeter' }],
      minimumWallThickness: { value: 2.5, location: [0, 0, 0] },
    },
  };

  return subject as unknown as TauModelRendererOutput;
};

const createParameterizedBoundsSubject = (size: number): TauModelRendererOutput => {
  const subject = createBrepSubject();
  if (subject instanceof Uint8Array) {
    throw new TypeError('Expected an in-memory geometry subject.');
  }
  return {
    ...subject,
    provenance: {
      ...subject.provenance,
      parameters: { cubeSize: size },
    },
    mesh: {
      ...subject.mesh,
      stats: {
        ...subject.mesh.stats,
        boundingBox: {
          center: [0, 0, 0],
          size: [size, size, size],
          primitives: [],
        },
      },
    },
  };
};

const setBrepGeoSpecTest = (filesystem: MemoryGeoSpecFileSystem): void => {
  filesystem.setText(
    '/project/main.geospec.ts',
    [
      "import { describe, expectGeo, it } from 'geospec';",
      "import { loadModel } from 'geospec/model';",
      "describe('api harness brep checks', () => {",
      "  it('should validate measurement and feature evidence', async () => {",
      "    const model = await loadModel({ file: 'main.ts', format: 'step' });",
      '    expectGeo(model).toHaveSurfaceArea({ value: 5_200, tolerance: 0.001 });',
      '    expectGeo(model).toHaveVolume({ value: 24_000, tolerance: 0.001 });',
      '    expectGeo(model).toHaveMass({ value: 18.84, density: 0.000785, tolerance: 0.001 });',
      '    expectGeo(model).toHaveCenterOfMass({ point: { x: 0, y: 0, z: 10 }, tolerance: 0.001 });',
      '    expectGeo(model).toHavePlanarFace({ normal: { x: 0, y: 0, z: 1 }, offset: 20, area: { greaterThan: 5_000 }, tolerance: 0.05 });',
      "    expectGeo(model).toHaveCylindricalFace({ radius: 15, axis: 'z', tolerance: 0.05 });",
      "    expectGeo(model).toHaveCircularHole({ diameter: 8, through: true, axis: 'z', center: { x: 25, y: 15 }, tolerance: 0.05 });",
      "    expectGeo(model).toHaveChamferFeature({ distance: 2, selection: 'outer top perimeter', tolerance: 0.05 });",
      '    expectGeo(model).toHaveMinimumWallThickness({ value: { greaterThanOrEqual: 2 }, tolerance: 0.05 });',
      '  });',
      '});',
    ].join('\n'),
  );
};

const setComponentOverlapGeoSpecTest = (filesystem: MemoryGeoSpecFileSystem): void => {
  filesystem.setText(
    '/project/main.geospec.ts',
    [
      "import { describe, expectGeo, it } from 'geospec';",
      "import { loadModel } from 'geospec/model';",
      "describe('api harness assembly interference checks', () => {",
      "  it('should reject physical component interference', async () => {",
      "    const model = await loadModel({ file: 'main.scad' });",
      '    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.1 });',
      '  });',
      '});',
    ].join('\n'),
  );
};

const setParameterizedBoundsGeoSpecTest = (filesystem: MemoryGeoSpecFileSystem): void => {
  filesystem.setText(
    '/project/main.geospec.ts',
    [
      "import { describe, expectGeo, it } from 'geospec';",
      "import { loadModel } from 'geospec/model';",
      "describe('api harness parameterized bounds', () => {",
      "  it('should use model defaults when parameters are omitted', async () => {",
      "    const model = await loadModel({ file: 'main.ts' });",
      '    expectGeo(model).toHaveBoundingBox({ size: { x: 10, y: 10, z: 10 }, tolerance: 0.1 });',
      '  });',
      "  it('should use explicit parameters for alternate bounds', async () => {",
      "    const model = await loadModel({ file: 'main.ts', parameters: { cubeSize: 20 } });",
      '    expectGeo(model).toHaveBoundingBox({ size: { x: 20, y: 20, z: 20 }, tolerance: 0.1 });',
      '  });',
      '});',
    ].join('\n'),
  );
};

const createHarnessGeoSpecClient = (
  filesystem: MemoryGeoSpecFileSystem,
  renderCalls: HarnessRenderInput[] = [],
  renderer: (input: HarnessRenderInput) => Promise<TauModelRendererOutput> | TauModelRendererOutput = () =>
    createBrepSubject(),
): RpcGeoSpecClient => ({
  async runTests(args) {
    const discovery = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      files: args.files,
      include: args.include,
      exclude: args.exclude,
    });

    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: discovery.files,
      renderer: async (input) => {
        renderCalls.push(input);
        return renderer(input);
      },
      testNamePattern: args.testNamePattern,
      testTimeout: args.testTimeout ?? 2000,
    });

    return { success: true, ...result };
  },
});

const callTestModel = async (testApp: TestApp, input: Record<string, unknown> = {}) => {
  const configurable = {
    chatRpcService: testApp.headlessRpc,
    thread_id: 'chat-geospec-harness',
  };
  const runtimeLike = {
    toolCallId: 'tool-test-model-brep',
    configurable,
  };
  const testModelTool = createTestModelTool('replicad') as unknown as {
    invoke(input: Record<string, unknown>, runtime: ToolRuntime): Promise<unknown>;
  };

  return testModelTool.invoke(input, runtimeLike as unknown as ToolRuntime);
};

describe('GeoSpec headless API harness integration', () => {
  let testApp: TestApp | undefined;

  afterEach(async () => {
    await testApp?.app.close();
    testApp = undefined;
  });

  it('should run measurement and BRep GeoSpec matchers through test_model using in-process RPC', async () => {
    const filesystem = new MemoryGeoSpecFileSystem();
    setBrepGeoSpecTest(filesystem);
    const renderCalls: Array<{ file: string; format?: string }> = [];
    testApp = await createTestApp({ geospecStub: createHarnessGeoSpecClient(filesystem, renderCalls) });

    const result = (await callTestModel(testApp)) as {
      success?: boolean;
      failures: unknown[];
      passes: Array<{ id: string; requirement: string; targetFile: string }>;
      passed: number;
      total: number;
    };

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(result.passes).toEqual([
      {
        id: 'main.geospec.ts:api harness brep checks > should validate measurement and feature evidence',
        requirement: 'api harness brep checks > should validate measurement and feature evidence',
        targetFile: 'main.geospec.ts',
      },
    ]);
    expect(renderCalls).toEqual([expect.objectContaining({ file: 'main.ts', format: 'step' })]);

    const rpcResult = await testApp.headlessRpc.sendRpcRequest({
      chatId: 'chat-geospec-harness',
      toolCallId: 'rpc-direct-brep',
      rpcName: rpcName.runGeoSpecTests,
      args: { include: ['**/*.geospec.ts'] },
    });

    expect(rpcResult).toEqual(
      expect.objectContaining({
        success: true,
        passed: 1,
        total: 1,
      }),
    );
  });

  it('should forward default and explicit parameters through the test_model bridge', async () => {
    const filesystem = new MemoryGeoSpecFileSystem();
    setParameterizedBoundsGeoSpecTest(filesystem);
    const renderCalls: HarnessRenderInput[] = [];
    testApp = await createTestApp({
      geospecStub: createHarnessGeoSpecClient(filesystem, renderCalls, (input) =>
        createParameterizedBoundsSubject(
          typeof input.parameters?.['cubeSize'] === 'number' ? input.parameters['cubeSize'] : 10,
        ),
      ),
    });

    const result = (await callTestModel(testApp)) as {
      failures: unknown[];
      passes: Array<{ requirement: string; targetFile: string }>;
      passed: number;
      total: number;
    };

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(2);
    expect(result.total).toBe(2);
    expect(result.passes.map((pass) => pass.targetFile)).toEqual(['main.geospec.ts', 'main.geospec.ts']);
    expect(renderCalls).toEqual([
      { file: 'main.ts', format: 'glb' },
      { file: 'main.ts', format: 'glb', parameters: { cubeSize: 20 } },
    ]);
  });

  it('should run component-overlap GeoSpec matchers through test_model using in-process RPC', async () => {
    const filesystem = new MemoryGeoSpecFileSystem();
    setComponentOverlapGeoSpecTest(filesystem);
    testApp = await createTestApp({
      geospecStub: createHarnessGeoSpecClient(filesystem, [], () => createComponentOverlapSubject(15)),
    });

    const result = (await callTestModel(testApp)) as {
      failures: unknown[];
      passes: Array<{ id: string; requirement: string; targetFile: string }>;
      passed: number;
      total: number;
    };

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(result.passes).toEqual([
      expect.objectContaining({
        requirement: 'api harness assembly interference checks > should reject physical component interference',
        targetFile: 'main.geospec.ts',
      }),
    ]);
  });

  it('should preserve component-overlap diagnostics through the compact test_model result', async () => {
    const filesystem = new MemoryGeoSpecFileSystem();
    setComponentOverlapGeoSpecTest(filesystem);
    testApp = await createTestApp({
      geospecStub: createHarnessGeoSpecClient(filesystem, [], () => createComponentOverlapSubject(9)),
    });

    const result = (await callTestModel(testApp)) as {
      failures: Array<{
        reason: string;
        suggestion: string;
        targetFile: string;
        diagnostics?: Array<{ code: string; spatial?: unknown; details?: unknown }>;
      }>;
      passes: unknown[];
      passed: number;
      total: number;
    };

    expect(result.passes).toEqual([]);
    expect(result.passed).toBe(0);
    expect(result.total).toBe(1);
    const failure = result.failures[0];
    expect(failure).toBeDefined();
    if (!failure) {
      throw new Error('Expected one component-overlap failure');
    }
    expect(failure.targetFile).toBe('main.geospec.ts');
    expect(failure.reason).toContain('Unclassified component interference detected between 1 component pair');
    expect(failure.suggestion).toContain('Fix the assembly');
    const diagnostic = failure.diagnostics?.[0];
    expect(diagnostic).toBeDefined();
    if (!diagnostic) {
      throw new Error('Expected component-overlap diagnostic');
    }
    expect(diagnostic.code).toBe('GEOSPEC_COMPONENT_INTERFERENCE_DETECTED');
    const spatial = diagnostic.spatial as { center?: unknown };
    expect(spatial.center).toEqual([9.5, 10, 15]);
    const details = diagnostic.details as {
      overlaps?: Array<{
        leftLabel: string;
        rightLabel: string;
        leftColor: string;
        rightColor: string;
        intersectionVolume: number;
        penetration: string;
      }>;
    };
    const overlap = details.overlaps?.[0];
    // Color evidence (leftColor/rightColor) is optional and geospec only
    // populates it for GLB-backed subjects (buildRecordFromGltf); the triangle-
    // soup path this synthetic mesh-buffer fixture exercises does not carry per-
    // primitive color. Tracked separately — see the spawned color-propagation task.
    expect(overlap).toMatchObject({
      leftLabel: 'sun#0',
      rightLabel: 'ring#0',
      penetration: 'positive-volume',
    });
    expect(overlap?.intersectionVolume).toBeCloseTo(600, 2);
  });

  it('should pass test_model filters through the API harness into the in-process GeoSpec runner', async () => {
    const filesystem = new MemoryGeoSpecFileSystem();
    setBrepGeoSpecTest(filesystem);
    testApp = await createTestApp({ geospecStub: createHarnessGeoSpecClient(filesystem) });

    const result = (await callTestModel(testApp, {
      files: ['main.geospec.ts'],
      testNamePattern: 'feature evidence',
      testTimeout: 10_000,
    })) as {
      failures: unknown[];
      passes: Array<{ requirement: string; targetFile: string }>;
      passed: number;
      total: number;
    };

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(result.passes[0]).toEqual(
      expect.objectContaining({
        requirement: 'api harness brep checks > should validate measurement and feature evidence',
        targetFile: 'main.geospec.ts',
      }),
    );
  });

  it('should exclude GeoSpec files through the API harness filter', async () => {
    const filesystem = new MemoryGeoSpecFileSystem();
    setBrepGeoSpecTest(filesystem);
    filesystem.setText(
      '/project/secondary.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('secondary checks', () => {",
        "  it('should not run when the file filter excludes it', async () => {",
        "    const model = await loadModel({ file: 'main.ts', format: 'step' });",
        '    expectGeo(model).toHaveVolume({ value: -1, tolerance: 0 });',
        '  });',
        '});',
      ].join('\n'),
    );
    testApp = await createTestApp({ geospecStub: createHarnessGeoSpecClient(filesystem) });

    const result = (await callTestModel(testApp, {
      include: ['**/*.geospec.ts'],
      exclude: ['secondary.geospec.ts'],
    })) as {
      failures: unknown[];
      passes: Array<{ requirement: string; targetFile: string }>;
      passed: number;
      total: number;
    };

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(result.passes.map((pass) => pass.targetFile)).toEqual(['main.geospec.ts']);
  });

  it('should report zero selected tests as a test_model failure', async () => {
    const filesystem = new MemoryGeoSpecFileSystem();
    setBrepGeoSpecTest(filesystem);
    testApp = await createTestApp({ geospecStub: createHarnessGeoSpecClient(filesystem) });

    const result = (await callTestModel(testApp, {
      files: ['main.geospec.ts'],
      testNamePattern: 'does not exist',
    })) as {
      failures: Array<{ id: string; requirement: string; targetFile: string }>;
      passes: unknown[];
      passed: number;
      total: number;
    };

    expect(result.passes).toEqual([]);
    expect(result.passed).toBe(0);
    expect(result.total).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({
        id: 'NO_MATCHING_GEOSPEC_TESTS',
        requirement: 'At least one selected GeoSpec test must run',
        targetFile: 'main.geospec.ts',
      }),
    ]);
  });
});
