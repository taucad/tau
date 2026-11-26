// @vitest-environment node
/**
 * HA0 regression harness (Brain research/host-attachment-reliability-blueprint.md, "Regression harness (HA0)"). Each
 * row is one numbered harness row, written against T4, where this device's own `events.jsonl` reaches the transcript
 * only through a live host's read answers. A row is kept only while it is red on T4, so each is an `it.fails` naming
 * the defect: HA1–HA4 turn it green, and the marker then has to go. Rows green on T4, and rows this tier cannot
 * build, are inventoried in Brain `artifacts/host-attachment-reliability/ha0-results.md`.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chat as ChatEntity } from '@taucad/chat';
import type { HostCommand } from '@taucad/agent-host/wire';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import { chatTurnAdmission } from '#chat-clients/_internal/chat-host-binding.js';
import { lifecycleRow, logRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';
import { projectSessionsStandIn } from '#services/project-sessions.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { ChatSessionStore, chatReadLossBoundMilliseconds } from '#services/chat-session-store.js';
import { chatReadReporter } from '#lib/chat-read-reporting.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Mirror the environment module's fixed exported names.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'http://test.local' } }));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));

type Store = ChatSessionStore;

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Harness
// ===========================================================================

const projectId = 'project_reattach';
const chatId = 'chat_reattach';
const chatDirectory = `/projects/${projectId}/.tau/chats/${chatId}`;
const ownLog = `${chatDirectory}/events.jsonl`;

/** A recorded completed turn, and the assistant text it ends on. */
const recordedTurn = readFileSync(
  new URL('../../../../packages/agent-host/specs/ChatLog/recorded/in-project-ping-pong-turn.jsonl', import.meta.url),
  'utf8',
);
const recordedText = 'Browser host completed the workspace change.';

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

/** One device's disk, in memory; `failing` paths reject with an I/O error. */
const createDisk = (files: Readonly<Record<string, string>>, failing: ReadonlySet<string> = new Set()) => {
  const bytes = new Map(Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)]));
  const under = (path: string): string[] =>
    [...bytes.keys()].filter((entry) => entry.startsWith(`${path}/`)).map((entry) => entry.slice(path.length + 1));
  const io = (path: string): void => {
    if (failing.has(path)) {
      throw Object.assign(new Error(`EIO: ${path}`), { code: 'EIO' });
    }
  };
  return {
    readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      io(path);
      return bytes.get(path) ?? Promise.reject(notFound(path));
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer>): Promise<void> => {
      bytes.set(path, data);
    },
    exists: async (path: string): Promise<boolean> => bytes.has(path) || under(path).length > 0,
    readdir: async (path: string): Promise<string[]> => {
      io(path);
      const names = under(path);
      return names.length === 0 ? Promise.reject(notFound(path)) : names;
    },
    unlink: async (path: string): Promise<void> => {
      bytes.delete(path);
    },
    rmdir: async (): Promise<void> => undefined,
  };
};

const chatRecord: ChatEntity = {
  id: chatId,
  resourceId: projectId,
  name: '',
  messages: [],
  createdAt: 0,
  updatedAt: 0,
};

const createStore = (disk: ReturnType<typeof createDisk>, record: ChatEntity | undefined = chatRecord): Store => {
  const store = new ChatSessionStore({
    projectSessions: projectSessionsStandIn(),
    chatSession: chatSessionMachine.provide({ actors: { admitTurn: chatTurnAdmission } }),
  });
  store.setDependencies({
    getChat: vi.fn(async () => record),
    patchChat: vi.fn(async () => undefined),
    touchChatRecency: vi.fn(async () => undefined),
    consumeChatStartupRequest: vi.fn(async () => undefined),
    commitCancelledDraftRestore: vi.fn(async () => undefined),
    client: disk,
  });
  return store;
};

/** A host that cannot answer: its worker is gone (`PEER_GONE`), or its code did not load (`WORKER_LOAD_FAILED`). */
const deadHost = (code: 'PEER_GONE' | 'WORKER_LOAD_FAILED') => async (): Promise<AgentHostClient> => {
  throw Object.assign(new Error(`Host unavailable (${code})`), { code });
};

