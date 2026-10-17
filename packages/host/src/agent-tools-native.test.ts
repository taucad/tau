import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRegistry } from '@taucad/agent-host';
import type { RuntimeDocument, UpdateOutcome, ViewUpdateOutcome } from '@taucad/runtime/client';
import type { SourceRevision } from '@taucad/runtime/types';
import type { GeoSpecNativeRunnerOptions } from 'geospec/runner/native';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import type { GeoSpecRuntimeClient } from 'geospec/model';
import type { HostRuntimeClient } from '#agent-tools.js';

const native = vi.hoisted(() => {
  const close = vi.fn();
  return {
    close,
    engine: vi.fn(function () {
      return {
        close: vi.fn(() => {
          close();
        }),
        evaluateClaim: vi.fn(() => ({
          canonicalClaim: new Uint8Array(),
          canonicalPlan: new Uint8Array(),
          canonicalResult: new Uint8Array(),
        })),
        processRequest: vi.fn((_request: Uint8Array<ArrayBuffer>) => new Uint8Array()),
        ingestSubject: vi.fn(() => new Uint8Array()),
        subjectHandle: vi.fn(() => new Uint8Array()),
        releaseSubject: vi.fn(() => new Uint8Array()),
      };
    }),
    runner: vi.fn<(options: GeoSpecNativeRunnerOptions) => GeoSpecRunner>(),
    filesystem: vi.fn(),
  };
});

vi.mock('geospec-engine/node', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the public module's constructor export.
  Engine: native.engine,
}));
vi.mock('geospec/runner/native', () => ({ createNativeGeoSpecRunner: native.runner }));
vi.mock('@taucad/geospec-engine/node-filesystem', () => ({ createNodeVmFileSystem: native.filesystem }));

/**
 * Load the host module afresh, so each test starts before the process-wide engine exists.
 * @returns The native runner factory of a new module instance.
 */
const freshFactory = async () => {
  vi.resetModules();
  const { createHostGeoSpecRunner } = await import('#agent-tools.js');
  return createHostGeoSpecRunner;
};

