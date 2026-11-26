// @vitest-environment node
/**
 * HA1 at the store tier: a chat whose files this device holds reads its own segment from the file (HA-I1, HA-I3a)
 * whatever the host does, and a composer pick made while its own run is unsettled waits, whole, for the run to settle
 * (HA-I7). The harness rows these stand for are named in each test (blueprint "Regression harness (HA0)").
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chat as ChatEntity } from '@taucad/chat';
import type { HostCommand } from '@taucad/agent-host/wire';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import { chatTurnAdmission } from '#chat-clients/_internal/chat-host-binding.js';
import { lifecycleRow, logRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';
import { projectSessionsStandIn } from '#services/project-sessions.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { ChatSessionStore, selectChatTranscript } from '#services/chat-session-store.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Mirror the environment module's fixed exported names.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'http://test.local' } }));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));

afterEach(() => {
  vi.restoreAllMocks();
});

const projectId = 'project_own';
const chatId = 'chat_own';
const chatDirectory = `/projects/${projectId}/.tau/chats/${chatId}`;
const ownLog = `${chatDirectory}/events.jsonl`;
const recordPath = `${chatDirectory}/chat.json`;
const bound = { timeout: 3000 };

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
const jsonl = (rows: readonly unknown[]): string => rows.map((row) => `${JSON.stringify(row)}\n`).join('');

const createDisk = (files: Readonly<Record<string, string>>) => {
  const bytes = new Map(Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)]));
  const failing = new Set<string>();
  const under = (path: string): string[] =>
    [...bytes.keys()].filter((entry) => entry.startsWith(`${path}/`)).map((entry) => entry.slice(path.length + 1));
  return {
    failing,
    set: (path: string, text: string): void => {
      bytes.set(path, new TextEncoder().encode(text));
    },
    readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      if (failing.has(path)) {
        throw Object.assign(new Error(`EIO: ${path}`), { code: 'EIO' });
      }
      return bytes.get(path) ?? Promise.reject(notFound(path));
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer>): Promise<void> => {
      bytes.set(path, data);
    },
    exists: async (path: string): Promise<boolean> => bytes.has(path) || under(path).length > 0,
    readdir: async (path: string): Promise<string[]> => {
      const names = under(path);
      return names.length === 0 ? Promise.reject(notFound(path)) : names;
    },
    unlink: async (path: string): Promise<void> => {
      bytes.delete(path);
    },
    rmdir: async (): Promise<void> => undefined,
  };
};

const record = (overrides: Partial<ChatEntity> = {}): ChatEntity => ({
  id: chatId,
  resourceId: projectId,
  name: '',
  messages: [],
  createdAt: 0,
  updatedAt: 0,
  activeExecution: { kind: 'tau', model: 'model-stored' },
  ...overrides,
});

const createStore = (disk: ReturnType<typeof createDisk>, chat: ChatEntity | undefined = record()) => {
  const store = new ChatSessionStore({
    projectSessions: projectSessionsStandIn(),
    chatSession: chatSessionMachine.provide({ actors: { admitTurn: chatTurnAdmission } }),
  });
  const deps = {
    getChat: vi.fn(async () => chat),
    patchChat: vi.fn(async () => undefined),
    touchChatRecency: vi.fn(async () => undefined),
    consumeChatStartupRequest: vi.fn(async () => undefined),
    commitCancelledDraftRestore: vi.fn(async () => undefined),
    client: disk,
  };
  store.setDependencies(deps);
  return { store, deps };
};

const deadHost = async (): Promise<AgentHostClient> => {
  throw Object.assign(new Error('Host unavailable (PEER_GONE)'), { code: 'PEER_GONE' });
};

/** A host that takes commands and streams nothing; it never answers a read. */
const quietHost = (commands: HostCommand[]) =>
  vi.fn(
    async (): Promise<AgentHostClient> =>
      ({
        hostCommand: vi.fn(async (command: HostCommand) => {
          commands.push(command);
          return { status: 'applied', effect: 'durable', commandId: command.commandId, cursor: 0 };
        }),
        catchUp: writerOwnedCatchUp,
        read: async () =>
          new Promise<never>(() => {
            /* Never answers. */
          }),
        subscribe: vi.fn(),
        close: vi.fn(async () => undefined),
      }) as unknown as AgentHostClient,
  );

