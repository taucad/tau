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
import { mock } from 'vitest-mock-extended';
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
  waitForRootedBridgeOpener,
} from '#providers/chat-workspace-authority-provider.js';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { WorkerRevisionCommand, WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';

const hookState = vi.hoisted(() => ({
  projectId: 'project_test',
  fileManager: undefined as unknown,
  invalidateProjectedChats: vi.fn(),
  refreshFromStorage: vi.fn(async () => undefined),
  getChat: vi.fn(async (_chatId: string): Promise<{ id: string; checkoutId?: string } | undefined> => undefined),
  patchChat: vi.fn(async (_chatId: string, _key: string, _value: unknown): Promise<undefined> => undefined),
}));
const revisionRoot = vi.hoisted(() => ({
  commands: [] as WorkerRevisionCommand[],
  admitted: [] as Array<{ turnId: string; chatId: string; runId: string; checkoutId?: string }>,
  refuse: undefined as string | undefined,
  /** Where the root places the turn; the project itself unless a test says otherwise. */
  placement: undefined as { checkoutId: string; root: string; baseRevisionId: string } | undefined,
  /**
   * What the checkout registry publishes — where each checkout's files are.
   *
   * The attach reads its root from here rather than from the workbench, so a
   * chat on a branch has to be named here to have any files at all (P2).
   */
  branches: [] as Array<{
    name: string;
    head: string | undefined;
    checkoutId: string | undefined;
    checkoutRoot: string | undefined;
    leaseChatIds: readonly string[];
  }>,
  /** Set by a test to keep an admission in flight while the page sends. */
  hold: undefined as PromiseWithResolvers<void> | undefined,
  /** Listeners the provider registered for the root's host-attested facts (W5). */
  eventListeners: new Set<(event: WorkerRevisionEvent) => void>(),
  /** Listeners waiting on the registry's own projection; a test publishes one. */
  statusListeners: new Set<() => void>(),
  /** Set by a test while the root has not yet answered its first projection. */
  unanswered: false,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => hookState.fileManager,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: hookState.projectId }),
}));
let chats = [{ id: 'chat_1', checkoutId: 'checkout-durable' }];
/* A fresh array on every render, exactly as react-query hands back a refetched
 * `data`. Anything the provider derives from it churns its context value. */
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats: [...chats] }) }));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    invalidateProjectedChats: hookState.invalidateProjectedChats,
    getChat: hookState.getChat,
    patchChat: hookState.patchChat,
  }),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ refreshFromStorage: hookState.refreshFromStorage }),
}));
const revisionClient = vi.hoisted(() => {
  let held: unknown;
  /* One client for the whole file: the real hook memoizes on project and
   * worker, so any identity churn a test observes is the provider's own. */
  return {
    stable: (created: unknown): unknown => {
      held ??= created;
      return held;
    },
  };
});
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () =>
    revisionClient.stable({
      status: () =>
        revisionRoot.unanswered
          ? undefined
          : {
              checkoutId: 'checkout-durable',
              checkoutRoot: '/projects/project_test',
              branches: revisionRoot.branches,
            },
      subscribe: (listener: () => void) => {
        revisionRoot.statusListeners.add(listener);
        return () => revisionRoot.statusListeners.delete(listener);
      },
      subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => {
        revisionRoot.eventListeners.add(listener);
        return () => revisionRoot.eventListeners.delete(listener);
      },
      subscribeToasts: () => () => undefined,
      admitTurn: async (input: { turnId: string; chatId: string; runId: string; checkoutId?: string }) => {
        revisionRoot.admitted.push(input);
        await revisionRoot.hold?.promise;
        if (revisionRoot.refuse !== undefined) {
          throw Object.assign(new Error(revisionRoot.refuse), { code: 'REVISION_PREPARE_FAILED' });
        }
        return (
          revisionRoot.placement ?? { checkoutId: 'live', root: '/projects/project_test', baseRevisionId: 'rev-base' }
        );
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
  /** A linked checkout's own files, mounted beside the project as the worker mounts one. */
  readonly linked: RootedFileSystem;
  readonly written: string[];
  readonly dispose: () => void;
};

const live: Fixture[] = [];

/** The registry's row for the linked checkout the fixture mounts beside the project. */
const branchRow = {
  name: 'fillet',
  head: 'rev-base',
  checkoutId: 'checkout-branch',
  checkoutRoot: '/checkouts/checkout-branch',
  leaseChatIds: [] as readonly string[],
};

/** Every root the page opened a rooted bridge at, so a bind at `''` is visible. */
const openedRoots: string[] = [];

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
  mountTable.mount('/checkouts/checkout-branch', provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:w3d-provider-test',
    providerBasePath: '.tau/checkouts/project_test/checkout-branch',
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
    linked: service.createRootedFileSystem('/checkouts/checkout-branch'),
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

const bindFileManager = (project: RootedFileSystem, linked?: RootedFileSystem): void => {
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
          openFileSystemBridge: (root?: string) => {
            openedRoots.push(root ?? '(none)');
            return createBridgePort(root === '/checkouts/checkout-branch' && linked !== undefined ? linked : project);
          },
        },
      }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
  };
};

