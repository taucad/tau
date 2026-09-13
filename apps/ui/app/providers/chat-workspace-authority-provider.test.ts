/**
 * The page's chat-turn authority, after W3d.
 *
 * The provider no longer owns revisions, materialized workspaces, modes or
 * claims: it places a turn on the worker's revision root and holds the
 * per-document bookkeeping the chat client and the settlement effect read. So
 * these are the claims that survive the move — `prepare` is one `admitTurn`,
 * the turn's placement is what rides the wire, `finalize`/`discard` are the
 * root's `turnCompleted`/`turnAbandoned`, and **no `.tau/workspaces` path is
 * ever written**, because nothing in the page writes a claim file any more.
 *
 * What the turn actually records is proved against the real machine tree in
 * `app/machines/file-manager.worker.revisions.test.ts`; here the root is a
 * scripted client, because the claim is about the page's half of the seam.
 */

import { createElement } from 'react';
import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderCapabilities, RootedFileSystem } from '@taucad/filesystem';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileSystemClientFacade } from '#hooks/use-file-manager.js';
import {
  ChatWorkspaceAuthorityProvider,
  browserWorkspaceAuthorityTestApi,
  createPreparedWorkspaceFileSystems,
  readRootedBridgeCapabilities,
  useChatWorkspaceAuthority,
  usePreparedChatWorkspace,
} from '#providers/chat-workspace-authority-provider.js';
import type { WorkerRevisionCommand } from '#machines/file-manager.worker.revisions.js';

const hookState = vi.hoisted(() => ({
  projectId: 'project_test',
  fileManager: undefined as unknown,
}));
const revisionRoot = vi.hoisted(() => ({
  commands: [] as WorkerRevisionCommand[],
  admitted: [] as Array<{ turnId: string; chatId: string; runId: string }>,
  refuse: undefined as string | undefined,
  /** Set by a test to keep an admission in flight while the page sends. */
  hold: undefined as PromiseWithResolvers<void> | undefined,
  /** Listeners the provider registered for the root's host-attested facts (W5). */
  eventListeners: new Set<(event: { type: string }) => void>(),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => hookState.fileManager,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: hookState.projectId }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => ({
    status: () => undefined,
    subscribe: () => () => undefined,
    subscribeEvents: (listener: (event: { type: string }) => void) => {
      revisionRoot.eventListeners.add(listener);
      return () => revisionRoot.eventListeners.delete(listener);
    },
    subscribeToasts: () => () => undefined,
    admitTurn: async (input: { turnId: string; chatId: string; runId: string }) => {
      revisionRoot.admitted.push(input);
      await revisionRoot.hold?.promise;
      if (revisionRoot.refuse !== undefined) {
        throw Object.assign(new Error(revisionRoot.refuse), { code: 'REVISION_PREPARE_FAILED' });
      }
      return { checkoutId: 'live', root: '/projects/project_test', baseRevisionId: 'rev-base' };
    },
    send: (command: WorkerRevisionCommand) => revisionRoot.commands.push(command),
    close: () => undefined,
  }),
}));

const client = (exists: ReturnType<typeof vi.fn>): FileSystemClientFacade =>
  ({ exists }) as unknown as FileSystemClientFacade;

const capabilities: ProviderCapabilities = {
  persistent: false,
  writable: true,
  quotaBased: false,
  durability: 'ephemeral',
};

type Fixture = {
  readonly project: RootedFileSystem;
  readonly written: string[];
  readonly dispose: () => void;
};

const live: Fixture[] = [];

/** The revision root lives in the worker; the page needs only its handle. */
const workerStub: Worker = { postMessage: () => undefined } as unknown as Worker;

/**
 * The project's working copy, and a log of every path the page writes through
 * it — the evidence for "no `.tau/workspaces` path is ever written".
 */
const fixture = (): Fixture => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  mountTable.mount('/projects/project_test', provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:w3d-provider-test',
  });
  const eventBus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  const rooted = service.createRootedFileSystem('/projects/project_test');
  const written: string[] = [];
  const project: RootedFileSystem = {
    ...rooted,
    writeFile: async (path, data) => {
      written.push(path);
      return rooted.writeFile(path, data);
    },
    appendFile: async (path, data) => {
      written.push(path);
      return rooted.appendFile?.(path, data);
    },
    mkdir: async (path, options) => {
      written.push(path);
      return rooted.mkdir(path, options);
    },
  };
  const created: Fixture = {
    project,
    written,
    dispose: () => {
      service.dispose();
      provider.dispose();
      eventBus.dispose();
    },
  };
  live.push(created);
  return created;
};

const wrapper =
  () =>
  ({ children }: PropsWithChildren): React.JSX.Element =>
    createElement(ChatWorkspaceAuthorityProvider, undefined, children);

