import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, waitFor } from 'xstate';
import type { DirectoryPick } from '#constants/browser.constants.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { selectWorkspaceConnectionState, workspaceConnectionMachine } from '#hooks/workspace-connection.machine.js';

const workspace: Workspace = {
  workspaceId: 'wsp_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Workshop',
  slug: 'workshop',
  lastConnectedAt: 1,
};
const handle = Object.create(null) as FileSystemDirectoryHandle;
Object.defineProperties(handle, {
  kind: { value: 'directory' },
  name: { value: 'Workshop' },
});
const selection: DirectoryPick = { backend: 'webaccess', handle };

const faults = vi.hoisted(() => ({ reported: [] as unknown[] }));

vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportAppRuntimeFault: (error: unknown) => {
    faults.reported.push(error);
  },
}));

/** A webaccess pick whose folder name throws when the machine reads it: a defect no transition models. */
const faultingSelection = (error: Error): DirectoryPick => {
  const broken = Object.create(null) as FileSystemDirectoryHandle;
  Object.defineProperty(broken, 'name', {
    get: () => {
      throw error;
    },
  });
  return { backend: 'webaccess', handle: broken };
};

afterEach(() => {
  vi.unstubAllGlobals();
  faults.reported.length = 0;
});

describe('workspaceConnectionMachine', () => {
  it('returns to idle when folder selection is cancelled', () => {
    const actor = createActor(workspaceConnectionMachine, {
      input: {
        registerWorkspace: vi.fn(),
        mountWorkspace: vi.fn(),
        prepareWorkspaceCatalog: vi.fn(),
      },
    });
    actor.start();
    actor.send({ type: 'beginSelection', operationId: 'req_cancelled' });
    actor.send({ type: 'selectionCancelled' });

    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toEqual({ phase: 'idle' });
    actor.stop();
  });

  it('publishes each truthful connection phase and resolves at catalog-ready', async () => {
    const registration = Promise.withResolvers<{
      workspace: Workspace;
      minted: boolean;
    }>();
    const mounting = Promise.withResolvers<void>();
    const discovery = Promise.withResolvers<{
      readonly projectCount: number;
      readonly candidateCount: number;
      readonly conflictCount: number;
      publish(): Promise<void>;
    }>();
    const publication = Promise.withResolvers<void>();
    let paint!: FrameRequestCallback;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      paint = callback;
      return 1;
    });
    const actor = createActor(workspaceConnectionMachine, {
      input: {
        registerWorkspace: async () => registration.promise,
        mountWorkspace: async () => mounting.promise,
        prepareWorkspaceCatalog: async () => discovery.promise,
      },
    });
    actor.start();
    actor.send({ type: 'beginSelection', operationId: 'req_1' });
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toEqual({
      phase: 'selecting',
      operationId: 'req_1',
    });

    actor.send({ type: 'workspaceSelected', operationId: 'req_1', selection });
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
      phase: 'registering',
      workspaceName: 'Workshop',
    });

    registration.resolve({ workspace, minted: true });
    await waitFor(actor, (snapshot) => snapshot.matches('mounting'));
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({ phase: 'mounting', workspace });

    mounting.resolve();
    await waitFor(actor, (snapshot) => snapshot.matches('browsing'));
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({ phase: 'browsing', workspace });
    paint(0);
    await waitFor(actor, (snapshot) => snapshot.matches('discovering'));

    discovery.resolve({
      projectCount: 104,
      candidateCount: 106,
      conflictCount: 2,
      publish: async () => publication.promise,
    });
    await waitFor(actor, (snapshot) => snapshot.matches('publishing'));
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
      phase: 'publishing',
      projectCount: 104,
      candidateCount: 106,
      conflictCount: 2,
    });

    publication.resolve();
    await waitFor(actor, (snapshot) => snapshot.matches('ready'));
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
      phase: 'ready',
      projectCount: 104,
      candidateCount: 106,
      conflictCount: 2,
      observation: 'starting',
    });
    actor.stop();
  });

  it('retains a registered workspace and resumes from a failed mount', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const mountWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Folder permission was revoked.', 'NotAllowedError'))
      .mockResolvedValueOnce(undefined);
    const actor = createActor(workspaceConnectionMachine, {
      input: {
        registerWorkspace: async () => ({ workspace, minted: true }),
        mountWorkspace,
        prepareWorkspaceCatalog: async () => ({
          projectCount: 1,
          candidateCount: 1,
          conflictCount: 0,
          publish: async () => undefined,
        }),
      },
    });
    actor.start();
    actor.send({ type: 'beginSelection', operationId: 'req_retry' });
    actor.send({ type: 'workspaceSelected', operationId: 'req_retry', selection });
    await waitFor(actor, (snapshot) => snapshot.matches('failed'));

    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
      phase: 'failed',
      workspace,
      failedPhase: 'mounting',
      retry: 'grant-access',
    });

    actor.send({ type: 'retry' });
    await waitFor(actor, (snapshot) => snapshot.matches('ready'));
    expect(mountWorkspace).toHaveBeenCalledTimes(2);
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({ phase: 'ready', workspace });
    actor.stop();
  });

  it('carries a picked node folder through registration and mounting', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const nodeSelection: DirectoryPick = { backend: 'node', path: '/Users/tester/Projects/Workshop/' };
    const nodeWorkspace: Workspace = { ...workspace, path: '/Users/tester/Projects/Workshop' };
    const registerWorkspace = vi.fn(async () => ({ workspace: nodeWorkspace, minted: true }));
    const mountWorkspace = vi.fn(async () => undefined);
    const actor = createActor(workspaceConnectionMachine, {
      input: {
        registerWorkspace,
        mountWorkspace,
        prepareWorkspaceCatalog: async () => ({
          projectCount: 2,
          candidateCount: 2,
          conflictCount: 0,
          publish: async () => undefined,
        }),
      },
    });
    actor.start();
    actor.send({ type: 'beginSelection', operationId: 'req_node' });
    actor.send({ type: 'workspaceSelected', operationId: 'req_node', selection: nodeSelection });

    // The absolute path is the only name a node pick has.
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
      phase: 'registering',
      workspaceName: 'Workshop',
    });

    await waitFor(actor, (snapshot) => snapshot.matches('ready'));
    expect(registerWorkspace).toHaveBeenCalledWith(nodeSelection, expect.any(AbortSignal));
    expect(mountWorkspace).toHaveBeenCalledWith(
      { workspace: nodeWorkspace, minted: true },
      nodeSelection,
      expect.any(AbortSignal),
    );
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
      phase: 'ready',
      workspace: nodeWorkspace,
      projectCount: 2,
    });
    actor.stop();
  });

  // Root onError (charter D23, B2; plan § 4 A4b)
  describe('root onError', () => {
    it('should keep the first fault, report it once, and keep answering', () => {
      const first = new Error('first fault');
      const second = new Error('second fault');
      const actor = createActor(workspaceConnectionMachine, {
        input: {
          registerWorkspace: vi.fn(
            async () =>
              new Promise<never>(() => {
                /* Registration never settles: the fault happens first. */
              }),
          ),
          mountWorkspace: vi.fn(),
          prepareWorkspaceCatalog: vi.fn(),
        },
      });
      /* Without a root onError the fault stops the actor; the observer keeps it from being rethrown. */
      actor.subscribe({ error: () => undefined });
      actor.start();
      actor.send({ type: 'beginSelection', operationId: 'req_first' });
      actor.send({ type: 'workspaceSelected', operationId: 'req_first', selection: faultingSelection(first) });
      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.fault).toBe('first fault');

      actor.send({ type: 'beginSelection', operationId: 'req_second' });
      actor.send({ type: 'workspaceSelected', operationId: 'req_second', selection: faultingSelection(second) });
      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.fault).toBe('first fault');
      expect(faults.reported).toEqual([first]);

      /* It still answers: a good pick registers. */
      actor.send({ type: 'beginSelection', operationId: 'req_good' });
      actor.send({ type: 'workspaceSelected', operationId: 'req_good', selection });
      expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
        phase: 'registering',
        operationId: 'req_good',
      });
      actor.stop();
    });
  });
});
