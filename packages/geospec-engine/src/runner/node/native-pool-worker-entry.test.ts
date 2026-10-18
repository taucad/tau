import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateGeoSpecNativeModelLoaderOptions } from 'geospec/runner/native';
import { startNativePoolWorker } from '#runner/node/native-pool-worker-entry.js';

const owner = vi.hoisted(() => ({
  loader: vi.fn<(options: CreateGeoSpecNativeModelLoaderOptions) => void>(),
  close: vi.fn(),
  client: vi.fn(async () => ({})),
  composition: { kernels: [] as unknown[], unavailable: [], closureRoots: [] as string[] },
  compose: vi.fn(async (_input: { store: string; managed: unknown }) => owner.composition),
  plugins: vi.fn(async (rows: readonly unknown[]) => rows.map((_row, index) => ({ id: `native-${String(index)}` }))),
  definition: vi.fn((options: unknown) => options),
  defaults: { kernels: ['kernel'], middleware: ['middleware'], bundlers: ['bundler'], transcoders: ['transcoder'] },
}));

vi.mock('node:worker_threads', () => ({ parentPort: null, workerData: undefined }));
vi.mock('geospec-engine/node', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the native package's public constructor export.
  Engine: class {
    public close = owner.close;
  },
}));
vi.mock('geospec/runner/native', () => ({ createGeoSpecNativeModelLoader: owner.loader }));
vi.mock('@taucad/runtime/node', () => ({ createNodeClient: owner.client }));
vi.mock('@taucad/runtime/worker', () => ({ defineRuntime: owner.definition }));
vi.mock('@taucad/native-kernels/node', () => ({
  composeNativeKernels: owner.compose,
  composeNativePlugins: owner.plugins,
  defaultPayloadStore: () => '/store',
}));
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
  it('keeps the portable defaults when the payload store holds no sealed native closure', async () => {
    owner.composition = { kernels: [], unavailable: [], closureRoots: [] };
    await runtimeFactory()();
    expect(owner.compose).toHaveBeenCalledWith({ store: '/store', managed: expect.any(Object) as unknown });
    expect(owner.definition).not.toHaveBeenCalled();
    expect(owner.client).toHaveBeenCalledWith({ runtime: owner.defaults, projectPath: '/project' });
  });

  it('adds every prepared native kernel from the roster and preserves every default bucket', async () => {
    owner.composition = { kernels: [{ kernel: 'a' }, { kernel: 'b' }], unavailable: [], closureRoots: ['/a', '/b'] };
    await runtimeFactory()();
    const plugins = [{ id: 'native-0' }, { id: 'native-1' }];
    expect(owner.plugins).toHaveBeenCalledWith(owner.composition.kernels);
    expect(owner.definition).toHaveBeenCalledWith({ ...owner.defaults, plugins });
    expect(owner.client).toHaveBeenCalledWith({ runtime: { ...owner.defaults, plugins }, projectPath: '/project' });
  });

  it('refuses a malformed managed profile without falling back to another Runtime', async () => {
    vi.stubEnv('TAU_ACQUISITION', 'sometimes');
    await expect(runtimeFactory()()).rejects.toThrow('TAU_ACQUISITION');
    expect(owner.compose).not.toHaveBeenCalled();
    expect(owner.client).not.toHaveBeenCalled();
  });
});