/** The project's own rooted bridge port, as the file-manager machine opens one. */
const createBridgePort = (project: RootedFileSystem): ReturnType<typeof createFileSystemBridgePort> => {
  const { watch: _watch, ...handlers } = project;
  return createFileSystemBridgePort(handlers as Parameters<typeof createFileSystemBridgePort>[0]);
};

const bindFileManager = (project: RootedFileSystem): void => {
  hookState.fileManager = {
    client: client(vi.fn(async () => false)),
    backendType: 'memory',
    workspace: { syncProjectRoots: vi.fn(async () => undefined) },
    fileManagerRef: {
      getSnapshot: () => ({
        context: {
          rootDirectory: '/projects/project_test',
          proxy: undefined,
          worker: workerStub,
          /* The rooted bridge the authority reads capabilities and bytes over. */
          openFileSystemBridge: () => createBridgePort(project),
        },
      }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
  };
};

beforeEach(() => {
  revisionRoot.commands.length = 0;
  revisionRoot.admitted.length = 0;
  revisionRoot.refuse = undefined;
  browserWorkspaceAuthorityTestApi.reset();
});

afterEach(() => {
  for (const entry of live.splice(0)) {
    entry.dispose();
  }
  vi.restoreAllMocks();
});

describe('ChatWorkspaceAuthorityProvider (north star W3d)', () => {
  it('should place a turn with one admitTurn and publish its checkout', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const prepared = await act(async () => result.current.prepare('chat_1', { turnId: 'turn_1' }));

    expect(revisionRoot.admitted).toEqual([
      { turnId: 'turn_1', chatId: 'chat_1', runId: expect.stringMatching(/^run_/u) as unknown as string },
    ]);
    expect(prepared.execution).toEqual({
      hostId: expect.any(String) as unknown as string,
      workspaceId: 'live',
      baseRevisionId: 'rev-base',
    });
    /* No revision mode on the wire: placement is non-branching by default. */
    expect(prepared.execution).not.toHaveProperty('mode');
  });

  /* AC14's second clause: *Ask chat to resolve* is only a real control if the
     turn it seeds can see the conflict. The page binds it to the chat before
     the first turn is placed, and it rides the placement — the turn lands on
     the conflicted branch's own checkout, and the body names the revision the
     agent must read the three terms from (review R2, P42). */
  it('should carry the conflict a chat was seeded to resolve into its turn placement', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    act(() => {
      result.current.bindConflict('chat_fix', {
        revisionId: 'rev-conflicted',
        paths: ['src/bracket.ts'],
        checkoutId: 'checkout-fillet',
      });
    });
    const prepared = await act(async () => result.current.prepare('chat_fix', { turnId: 'turn_1' }));

    expect(revisionRoot.admitted.at(-1)).toMatchObject({ chatId: 'chat_fix', checkoutId: 'checkout-fillet' });
    expect(prepared.execution).toMatchObject({
      conflict: { revisionId: 'rev-conflicted', paths: ['src/bracket.ts'] },
    });
  });

  /* eslint-disable no-restricted-syntax -- the retired directory is this case's subject: the pin has to name the path it refuses. */
  it('should never write the retired materialized-workspace directory', async () => {
    const { project, written } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await act(async () => result.current.prepare('chat_1', { turnId: 'turn_1' }));
    await act(async () => {
      await result.current.markAdmitted('chat_1', 'turn_1');
      await result.current.markRunId('chat_1', 'run_browser_1');
      await result.current.finalize('chat_1');
    });

    expect(written.filter((path) => path.includes('.tau/workspaces'))).toEqual([]);
    /* Stronger than the pin: the page writes *nothing* through the project's
     * working copy any more — the lease and the revision are the worker's. */
    expect(written).toEqual([]);
  });
  /* eslint-enable no-restricted-syntax -- back on for the rest of the file. */

  it('should reuse one placement per chat and answer concurrent prepares once', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const [first, second] = await act(async () =>
      Promise.all([result.current.prepare('chat_1'), result.current.prepare('chat_1')]),
    );
    const third = await act(async () => result.current.prepare('chat_1'));

    expect(revisionRoot.admitted).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('should settle a turn with turnCompleted and abandon one with turnAbandoned', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await act(async () => result.current.prepare('chat_done', { turnId: 'turn_done' }));
    await act(async () => result.current.finalize('chat_done'));
    await act(async () => result.current.prepare('chat_gone', { turnId: 'turn_gone' }));
    await act(async () => result.current.discard('chat_gone'));
    await act(async () => result.current.prepare('chat_dead', { turnId: 'turn_dead' }));
    await act(async () => result.current.retireClaim('chat_dead'));

    expect(revisionRoot.commands).toEqual([
      { command: 'turnCompleted', turnId: 'turn_done' },
      { command: 'turnAbandoned', turnId: 'turn_gone' },
      { command: 'turnAbandoned', turnId: 'turn_dead' },
    ]);
    expect(result.current.get('chat_done')).toBeUndefined();
    expect(result.current.get('chat_gone')).toBeUndefined();
  });

  it('should send a completion that arrives while the turn is still being placed', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    /* The run finished before its own admission resolved. Dropped here, the
       lease is never retired and the turn waits out the root's cut bound
       (W3c §7.2); the root holds it behind `leased` (W6 moves the buffer into
       the machine). */
    revisionRoot.hold = Promise.withResolvers<void>();
    const preparing = act(async () => result.current.prepare('chat_race', { turnId: 'turn_race' }));
    await waitFor(() => {
      expect(revisionRoot.admitted).toHaveLength(1);
    });
    await act(async () => result.current.finalize('chat_race'));
    revisionRoot.hold.resolve();
    revisionRoot.hold = undefined;
    await preparing;

    expect(revisionRoot.commands).toEqual([{ command: 'turnCompleted', turnId: 'turn_race' }]);
    expect(result.current.get('chat_race')).toBeUndefined();
  });

  it('should refuse a turn the root could not place rather than run it unrecorded', async () => {
    const { project } = fixture();
    bindFileManager(project);
    revisionRoot.refuse = 'the checkout is held';
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await expect(act(async () => result.current.prepare('chat_refused'))).rejects.toThrow('the checkout is held');
    expect(result.current.get('chat_refused')).toBeUndefined();
    /* A refused placement must not wedge the chat: the next submit retries. */
    revisionRoot.refuse = undefined;
    await act(async () => result.current.prepare('chat_refused'));
    expect(revisionRoot.admitted).toHaveLength(2);
  });

  it('should keep admission bookkeeping identity-stable so a no-op update never notifies', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => usePreparedChatWorkspace('chat_1'), { wrapper: wrapper() });
    const authority = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await act(async () => authority.result.current.prepare('chat_1', { turnId: 'turn_1' }));
    await act(async () => authority.result.current.markRunId('chat_1', 'run_1'));
    await waitFor(() => {
      expect(result.current?.runId).toBe('run_1');
    });
    const published = result.current;
    await act(async () => authority.result.current.markRunId('chat_1', 'run_1'));

    expect(result.current).toBe(published);
  });

  it('should follow a chat onto the checkout its turns land on', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    act(() => {
      result.current.followChat('chat_1');
    });

    expect(revisionRoot.commands).toEqual([{ command: 'followChat', chatId: 'chat_1' }]);
  });

  /**
   * One store for both transports (S9, W5): a turn this document placed settles
   * in the worker and arrives on the revision port; a turn a remote host placed
   * arrives as a `turn.finalized` record in the chat's durable log. The provider
   * owns only the first wire, and this is it.
   */
  it('should feed a host-attested settlement from the revision root into the finalized-turn store', async () => {
    const { project } = fixture();
    bindFileManager(project);
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const settlement = {
      type: 'turn.finalized',
      turnId: 'turn_wire',
      runId: 'run_wire',
      chatId: 'chat_wire',
      projectId: 'project_test',
      revisionId: 'rev-wire',
      changedPaths: ['main.scad'],
      trigger: 'turn',
      runIds: ['run_wire'],
    };
    for (const listener of revisionRoot.eventListeners) {
      listener(settlement);
    }

    const { getHostFinalizedTurns } = await import('#chat-clients/_internal/browser-agent-host-transport.js');
    expect(getHostFinalizedTurns().map((entry) => entry.turnId)).toContain('turn_wire');
  });

  it('should answer nothing for a chat it never prepared', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await expect(result.current.reclaim('chat_absent')).resolves.toBeUndefined();
    await expect(result.current.reclaimAll()).resolves.toEqual([]);
  });
});

describe('the project working copy the page hands the browser agent host', () => {
  it('should bridge an already-rooted filesystem without rebuilding a path', async () => {
    const { project } = fixture();
    await project.writeFile('main.scad', 'cube(10);');

    const prepared = await createPreparedWorkspaceFileSystems(project);
    const proxyModule = await import('@taucad/fs-bridge');
    const proxy = proxyModule.createFileSystemBridgeProxy(prepared.openFileSystemBridge());
    await proxy.ready;

    await expect(proxy.readFile('main.scad', 'utf8')).resolves.toBe('cube(10);');
    proxy.dispose();
  });

  it('should read the selected provider capabilities from the rooted bridge hello', async () => {
    const { project } = fixture();
    const prepared = await createPreparedWorkspaceFileSystems(project);

    await expect(readRootedBridgeCapabilities(prepared.openFileSystemBridge)).resolves.toMatchObject({
      writable: capabilities.writable,
    });
  });
});
