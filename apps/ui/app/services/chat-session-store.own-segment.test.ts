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
import type { ChatTurnGesture } from '#machines/chat-session.machine.js';
import { chatTurnAdmission, publishChatTurnAdmission } from '#chat-clients/_internal/chat-host-binding.js';
import {
  lifecycleRow,
  logRow,
  publishLogRows,
  runningRows,
  writerOwnedCatchUp,
} from '#machines/chat-projection.fixture.js';
import { projectSessionsStandIn } from '#services/project-sessions.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { writeChatPlacement } from '@taucad/chat-ui/db/chat-placements';
import { runHeartbeatMilliseconds } from '@taucad/agent-host';
import { ChatSessionStore, selectChatTranscript } from '#services/chat-session-store.js';
import type { ChatSessionDeps } from '#services/chat-session-store.js';

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

const createStore = (
  disk: ReturnType<typeof createDisk>,
  chat: ChatEntity | undefined = record(),
  watchRecordFile?: ChatSessionDeps['watchRecordFile'],
) => {
  const store = new ChatSessionStore({
    projectSessions: projectSessionsStandIn(),
    chatSession: chatSessionMachine.provide({ actors: { admitTurn: chatTurnAdmission } }),
  });
  const deps = {
    getChat: vi.fn(async () => chat),
    isPlacementOnThisDevice: vi.fn(async () => true),
    patchChat: vi.fn<(chatId: string, field: string, value: unknown) => Promise<undefined>>(async () => undefined),
    touchChatRecency: vi.fn(async () => undefined),
    consumeChatStartupRequest: vi.fn(async () => undefined),
    commitCancelledDraftRestore: vi.fn(async () => undefined),
    client: disk,
    ...(watchRecordFile === undefined ? {} : { watchRecordFile }),
  };
  store.setDependencies(deps);
  return { store, deps };
};

const deadHost = async (): Promise<AgentHostClient> => {
  throw Object.assign(new Error('Host unavailable (PEER_GONE)'), { code: 'PEER_GONE' });
};

/** A host that takes commands and streams nothing; it never answers a read, and `reads` counts the asks. */
const quietHost = (commands: HostCommand[], reads?: { count: number }) =>
  vi.fn(
    async (): Promise<AgentHostClient> =>
      ({
        hostCommand: vi.fn(async (command: HostCommand) => {
          commands.push(command);
          return { status: 'applied', effect: 'durable', commandId: command.commandId, cursor: 0 };
        }),
        async *catchUp(...args: Parameters<typeof writerOwnedCatchUp>) {
          if (reads !== undefined) {
            reads.count += 1;
          }
          yield* writerOwnedCatchUp(...args);
        },
        read: async () => {
          if (reads !== undefined) {
            reads.count += 1;
          }
          return new Promise<never>(() => {
            /* Never answers. */
          });
        },
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

const settle = async (milliseconds = 100): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

/** A send the admission turns into a `start`, as the composer's queued send does. */
const queueAdmission = () =>
  publishChatTurnAdmission(chatId, async (gesture) => {
    if (gesture.kind !== 'send' || gesture.requestId === undefined) {
      throw new Error('Expected queued send');
    }
    return {
      runId: gesture.requestId,
      leaseTurnId: gesture.message.id,
      request: {
        kind: 'send',
        message: gesture.message,
        command: {
          type: 'start',
          commandId: gesture.requestId,
          payload: {
            chatId,
            runId: gesture.requestId,
            trigger: 'submit',
            message: { id: gesture.message.id, role: 'user', content: 'Behind' },
          },
        },
        queueId: gesture.queueId,
      },
    };
  });
const queuedGesture = (id: string): Extract<ChatTurnGesture, { kind: 'send' }> => ({
  kind: 'send',
  requestId: `req_${id}`,
  message: { id, role: 'user', parts: [{ type: 'text', text: id }] },
});
const pick = (session: ReturnType<typeof open>['session'], model: string): void => {
  session.persistenceActorRef.send({
    type: 'setActiveExecution',
    execution: { kind: 'tau', model, hostId: 'paired-computer' },
  });
};
const executionWrites = (deps: ReturnType<typeof createStore>['deps']): number =>
  deps.patchChat.mock.calls.filter(([, field]) => field === 'activeExecution').length;

describe('locality is the placement, not the folder (HA-I1, residual R1)', () => {
  /* Review finding 1: a paired computer's chat whose folder also holds an own log keeps the host read. */
  it('should keep the host read for a chat placed on a paired computer, own log or not', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: settledLog });
    const { store } = createStore(
      disk,
      record({ activeExecution: { kind: 'tau', model: 'm', hostId: 'paired-computer' } }),
    );
    const reads = { count: 0 };
    const chat = open(store, quietHost([], reads));
    try {
      await vi.waitFor(() => {
        expect(reads.count).toBeGreaterThan(0);
      }, bound);
      expect(chat.text()).not.toContain('Gear made.');
    } finally {
      chat.close();
    }
  });

  /* Review finding 2: a remote host's unsettled run never defers a pick; the host may be gone. */
  it('should apply a pick at once on a chat this device does not read from the file', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: unsettledLog });
    const { store, deps } = createStore(
      disk,
      record({ activeExecution: { kind: 'tau', model: 'm', hostId: 'paired-computer' } }),
    );
    const chat = open(store, quietHost([]));
    try {
      await vi.waitFor(() => {
        expect(chat.session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      }, bound);
      /* The paired computer's read shows its run unsettled; that host may be gone, so the pick does not wait on it. */
      publishLogRows(store, chatId, runningRows());
      expect(store.getProjection(chatId)?.ledger.currentRunId).toBe('run_1');
      pick(chat.session, 'model-picked');
      await vi.waitFor(() => {
        expect(executionWrites(deps)).toBe(1);
      }, bound);
    } finally {
      chat.close();
    }
  });
});

