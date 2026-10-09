import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateGeoSpecNativeModelLoaderOptions } from 'geospec/runner/native';
import { startNativePoolWorker } from '#runner/node/native-pool-worker-entry.js';

const owner = vi.hoisted(() => ({
  loader: vi.fn<(options: CreateGeoSpecNativeModelLoaderOptions) => void>(),
  close: vi.fn(),
  client: vi.fn(async () => ({})),
  resourceOptions: { workerExecutable: '/resources/worker' },
  resources: vi.fn((_options: { resourceRoot: string }) => ({ workerExecutable: '/resources/worker' })),
  plugin: vi.fn((_options: unknown) => ({ id: 'configured-picogk' })),
  definition: vi.fn((options: unknown) => options),
  defaults: { kernels: ['kernel'], middleware: ['middleware'], bundlers: ['bundler'], transcoders: ['transcoder'] },
}));

vi.mock('node:worker_threads', () => ({ parentPort: null, workerData: undefined }));
vi.mock('@taucad/geospec-engine-native/node', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the native package's public constructor export.
  Engine: class {
    public close = owner.close;
  },
}));
vi.mock('geospec/runner/native', () => ({ createGeoSpecNativeModelLoader: owner.loader }));
vi.mock('@taucad/runtime/node', () => ({ createNodeClient: owner.client }));
vi.mock('@taucad/runtime/worker', () => ({ defineRuntime: owner.definition }));
vi.mock('@taucad/picogk', () => ({ loadPicogkKernelOptions: owner.resources, picogk: owner.plugin }));
vi.mock('#model/default-runtime.js', () => ({ defaultRuntime: owner.defaults }));
vi.mock('#runner/node/node-vm-filesystem.js', () => ({ createNodeVmFileSystem: vi.fn(() => ({})) }));
vi.mock('#runner/pool/worker-host.js', () => ({ startGeoSpecPoolWorkerHost: vi.fn() }));

const runtimeFactory = () => {
  startNativePoolWorker({ postMessage: vi.fn(), on: vi.fn() }, { projectPath: '/project', grant: 1 });
  const factory = owner.loader.mock.calls.at(-1)?.[0].runtime;
  if (typeof factory !== 'function') {
    throw new TypeError('The Node worker must supply its owning Runtime factory.');
  }
  return factory;
};

afterEach(() => {
  owner.close();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('configured native Node worker Runtime', () => {
  it('keeps the portable defaults when no PicoGK resource root is configured', async () => {
    vi.stubEnv('TAU_PICOGK_RESOURCE_ROOT', '');
    await runtimeFactory()();
    expect(owner.resources).not.toHaveBeenCalled();
    expect(owner.plugin).not.toHaveBeenCalled();
    expect(owner.client).toHaveBeenCalledWith({ runtime: owner.defaults, projectPath: '/project' });
  });

  it('adds only the explicitly configured PicoGK plugin and preserves every default bucket', async () => {
    vi.stubEnv('TAU_PICOGK_RESOURCE_ROOT', '/resources');
    await runtimeFactory()();
    expect(owner.resources).toHaveBeenCalledWith({ resourceRoot: '/resources' });
    expect(owner.plugin).toHaveBeenCalledWith({ kernels: { default: owner.resourceOptions } });
    expect(owner.definition).toHaveBeenCalledWith({ ...owner.defaults, plugins: [{ id: 'configured-picogk' }] });
    expect(owner.client).toHaveBeenCalledWith({
      runtime: { ...owner.defaults, plugins: [{ id: 'configured-picogk' }] },
      projectPath: '/project',
    });
  });

  it('refuses rejected configured resources without falling back to another Runtime', async () => {
    vi.stubEnv('TAU_PICOGK_RESOURCE_ROOT', '/invalid-resources');
    owner.resources.mockImplementationOnce(() => {
      throw new Error('PicoGK resource target mismatch');
    });
    await expect(runtimeFactory()()).rejects.toThrow('PicoGK resource target mismatch');
    expect(owner.client).not.toHaveBeenCalled();
    expect(owner.plugin).not.toHaveBeenCalled();
  });
});
