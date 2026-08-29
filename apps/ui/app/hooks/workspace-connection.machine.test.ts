import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, waitFor } from 'xstate';
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

afterEach(() => {
  vi.unstubAllGlobals();
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
      handle: FileSystemDirectoryHandle;
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

    actor.send({ type: 'workspaceSelected', operationId: 'req_1', handle });
    expect(selectWorkspaceConnectionState(actor.getSnapshot())).toMatchObject({
      phase: 'registering',
      workspaceName: 'Workshop',
    });

    registration.resolve({ workspace, handle, minted: true });
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
        registerWorkspace: async () => ({ workspace, handle, minted: true }),
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
    actor.send({ type: 'workspaceSelected', operationId: 'req_retry', handle });
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
});
