// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- file-path keys (e.g. 'main.geospec.ts') aren't camelCase */
import type { ToolRuntime } from '@langchain/core/tools';
import { rpcName } from '@taucad/chat/constants';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import type { TauModelRendererOutput } from '@taucad/testing/tau';
import { runTauGeoSpecTests } from '@taucad/testing/tau';
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
}

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

const createHarnessGeoSpecClient = (
  filesystem: MemoryGeoSpecFileSystem,
  renderCalls: Array<{ file: string; format?: string }> = [],
): RpcGeoSpecClient => ({
  async runTests(args) {
    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: ['main.geospec.ts'],
      renderer: async (input) => {
        renderCalls.push(input);
        return createBrepSubject();
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
      args: { pattern: '**/*.geospec.{ts,js}' },
    });

    expect(rpcResult).toEqual(
      expect.objectContaining({
        success: true,
        passed: 1,
        total: 1,
      }),
    );
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
});
