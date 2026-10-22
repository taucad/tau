import { afterEach, describe, expect, it, vi } from 'vitest';

const owner = vi.hoisted(() => ({
  runtime: { plugins: ['runtime'] },
  client: { id: 'client' },
  exporter: { id: 'tau' },
  loadCliRuntime: vi.fn(async (_options: unknown) => owner.runtime),
  resolve: vi.fn(async (_runtime: unknown, _config: unknown) => ({
    kernels: [{ extensions: ['ts', 'js'] }, { extensions: ['*', 'ts', 'scad'] }, {}],
  })),
  createNodeClient: vi.fn(async (_options: unknown) => owner.client),
  createHostGeoSpecExporter: vi.fn(
    async (_options: { client: () => Promise<unknown>; extensions: readonly string[] }) => owner.exporter,
  ),
  authorize: vi.fn(),
}));

vi.mock('#runtime-options.js', () => ({ loadCliRuntime: owner.loadCliRuntime }));
vi.mock('@taucad/runtime/worker', () => ({ resolveRuntimeDefinition: owner.resolve }));
vi.mock('@taucad/runtime/node', () => ({ createNodeClient: owner.createNodeClient }));
vi.mock('@taucad/host/agent-tools', () => ({ createHostGeoSpecExporter: owner.createHostGeoSpecExporter }));
vi.mock('#zoo-proxy.js', () => ({ authorizeCliZooProxy: owner.authorize, cliZooProxyUrl: () => 'wss://zoo' }));

const { tauExporter } = await import('#geospec/tau-exporter.js');
const { default: createTauExporters, exportersFor } = await import('#geospec/exporter-module.js');

afterEach(() => {
  vi.clearAllMocks();
});

describe('tauExporter', () => {
  it("should claim the composed kernels' extensions and root a lazy client at the project", async () => {
    const exporter = await tauExporter({
      projectPath: '/work/vise',
      pluginRoot: '/work',
      plugins: ['./zoo.mjs'],
      config: './tau.config.mjs',
    });

    expect(exporter).toBe(owner.exporter);
    expect(owner.authorize).toHaveBeenCalledOnce();
    expect(owner.loadCliRuntime).toHaveBeenCalledWith({
      projectRoot: '/work',
      plugin: ['./zoo.mjs'],
      config: './tau.config.mjs',
      zooProxyUrl: 'wss://zoo',
    });
    const [options] = owner.createHostGeoSpecExporter.mock.calls[0]!;
    expect(options.extensions).toEqual(['ts', 'js', 'scad']);
    expect(owner.createNodeClient).not.toHaveBeenCalled();
    await expect(options.client()).resolves.toBe(owner.client);
    expect(owner.createNodeClient).toHaveBeenCalledWith({ runtime: owner.runtime, projectPath: '/work/vise' });
  });

  it('should compose the built-in runtime of the current directory by default', async () => {
    await tauExporter();

    expect(owner.loadCliRuntime).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      plugin: [],
      zooProxyUrl: 'wss://zoo',
    });
    await owner.createHostGeoSpecExporter.mock.calls[0]![0].client();
    expect(owner.createNodeClient).toHaveBeenCalledWith({ runtime: owner.runtime, projectPath: process.cwd() });
  });
});

describe('the tau test exporter module', () => {
  it('should create one exporter for the worker with no plugins in its URL', async () => {
    expect(await createTauExporters({ projectPath: '/work/vise' })).toEqual([owner.exporter]);
    expect(owner.loadCliRuntime).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      plugin: [],
      zooProxyUrl: 'wss://zoo',
    });
  });

  it("should rebuild the composition its URL's query names", async () => {
    const query = new URLSearchParams([
      ['pluginRoot', '/work'],
      ['plugin', './a.mjs'],
      ['plugin', './b.mjs'],
      ['config', './tau.config.mjs'],
    ]);

    await exportersFor(`file:///cli/geospec-exporter.mjs?${query.toString()}`, { projectPath: '/work/vise' });

    expect(owner.loadCliRuntime).toHaveBeenCalledWith({
      projectRoot: '/work',
      plugin: ['./a.mjs', './b.mjs'],
      config: './tau.config.mjs',
      zooProxyUrl: 'wss://zoo',
    });
  });
});