describe('the own source decides locality and follows the file (HA-I1)', () => {
  /* Review round 3, finding 1: a browser chat switched to a paired computer stops reading the file and reads the host. */
  it('should decide locality again when a pick moves the chat to a paired computer', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: settledLog });
    const { store, deps } = createStore(disk);
    const reads = { count: 0 };
    const chat = open(store, quietHost([], reads));
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain('Gear made.');
        expect(chat.session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      }, bound);
      await settle();
      expect(reads.count).toBe(0);
      deps.getChat.mockResolvedValue(
        record({ activeExecution: { kind: 'tau', model: 'model-picked', hostId: 'paired-computer' } }),
      );
      pick(chat.session, 'model-picked');
      await vi.waitFor(() => {
        expect(reads.count).toBeGreaterThan(0);
      }, bound);
    } finally {
      chat.close();
    }
  });

  /* Review round 3, finding 3: the own watch follows a new capability incarnation, and one that closes is replaced. */
  it('should register the own watch again on new dependencies and after it closes', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: settledLog });
    const registered: Array<{ path: string; close: () => void; dispose: ReturnType<typeof vi.fn> }> = [];
    const watch: NonNullable<ChatSessionDeps['watchRecordFile']> = (path) => {
      const closed = Promise.withResolvers<void>();
      const entry = { path, close: closed.resolve, dispose: vi.fn() };
      registered.push(entry);
      return { ready: Promise.resolve(), closed: closed.promise, dispose: entry.dispose };
    };
    const { store, deps } = createStore(disk, record(), watch);
    const chat = open(store, deadHost);
    const own = () => registered.filter((entry) => entry.path === chatDirectory);
    try {
      await vi.waitFor(() => {
        expect(own()).toHaveLength(1);
      }, bound);
      const next: NonNullable<ChatSessionDeps['watchRecordFile']> = (path, listener) => watch(path, listener);
      store.setDependencies({ ...deps, watchRecordFile: next });
      await vi.waitFor(() => {
        expect(own()).toHaveLength(2);
      }, bound);
      expect(own()[0]?.dispose).toHaveBeenCalled();

      /* A watch that stayed open a while and then closed is registered again at once. */
      await settle(1100);
      own()[1]?.close();
      await vi.waitFor(() => {
        expect(own()).toHaveLength(3);
      }, bound);
    } finally {
      chat.close();
    }
  });

  /* Review finding 5: a first read that cannot hold the file keeps the host read; the chat is never left with neither. */
  it('should fall back to the host read when the first own read fails', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: settledLog });
    disk.failing.add(ownLog);
    const { store } = createStore(disk);
    const reads = { count: 0 };
    const chat = open(store, quietHost([], reads));
    try {
      await vi.waitFor(() => {
        expect(reads.count).toBeGreaterThan(0);
      }, bound);
    } finally {
      chat.close();
    }
  });

  /* Review finding 2: an unsettled run the file did not show (a host read's) defers no pick. */
  it('should apply a pick at once when the unsettled run came from a host read, not the file', async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: unsettledLog });
    disk.failing.add(ownLog);
    const { store, deps } = createStore(disk);
    const chat = open(store, quietHost([]));
    try {
      await vi.waitFor(() => {
        expect(chat.session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      }, bound);
      await settle();
      publishLogRows(store, chatId, runningRows());
      expect(store.getProjection(chatId)?.ledger.currentRunId).toBe('run_1');
      pick(chat.session, 'model-picked');
      await vi.waitFor(() => {
        expect(executionWrites(deps)).toBe(1);
      }, bound);
    } finally {
      chat.close();
    }
  });

  /* Review finding 6: another tab or app appending to the chat's own log wakes the source through the file watch. */
  it('should show rows another writer appends, woken by the chat directory’s watch', async () => {
    /* A settled log: nothing polls it, so only the watch can bring the second turn in. */
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: settledLog });
    const listeners = new Map<string, () => void>();
    const { store } = createStore(disk, record(), (path, listener) => {
      listeners.set(path, () => {
        listener({ type: 'change', path: `${path}/events.jsonl` });
      });
      return {
        ready: Promise.resolve(),
        closed: new Promise<void>(() => {
          /* Owner-controlled watch. */
        }),
        dispose: vi.fn(),
      };
    });
    const chat = open(store, deadHost);
    try {
      await vi.waitFor(() => {
        expect(listeners.has(chatDirectory)).toBe(true);
      }, bound);
      await vi.waitFor(() => {
        expect(chat.text()).toContain('Gear made.');
      }, bound);
      const second = jsonl([
        { ...lifecycleRow(5, 'admitted', 'run_2'), admission: { kind: 'tau', turnId: 'user_2' } },
        lifecycleRow(6, 'running', 'run_2'),
        logRow(7, {
          runId: 'run_2',
          type: 'message.appended',
          message: { id: 'user_2', role: 'user', content: 'Another' },
        }),
        logRow(8, {
          runId: 'run_2',
          type: 'message.appended',
          message: { id: 'assistant_2', role: 'assistant', content: [{ type: 'text', text: 'Second gear.' }] },
        }),
        lifecycleRow(9, 'completed', 'run_2'),
      ]);
      disk.set(ownLog, settledLog + second);
      await new Promise((resolve) => {
        setTimeout(resolve, 1500);
      });
      expect(chat.text()).not.toContain('Second gear.');
      listeners.get(chatDirectory)?.();
      await vi.waitFor(() => {
        expect(chat.text()).toContain('Second gear.');
      }, bound);
    } finally {
      chat.close();
    }
  });
});

