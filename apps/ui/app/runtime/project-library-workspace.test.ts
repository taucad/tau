/**
 * The library's workspace commands over a real workspace connection actor (app state orchestration charter D9, D23;
 * plan § 4 A4b; B2).
 *
 * A defect the machine's root `onError` catches keeps the actor answering. The command that drove it must hear of the
 * fault too: it rejects, and the next connection starts afresh instead of joining one that can no longer settle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { workspaceConnectionMachine } from '#hooks/workspace-connection.machine.js';
import { WorkspaceCommands } from '#runtime/project-library-workspace.js';

vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportAppRuntimeFault: () => undefined,
}));

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

const commandsOver = () => {
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
    facade: notCalled,
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
