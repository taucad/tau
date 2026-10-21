import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateGeoSpecNativeModelLoaderOptions } from '#model/native-model-loader.js';
import { startGeoSpecNodePoolWorker } from '#runner/node/pool-worker-entry.js';

const owner = vi.hoisted(() => ({
  loader: vi.fn<(options: CreateGeoSpecNativeModelLoaderOptions) => void>(),
  close: vi.fn(),
  host: vi.fn(),
  engine: vi.fn(async (_options: { executionPermits?: number }) => ({
    engine: { close: owner.close },
    binding: 'napi',
  })),
}));

vi.mock('node:worker_threads', () => ({ parentPort: null, workerData: undefined }));
vi.mock('#runner/node/engine.js', () => ({ createNodeGeoSpecEngine: owner.engine }));
vi.mock('#model/native-model-loader.js', () => ({ createGeoSpecNativeModelLoader: owner.loader }));
vi.mock('#runner/pool/worker-host.js', () => ({ startGeoSpecPoolWorkerHost: owner.host }));

/** A project whose config declares one exporter, and an exporter module that supplies another. */
const project = async (): Promise<{ projectPath: string; exporterModule: string }> => {
  const projectPath = await mkdtemp(join(tmpdir(), 'geospec-pool-worker-'));
  await writeFile(
    join(projectPath, 'geospec.config.mjs'),
    `export default { exporters: [{ id: 'config', extensions: ['py'], capabilities: { formats: ['step'] }, export: async () => { throw new Error('unused'); } }] };`,
  );
  const exporterModule = join(projectPath, 'preset.mjs');
  await writeFile(
    exporterModule,
    `export default async ({ projectPath }) => [{ id: 'preset', projectPath, extensions: ['ts'], capabilities: { formats: ['glb'] }, export: async () => { throw new Error('unused'); } }];`,
  );
  return { projectPath, exporterModule: pathToFileURL(exporterModule).href };
};

const start = async (options: Parameters<typeof startGeoSpecNodePoolWorker>[1]): Promise<void> => {
  await startGeoSpecNodePoolWorker({ postMessage: vi.fn(), on: vi.fn() }, options);
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('startGeoSpecNodePoolWorker', () => {
  it("should place the exporter modules' exporters before the config's", async () => {
    const { projectPath, exporterModule } = await project();

    await start({ projectPath, exporterModules: [exporterModule], grant: 2 });

    const options = owner.loader.mock.calls.at(-1)?.[0];
    expect(options?.exporters?.map(({ id }) => id)).toStrictEqual(['preset', 'config']);
    expect(options?.exporters?.[0]).toMatchObject({ projectPath });
    expect(owner.engine).toHaveBeenCalledWith({ executionPermits: 2 });
    expect(owner.host).toHaveBeenCalledOnce();
  });

  it('should read the explicit config and leave the permits to the engine when no grant is given', async () => {
    const { projectPath } = await project();
    await writeFile(join(projectPath, 'other.config.mjs'), 'export default {};');

    await start({ projectPath, configPath: 'other.config.mjs' });

    expect(owner.loader.mock.calls.at(-1)?.[0].exporters).toStrictEqual([]);
    expect(owner.engine).toHaveBeenCalledWith({});
  });

  it('should close the engine when the config cannot load', async () => {
    const { projectPath } = await project();

    await expect(start({ projectPath, configPath: 'missing.config.mjs' })).rejects.toThrow();
    expect(owner.close).toHaveBeenCalledOnce();
    expect(owner.host).not.toHaveBeenCalled();
  });
});