describe('the deferred pick releases the queue once, and last (HA-I7, AR5-4)', () => {
  const openUnsettled = async () => {
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: unsettledLog });
    const { store, deps } = createStore(disk);
    const commands: HostCommand[] = [];
    const chat = open(store, quietHost(commands));
    await vi.waitFor(() => {
      expect(store.getProjection(chatId)?.ledger.currentRunId).toBe('run_1');
      expect(chat.session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      expect(commands.map((command) => command.type)).toContain('attach');
    }, bound);
    return { disk, store, deps, commands, chat };
  };

  /* Review finding 3: a second pick aborts the first, whose release must not lift the second's hold. */
  it('should not wake the queue when a newer pick supersedes a deferred one', async () => {
    const { store, deps, chat } = await openUnsettled();
    const refresh = vi.spyOn(store, 'refreshMessageQueue');
    try {
      pick(chat.session, 'model-first');
      await settle();
      pick(chat.session, 'model-second');
      await settle(300);
      expect(refresh).not.toHaveBeenCalled();
      expect(executionWrites(deps)).toBe(0);
    } finally {
      chat.close();
    }
  });

  /* Review finding 12: the queue holds as `pick-deferred` while the pick's writes run after settlement; without the
   * hold the settled run's gate opens and the queued send leaves before the records name its executor. */
  it('should hold a queued send behind the pick’s writes after the run settles', async () => {
    const { disk, deps, commands, store, chat } = await openUnsettled();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const unadmit = queueAdmission();
    const written = Promise.withResolvers<undefined>();
    deps.patchChat.mockImplementation(async (_id: string, field: string) =>
      field === 'activeExecution' ? written.promise : undefined,
    );
    try {
      pick(chat.session, 'model-picked');
      await settle();
      await store.requestTurn(chatId, queuedGesture('behind'));
      disk.set(ownLog, settledLog);
      await vi.waitFor(() => {
        expect(executionWrites(deps)).toBe(1);
      }, bound);
      await settle(300);
      expect(commands.map((command) => command.type)).not.toContain('start');
      expect(
        info.mock.calls
          .filter(([label]) => label === '[ChatSessionStore] queue held')
          .map(([, facts]) => (JSON.parse(String(facts)) as { reason?: string }).reason),
      ).toContain('pick-deferred');
      written.resolve(undefined);
    } finally {
      info.mockRestore();
      unadmit();
      chat.close();
    }
  });
});

