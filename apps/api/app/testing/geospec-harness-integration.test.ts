// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- file-path keys (e.g. 'main.geospec.ts') aren't camelCase */
import { resolve } from 'node:path';
import type { ToolRuntime } from '@langchain/core/tools';
import { rpcName } from '@taucad/chat/constants';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { discoverGeoSpecFiles } from 'geospec/runner';
import type { GeoSpecDiscoveryFileStat } from 'geospec/runner';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestModelTool } from '#api/tools/tools/tool-test-model.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { runTauGeoSpecTests } from '#testing/tau-geospec-harness.js';
import type { TauModelRendererOutput } from '#testing/tau-geospec-harness.js';

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

const createComponentOverlapSource = async (rightBoxX: number): Promise<TauModelRendererOutput> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene('assembly');
  for (const [name, translation] of [
    ['left', 0],
    ['right', rightBoxX],
  ] as const) {
    const positions = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setBuffer(buffer)
      .setArray(new Float32Array(boxPositions));
    const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions);
    const mesh = document.createMesh(name).addPrimitive(primitive);
    scene.addChild(document.createNode(name).setTranslation([translation, 0, 0]).setMesh(mesh));
  }
  return { format: 'glb', source: await new WebIO().writeBinary(document), sourceUnit: 'mm', name: 'assembly' };
};

const brepFixture = resolve(
  import.meta.dirname,
  '../../../../packages/geospec-engine/fixtures/contact/valve-seat-cone-positive/model.step',
);

const createBrepSource = (): TauModelRendererOutput => ({
  source: brepFixture,
  format: 'step',
  name: 'valve-seat-cone-positive',
});

const createParameterizedBoundsSource = (size: number): TauModelRendererOutput => ({
  format: 'mesh-buffer',
  source: {
    format: 'mesh-buffer',
    positions: boxPositions.map((coordinate, index) => {
      const divisor = [10, 20, 30][index % 3]!;
      return (coordinate / divisor) * size;
    }),
    name: 'parameterized-box',
  },
});

const setBrepGeoSpecTest = (filesystem: MemoryGeoSpecFileSystem): void => {
  filesystem.setText(
    '/project/main.geospec.ts',
    [
      "import { describe, expectGeo, it } from 'geospec';",
      "import { loadModel } from 'geospec/model';",
      "describe('api harness brep checks', () => {",
      "  it('should validate measurement and feature evidence', async () => {",
      "    const model = await loadModel({ file: 'main.ts', format: 'step' });",
      '    expectGeo(model).toHaveSurfaceArea({ value: 3340.020268781724, tolerance: 0.001 });',
      '    expectGeo(model).toHaveVolume({ value: 6006.725153663717, tolerance: 0.001 });',
      '    expectGeo(model).toHaveMass({ value: 4.715279245626018, density: 0.000785, tolerance: 0.001 });',
      '    expectGeo(model).toHaveCenterOfMass({ point: { x: 0, y: 0, z: 5.003138075313799 }, tolerance: 0.001 });',
      '    expectGeo(model).toHavePlanarFace({ normal: { x: 0, y: 0, z: 1 }, offset: 6, area: { greaterThan: 270 }, tolerance: 0.05 });',
      "    expectGeo(model).toHaveCylindricalFace({ radius: 16, axis: 'z', tolerance: 0.05 });",
      "    expectGeo(model).toHaveCircularHole({ diameter: 20, through: false, axis: 'z', center: { x: 0, y: 0 }, tolerance: 0.05 });",
      "    expectGeo(model).toHaveChamferFeature({ distance: 3, selection: 'revolved chamfer (axis z)', tolerance: 0.05 });",
      '    expectGeo(model).toHaveMinimumWallThickness({ value: { greaterThanOrEqual: 3 }, tolerance: 0.05 });',
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
    createBrepSource(),
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
        createParameterizedBoundsSource(
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
      geospecStub: createHarnessGeoSpecClient(filesystem, [], async () => createComponentOverlapSource(15)),
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
      geospecStub: createHarnessGeoSpecClient(filesystem, [], async () => createComponentOverlapSource(9)),
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
    expect(overlap).toMatchObject({
      leftLabel: 'left#0',
      rightLabel: 'right#0',
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