const open = (store: ChatSessionStore, connect: () => Promise<AgentHostClient>) => {
  const unpublish = store.publishProjectHostConnector(projectId, connect);
  const unobserve = store.observe(chatId, projectId);
  const session = store.acquire(chatId, projectId);
  return {
    session,
    text: () => JSON.stringify(session.messages),
    close: () => {
      store.release(chatId);
      unobserve();
      unpublish();
    },
  };
};

const user = logRow(2, { type: 'message.appended', message: { id: 'user_1', role: 'user', content: 'Make a gear' } });
const admitted = { ...lifecycleRow(0, 'admitted'), admission: { kind: 'tau', turnId: 'user_1' } };
const reply = logRow(3, {
  type: 'message.appended',
  message: { id: 'assistant_1', role: 'assistant', content: [{ type: 'text', text: 'Gear made.' }] },
});
const settledLog = jsonl([admitted, lifecycleRow(1, 'running'), user, reply, lifecycleRow(4, 'completed')]);
const unsettledLog = jsonl([admitted, lifecycleRow(1, 'running'), user]);

describe('own segment read from the file (HA-I1, HA-I3a)', () => {
  /* Row 13 (AR3-1): a new chat's record is present and its own log absent: an authoritative empty read. */
  it('should settle a new chat empty from its record while the host is gone', async () => {
    const { store } = createStore(createDisk({ [recordPath]: '{"id":"chat_own"}' }));
    const chat = open(store, deadHost);
    try {
      await vi.waitFor(() => {
        expect(selectChatTranscript(chat.session)).toBe('empty');
      }, bound);
    } finally {
      chat.close();
    }
  });

  /* Row 14 (AR3-1): a chat synced from another device, record present and no own log, opens with its transcript. */
  it('should show a synced chat’s foreign turns cold while the host is gone', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [`${chatDirectory}/events/peer.jsonl`]: settledLog });
    const { store } = createStore(disk);
    const chat = open(store, deadHost);
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain('Gear made.');
      }, bound);
    } finally {
      chat.close();
    }
  });

  /* Row 11: a chat purged in another tab reads as deleted. */
  it('should read a purged record as the deleted state', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own","purgedAt":3}' });
    const { store } = createStore(disk);
    const chat = open(store, deadHost);
    try {
      await vi.waitFor(async () => {
        await expect(store.getHistoricalUsage(chatId)).rejects.toThrow('superseded');
      }, bound);
    } finally {
      chat.close();
    }
  });
});

describe('the whole pick deferred while an own run is unsettled (HA-I7)', () => {
  /* Rows 12, 15 and 19: the stored records keep naming the run's executor until it settles. */
  it('should hold both writes, the route and the observer restart until settlement, then wake the queue last', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: unsettledLog });
    const { store, deps } = createStore(disk);
    const commands: HostCommand[] = [];
    const connect = quietHost(commands);
    const refresh = vi.spyOn(store, 'refreshMessageQueue');
    const chat = open(store, connect);
    try {
      await vi.waitFor(() => {
        expect(store.getProjection(chatId)?.ledger.currentRunId).toBe('run_1');
        expect(chat.session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      }, bound);
      /* HA-I5: the open sends `attach` for the unsettled own run. */
      await vi.waitFor(() => {
        expect(commands.map((command) => command.type)).toContain('attach');
      }, bound);
      const connectsBefore = connect.mock.calls.length;

      chat.session.persistenceActorRef.send({
        type: 'setActiveExecution',
        execution: { kind: 'tau', model: 'model-picked', hostId: 'paired-computer' },
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      expect(deps.patchChat).not.toHaveBeenCalledWith(chatId, 'activeExecution', expect.anything());
      await expect(store.getChatHostSettings(chatId)).resolves.toMatchObject({
        activeExecution: { kind: 'tau', model: 'model-stored' },
      });
      expect(connect.mock.calls.length).toBe(connectsBefore);

      /* The run settles in the file; the next poll reads it and the pick applies. */
      disk.set(ownLog, settledLog);
      await vi.waitFor(() => {
        expect(deps.patchChat).toHaveBeenCalledWith(chatId, 'activeExecution', expect.anything());
      }, bound);
      await vi.waitFor(() => {
        expect(connect.mock.calls.length).toBeGreaterThan(connectsBefore);
      }, bound);
      const written = deps.patchChat.mock.invocationCallOrder.at(-1)!;
      expect(refresh.mock.invocationCallOrder.some((order) => order > written)).toBe(true);
    } finally {
      chat.close();
    }
  });
});
