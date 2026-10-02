// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB polyfill for WorkspaceFileService tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { populateBundledTypesMount } from '#bundled-types-mount.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';

const decoder = new TextDecoder();

async function createService(): Promise<WorkspaceFileService> {
  const providerRegistry = new ProviderRegistry();
  const provider = await providerRegistry.createMountProvider({ backend: 'memory' });
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { backend: 'memory' });
  return new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
}

describe('populateBundledTypesMount', () => {
  let service: WorkspaceFileService;

  beforeEach(async () => {
    service = await createService();
  });

  it('writes index.d.ts and package.json under /node_modules/<pkg>/', async () => {
    await populateBundledTypesMount(service, [
      { packageName: 'replicad', content: 'export declare const x: 1;', prewrapped: true },
    ]);

    const dts = await service.readFile('/node_modules/replicad/index.d.ts');
    expect(typeof dts === 'string' ? dts : decoder.decode(dts)).toBe('export declare const x: 1;');

    const packageJsonRead = await service.readFile('/node_modules/replicad/package.json');
    const packageJsonText = typeof packageJsonRead === 'string' ? packageJsonRead : decoder.decode(packageJsonRead);
    expect(JSON.parse(packageJsonText)).toEqual({ name: 'replicad', types: 'index.d.ts' });
  });

  it('wraps content when prewrapped is false', async () => {
    await populateBundledTypesMount(service, [
      { packageName: 'alpha', content: 'export const z = 1;', prewrapped: false },
    ]);

    const dts = await service.readFile('/node_modules/alpha/index.d.ts');
    const text = typeof dts === 'string' ? dts : decoder.decode(dts);
    expect(text).toContain("declare module 'alpha'");
    expect(text).toContain('export const z = 1;');
  });

  it('skips write when bytes already match', async () => {
    const writeSpy = vi.spyOn(service, 'writeFile');

    await populateBundledTypesMount(service, [{ packageName: 'idempotent', content: 'export {}', prewrapped: true }]);
    writeSpy.mockClear();

    await populateBundledTypesMount(service, [{ packageName: 'idempotent', content: 'export {}', prewrapped: true }]);

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