describe('the in-page attach after a stale span (HA-I5)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /* Review findings 7 and 12: a `tau serve` sharing the folder crashed mid-run. Its rows and marker are past XD3, so
   * after 2 x runHeartbeatMilliseconds of monotonic time the page attaches on its own host, whatever the record names,
   * and backs off while the run stays unsettled. */
  it('should route attach in-page once the span completes, and back off while the run stays unsettled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const disk = createDisk({ [recordPath]: '{"id":"chat_own"}', [ownLog]: unsettledLog });
    await writeChatPlacement({ client: disk, projectId, chatId, placement: 'loopback:serve' });
    const { store } = createStore(disk);
    const commands: HostCommand[] = [];
    const host = quietHost(commands);
    const routes: Array<Promise<string | undefined>> = [];
    const routeOf = async (settings: ReturnType<ChatSessionStore['getChatHostSettings']>) => {
      const read = await settings;
      const execution = read?.activeExecution;
      return execution?.kind === 'tau' ? execution.hostId : undefined;
    };
    const connect = async (): Promise<AgentHostClient> => {
      /* The connector reads the route first, synchronously, as the real one does. */
      routes.push(routeOf(store.getChatHostSettings(chatId)));
      return host();
    };
    const chat = open(store, connect);
    try {
      await vi.waitFor(() => {
        expect(commands.map((command) => command.type)).toContain('attach');
      }, bound);
      expect(await Promise.all(routes)).toContain('loopback:serve');
      const before = routes.length;
      await vi.advanceTimersByTimeAsync(2 * runHeartbeatMilliseconds + 2000);
      const inPage = async (): Promise<number> => {
        const seen = await Promise.all(routes.slice(before));
        return seen.filter((route) => route === undefined).length;
      };
      expect(await inPage()).toBeGreaterThan(0);
      const first = await inPage();
      await vi.advanceTimersByTimeAsync(10_000);
      /* 1 Hz would send ten more; the backoff (1 s doubling) sends at most four. */
      expect((await inPage()) - first).toBeLessThanOrEqual(4);
    } finally {
      chat.close();
    }
  });
});