/** A host that is up and takes commands, but whose read never answers. */
const silentHost =
  (hostCommand: (command: HostCommand) => unknown, subscribed: () => void = () => undefined) =>
  async (): Promise<AgentHostClient> =>
    ({
      hostCommand: vi.fn(async (command: HostCommand) => hostCommand(command)),
      catchUp: writerOwnedCatchUp,
      read: async () =>
        new Promise<never>(() => {
          /* The read never settles. */
        }),
      subscribe: () => {
        subscribed();
        return vi.fn();
      },
      close: vi.fn(async () => undefined),
    }) as unknown as AgentHostClient;

/** A host that answers the read with `rows`: what T4 needs to show a chat. */
const liveHost = (rows: readonly unknown[]) => async (): Promise<AgentHostClient> =>
  ({
    hostCommand: vi.fn(),
    catchUp: writerOwnedCatchUp,
    read: vi.fn(),
    subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
      queueMicrotask(() =>
        parameters[3]?.({
          status: 'batch',
          sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
          chatId,
          cursor: 0,
          nextCursor: rows.length,
          endCursor: rows.length,
          events: [...rows],
        }),
      );
      return vi.fn();
    },
    close: vi.fn(async () => undefined),
  }) as unknown as AgentHostClient;

const recordedRows = recordedTurn
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as unknown);

/** An own log whose run is still open: admitted and running, never settled. */
const unsettledLog = `${[
  logRow(0, { ...lifecycleRow(0, 'admitted'), admission: { kind: 'tau', turnId: 'user_1' } }),
  lifecycleRow(1, 'running'),
]
  .map((row) => JSON.stringify(row))
  .join('\n')}\n`;

type Opened = Readonly<{ store: Store; text: () => string; close: () => void }>;

/** Open the chat as a route would: publish the project's connector, observe the chat and acquire its session. */
const open = (store: Store, connect: () => Promise<AgentHostClient>): Opened => {
  const unpublish = store.publishProjectHostConnector(projectId, connect);
  const unobserve = store.observe(chatId, projectId);
  const session = store.acquire(chatId, projectId);
  return {
    store,
    text: () => JSON.stringify(session.messages),
    close: () => {
      store.release(chatId);
      unobserve();
      unpublish();
    },
  };
};

/** How long a cold open may take to show a transcript that is already on this device's disk. */
const coldBound = { timeout: 2000 };

// ===========================================================================
// Rows red on T4
// ===========================================================================

describe('host attachment regression harness (HA0, red on T4)', () => {
  /* Row 1 (U2), unit tier: the worker died mid-run and the page reloaded. The turn is on this device's disk, yet T4
   * shows it only once a host answers a read. HA1 (HA-I1) reads the own segment from the file. */
  // Expected-failure: @rifont until 2026-12-15
  it.fails('row 1: shows the own log cold while the host is gone', async () => {
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), deadHost('PEER_GONE'));
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain(recordedText);
      }, coldBound);
    } finally {
      chat.close();
    }
  });

  /* Row 2 (U3): a chunk 404 leaves the host's code unloaded. The transcript is still readable from disk. HA1. */
  // Expected-failure: @rifont until 2026-12-15
  it.fails('row 2: shows the own log cold when the host code does not load', async () => {
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), deadHost('WORKER_LOAD_FAILED'));
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain(recordedText);
      }, coldBound);
    } finally {
      chat.close();
    }
  });

  /* Row 8a: a run killed mid-turn is reopened. Its own segment shows it unsettled, so the page must send `attach`
   * (HA-I5); T4 never sends `attach` for a chat and settles only through a host read. HA1. */
  // Expected-failure: @rifont until 2026-12-15
  it.fails('row 8a: sends attach for an unsettled own run when no host read answers', async () => {
    const commands: HostCommand[] = [];
    const disk = createDisk({ [ownLog]: unsettledLog });
    const chat = open(
      createStore(disk),
      silentHost((command) => {
        commands.push(command);
        return { status: 'applied', effect: 'durable', commandId: command.commandId, cursor: 0 };
      }),
    );
    try {
      await vi.waitFor(() => {
        expect(commands.map((command) => command.type)).toContain('attach');
      }, coldBound);
    } finally {
      chat.close();
    }
  });
});