beforeEach(() => {
  hookState.invalidateProjectedChats.mockClear();
  hookState.getChat.mockImplementation(async (chatId: string) => chats.find((chat) => chat.id === chatId));
  hookState.refreshFromStorage.mockClear();
  revisionRoot.commands.length = 0;
  revisionRoot.admitted.length = 0;
  revisionRoot.refuse = undefined;
  revisionRoot.placement = undefined;
  revisionRoot.unanswered = false;
  revisionRoot.branches = [
    {
      name: 'main',
      head: 'rev-base',
      checkoutId: 'checkout-durable',
      checkoutRoot: '/projects/project_test',
      leaseChatIds: [],
    },
  ];
  hookState.patchChat.mockClear();
  openedRoots.length = 0;
  revisionRoot.statusListeners.clear();
  chats = [{ id: 'chat_1', checkoutId: 'checkout-durable' }];
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
      {
        turnId: 'turn_1',
        chatId: 'chat_1',
        runId: expect.stringMatching(/^run_/u) as unknown as string,
        checkoutId: 'checkout-durable',
      },
    ]);
    expect(prepared.runId).toBe(revisionRoot.admitted[0]?.runId);
    expect(prepared.execution).toEqual({
      hostId: expect.any(String) as unknown as string,
      workspaceId: 'live',
      baseRevisionId: 'rev-base',
    });
    /* No revision mode on the wire: placement is non-branching by default. */
    expect(prepared.execution).not.toHaveProperty('mode');
  });

  /* The lease names the checkout; the files have to be that checkout's too. A
     branch turn that was handed the project's bridge wrote its work into the
     project, and the branch's own cut then found nothing to record. */
  it('should hand a turn placed on a branch that branch’s files, not the project’s', async () => {
    const { project, linked } = fixture();
    bindFileManager(project, linked);
    revisionRoot.placement = {
      checkoutId: 'checkout-branch',
      root: '/checkouts/checkout-branch',
      baseRevisionId: 'rev-base',
    };
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const prepared = await act(async () => result.current.prepare('chat_1', { turnId: 'turn_1' }));
    const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
    const proxy = createFileSystemBridgeProxy(prepared.openFileSystemBridge());
    await proxy.ready;
    await proxy.writeFile('proof.txt', 'made on the branch');
    proxy.dispose();

    expect(await linked.readFile('proof.txt', 'utf8')).toBe('made on the branch');
    expect(await project.exists('proof.txt')).toBe(false);
  });

  /* I7. Open-time discovery has to build a host client before it knows what the
     chat's log holds. Building it through `prepare` placed a turn at every chat
     open, and the run id that placement minted is one the host never admitted:
     the abandoned run's settlement named it and the durable log refused it
     (*"was never admitted in chat …"*), so `RUN_ABANDONED` never became a
     `turn.failed` and the saved-turn card had nothing behind it. */
  it('should compose an attach from the chat checkout without placing a turn', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const attached = await act(async () => result.current.attachment('chat_1'));

    expect(revisionRoot.admitted).toEqual([]);
    expect(attached?.runId).toBeUndefined();
    expect(attached?.execution).toEqual({
      hostId: expect.any(String) as unknown as string,
      workspaceId: 'checkout-durable',
    });
    expect(result.current.get('chat_1')).toBeUndefined();
  });

  it('should wait for the root’s first projection rather than attach to no checkout', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });
    /* The route opens the root only once the GitHub credential is minted (D36). */
    revisionRoot.unanswered = true;

    const attaching = result.current.attachment('chat_1');
    await act(async () => {
      /* Long enough for the attach to reach its status read. */
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
      revisionRoot.unanswered = false;
      for (const listener of revisionRoot.statusListeners) {
        listener();
      }
    });

    const attached = await attaching;
    expect(attached?.execution.workspaceId).toBe('checkout-durable');
  });

  it('should hand an attach the claim its chat already holds', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const prepared = await act(async () => result.current.prepare('chat_1', { turnId: 'turn_1' }));
    const attached = await act(async () => result.current.attachment('chat_1'));

    expect(attached).toBe(prepared);
    expect(revisionRoot.admitted).toHaveLength(1);
  });

  /* The claim is recorded only once `admitTurn` answers, so an attach composed
     while the placement is still in flight fell through to the fallback chain
     and handed the turn's own worker a `workspaceId` that is not the turn's —
     the wrong leadership scope, and the wrong parameter authority. `prepare`
     already reuses its in-flight operation; so does this. */
  it('should hand an attach the placement its chat is still taking', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const hold = Promise.withResolvers<void>();
    revisionRoot.hold = hold;
    const [prepared, attached] = await act(async () => {
      const placing = result.current.prepare('chat_inflight', { turnId: 'turn_inflight' });
      await waitFor(() => {
        expect(revisionRoot.admitted).toHaveLength(1);
      });
      const attaching = result.current.attachment('chat_inflight');
      hold.resolve();
      revisionRoot.hold = undefined;
      return Promise.all([placing, attaching]);
    });

    expect(attached).toBe(prepared);
    expect(revisionRoot.admitted).toHaveLength(1);
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
      await result.current.finalize('chat_1', 'run_browser_1');
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

    const done = await act(async () => result.current.prepare('chat_done', { turnId: 'turn_done' }));
    await act(async () => result.current.finalize('chat_done', done.runId));
    const gone = await act(async () => result.current.prepare('chat_gone', { turnId: 'turn_gone' }));
    await act(async () => result.current.discard('chat_gone', gone.runId));
    const dead = await act(async () => result.current.prepare('chat_dead', { turnId: 'turn_dead' }));
    await act(async () => result.current.retireClaim('chat_dead', dead.runId));

    expect(revisionRoot.commands).toEqual([
      { command: 'turnCompleted', turnId: 'turn_done' },
      { command: 'turnAbandoned', turnId: 'turn_gone' },
      { command: 'turnAbandoned', turnId: 'turn_dead' },
    ]);
    expect(result.current.get('chat_done')).toBeUndefined();
    expect(result.current.get('chat_gone')).toBeUndefined();
  });

  it('should refuse a settlement that names a run the current claim is not', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const first = await act(async () => result.current.prepare('chat_roll', { turnId: 'turn_roll_1' }));
    await act(async () => result.current.discard('chat_roll', first.runId));
    const second = await act(async () => result.current.prepare('chat_roll', { turnId: 'turn_roll_2' }));
    /* The first run's settlement, decided while the second turn is already
     * placed. It may not reach the second turn's lease — and it may not answer
     * its caller as though the lease were released either: refusing with a
     * `console.warn` left the settlement believing it had retired a lease that
     * was still held, so nothing ever retried and every later turn of the chat
     * died on the stale claim (T3-amp). */
    await expect(act(async () => result.current.finalize('chat_roll', first.runId))).rejects.toThrow(
      /does not name chat/u,
    );

    expect(revisionRoot.commands).toEqual([{ command: 'turnAbandoned', turnId: 'turn_roll_1' }]);
    expect(result.current.get('chat_roll')).toMatchObject({ runId: second.runId });
  });

  /*
   * I1: a continuation is a second attempt at the run the host already holds,
   * so it names that run when it takes its lease. Reusing a claim keyed by a
   * *different* run would fence its writes under the wrong id and make its
   * settlement name a run `drop` is not holding — so the claim is either that
   * run's, or the continuation is refused.
   */
  it('should lease a continuation under the run it names, and refuse another turn’s claim', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const held = await act(async () => result.current.prepare('chat_continue', { turnId: 'turn_continue' }));

    // The same run continued: the claim it already holds is the one it wants.
    await expect(
      act(async () => result.current.prepare('chat_continue', { turnId: 'turn_continue', runId: held.runId })),
    ).resolves.toMatchObject({ runId: held.runId });

    await expect(
      act(async () => result.current.prepare('chat_continue', { turnId: 'turn_continue', runId: 'run_somebody_else' })),
    ).rejects.toMatchObject({ code: 'CHAT_CLAIM_RUN_MISMATCH' });

    // A fresh lease carries the run the caller named rather than minting one.
    await act(async () => result.current.discard('chat_continue', held.runId));
    const continued = await act(async () =>
      result.current.prepare('chat_continue', { turnId: 'turn_continue', runId: 'run_host_holds' }),
    );

    expect(continued.runId).toBe('run_host_holds');
    expect(revisionRoot.admitted.at(-1)).toMatchObject({ turnId: 'turn_continue', runId: 'run_host_holds' });
  });

  /* Discovery is the one caller that may name a run the claim is not: it reads
   * `reclaimAll` and then retires, and the claim can roll over in between. It
   * tolerates the refusal; a settlement does not. */
  it('should let discovery retire a claim that rolled over without failing', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const first = await act(async () => result.current.prepare('chat_retire', { turnId: 'turn_retire_1' }));
    await act(async () => result.current.discard('chat_retire', first.runId));
    const second = await act(async () => result.current.prepare('chat_retire', { turnId: 'turn_retire_2' }));

    await act(async () => result.current.retireClaim('chat_retire', first.runId));

    expect(revisionRoot.commands).toEqual([{ command: 'turnAbandoned', turnId: 'turn_retire_1' }]);
    expect(result.current.get('chat_retire')).toMatchObject({ runId: second.runId });
  });

  it('should keep its context value identity-stable across a chats refetch', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result, rerender } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });
    const published = result.current;

    chats = [{ id: 'chat_1', checkoutId: 'checkout-durable' }];
    rerender();

    expect(result.current.prepare).toBe(published.prepare);
    expect(result.current).toBe(published);
    /* Identity stability may not cost the placement its checkout. */
    await act(async () => result.current.prepare('chat_1', { turnId: 'turn_stable' }));
    expect(revisionRoot.admitted.at(-1)).toMatchObject({ checkoutId: 'checkout-durable' });
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
    await act(async () => result.current.finalize('chat_race', revisionRoot.admitted[0]?.runId));
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
  it('should feed every host-attested settlement from the revision root into the shared store', async () => {
    const { project } = fixture();
    bindFileManager(project);
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const settlements: readonly WorkerRevisionEvent[] = [
      {
        type: 'turn.finalized',
        turnId: 'turn_wire',
        runId: 'run_wire',
        chatId: 'chat_wire',
        projectId: 'project_test',
        checkoutId: 'live',
        revisionId: 'rev-wire',
        changedPaths: ['main.scad'],
        trigger: 'turn',
        runIds: ['run_wire'],
      },
      {
        type: 'turn.failed',
        turnId: 'turn_failed',
        runId: 'run_failed',
        chatId: 'chat_failed',
        checkoutId: 'live',
        reason: 'revision cut failed',
      },
      {
        type: 'turn.conflicted',
        turnId: 'turn_conflicted',
        runId: 'run_conflicted',
        chatId: 'chat_conflicted',
        checkoutId: 'live',
      },
    ];
    const transport = await import('#chat-clients/_internal/browser-agent-host-transport.js');
    const observed: WorkerRevisionEvent[] = [];
    const unsubscribe = transport.subscribeHostTurnSettlements((event) => observed.push(event));
    for (const settlement of settlements) {
      for (const listener of revisionRoot.eventListeners) {
        listener(settlement);
      }
    }
    for (const listener of revisionRoot.eventListeners) {
      listener({ type: 'chats.projected', projectId: 'project_test', chatIds: ['chat_remote'] });
    }
    await waitFor(() => {
      expect(observed).toEqual(settlements);
    });
    unsubscribe();
    expect(hookState.invalidateProjectedChats).toHaveBeenCalledWith('project_test', ['chat_remote']);
    expect(hookState.refreshFromStorage).toHaveBeenCalledWith('chat_remote');
    expect(transport.getHostFinalizedTurns().map((entry) => entry.turnId)).toContain('turn_wire');
  });

  /**
   * F5: a settlement the chat's durable log refuses is not a fact. Recording it
   * anyway put page memory and the log permanently at odds — and because
   * `getHostFinalizedTurns()` is read as "the host already attested this run",
   * the next settlement of that run discarded instead of publishing.
   */
  it('should not remember a settlement the durable chat log refused', async () => {
    const { project } = fixture();
    bindFileManager(project);
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const transport = await import('#chat-clients/_internal/browser-agent-host-transport.js');
    const refused = vi
      .spyOn(transport, 'persistBrowserTurnSettlement')
      .mockRejectedValue(new Error('SETTLEMENT_WITHOUT_RUN'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const observed: WorkerRevisionEvent[] = [];
    const unsubscribe = transport.subscribeHostTurnSettlements((event) => observed.push(event));

    for (const listener of revisionRoot.eventListeners) {
      listener({
        type: 'turn.finalized',
        turnId: 'turn_refused',
        runId: 'run_refused',
        chatId: 'chat_refused',
        projectId: 'project_test',
        checkoutId: 'live',
        revisionId: 'rev-refused',
        changedPaths: ['main.scad'],
        trigger: 'turn',
        runIds: ['run_refused'],
      });
    }

    await waitFor(() => {
      expect(refused).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });
    expect(observed).toEqual([]);
    expect(transport.getHostFinalizedTurns().map((entry) => entry.turnId)).not.toContain('turn_refused');

    unsubscribe();
    refused.mockRestore();
    consoleError.mockRestore();
  });

  it('should adopt a finalized daemon turn into the browser revision projection', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const transport = await import('#chat-clients/_internal/browser-agent-host-transport.js');

    act(() => {
      transport.recordHostTurnSettlement({
        type: 'turn.finalized',
        turnId: 'turn_daemon',
        runId: 'run_daemon',
        chatId: 'chat_daemon',
        projectId: 'project_test',
        checkoutId: 'live',
        revisionId: 'rev-daemon',
        treeId: 'tree-daemon',
        branch: 'main',
        changedPaths: ['main.scad'],
        trigger: 'turn',
        runIds: ['run_daemon'],
      });
    });
    /* A seeded turn can settle while the project is still being renamed. The
     * final project provider mounts afterward and must replay that retained
     * settlement rather than waiting for another turn. */
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    expect(revisionRoot.commands).toContainEqual({
      command: 'adoptHostFinalized',
      checkoutId: 'live',
      revisionId: 'rev-daemon',
      treeId: 'tree-daemon',
      branch: 'main',
    });
  });

  /* Q1: the attach handed every chat the workbench's own files whatever
     checkout it named, so a chat on a branch read and wrote the project's tree
     at open. The registry publishes each checkout's root; the attach asks it,
     exactly as the placement does (revisions policy Rule 3). */
  it('should attach a chat on a branch to that branch’s files, not the project’s', async () => {
    const { project, linked } = fixture();
    bindFileManager(project, linked);
    chats = [{ id: 'chat_1', checkoutId: 'checkout-branch' }];
    revisionRoot.branches.push(branchRow);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const attached = await act(async () => result.current.attachment('chat_1'));
    if (attached === undefined) {
      throw new Error('the attach answered no workspace');
    }
    const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
    const proxy = createFileSystemBridgeProxy(attached.openFileSystemBridge());
    await proxy.ready;
    await proxy.writeFile('attached.txt', 'read at chat open');
    proxy.dispose();

    expect(attached.execution.workspaceId).toBe('checkout-branch');
    expect(await linked.readFile('attached.txt', 'utf8')).toBe('read at chat open');
    expect(await project.exists('attached.txt')).toBe(false);
  });

  /* P1/Q2: the person picked the branch before they pressed send. The picker's
     write landed an effect and a storage round-trip later, so a send fired in
     between leased the project. The intent is the authority's now, and an
     admission that arrives while it settles waits for it. */
  it('should place a turn on the branch the chat is moving to, waiting for it', async () => {
    const { project, linked } = fixture();
    bindFileManager(project, linked);
    revisionRoot.branches.push(branchRow);
    revisionRoot.placement = {
      checkoutId: 'checkout-branch',
      root: '/checkouts/checkout-branch',
      baseRevisionId: 'rev-base',
    };
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const settling = Promise.withResolvers<Readonly<{ checkoutId: string }>>();
    const placed = result.current.placeChat('chat_1', settling.promise);
    /* A chat with nothing settling admits inside the same flush, so the wait
       below is the placement's and not the harness's. */
    const control = result.current.prepare('chat_control');
    const waiting = result.current.prepare('chat_1', { turnId: 'turn_1' });
    await act(async () => {
      await control;
    });

    expect(revisionRoot.admitted.map((admission) => admission.chatId)).toEqual(['chat_control']);

    settling.resolve({ checkoutId: 'checkout-branch' });
    const prepared = await act(async () => {
      await placed;
      return waiting;
    });

    expect(revisionRoot.admitted.at(-1)).toMatchObject({ chatId: 'chat_1', checkoutId: 'checkout-branch' });
    expect(prepared.execution.workspaceId).toBe('checkout-branch');
    expect(hookState.patchChat.mock.calls).toEqual([['chat_1', 'checkoutId', 'checkout-branch']]);
  });

  /* E2: the turn is refused with the branch's own reason rather than quietly
     run on the checkout the person did not choose (I-EDIT). */
  it('should refuse the turn when the branch it was moving to was refused', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const settling = Promise.withResolvers<Readonly<{ checkoutId: string }>>();
    const placed = result.current.placeChat('chat_1', settling.promise);
    const turn = result.current.prepare('chat_1', { turnId: 'turn_1' });
    /* The port's own diagnostic, verbatim — what the worker actually relays. */
    settling.reject(
      Object.assign(new Error('Branch x is unborn; a checkout of it needs an explicit base revision.'), {
        code: 'BRANCH_NEEDS_REVISION',
      }),
    );

    const refusal = await act(async () => turn.catch((error: unknown) => error));

    expect(refusal).toMatchObject({ code: 'BRANCH_NEEDS_REVISION' });
    /* P4: the code crosses, the words are the page's. The card renders
       `error.message`, so the diagnostic must not be it (review W8 finding 2). */
    expect((refusal as Error).message).toBe(describeRevisionFailure('branch', 'BRANCH_NEEDS_REVISION').description);
    expect((refusal as Error).message).not.toMatch(/checkout|unborn/iu);
    /* The refusal is the toast channel's and the turn's; `placeChat` itself
       settles quietly so no caller is handed a second copy to report. */
    await expect(placed).resolves.toBeUndefined();
    expect(revisionRoot.admitted).toEqual([]);
    expect(hookState.patchChat).not.toHaveBeenCalled();
  });

  it('should write a chat’s checkout once when it is placed by id', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await act(async () => result.current.placeChat('chat_1', 'checkout-branch'));

    expect(hookState.patchChat.mock.calls).toEqual([['chat_1', 'checkoutId', 'checkout-branch']]);
  });

  /* Lane x1 §1: the seeded chat's checkout lived only in the in-memory
     conflict map, so a reload dropped that chat onto the live checkout. The
     conflict's terms ride one turn; its placement is durable. */
  it('should persist the checkout a conflict chat is seeded onto', async () => {
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

    await waitFor(() => {
      expect(hookState.patchChat.mock.calls).toEqual([['chat_fix', 'checkoutId', 'checkout-fillet']]);
    });
  });

  /* Review W8 finding 7: the map entry was identity-guarded but the record
     write was not, so a slow *New branch* settling after a quick pick wrote the
     branch the person had already moved away from. */
  it('should let no placement the chat has moved on from write its checkout', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const slow = Promise.withResolvers<Readonly<{ checkoutId: string }>>();
    const stale = result.current.placeChat('chat_1', slow.promise);
    await act(async () => result.current.placeChat('chat_1', 'checkout-quick'));
    slow.resolve({ checkoutId: 'checkout-slow' });
    await act(async () => stale);

    expect(hookState.patchChat.mock.calls).toEqual([['chat_1', 'checkoutId', 'checkout-quick']]);
  });

  /* Review W8 finding 14: the branch verb answers with the checkout's root and
     the projection that names it is published a beat later, so a chat opened in
     between had no files at all. The answered root is kept and consulted after
     the registry's own rows. */
  it('should attach a chat to the root the branch it was placed on answered with', async () => {
    const { project, linked } = fixture();
    bindFileManager(project, linked);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await act(async () =>
      result.current.placeChat(
        'chat_1',
        Promise.resolve({ checkoutId: 'checkout-branch', checkoutRoot: '/checkouts/checkout-branch' }),
      ),
    );
    /* The record the authority just wrote; the registry still names no branch. */
    chats = [{ id: 'chat_1', checkoutId: 'checkout-branch' }];
    const attached = await act(async () => result.current.attachment('chat_1'));
    if (attached === undefined) {
      throw new Error('the attach answered no workspace');
    }
    const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
    const proxy = createFileSystemBridgeProxy(attached.openFileSystemBridge());
    await proxy.ready;
    await proxy.writeFile('attached.txt', 'read before the projection caught up');
    proxy.dispose();

    expect(attached.execution.workspaceId).toBe('checkout-branch');
    expect(await linked.readFile('attached.txt', 'utf8')).toBe('read before the projection caught up');
  });

  /* And it is kept only until the registry has spoken for itself: a checkout
     discarded or renamed after the branch answered is gone, and the remembered
     root is then a path to nothing. The next projection drops it. */
  it('should forget a placement’s root once a projection no longer names its checkout', async () => {
    const { project, linked } = fixture();
    bindFileManager(project, linked);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await act(async () =>
      result.current.placeChat(
        'chat_1',
        Promise.resolve({ checkoutId: 'checkout-branch', checkoutRoot: '/checkouts/checkout-branch' }),
      ),
    );
    chats = [{ id: 'chat_1', checkoutId: 'checkout-branch' }];
    /* The registry publishes, and its rows name only the project itself. */
    await act(async () => {
      for (const listener of revisionRoot.statusListeners) {
        listener();
      }
    });

    await expect(act(async () => result.current.attachment('chat_1'))).resolves.toBeUndefined();
  });

  /* A discarded checkout has no files to attach to, which is the same answer
     as no checkout at all — the caller turns both into *this chat has nothing
     to run or replay a turn on*. */
  it('should answer nothing for an attach whose checkout the registry no longer names', async () => {
    const { project } = fixture();
    bindFileManager(project);
    chats = [{ id: 'chat_1', checkoutId: 'checkout-discarded' }];
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await expect(act(async () => result.current.attachment('chat_1'))).resolves.toBeUndefined();
  });

  /* Lane x3 §4: a non-`placement` reply degrades to `root: ''` at the
     worker seam, and `''` is not the project's root — it is the authority's own
     origin, which is every project's files at once. A placement with no root is
     refused rather than opened. */
  it('should refuse a placement with no root rather than bind the project', async () => {
    const { project } = fixture();
    bindFileManager(project);
    revisionRoot.placement = { checkoutId: 'checkout-branch', root: '', baseRevisionId: '' };
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await expect(act(async () => result.current.prepare('chat_1', { turnId: 'turn_1' }))).rejects.toMatchObject({
      code: 'PLACEMENT_UNROOTED',
      /* The words are the table's, not this call site's: two layers refuse an
         unrooted placement and a person must read one sentence (P4, Rule 1). */
      message: describeRevisionFailure('turn', 'PLACEMENT_UNROOTED').description,
    });
    expect(result.current.get('chat_1')).toBeUndefined();
    expect(openedRoots).not.toContain('');
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

describe('waitForRootedBridgeOpener', () => {
  type FileManagerSnapshot = ReturnType<FileManagerRef['getSnapshot']>;

  /** A file-manager actor that never mints the opener, with the context a test dictates. */
  const openerlessFileManager = (error?: Error): FileManagerRef =>
    mock<FileManagerRef>({
      getSnapshot: () =>
        mock<FileManagerSnapshot>({
          context: mock<FileManagerSnapshot['context']>({ error, openFileSystemBridge: undefined }),
        }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    });

  it('should reject the rooted bridge wait when the file manager fails', async () => {
    await expect(waitForRootedBridgeOpener(openerlessFileManager(new Error('worker crashed')))).rejects.toThrow(
      'worker crashed',
    );
  });

  it('should reject the rooted bridge wait when no opener arrives within the timeout', async () => {
    vi.useFakeTimers();
    try {
      const pending = expect(waitForRootedBridgeOpener(openerlessFileManager())).rejects.toThrow(
        'did not finish starting',
      );

      await vi.advanceTimersByTimeAsync(30_000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});