describe('native host GeoSpec composition', () => {
  const temporaryRoots: string[] = [];
  const project = async (name: string): Promise<string> => {
    const base = await mkdtemp(join(tmpdir(), 'tau-native-session-'));
    temporaryRoots.push(base);
    const root = join(base, name);
    await mkdir(root);
    return root;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  it('should borrow the project runtime and keep the shared engine open after the SDK runner', async () => {
    const createHostGeoSpecRunner = await freshFactory();
    const runtime = mock<GeoSpecRuntimeClient>();
    const bytes = new Uint8Array([1, 2, 3]);
    const read = vi.fn();
    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    function readFile(path: string, encoding: 'utf8'): Promise<string>;
    async function readFile(path: string, encoding?: 'utf8'): Promise<Uint8Array<ArrayBuffer> | string> {
      read(path);
      return encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
    }
    const filesystem = mock<GeoSpecNativeRunnerOptions['filesystem']>({ readFile });
    const sdkRunner = mock<GeoSpecRunner>();
    const result = { success: true, passed: 1, failed: 0, selectedTests: 1, files: [], issues: [] };
    sdkRunner.run.mockResolvedValue(result);
    sdkRunner.close.mockImplementation(async () => {
      expect(native.close).not.toHaveBeenCalled();
    });
    native.filesystem.mockReturnValue(filesystem);
    native.runner.mockReturnValue(sdkRunner);

    const root = await project('widget');
    const runner = await createHostGeoSpecRunner(root, runtime);
    expect(native.engine).toHaveBeenCalledExactlyOnceWith(
      {
        root: join(homedir() || tmpdir(), '.cache', 'geospec', 'evidence'),
        projectRoot: await realpath(root),
      },
      undefined,
      { maxMeshBytes: 1024 * 1024 * 1024 },
    );
    expect(native.filesystem).toHaveBeenCalledExactlyOnceWith(root);
    const options = native.runner.mock.calls[0]?.[0];
    expect(options?.filesystem).toBe(filesystem);
    const trackedRuntime = options?.model?.runtime;
    if (trackedRuntime === undefined || typeof trackedRuntime === 'function') {
      throw new Error('Expected the borrowed project runtime.');
    }
    const sourceRevision: SourceRevision = { entry: 'widget.ts', files: { 'widget.ts': 'missing' } };
    const document = mock<RuntimeDocument>();
    document.export.mockResolvedValue({
      success: true,
      exportId: 'glb',
      evaluationId: 'evaluation',
      files: [{ name: 'widget.glb', mimeType: 'model/gltf-binary', bytes: new Uint8Array([1]) }],
      issues: [],
      sourceRevision,
    });
    runtime.open.mockReturnValue(document);
    const trackedDocument = trackedRuntime.open({ source: { path: 'widget.ts' } });
    const exported = await trackedDocument.export('glb');
    expect(exported.sourceRevision).toEqual(sourceRevision);
    expect(runtime.open).toHaveBeenCalledExactlyOnceWith({ source: { path: 'widget.ts' } });
    expect(document.export).toHaveBeenCalledExactlyOnceWith('glb');
    trackedDocument.close();
    expect(document.close).toHaveBeenCalledOnce();
    expect(trackedRuntime).toBe(runtime);
    expect(runner).not.toHaveProperty('sourceRevisions');
    expect(options?.model?.projectPath).toBe(root);
    // The product reads verdicts and localized failures, not complete success witnesses.
    expect(options?.nativeAssertions.evidenceProfile).toBe('bounded');
    expect(options?.model?.carried).toBeInstanceOf(Map);
    await expect(options?.model?.readSource?.('widget.step')).resolves.toBe(bytes);
    expect(read).toHaveBeenCalledExactlyOnceWith('widget.step');

    const runOptions = { files: ['widget.geospec.ts'] };
    await expect(runner.run(runOptions)).resolves.toBe(result);
    expect(sdkRunner.run).toHaveBeenCalledExactlyOnceWith(runOptions);
    await runner.close();
    expect(sdkRunner.close).toHaveBeenCalledOnce();
    expect(native.close).not.toHaveBeenCalled();
    expect(runtime.terminate).not.toHaveBeenCalled();
  }, 15_000);

  it('should run calls one at a time on one engine and carrier', async () => {
    const createHostGeoSpecRunner = await freshFactory();
    native.filesystem.mockReturnValue(mock<GeoSpecNativeRunnerOptions['filesystem']>());
    native.runner.mockImplementation(() => mock<GeoSpecRunner>());
    const runtime = mock<GeoSpecRuntimeClient>();

    const root = await project('widget');
    const first = await createHostGeoSpecRunner(root, runtime);
    const pending = createHostGeoSpecRunner(root, runtime);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    // The second call builds no runner until the first call's runner closes.
    expect(native.runner).toHaveBeenCalledOnce();

    await first.close();
    const second = await pending;
    expect(native.runner).toHaveBeenCalledTimes(2);
    await second.close();
    const [firstOptions, secondOptions] = native.runner.mock.calls.map(([options]) => options);
    expect(native.engine).toHaveBeenCalledOnce();
    expect(secondOptions?.nativeAssertions.engine).toBe(firstOptions?.nativeAssertions.engine);
    expect(secondOptions?.model?.carried).toBe(firstOptions?.model?.carried);
    expect(native.close).not.toHaveBeenCalled();
  });

  it('should retire the prior root only after its runner closes across A to B to A', async () => {
    const createHostGeoSpecRunner = await freshFactory();
    native.filesystem.mockReturnValue(mock<GeoSpecNativeRunnerOptions['filesystem']>());
    native.runner.mockImplementation(() => mock<GeoSpecRunner>());
    const runtime = mock<GeoSpecRuntimeClient>();
    const rootA = await project('a');
    const rootB = await project('b');

    const first = await createHostGeoSpecRunner(rootA, runtime);
    const pendingB = createHostGeoSpecRunner(rootB, runtime);
    expect(native.engine).toHaveBeenCalledOnce();
    expect(native.close).not.toHaveBeenCalled();
    await first.close();
    const second = await pendingB;
    expect(native.engine).toHaveBeenCalledTimes(2);
    expect(native.engine.mock.results[0]?.value.close).toHaveBeenCalledOnce();
    expect(native.engine.mock.results[1]?.value.close).not.toHaveBeenCalled();
    expect(native.runner.mock.calls[1]?.[0]?.model?.carried).not.toBe(native.runner.mock.calls[0]?.[0]?.model?.carried);

    await second.close();
    const third = await createHostGeoSpecRunner(rootA, runtime);
    expect(native.engine).toHaveBeenCalledTimes(3);
    expect(native.engine.mock.results[1]?.value.close).toHaveBeenCalledOnce();
    await third.close();
    expect(native.engine.mock.results[2]?.value.close).not.toHaveBeenCalled();
  });

  it('should reuse one session for symlink aliases of the same root', async () => {
    const createHostGeoSpecRunner = await freshFactory();
    native.filesystem.mockReturnValue(mock<GeoSpecNativeRunnerOptions['filesystem']>());
    native.runner.mockImplementation(() => mock<GeoSpecRunner>());
    const runtime = mock<GeoSpecRuntimeClient>();
    const root = await project('project');
    const alias = join(root, '..', 'alias');
    await symlink(root, alias);

    const first = await createHostGeoSpecRunner(root, runtime);
    await first.close();
    const second = await createHostGeoSpecRunner(alias, runtime);
    expect(native.engine).toHaveBeenCalledOnce();
    expect(native.runner.mock.calls[1]?.[0]?.model?.carried).toBe(native.runner.mock.calls[0]?.[0]?.model?.carried);
    await second.close();
  });

  it('should fall back to a resident engine when optional cache setup fails', async () => {
    const createHostGeoSpecRunner = await freshFactory();
    native.filesystem.mockReturnValue(mock<GeoSpecNativeRunnerOptions['filesystem']>());
    native.runner.mockReturnValue(mock<GeoSpecRunner>());
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = await project('cache-unavailable');
    native.engine.mockImplementationOnce(function () {
      throw new Error('Permission denied (os error 13)');
    });
    try {
      const runner = await createHostGeoSpecRunner(root, mock<GeoSpecRuntimeClient>());
      expect(native.engine).toHaveBeenCalledTimes(2);
      expect(native.engine.mock.calls[1]).toEqual([undefined, undefined, { maxMeshBytes: 1024 * 1024 * 1024 }]);
      expect(warning).toHaveBeenCalledOnce();
      expect(warning.mock.calls[0]?.[0]).toContain('using a resident engine');
      await runner.close();
    } finally {
      warning.mockRestore();
    }
  });

  it('should propagate a native construction error when the resident engine also fails', async () => {
    const createHostGeoSpecRunner = await freshFactory();
    const root = await project('engine-error');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    native.engine.mockImplementationOnce(function () {
      throw new Error('cache constructor failed');
    });
    native.engine.mockImplementationOnce(function () {
      throw new Error('native engine configuration failed');
    });
    try {
      await expect(createHostGeoSpecRunner(root, mock<GeoSpecRuntimeClient>())).rejects.toThrow(
        'native engine configuration failed',
      );
      expect(native.engine).toHaveBeenCalledTimes(2);
    } finally {
      warning.mockRestore();
    }
  });

  describe('registry default runner', () => {
    const freshRegistry = async () => {
      vi.resetModules();
      const { createHostToolRegistry } = await import('#agent-tools.js');
      return createHostToolRegistry;
    };
    const testModel = async (registry: ToolRegistry) =>
      registry.invoke({
        toolCallId: 'test-model',
        toolName: 'test_model',
        input: {},
        signal: new AbortController().signal,
      });

    it('should offer test_model over the attached runtime and borrow exactly that client', async () => {
      const createHostToolRegistry = await freshRegistry();
      const workspaceRoot = await project('default-runner');
      await writeFile(join(workspaceRoot, 'cube.geospec.ts'), 'export const spec = 1;\n', 'utf8');
      const client = mock<HostRuntimeClient>();
      const runtimeClient = vi.fn(async () => client);
      const sdkRunner = mock<GeoSpecRunner>();
      sdkRunner.run.mockResolvedValue({ success: true, passed: 0, failed: 0, selectedTests: 0, files: [], issues: [] });
      native.filesystem.mockReturnValue(mock<GeoSpecNativeRunnerOptions['filesystem']>());
      native.runner.mockReturnValue(sdkRunner);
      const registry = createHostToolRegistry({ workspaceRoot, runtimeClient });

      expect(registry.list().map((tool) => tool.name)).toContain('test_model');
      expect(runtimeClient).not.toHaveBeenCalled();
      const result = await testModel(registry);

      expect(result.isError).toBe(false);
      expect(runtimeClient).toHaveBeenCalledWith(workspaceRoot);
      expect(native.runner).toHaveBeenCalledOnce();
      expect(native.runner.mock.calls[0]?.[0].model?.runtime).toBe(client);
      expect(sdkRunner.run).toHaveBeenCalledExactlyOnceWith({ files: ['cube.geospec.ts'] });
      expect(sdkRunner.close).toHaveBeenCalledOnce();
    });

    it('should not offer test_model without an attached runtime', async () => {
      const createHostToolRegistry = await freshRegistry();
      const registry = createHostToolRegistry({ workspaceRoot: await project('no-runtime') });
      expect(registry.list().map((tool) => tool.name)).not.toContain('test_model');
    });

    it('should run an explicit geospecRunner instead of the default', async () => {
      const createHostToolRegistry = await freshRegistry();
      const workspaceRoot = await project('explicit-runner');
      const runner = mock<GeoSpecRunner>();
      runner.run.mockResolvedValue({ success: true, passed: 0, failed: 0, selectedTests: 0, files: [], issues: [] });
      const geospecRunner = vi.fn(async () => runner);
      const registry = createHostToolRegistry({
        workspaceRoot,
        runtimeClient: async () => mock<HostRuntimeClient>(),
        geospecRunner,
      });

      await testModel(registry);

      expect(geospecRunner).toHaveBeenCalledExactlyOnceWith(workspaceRoot);
      expect(runner.close).toHaveBeenCalledOnce();
      expect(native.runner).not.toHaveBeenCalled();
      expect(native.engine).not.toHaveBeenCalled();
    });

    it('should withhold test_model when geospecRunner is false', async () => {
      const createHostToolRegistry = await freshRegistry();
      const registry = createHostToolRegistry({
        workspaceRoot: await project('withheld'),
        runtimeClient: async () => mock<HostRuntimeClient>(),
        geospecRunner: false,
      });
      expect(registry.list().map((tool) => tool.name)).not.toContain('test_model');
    });

    describe('evaluate_model admission limits', () => {
      const limits = { maxTriangles: 3_999_999, maxVertices: 1_999_999, maxSubjectBytes: 65_536 };
      const configuration = (binaryAdmissionLimits: unknown): Uint8Array<ArrayBuffer> =>
        new TextEncoder().encode(
          JSON.stringify({ requestId: 'configuration', result: { configuration: { binaryAdmissionLimits } } }),
        );
      /** An engine that answers every request with `response`, built as the default mock builds one. */
      const engineAnswering = (response: Uint8Array<ArrayBuffer>, close?: Mock<() => void>) => {
        const processRequest = vi.fn((_request: Uint8Array<ArrayBuffer>) => response);
        const base = native.engine.getMockImplementation();
        native.engine.mockImplementationOnce(function () {
          return { ...base!(), processRequest, ...(close === undefined ? {} : { close }) };
        });
        return processRequest;
      };
      /** A runtime whose default view draws one triangle, so a whole-model load is 72 bytes. */
      const oneTriangleRuntime = (): HostRuntimeClient => {
        const text = JSON.stringify({
          nodes: [{ mesh: 0 }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics are uppercase by specification.
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          accessors: [{ componentType: 5126, type: 'VEC3', count: 3, min: [0, 0, 0], max: [0.01, 0.01, 0.01] }],
        });
        const json = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
        const content = new Uint8Array(20 + json.byteLength);
        const header = new DataView(content.buffer);
        header.setUint32(0, 0x46_54_6c_67, true);
        header.setUint32(4, 2, true);
        header.setUint32(8, content.byteLength, true);
        header.setUint32(12, json.byteLength, true);
        header.setUint32(16, 0x4e_4f_53_4a, true);
        content.set(json, 20);
        const evaluated: UpdateOutcome = {
          superseded: false,
          evaluation: {
            id: 'evaluation',
            success: true,
            transient: false,
            views: [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }],
            exports: [],
            issues: [],
          },
        };
        const rendered: ViewUpdateOutcome = {
          superseded: false,
          rendering: {
            success: true,
            requestId: 'rendering',
            evaluationId: 'evaluation',
            transient: false,
            view: 'model',
            artifact: { mimeType: 'model/gltf-binary', content },
            hash: 'geometry',
            issues: [],
          },
        };
        const view = { rendering: vi.fn(async () => rendered), close: vi.fn() };
        const client = mock<HostRuntimeClient>();
        client.open.mockReturnValue({
          evaluation: vi.fn(async () => evaluated),
          export: vi.fn(),
          close: vi.fn(),
          view: vi.fn(() => view),
        });
        return client;
      };
      const evaluate = async (registry: ToolRegistry) =>
        registry.invoke({
          toolCallId: 'evaluate-model',
          toolName: 'evaluate_model',
          input: { targetFile: 'main.ts' },
          signal: new AbortController().signal,
        });

      it('should read them once from an engine built like the test_model engine, closed at once', async () => {
        const createHostToolRegistry = await freshRegistry();
        const processRequest = engineAnswering(configuration({ ...limits, maxResourceBytes: 1 }));
        const client = oneTriangleRuntime();
        const registry = createHostToolRegistry({
          workspaceRoot: await project('admission'),
          runtimeClient: async () => client,
        });

        const first = await evaluate(registry);
        const second = await evaluate(registry);

        const admission = {
          triangles: { estimated: 1, limit: limits.maxTriangles },
          vertices: { estimated: 3, limit: limits.maxVertices },
          subjectBytes: { estimated: 72, limit: limits.maxSubjectBytes },
        };
        expect(first.isError).toBe(false);
        expect(first.content).toHaveProperty('summary.admission', admission);
        expect(second.content).toHaveProperty('summary.admission', admission);
        expect(native.engine).toHaveBeenCalledExactlyOnceWith(undefined, undefined, {
          maxMeshBytes: 1024 * 1024 * 1024,
        });
        expect(native.close).toHaveBeenCalledOnce();
        expect(processRequest).toHaveBeenCalledOnce();
        expect(JSON.parse(new TextDecoder().decode(processRequest.mock.calls[0]?.[0]))).toEqual({
          canonicalProfile: 'geospec-jcs-v1',
          method: 'initialize',
          protocolVersion: 3,
          registryVersion: 5,
          requestId: 'configuration',
        });
      });

      it('should evaluate without admission, warning once, when the engine does not report its limits', async () => {
        const createHostToolRegistry = await freshRegistry();
        engineAnswering(configuration({ maxTriangles: 4_000_000 }));
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const client = oneTriangleRuntime();
        const registry = createHostToolRegistry({
          workspaceRoot: await project('admission-unknown'),
          runtimeClient: async () => client,
        });
        try {
          const first = await evaluate(registry);
          await evaluate(registry);

          expect(first.isError).toBe(false);
          expect(first.content).toMatchObject({ status: 'ready', summary: { componentCount: 1, triangles: 1 } });
          expect(first.content).not.toHaveProperty('summary.admission');
          expect(native.engine).toHaveBeenCalledOnce();
          expect(native.close).toHaveBeenCalledOnce();
          expect(warning).toHaveBeenCalledOnce();
          expect(warning.mock.calls[0]?.[0]).toContain('GeoSpec admission limits unavailable');
        } finally {
          warning.mockRestore();
        }
      });

      it('should keep the limits it read, warning once, when that engine fails to close', async () => {
        const createHostToolRegistry = await freshRegistry();
        const close = vi.fn<() => void>(() => {
          throw new Error('engine already closed');
        });
        engineAnswering(configuration(limits), close);
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const client = oneTriangleRuntime();
        const registry = createHostToolRegistry({
          workspaceRoot: await project('admission-close'),
          runtimeClient: async () => client,
        });
        try {
          const result = await evaluate(registry);

          expect(result.content).toHaveProperty('summary.admission.subjectBytes', {
            estimated: 72,
            limit: limits.maxSubjectBytes,
          });
          expect(close).toHaveBeenCalledOnce();
          expect(warning).toHaveBeenCalledOnce();
          expect(warning.mock.calls[0]?.[0]).toContain('GeoSpec admission probe engine failed to close');
        } finally {
          warning.mockRestore();
        }
      });

      it('should build no engine for them when test_model runs another runner', async () => {
        const createHostToolRegistry = await freshRegistry();
        const client = oneTriangleRuntime();
        const registry = createHostToolRegistry({
          workspaceRoot: await project('admission-explicit'),
          runtimeClient: async () => client,
          geospecRunner: async () => mock<GeoSpecRunner>(),
        });

        const result = await evaluate(registry);

        expect(result.content).toMatchObject({ status: 'ready', summary: { componentCount: 1, triangles: 1 } });
        expect(result.content).not.toHaveProperty('summary.admission');
        expect(native.engine).not.toHaveBeenCalled();
      });
    });
  });
});
