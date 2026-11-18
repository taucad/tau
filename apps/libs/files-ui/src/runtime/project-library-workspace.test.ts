/**
 * The library's workspace commands over a real workspace connection actor (app state orchestration charter D9, D23;
 * plan § 4 A4b; B2).
 *
 * A defect the machine's root `onError` catches keeps the actor answering. The command that drove it must hear of the
 * fault too: it rejects, and the next connection starts afresh instead of joining one that can no longer settle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { workspaceConnectionMachine } from '#machines/workspace-connection.machine.js';
import { workspaceMarkerSchemaUrl } from '@taucad/types';
import { WorkspaceCommands } from '#runtime/project-library-workspace.js';
import type { WorkspaceCommandsHost } from '#runtime/project-library-workspace.js';

vi.mock('#constants/browser.constants.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  directoryPicker: () => ({ available: true, backend: 'webaccess', pick: async () => undefined }),
}));

/** A folder whose name throws when the machine reads it: a defect no transition models. */
const faultingHandle = (error: Error): FileSystemDirectoryHandle => {
  const broken = Object.create(null) as FileSystemDirectoryHandle;
  Object.defineProperty(broken, 'name', {
    get: () => {
      throw error;
    },
  });
  return broken;
};

const notCalled = async (): Promise<never> => {
  throw new Error('not called in this test');
};

const actors: Array<{ stop: () => void }> = [];

const commandsOver = (facade: WorkspaceCommandsHost['facade'] = notCalled) => {
  const workspaceConnection = createActor(workspaceConnectionMachine, {
    input: {
      registerWorkspace: vi.fn(
        async () =>
          new Promise<never>(() => {
            /* Registration never settles: these rows end before it. */
          }),
      ),
      mountWorkspace: vi.fn(),
      prepareWorkspaceCatalog: vi.fn(),
      reportFault: () => undefined,
    },
  });
  workspaceConnection.subscribe({ error: () => undefined });
  workspaceConnection.start();
  actors.push(workspaceConnection);
  /* Each `beginSelection` sets a new operation id. */
  const operations = new Set<string>();
  workspaceConnection.subscribe(({ context }) => {
    if (context.operationId !== undefined) {
      operations.add(context.operationId);
    }
  });
  const commands = new WorkspaceCommands({
    workspaceConnection,
    facade,
    readiedWorker: notCalled,
    whenDiscoveryReady: notCalled,
    discover: notCalled,
    prepareCurrentWorkspaceCatalog: notCalled,
    invalidateListing: () => undefined,
    invalidateProject: () => undefined,
    telemetry: undefined,
  });
  return { commands, operations };
};

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

describe('WorkspaceCommands over a faulting connection (A4b, B2)', () => {
  it('should reject a connection the machine faulted on, and start the next one afresh', async () => {
    const { commands, operations } = commandsOver();

    await expect(commands.connectWorkspace(faultingHandle(new Error('first fault')))).rejects.toThrow(
      'Workspace connection fault',
    );

    /* A later fault is a consequence and keeps the first message, but it still ends the connection that met it. */
    await expect(commands.connectWorkspace(faultingHandle(new Error('second fault')))).rejects.toThrow(
      'Workspace connection fault',
    );
    expect(operations.size).toBe(2);
  });
});

describe('Locate folder evidence (blueprint D2 step 3)', () => {
  it('should read the marker, the projects one level down and the projects inside a parent, through scoped reads only', async () => {
    const tree: Record<string, readonly string[]> = {
      '': ['gearbox', 'archive', '.tau', 'empty'],
      archive: ['bracket'],
      empty: [],
      gearbox: [],
    };
    const files: Record<string, string> = {
      '.tau/workspace.json': JSON.stringify({
        $schema: workspaceMarkerSchemaUrl,
        workspaceId: 'wsp_locate000000000000000',
        slug: 'workshop',
        createdAt: '2026-07-24T00:11:47.808Z',
      }),
      'gearbox/.tau/project.json': JSON.stringify({ version: 1, projectId: 'proj_gearbox' }),
      'archive/bracket/.tau/project.json': JSON.stringify({ version: 1, projectId: 'proj_bracket' }),
    };
    const scope = { backend: 'node', path: '/Volumes/Archive/Workshop' } as const;
    const readShallowDirectory = vi.fn(async (path: string, options: { scope: unknown }) => {
      expect(options.scope).toEqual(scope);
      return (tree[path] ?? []).map((name) => ({ id: name, name, size: 0, mtimeMs: 0, children: [] }));
    });
    const readFile = vi.fn(async (path: string, options: { scope: unknown }) => {
      expect(options.scope).toEqual(scope);
      const text = files[path];
      if (text === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return text;
    });
    const { commands } = commandsOver(
      async () =>
        ({ scopedStorage: { readShallowDirectory, readFile } }) as unknown as Awaited<
          ReturnType<WorkspaceCommandsHost['facade']>
        >,
    );

    const evidence = await commands.readFolderEvidence({ ...scope, wasGranted: false });

    expect(evidence.marker?.workspaceId).toBe('wsp_locate000000000000000');
    expect(evidence.projects).toEqual([{ projectId: 'proj_gearbox', directory: 'gearbox' }]);
    expect(evidence.subfolders).toEqual([
      { name: 'archive', projects: [{ projectId: 'proj_bracket', directory: 'bracket' }] },
    ]);
  });
});
