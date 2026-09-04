/**
 * External-change wiring for node storage roots.
 *
 * The renderer never polls a node root: the watcher lives with the bytes in the
 * host, and its events must land on the same `ChangeEventBus` path that
 * `FileSystemObserver` records take for webaccess roots.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { serveNodeFsProvider } from '#backend/node/host.js';
import type { ProjectRootConfiguration } from '#mount-table.js';
import type { WatchEvent } from '#types.js';

const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';

/** Names of the project's immediate children, as the tree currently reports them. */
const listProjectNames = async (service: WorkspaceFileService): Promise<string[]> => {
  const nodes = await service.readDirectory(`/projects/${projectId}`);
  return nodes.map(({ name }) => name);
};
const physicalRoot = 'alpha-project';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup();
  }
});

const createNodeService = async (): Promise<{
  service: WorkspaceFileService;
  root: string;
  eventBus: ChangeEventBus;
}> => {
  const root = mkdtempSync(join(tmpdir(), 'tau-node-observe-'));
  mkdirSync(join(root, physicalRoot));
  writeFileSync(join(root, physicalRoot, 'main.ts'), 'before');
  writeFileSync(
    join(root, physicalRoot, 'tau.json'),
    JSON.stringify({ $schema: 'https://tau.new/schemas/project.json', id: projectId, name: 'Alpha' }),
  );

  const { port1, port2 } = new MessageChannel();
  const stopHost = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root });
  const providerRegistry = new ProviderRegistry({ createNodeFsPort: async () => port1 });
  const mountTable = new MountTable();
  const eventBus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  cleanups.push(() => {
    service.dispose();
    stopHost();
    port2.close();
    rmSync(root, { recursive: true, force: true });
  });

  const configuration: ProjectRootConfiguration = {
    projects: [{ backend: 'node', path: root, projectId, providerBasePath: physicalRoot }],
    roots: [{ backend: 'node', path: root }],
  };
  await service.configureProjectRoots(configuration);
  return { service, root, eventBus };
};

describe('WorkspaceFileService node root observation', () => {
  it('mounts a node project root through the provider port', async () => {
    const { service } = await createNodeService();

    await expect(service.readFile(`/projects/${projectId}/main.ts`, 'utf8')).resolves.toBe('before');
  });

  it('surfaces an external disk write as a watch change', async () => {
    const { service, root } = await createNodeService();
    const events: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${projectId}`)
      .watch({ paths: ['main.ts'] }, (event) => events.push(event));

    // The host arms its watcher asynchronously (the port is a process seam), so
    // the write is repeated until it lands on an armed watcher.
    await expect
      .poll(
        () => {
          writeFileSync(join(root, physicalRoot, 'main.ts'), 'changed on disk');
          return events;
        },
        { timeout: 15_000, interval: 200 },
      )
      .toContainEqual({ type: 'change', path: 'main.ts' });
    await expect(service.readFile(`/projects/${projectId}/main.ts`, 'utf8')).resolves.toBe('changed on disk');
  }, 20_000);

  it('surfaces an external delete', async () => {
    const { service, root } = await createNodeService();
    writeFileSync(join(root, physicalRoot, 'extra.ts'), 'temporary');
    await expect.poll(async () => listProjectNames(service), { timeout: 5000 }).toContain('extra.ts');
    const events: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${projectId}`)
      .watch({ paths: ['extra.ts'] }, (event) => events.push(event));

    unlinkSync(join(root, physicalRoot, 'extra.ts'));

    // Either the precise deletion or a resync summary is a correct answer — both
    // are what the webaccess path emits, depending on what the tree had seen.
    await expect.poll(() => events.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect.poll(async () => listProjectNames(service), { timeout: 5000 }).not.toContain('extra.ts');
  }, 20_000);
});
