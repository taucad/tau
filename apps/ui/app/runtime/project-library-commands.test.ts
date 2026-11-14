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
import type { Chat } from '@taucad/chat';
import { ProjectLibrary } from '#runtime/project-library.js';
import type { ProjectLibraryBinding } from '#runtime/project-library.js';
import type { ProjectLibraryChatSessions, ProjectLibrarySessions } from '#runtime/project-library-commands.js';
import type { ChatStorage } from '#types/storage.types.js';

/** The chat store each record client stands for. */
const stores = vi.hoisted(() => new WeakMap<WeakKey, unknown>());

vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));

vi.mock('comlink', () => ({ wrap: vi.fn(() => ({})) }));

vi.mock('#db/chat-file-storage.js', () => ({
  createChatFileStore: ({ client }: { client: WeakKey }) => stores.get(client),
}));

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

/** A binding whose chat store holds `chats` for every project. */
const bindingWith = (chats: readonly Chat[]): ProjectLibraryBinding => {
  const recordFiles = {};
  stores.set(recordFiles, {
    getChatsForResource: async () => [...chats],
  } satisfies Pick<ChatStorage, 'getChatsForResource'>);
  return { fileManager: { recordFiles } as unknown as ProjectLibraryBinding['fileManager'] };
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
  ({
    observedChatIdsOf: () => observed,
    getProjection: () =>
      ({
        ledger: { position: { cursor: caughtUp ? 1 : 0 } },
        endCursor: 1,
      }) as unknown as ReturnType<ProjectLibraryChatSessions['getProjection']>,
    getProjectClosePlan: async () =>
      ({ liveChatIds: [...liveChatIds] }) as unknown as Awaited<
        ReturnType<ProjectLibraryChatSessions['getProjectClosePlan']>
      >,
    noteCreatedEmpty: () => undefined,
  }) satisfies ProjectLibraryChatSessions;

const libraries: ProjectLibrary[] = [];
const createLibrary = (
  sessions: ProjectLibrarySessions,
  chatSessions: ProjectLibraryChatSessions,
  chats: readonly Chat[],
): ProjectLibrary => {
  const library = new ProjectLibrary({
    queryClient: new QueryClient(),
    sessions: () => sessions,
    chatSessions: () => chatSessions,
  });
  library.bind(bindingWith(chats));
  libraries.push(library);
  return library;
};

afterEach(() => {
  for (const library of libraries.splice(0)) {
    library.stop();
  }
});

describe('ProjectLibrary project commands (A4a, row L7)', () => {
  it('should refuse a project with stored chats and no live session, asking the registry it was built with', async () => {
    const library = createLibrary(registryOf([]), chatSessionsOf({}), [chatOf('c1')]);
    await expect(library.commands.verifyProjectQuiescent('p1')).rejects.toThrow(
      'Restore and open this project to verify its chats before deleting it.',
    );
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
});
