import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GeoSpecNativeRunnerOptions } from 'geospec/runner/native';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import { createHostNativeGeoSpecRunner } from '#agent-tools.js';
import type { HostGeoSpecRuntimeClient } from '#agent-tools.js';

const native = vi.hoisted(() => {
  const close = vi.fn();
  return {
    close,
    canonicalize: vi.fn(),
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
  canonicalize: native.canonicalize,
}));
vi.mock('geospec/runner/native', () => ({ createNativeGeoSpecRunner: native.runner }));
vi.mock('@taucad/geospec-engine/node-filesystem', () => ({ createNodeVmFileSystem: native.filesystem }));
vi.mock('@taucad/geospec-engine/register/node', () => {
  throw new Error('The native host factory must not register the legacy engine.');
});

describe('native host GeoSpec composition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should borrow the project runtime and close its own engine after the SDK runner', async () => {
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
    const sourceRevision = { entry: 'widget.ts', files: { 'widget.ts': `sha256:${'a'.repeat(64)}` } };
    runtime.export.mockResolvedValue({ success: true, data: [], issues: [], sourceRevision });
    const exported = await trackedRuntime.export('glb', { source: { path: 'widget.ts' } });
    expect(exported.sourceRevision).toEqual(sourceRevision);
    expect(runtime.export).toHaveBeenCalledExactlyOnceWith('glb', { source: { path: 'widget.ts' } });
    expect(runner.sourceRevisions?.()).toEqual([sourceRevision]);
    expect(options?.model?.projectPath).toBe('/projects/widget');
    expect(options?.nativeAssertions.engine).toEqual({ close: native.close });
    expect(options?.nativeAssertions.canonicalize).toBe(native.canonicalize);
    await expect(options?.model?.readSource?.('widget.step')).resolves.toBe(bytes);
    expect(read).toHaveBeenCalledExactlyOnceWith('widget.step');

    const runOptions = { files: ['widget.geospec.ts'] };
    await expect(runner.run(runOptions)).resolves.toBe(result);
    expect(sdkRunner.run).toHaveBeenCalledExactlyOnceWith(runOptions);
    await runner.close();
    expect(sdkRunner.close).toHaveBeenCalledOnce();
    expect(native.close).toHaveBeenCalledOnce();
    expect(runtime.terminate).not.toHaveBeenCalled();
  });
});
