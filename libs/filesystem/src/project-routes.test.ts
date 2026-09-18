import { describe, expect, it, vi } from 'vitest';
import { checkoutRoute, nodeModulesRoute, parseRoute, projectRoute } from '#project-routes.js';
import { MountTable } from '#mount-table.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { WorkspaceFileService } from '#workspace-file-service.js';

/**
 * The route grammar and the mount kind that replaces reading it back out of a
 * prefix (charter D10).
 *
 * The behaviour pins mount a prefix that *spells* a project route while its
 * `kind` says otherwise: the route assertion and the lock-owner lookup must
 * follow the kind, which is what proves they no longer parse the prefix.
 */

const projectId = 'proj_rrrrrrrrrrrrrrrrrrrrr';

async function createService() {
  const providerRegistry = new ProviderRegistry({ databasePrefix: 'tau-project-routes-test' });
  const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:0' });
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:0' });
  const resourceQueue = new ResourceQueue();
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue,
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  return { service, provider, mountTable, resourceQueue };
}

describe('ProjectRoutes', () => {
  it('classifies every product route, its descendants and everything it does not claim', () => {
    expect(parseRoute('/')).toEqual({ kind: 'root', rest: '' });
    expect(parseRoute(projectRoute(projectId))).toEqual({ kind: 'project', id: projectId, rest: '' });
    expect(parseRoute(`${projectRoute(projectId)}/src/main.ts`)).toEqual({
      kind: 'project',
      id: projectId,
      rest: 'src/main.ts',
    });
    expect(parseRoute(checkoutRoute('candidate'))).toEqual({
      kind: 'checkout',
      id: 'candidate',
      rest: '',
    });
    expect(parseRoute('/previews/card-a')).toEqual({ kind: 'preview', id: 'card-a', rest: '' });
    expect(parseRoute(nodeModulesRoute)).toEqual({ kind: 'node_modules', rest: '' });
    expect(parseRoute(`${nodeModulesRoute}/three/index.d.ts`)).toEqual({
      kind: 'node_modules',
      rest: 'three/index.d.ts',
    });
    expect(parseRoute('/projects')).toEqual({ kind: 'other', rest: '' });
    expect(parseRoute('/cube-design/main.ts')).toEqual({ kind: 'other', rest: '' });
  });
});

describe('MountEntry.kind', () => {
  it('derives the kind and route id from the prefix', () => {
    const mountTable = new MountTable();
    mountTable.mount('/', new MemoryProvider(), { class: 'authored', backend: 'memory' });
    mountTable.mount(projectRoute(projectId), new MemoryProvider(), { class: 'authored', backend: 'memory' });
    mountTable.mount(nodeModulesRoute, new MemoryProvider(), { class: 'derived', backend: 'opfs' });

    expect(mountTable.getExactMount('/')).toMatchObject({ kind: 'root', routeId: undefined });
    expect(mountTable.getExactMount(projectRoute(projectId))).toMatchObject({
      kind: 'project',
      routeId: projectId,
    });
    expect(mountTable.getExactMount(nodeModulesRoute)).toMatchObject({
      kind: 'node_modules',
      routeId: undefined,
    });
  });

  it('keeps the kind the caller declared over the one the prefix spells', () => {
    const mountTable = new MountTable();
    mountTable.mount(projectRoute(projectId), new MemoryProvider(), {
      class: 'authored',
      backend: 'memory',
      kind: 'other',
    });

    expect(mountTable.getExactMount(projectRoute(projectId))).toMatchObject({ kind: 'other' });
  });

  it('refuses a route whose mount is not a project mount, so the assertion reads the kind', async () => {
    const { service, provider, mountTable } = await createService();
    try {
      mountTable.mount(projectRoute(projectId), provider, {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:0',
        providerBasePath: 'cube-design',
        kind: 'other',
      });

      await expect(service.readFile(`${projectRoute(projectId)}/main.ts`)).rejects.toThrow(
        expect.objectContaining({ code: 'UNBOUND_PROJECT_ROUTE' }),
      );
    } finally {
      service.dispose();
    }
  });

  /* The positive control is `flat workspace layout locks` in
   * `workspace-file-service.test.ts`: the same write under a derived `project`
   * kind does take the `project:<id>` lock. */
  it('leaves a physical write unlocked by a project whose mount kind says it is not one', async () => {
    const { service, provider, mountTable, resourceQueue } = await createService();
    try {
      await provider.mkdir('cube-design', { recursive: true });
      mountTable.mount(projectRoute(projectId), provider, {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:0',
        providerBasePath: 'cube-design',
        kind: 'other',
      });
      const queueForMany = vi.spyOn(resourceQueue, 'queueForMany');

      await service.writeFile('/cube-design/main.ts', 'physical route');

      expect(queueForMany.mock.calls.at(-1)?.[0].filter((lock) => lock.startsWith('project:'))).toEqual([]);
    } finally {
      service.dispose();
    }
  });
});
