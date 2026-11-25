/**
 * The library's project commands (app state orchestration charter D9; plan § 4 A4a; inventory L7).
 *
 * Create, duplicate, delete, restore, adopt, repair and rename are `ProjectLibrary` commands since A4a. The rows here
 * are the ones no React tree can answer for: the quiescence check a delete runs and the session close before it ask
 * the registry and the chat store the library was built with, with nothing mounted (row L7). Each command's own
 * behaviour is pinned through the hook suites, which call it through `useProjectManager()`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { mock } from 'vitest-mock-extended';
import type { Chat } from '@taucad/chat';
import { ProjectLibrary } from '#runtime/project-library.js';
import type { ProjectLibraryServices } from '#runtime/project-library.js';
import { testRootFiles } from '#runtime/project-library.fixture.js';
import type { ProjectLibraryChatSessions, ProjectLibrarySessions } from '#runtime/project-library-commands.js';
import type { ProjectLibraryRootFacade, ProjectLibraryWorker } from '#types/project-library-io.types.js';
import type { ChatStorage } from '#types/chat-storage.types.js';

/** The chats each record client's store holds; a client with none holds no chats. */
const stores = vi.hoisted(() => new WeakMap<WeakKey, readonly unknown[]>());

/** The headless half (W30): each chat's own log, and the lease the commands take over it. */
const logs = vi.hoisted(() => new Map<string, string>());
const leases = vi.hoisted(() => ({
  ledElsewhere: undefined as string | undefined,
  taken: [] as Array<Readonly<{ projectId: string; chatIds: readonly string[] }>>,
  released: 0,
}));
/* The log's fold is `unsettledLogRun`'s own suite (`@taucad/agent-host`); here a log names its run's state. */
vi.mock('@taucad/agent-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  unsettledLogRun: (bytes: Uint8Array<ArrayBuffer>) =>
    new TextDecoder().decode(bytes) === 'running' ? { runId: 'run_1', state: 'running' } : undefined,
}));
vi.mock('@taucad/agent-host/browser', () => ({
  leaseChatLogs: async (input: { projectId: string; chatIds: readonly string[] }) => {
    if (leases.ledElsewhere !== undefined) {
      return { status: 'led-elsewhere', chatId: leases.ledElsewhere };
    }
    leases.taken.push(input);
    return {
      status: 'held',
      lost: () => false,
      release: () => {
        leases.released += 1;
      },
    };
  },
}));

/** A chat's projection, as the stand-in `isCaughtUp` below reads it. */
type Projection = Readonly<{ caughtUp: boolean }>;

function notCalled(): never {
  throw new Error('not called in this test');
}

/** The app's services: a worker double, and a chat store over each record client's chats and logs. */
const services: ProjectLibraryServices<ProjectLibraryWorker, ProjectLibraryRootFacade, Projection> = {
  startObjectStore: () => ({
    worker: { terminate: vi.fn() } as unknown as Worker,
    wrappedWorker: mock<ProjectLibraryWorker>(),
  }),
  reportFault: vi.fn(),
  reportWorkerFailed: vi.fn(),
  buildSkew: { isSuperseded: () => false, subscribe: () => () => undefined },
  createChatStore: ({ client }) =>
    mock<ChatStorage>({
      getChatsForResource: async () => [...((stores.get(client) ?? []) as Chat[])],
      readChatLog: async (chatId: string) => new TextEncoder().encode(logs.get(chatId) ?? ''),
    }),
  clearLegacyListing: () => undefined,
  projectTemplates: {
    createEntrylessProject: notCalled,
    createInitialProject: notCalled,
    getKernelOption: notCalled,
    getKernelDependencies: notCalled,
    getKernelProjectTemplate: notCalled,
  },
  buildUserMessage: notCalled,
  cloudIntent: { set: notCalled },
  isCaughtUp: (projection) => projection.caughtUp,
};

