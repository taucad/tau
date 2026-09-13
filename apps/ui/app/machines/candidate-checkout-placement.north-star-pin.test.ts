/**
 * Red pin 4 for the workspace-filesystem north star, wave W0 — flipped in W3d.
 *
 * The claim is unchanged: **a turn's checkout is never materialized inside the
 * project it is a checkout of.** What changed is where it can be asked. W0 asked
 * it of `MaterializedWorkspaceAuthority`, which W3d deleted; the owner of
 * placement is now the worker's revision root over
 * `@taucad/revisions/revision-effects`, so the pin is asked there.
 *
 * The filter is the registry's answer rather than W0's `run_` prefix (W0 review
 * F4): with the `.tau/workspaces` row deleted, a materialized checkout inside
 * the project is not merely visible — `classify` says its bytes are
 * **versioned**, so the next revision would swallow the previous turn's whole
 * tree. That is the defect, stated as the registry states it.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { classify } from '@taucad/filesystem/path-registry';
import type { RootedFileSystem } from '@taucad/filesystem';
import { createWorkerProjectRevisions } from '#machines/file-manager.worker.revisions.js';

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
});

const settle = async (turns = 20): Promise<void> => {
  for (let index = 0; index < turns; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- draining is sequential by definition.
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
};

/** The project route, and a revision root placed on it exactly as the worker does. */
const harness = (): { project: RootedFileSystem; revisions: ReturnType<typeof createWorkerProjectRevisions> } => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  mountTable.mount('/projects/pin-4', provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:north-star-w0-pin-4',
  });
  const eventBus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  const project = service.createRootedFileSystem('/projects/pin-4');
  const revisions = createWorkerProjectRevisions({
    projectId: 'pin-4',
    port: createIsomorphicGitRevisionPort({ filesystem: project }),
    filesystem: (root) => service.createRootedFileSystem(root),
    authorityEpoch: 'epoch-pin-4',
  });
  disposers.push(() => {
    void revisions.release();
    service.dispose();
    provider.dispose();
    eventBus.dispose();
  });
  return { project, revisions };
};

/** Every file the tree holds under the project root. */
const listProjectFiles = async (filesystem: RootedFileSystem, directory = ''): Promise<readonly string[]> => {
  const names = await filesystem.readdir(directory);
  const nested = await Promise.all(
    names.map(async (name) => {
      const path = directory === '' ? name : `${directory}/${name}`;
      const stat = await filesystem.stat(path);
      return stat.type === 'dir' ? listProjectFiles(filesystem, path) : [path];
    }),
  );
  return nested.flat();
};

describe('candidate checkouts and the project tree (north star W0 pin 4)', () => {
  it('should place a turn without materializing a checkout inside the project directory', async () => {
    const { project, revisions } = harness();
    await project.writeFile('main.scad', 'cube(10);');

    await revisions.admitTurn({ turnId: 'turn-pin-4', chatId: 'chat-pin-4', runId: 'run-pin-4' });
    await settle();

    const files = await listProjectFiles(project);

    /* The registry's answer, not a `run_` prefix (W0 review F4): what the next
     * revision would capture is the user's own file and the generated ignore
     * the registry deliberately versions — nothing else. A checkout
     * materialized here would be versioned too (no row covers it any more), and
     * the next revision would swallow another turn's whole tree. */
    expect(files.filter((path) => classify(path).versioned).toSorted()).toEqual(['.gitignore', 'main.scad']);
  });
});
