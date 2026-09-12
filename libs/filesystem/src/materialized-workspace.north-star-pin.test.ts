/**
 * Red pin for the workspace-filesystem north star, wave W0.
 *
 * The assertion states the target behaviour, so it fails today. It is wrapped
 * in `it.fails` (execution-queue ruling P2) to keep the suite green while the
 * defect stands; the wave that fixes it removes `.fails`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import type { RootedFileSystem } from '#workspace-file-service.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import { MaterializedWorkspaceAuthority } from '#materialized-workspace.js';
import { materializedWorkspaceId } from '#workspace-identity.js';

type Harness = {
  readonly authority: MaterializedWorkspaceAuthority;
  readonly project: RootedFileSystem;
  readonly dispose: () => void;
};

const live: Harness[] = [];

afterEach(() => {
  for (const entry of live) {
    entry.dispose();
  }
  live.length = 0;
});

/** The project directory as the authority serves it, and the turn authority above it. */
const harness = (): Harness => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  mountTable.mount('/project', provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:north-star-w0-pin-4',
  });
  const eventBus = new ChangeEventBus();
  const resourceQueue = new ResourceQueue();
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue,
    eventBus,
    mountTable,
  });
  const project = service.createRootedFileSystem('/project');
  const created: Harness = {
    authority: new MaterializedWorkspaceAuthority({ filesystem: project, resourceQueue }),
    project,
    dispose: () => {
      service.dispose();
      provider.dispose();
      eventBus.dispose();
    },
  };
  live.push(created);
  return created;
};

/** Every path the file tree would list under the project root. */
const listProjectTree = async (filesystem: RootedFileSystem, directory = ''): Promise<readonly string[]> => {
  const names = await filesystem.readdir(directory);
  const nested = await Promise.all(
    names.map(async (name) => {
      const path = directory === '' ? name : `${directory}/${name}`;
      const stat = await filesystem.stat(path);
      return stat.type === 'dir' ? [path, ...(await listProjectTree(filesystem, path))] : [path];
    }),
  );
  return nested.flat();
};

describe('candidate checkouts and the project tree (north star W0)', () => {
  // oxlint-disable-next-line eslint/capitalized-comments -- the pin header is the exact wording the W0 brief specifies
  // north-star W0 pin 4: a `.tau/workspaces/run_*` row is visible to the tree because a candidate checkout is materialized inside the project it is a candidate for; turns green in W3; remove .fails then.
  it.fails('should materialize a candidate turn outside the project directory', async () => {
    const { authority, project } = harness();

    await authority.materialize({
      workspaceId: materializedWorkspaceId('run_north_star_w0_pin'),
      baseRevisionId: revisionId('rev-north-star-w0-pin'),
      tree: new ImmutableRevisionTree([['main.scad', 'cube(10);']]),
    });

    const tree = await listProjectTree(project);

    expect(tree.filter((path) => path.split('/').some((segment) => segment.startsWith('run_')))).toEqual([]);
    expect(tree.filter((path) => path.startsWith('.tau/workspaces'))).toEqual([]);
  });
});