/** A chat log, as the stand-in reader below reads it: `running` holds a run that has not ended. */
const logWithRun = (ended: boolean): string => (ended ? 'ended' : 'running');
/* A read owner that admits every read at once: no observation runs in these rows. */
vi.mock('#runtime/project-library-observations.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createMetadataReadOwner: (source: ChatStorage) => ({
    connect: () => () => undefined,
    hold: () => undefined,
    ready: () => undefined,
    fail: () => undefined,
    read: async <Value>(operation: (store: ChatStorage) => Promise<Value>) => operation(source),
    settle: async () => undefined,
  }),
}));

const chatOf = (id: string): Chat => ({ id, resourceId: 'p1', name: id, messages: [], createdAt: 0, updatedAt: 0 });

/** A root file facade whose chat store holds `chats` for every project. */
const facadeWith = (chats: readonly Chat[]): ProjectLibraryRootFacade => {
  const fileManager = mock<ProjectLibraryRootFacade>();
  stores.set(fileManager.recordFiles, chats);
  return fileManager;
};

type LiveSessions = Readonly<Record<string, unknown>>;

/** A registry double: the live refs, and a `close` that drops one and tells every listener. */
const registryOf = (
  live: readonly string[],
): ProjectLibrarySessions & { readonly sent: Array<Readonly<{ type: string; projectId?: string }>> } => {
  let liveSessions: LiveSessions = Object.fromEntries(live.map((projectId) => [projectId, {}]));
  const listeners = new Set<(snapshot: { context: { refs: LiveSessions } }) => void>();
  const sent: Array<Readonly<{ type: string; projectId?: string }>> = [];
  return {
    sent,
    getSnapshot: () => ({ context: { refs: liveSessions } }),
    subscribe(listener) {
      listeners.add(listener);
      return {
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
    send(event) {
      sent.push(event);
      liveSessions = Object.fromEntries(
        Object.entries(liveSessions).filter(([projectId]) => projectId !== event.projectId),
      );
      for (const listener of listeners) {
        listener({ context: { refs: liveSessions } });
      }
    },
  };
};

/** A chat store double: which chats are observed, their projections, and the live runs a close would cut. */
const chatSessionsOf = ({
  observed = [],
  caughtUp = true,
  liveChatIds = [],
}: Readonly<{ observed?: readonly string[]; caughtUp?: boolean; liveChatIds?: readonly string[] }>) =>
  mock<ProjectLibraryChatSessions<Projection>>({
    observedChatIdsOf: () => observed,
    getProjection: () => ({ caughtUp }),
    getProjectClosePlan: async () => ({ liveChatIds: [...liveChatIds] }),
  });

type Library = ProjectLibrary<ProjectLibraryWorker, ProjectLibraryRootFacade, Projection>;
const libraries: Library[] = [];
const createLibrary = (
  sessions: ProjectLibrarySessions,
  chatSessions: ProjectLibraryChatSessions<Projection>,
  chats: readonly Chat[],
): Library => {
  const root = testRootFiles(facadeWith(chats));
  const library = new ProjectLibrary({
    services,
    queryClient: new QueryClient(),
    sessions: () => sessions,
    chatSessions: () => chatSessions,
    rootFiles: () => root,
  });
  libraries.push(library);
  return library;
};

afterEach(() => {
  for (const library of libraries.splice(0)) {
    library.stop();
  }
  logs.clear();
  leases.ledElsewhere = undefined;
  leases.taken.length = 0;
  leases.released = 0;
});

describe('ProjectLibrary project commands (A4a, row L7)', () => {
  /* #2303: a trashed project is never open, so its chats are verified from their logs, under a lease. */
  it('should verify a project with no live session headlessly, from its chat logs under a lease', async () => {
    logs.set('c1', logWithRun(true));
    const library = createLibrary(registryOf([]), chatSessionsOf({}), [chatOf('c1')]);
    await expect(library.commands.verifyProjectQuiescent('p1')).resolves.toBeUndefined();
    expect(leases.taken).toEqual([{ projectId: 'p1', chatIds: ['c1'] }]);
    expect(leases.released).toBe(1);
  });

  it('should refuse a project with no live session whose chat log holds a run that has not ended', async () => {
    logs.set('c1', logWithRun(false));
    const library = createLibrary(registryOf([]), chatSessionsOf({}), [chatOf('c1')]);
    await expect(library.commands.verifyProjectQuiescent('p1')).rejects.toThrow(
      'The chat "c1" has a run that has not ended (running).',
    );
    /* A refusal holds nothing. */
    expect(leases.released).toBe(1);
  });

  it('should refuse a project with no live session while another tab leads one of its chats', async () => {
    leases.ledElsewhere = 'c1';
    const library = createLibrary(registryOf([]), chatSessionsOf({}), [chatOf('c1')]);
    await expect(library.commands.verifyProjectQuiescent('p1')).rejects.toThrow(
      'The chat "c1" is open in another tab or window.',
    );
  });

  it('should hold a closed project quiescent until the caller releases it, and refuse to lease a live one', async () => {
    logs.set('c1', logWithRun(true));
    const closed = createLibrary(registryOf([]), chatSessionsOf({}), [chatOf('c1')]);
    const lease = await closed.commands.leaseQuiescentProject('p1');
    expect(leases.released).toBe(0);
    lease.release();
    expect(leases.released).toBe(1);
    const live = createLibrary(registryOf(['p1']), chatSessionsOf({ observed: ['c1'] }), [chatOf('c1')]);
    await expect(live.commands.leaseQuiescentProject('p1')).rejects.toThrow('Close this project before deleting it.');
  });

  it('should refuse a live project while a stored chat is unobserved or its projection has not caught up', async () => {
    const unobserved = createLibrary(registryOf(['p1']), chatSessionsOf({ observed: [] }), [chatOf('c1')]);
    await expect(unobserved.commands.verifyProjectQuiescent('p1')).rejects.toThrow(
      'Wait for every chat history to load before deleting this project.',
    );
    const behind = createLibrary(registryOf(['p1']), chatSessionsOf({ observed: ['c1'], caughtUp: false }), [
      chatOf('c1'),
    ]);
    await expect(behind.commands.verifyProjectQuiescent('p1')).rejects.toThrow(
      'Wait for every chat history to load before deleting this project.',
    );
  });

  it('should refuse a project with running work, and admit one that is settled', async () => {
    const running = createLibrary(registryOf(['p1']), chatSessionsOf({ observed: ['c1'], liveChatIds: ['c1'] }), [
      chatOf('c1'),
    ]);
    await expect(running.commands.verifyProjectQuiescent('p1')).rejects.toThrow(
      'This project has running work. Stop it and wait for the chat log to settle before deleting.',
    );
    const settled = createLibrary(registryOf(['p1']), chatSessionsOf({ observed: ['c1'] }), [chatOf('c1')]);
    await expect(settled.commands.verifyProjectQuiescent('p1')).resolves.toBeUndefined();
  });

  it('should close a live project through the registry and resolve once the registry drops it', async () => {
    const registry = registryOf(['p1', 'p2']);
    const library = createLibrary(registry, chatSessionsOf({}), []);
    await library.commands.closeProjectSession('p1');
    expect(registry.sent).toEqual([{ type: 'close', projectId: 'p1', reason: 'user' }]);
    expect(Object.keys(registry.getSnapshot().context.refs)).toEqual(['p2']);
  });

  it('should send nothing to close a project with no live session', async () => {
    const registry = registryOf(['p2']);
    const library = createLibrary(registry, chatSessionsOf({}), []);
    await library.commands.closeProjectSession('p1');
    expect(registry.sent).toEqual([]);
  });

  it('should refuse a command that asks the registry when it was built without one', async () => {
    const bare = createLibrary(registryOf([]), chatSessionsOf({}), []);
    const root = testRootFiles(facadeWith([]));
    const unwired = new ProjectLibrary({ services, queryClient: new QueryClient(), rootFiles: () => root });
    libraries.push(unwired);
    await expect(unwired.commands.closeProjectSession('p1')).rejects.toThrow('built without the sessions registry');
    await expect(bare.commands.closeProjectSession('p1')).resolves.toBeUndefined();
  });
});