// ===========================================================================
// Stand-in controls (green): each red row fails for its documented reason
// ===========================================================================

describe('host attachment harness stand-ins (HA0 controls)', () => {
  it('should show the recorded turn once a live host answers the read', async () => {
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), liveHost(recordedRows));
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain(recordedText);
      }, coldBound);
    } finally {
      chat.close();
    }
  });

  /* Row 5 (U1) is green on T4 at this tier: a failed segment scan does not hide the own turn a host answered. */
  it('should show the own turn a live host answered while the segment scan fails', async () => {
    const disk = createDisk({ [ownLog]: recordedTurn }, new Set([`${chatDirectory}/events`]));
    const chat = open(createStore(disk), liveHost(recordedRows));
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain(recordedText);
      }, coldBound);
    } finally {
      chat.close();
    }
  });

  it.each(['PEER_GONE', 'WORKER_LOAD_FAILED'] as const)(
    'should leave the read lost with nothing shown when the host fails %s',
    async (code) => {
      const connect = vi.fn(deadHost(code));
      const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), connect);
      try {
        await vi.waitFor(() => {
          expect(chat.store.getAttachmentStatus(chatId)).toBe('lost');
        }, coldBound);
        expect(connect).toHaveBeenCalled();
        expect(chat.text()).not.toContain(recordedText);
      } finally {
        chat.close();
      }
    },
  );

  it('should connect a silent host whose read never answers, and send it no command', async () => {
    const subscribed = vi.fn();
    const commands: HostCommand[] = [];
    const disk = createDisk({ [ownLog]: unsettledLog });
    const chat = open(
      createStore(disk),
      silentHost((command) => {
        commands.push(command);
      }, subscribed),
    );
    try {
      await vi.waitFor(() => {
        expect(subscribed).toHaveBeenCalled();
      }, coldBound);
      expect(chat.store.getAttachmentStatus(chatId)).not.toBe('attached');
      expect(commands).toEqual([]);
    } finally {
      chat.close();
    }
  });
});

// ===========================================================================
// Sink calls (HA0 telemetry, green)
// ===========================================================================

describe('host attachment reporting (HA0)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should report own.rewrite with its reason when a host answer resets the own projection', async () => {
    const report = vi.spyOn(chatReadReporter, 'report');
    const chat = open(
      createStore(createDisk({})),
      silentHost(() => undefined),
    );
    try {
      chat.store.receiveHostReadAnswer(chatId, { status: 'refused', chatId, reason: 'cursor-ahead' });

      expect(report.mock.calls.filter(([code]) => code === 'own.rewrite')).toEqual([
        ['own.rewrite', expect.objectContaining({ chatId, tags: { reason: 'cursor-ahead' } })],
      ]);
    } finally {
      chat.close();
    }
  });

  it('should report a cold, hidden chat once, only after the loss outlasts its bound', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const report = vi.spyOn(chatReadReporter, 'report');
    const coldHidden = (): unknown[] =>
      report.mock.calls.filter(([code]) => code === 'chat.read.cold-hidden').map(([, observation]) => observation);
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), deadHost('PEER_GONE'));
    try {
      await vi.waitFor(() => {
        expect(chat.store.getAttachmentStatus(chatId)).toBe('lost');
      }, coldBound);
      expect(coldHidden()).toEqual([]);

      /* Past the bound, through several retried losses: one report. */
      await vi.advanceTimersByTimeAsync(chatReadLossBoundMilliseconds * 2);

      expect(coldHidden()).toEqual([expect.objectContaining({ chatId, tags: { reason: 'PEER_GONE' } })]);
    } finally {
      chat.close();
    }
  });
});
