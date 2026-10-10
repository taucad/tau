import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRegistry } from '@taucad/agent-host';
import type { RuntimeDocument } from '@taucad/runtime/client';
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
        processRequest: vi.fn(() => new Uint8Array()),
        ingestSubject: vi.fn(() => new Uint8Array()),
        subjectHandle: vi.fn(() => new Uint8Array()),
        releaseSubject: vi.fn(() => new Uint8Array()),
      };
    }),
    runner: vi.fn<(options: GeoSpecNativeRunnerOptions) => GeoSpecRunner>(),
    filesystem: vi.fn(),
  };
});

vi.mock('@taucad/geospec-engine-native/node', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the public module's constructor export.
  Engine: native.engine,
}));
vi.mock('geospec/runner/native', () => ({ createNativeGeoSpecRunner: native.runner }));
vi.mock('@taucad/geospec-engine/node-filesystem', () => ({ createNodeVmFileSystem: native.filesystem }));
vi.mock('@taucad/geospec-engine/register/node', () => {
  throw new Error('The native host factory must not register the legacy engine.');
});

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
    expect(native.engine).toHaveBeenCalledExactlyOnceWith({
      root: join(homedir() || tmpdir(), '.cache', 'geospec', 'evidence'),
      projectRoot: await realpath(root),
    });
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
      expect(native.engine.mock.calls[1]).toEqual([]);
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
  });
});
