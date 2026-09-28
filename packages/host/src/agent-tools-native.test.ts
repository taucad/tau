import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { SourceRevision } from '@taucad/runtime/types';
import type { GeoSpecNativeRunnerOptions } from 'geospec/runner/native';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import type { HostGeoSpecRuntimeClient } from '#agent-tools.js';

const native = vi.hoisted(() => {
  const close = vi.fn();
  return {
    close,
    engine: vi.fn(function () {
      return { close };
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
  const { createHostNativeGeoSpecRunner } = await import('#agent-tools.js');
  return createHostNativeGeoSpecRunner;
};

describe('native host GeoSpec composition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should borrow the project runtime and keep the shared engine open after the SDK runner', async () => {
    const createHostNativeGeoSpecRunner = await freshFactory();
    const runtime = mock<HostGeoSpecRuntimeClient>();
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

    const runner = await createHostNativeGeoSpecRunner('/projects/widget', runtime);
    expect(native.engine).toHaveBeenCalledExactlyOnceWith();
    expect(native.filesystem).toHaveBeenCalledExactlyOnceWith('/projects/widget');
    const options = native.runner.mock.calls[0]?.[0];
    expect(options?.filesystem).toBe(filesystem);
    const trackedRuntime = options?.model?.runtime;
    if (trackedRuntime === undefined || typeof trackedRuntime === 'function') {
      throw new Error('Expected the borrowed project runtime.');
    }
    const sourceRevision: SourceRevision = { entry: 'widget.ts', files: { 'widget.ts': 'missing' } };
    runtime.export.mockResolvedValue({ success: true, data: [], issues: [], sourceRevision });
    const exported = await trackedRuntime.export('glb', { source: { path: 'widget.ts' } });
    expect(exported.sourceRevision).toEqual(sourceRevision);
    expect(runtime.export).toHaveBeenCalledExactlyOnceWith('glb', { source: { path: 'widget.ts' } });
    expect(runner.sourceRevisions?.()).toEqual([sourceRevision]);
    expect(options?.model?.projectPath).toBe('/projects/widget');
    // The product reads verdicts and localized failures, not complete success witnesses.
    expect(options?.nativeAssertions).toEqual({ engine: { close: native.close }, evidenceProfile: 'bounded' });
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
  });

  it('should run calls one at a time on one engine and carrier', async () => {
    const createHostNativeGeoSpecRunner = await freshFactory();
    native.filesystem.mockReturnValue(mock<GeoSpecNativeRunnerOptions['filesystem']>());
    native.runner.mockImplementation(() => mock<GeoSpecRunner>());
    const runtime = mock<HostGeoSpecRuntimeClient>();

    const first = await createHostNativeGeoSpecRunner('/projects/widget', runtime);
    const pending = createHostNativeGeoSpecRunner('/projects/gadget', runtime);
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
});
