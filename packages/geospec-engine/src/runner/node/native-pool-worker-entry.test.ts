import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CreateGeoSpecNativeModelLoaderOptions } from 'geospec/runner/native';
import { startNativePoolWorker } from '#runner/node/native-pool-worker-entry.js';

const owner = vi.hoisted(() => ({
  loader: vi.fn<(options: CreateGeoSpecNativeModelLoaderOptions) => void>(),
  close: vi.fn(),
  client: vi.fn(async () => ({})),
  exporter: vi.fn(async (options: { client: () => Promise<unknown>; extensions: readonly string[] }) => ({
    id: 'tau',
    ...options,
  })),
  resolved: {
    kernels: [
      { id: 'kernel', extensions: ['ts'] },
      { id: 'fallback', extensions: ['*', 'ts', 'scad'] },
    ],
  },
  resolve: vi.fn(async (_runtime: unknown, _config: unknown) => owner.resolved),
  deployments: [] as unknown[],
  deploymentsOf: vi.fn((_runtime: unknown) => owner.deployments),
  resolver: vi.fn(),
  storeResolver: vi.fn((_input: { managed: unknown }) => owner.resolver),
  install: vi.fn(),
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
vi.mock('@taucad/agent-tools/geospec/exporter', () => ({ tauClientExporter: owner.exporter }));
vi.mock('@taucad/runtime/node', () => ({ createNodeClient: owner.client }));
vi.mock('@taucad/runtime/worker', () => ({ resolveRuntimeDefinition: owner.resolve }));
vi.mock('@taucad/native-process-core/store', () => ({
  nativeDeploymentsOf: owner.deploymentsOf,
  storeClosureResolver: owner.storeResolver,
  installNativeClosureResolver: owner.install,
}));
vi.mock('#model/default-runtime.js', () => ({ defaultRuntime: owner.defaults }));
vi.mock('geospec/runner/node', () => ({ createNodeVmFileSystem: vi.fn(() => ({})) }));
vi.mock('geospec/runner/worker', () => ({ startGeoSpecPoolWorkerHost: vi.fn() }));

const runtimeFactory = async () => {
  await startNativePoolWorker({ postMessage: vi.fn(), on: vi.fn() }, { projectPath: '/project', grant: 1 });
  const [exporter] = owner.loader.mock.calls.at(-1)?.[0].exporters ?? [];
  expect(exporter).toBe(await owner.exporter.mock.results.at(-1)?.value);
  const factory = owner.exporter.mock.calls.at(-1)?.[0].client;
  if (typeof factory !== 'function') {
    throw new TypeError('The Node worker must supply its owning Runtime factory.');
  }
  return factory;
};

// The managed-profile reader is the one real import the factory makes; load it once, outside the tests' time budget.
beforeAll(async () => {
  await import('@taucad/runtime/preparation/node');
}, 60_000);

afterEach(() => {
  owner.close();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('configured native Node worker Runtime', () => {
  it("claims the default runtime's kernel extensions without the catch-all", async () => {
    await runtimeFactory();
    expect(owner.exporter.mock.calls.at(-1)?.[0].extensions).toEqual(['ts', 'scad']);
    expect(owner.client).not.toHaveBeenCalled();
  });

  it('serves the default runtime unchanged when it lists no native kernel', async () => {
    owner.deployments = [];
    await (
      await runtimeFactory()
    )();
    expect(owner.resolve).toHaveBeenCalledWith(owner.defaults, undefined);
    expect(owner.deploymentsOf).toHaveBeenCalledWith(owner.resolved);
    expect(owner.install).not.toHaveBeenCalled();
    expect(owner.client).toHaveBeenCalledWith({ runtime: owner.defaults, projectPath: '/project' });
  });

  it('binds the native kernels the default runtime lists to the payload store before the client starts', async () => {
    owner.deployments = [{ deployment: { package: '@taucad/picogk' }, kernels: [] }];
    await (
      await runtimeFactory()
    )();
    expect(owner.storeResolver).toHaveBeenCalledWith({ managed: expect.any(Object) as unknown });
    expect(owner.install).toHaveBeenCalledWith(owner.resolver);
    expect(owner.install.mock.invocationCallOrder[0]).toBeLessThan(owner.client.mock.invocationCallOrder[0]!);
    expect(owner.client).toHaveBeenCalledWith({ runtime: owner.defaults, projectPath: '/project' });
  });

  it('refuses a malformed managed profile without falling back to another Runtime', async () => {
    vi.stubEnv('TAU_ACQUISITION', 'sometimes');
    await expect((await runtimeFactory())()).rejects.toThrow('TAU_ACQUISITION');
    expect(owner.install).not.toHaveBeenCalled();
    expect(owner.client).not.toHaveBeenCalled();
  });
});
