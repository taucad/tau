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
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { WorkerRevisionCommand, WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';

const hookState = vi.hoisted(() => ({
  projectId: 'project_test',
  fileManager: undefined as unknown,
  invalidateProjectedChats: vi.fn(),
  refreshFromStorage: vi.fn(async () => undefined),
  getChat: vi.fn(async (_chatId: string): Promise<{ id: string; checkoutId?: string } | undefined> => undefined),
}));
const revisionRoot = vi.hoisted(() => ({
  commands: [] as WorkerRevisionCommand[],
  admitted: [] as Array<{ turnId: string; chatId: string; runId: string; checkoutId?: string }>,
  refuse: undefined as string | undefined,
  /** Set by a test to keep an admission in flight while the page sends. */
  hold: undefined as PromiseWithResolvers<void> | undefined,
  /** Listeners the provider registered for the root's host-attested facts (W5). */
  eventListeners: new Set<(event: WorkerRevisionEvent) => void>(),
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
      status: () => undefined,
      subscribe: () => () => undefined,
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
  hookState.invalidateProjectedChats.mockClear();
  hookState.getChat.mockImplementation(async (chatId: string) => chats.find((chat) => chat.id === chatId));
  hookState.refreshFromStorage.mockClear();
  revisionRoot.commands.length = 0;
  revisionRoot.admitted.length = 0;
  revisionRoot.refuse = undefined;
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

  it('should hand an attach the claim its chat already holds', async () => {
    const { project } = fixture();
    bindFileManager(project);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    const prepared = await act(async () => result.current.prepare('chat_1', { turnId: 'turn_1' }));
    const attached = await act(async () => result.current.attachment('chat_1'));

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
