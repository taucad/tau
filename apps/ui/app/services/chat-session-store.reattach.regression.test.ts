// @vitest-environment node
/**
 * HA0 regression harness (Brain research/host-attachment-reliability-blueprint.md, "Regression harness (HA0)"). Each
 * row is one numbered harness row, written against T4, where this device's own `events.jsonl` reaches the transcript
 * only through a live host's read answers. A row was kept only while it was red on T4; HA1 (own segment from the file,
 * HA-I1, and the `attach` settler, HA-I5) turned rows 1, 2 and 8a green; HA2 (no attachment state on a local
 * placement) adds rows 3, 4 and 16 and the successors of what it deleted. Rows green on T4, and rows this tier cannot
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
import {
  ChatSessionStore,
  chatReadLossBoundMilliseconds,
  reconnectingCueMilliseconds,
} from '#services/chat-session-store.js';
import { selectCaughtUp } from '#machines/chat-projection.logic.js';
import type { SourceLiveEvent } from '@taucad/agent-host';
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

describe('host attachment regression harness (HA0 rows, green since HA1)', () => {
  /* Row 1 (U2), unit tier: the worker died mid-run and the page reloaded. The turn is on this device's disk, yet T4
   * shows it only once a host answers a read. HA1 (HA-I1) reads the own segment from the file. */
  it('row 1: shows the own log cold while the host is gone', async () => {
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
  it('row 2: shows the own log cold when the host code does not load', async () => {
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
  it('row 8a: sends attach for an unsettled own run when no host read answers', async () => {
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
// HA2: no attachment state on a local placement
// ===========================================================================

/** A host that connects and streams live deltas the test pushes, and whose live subscription the test can end. */
const overlayHost = (hostId?: 'desktop') => {
  let listener: ((chatId: string, event: SourceLiveEvent) => void) | undefined;
  let ended: ((error?: unknown) => void) | undefined;
  const connect = vi.fn(
    async () =>
      ({
        hostCommand: vi.fn(async (command: HostCommand) => ({
          status: 'applied',
          effect: 'durable',
          commandId: command.commandId,
          cursor: 0,
        })),
        catchUp: writerOwnedCatchUp,
        read: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
        subscribeLive: (
          _chatId: string,
          next: (chatId: string, event: SourceLiveEvent) => void,
          onEnded?: (error?: unknown) => void,
        ) => {
          listener = next;
          ended = onEnded;
          return vi.fn();
        },
        close: vi.fn(async () => undefined),
        placement: { hostId },
      }) as unknown as AgentHostClient,
  );
  return {
    connect,
    push: (event: SourceLiveEvent) => listener?.(chatId, event),
    end: (error: unknown) => ended?.(error),
  };
};

const delta = (text: string, sourceGeneration: string): SourceLiveEvent => ({
  type: 'text-delta',
  chatId,
  runId: 'run_1',
  messageId: 'assistant_1',
  contentIndex: 0,
  delta: text,
  sourceGeneration,
});

/** An own log whose run stopped on an approval: paused, still unsettled. */
const pausedLog = `${unsettledLog}${JSON.stringify(lifecycleRow(2, 'paused'))}\n`;

describe('host attachment regression harness (HA2 rows)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /* Row 3 (U7): a writer reopen mints a new generation. On T4 the read went `lost` and every command gate closed until
   * a re-read; a local placement's read is the file's, so a new writer is only the overlay's next deltas. */
  it('row 3: keeps the chat read and caught up across a writer reopen', async () => {
    const host = overlayHost('desktop');
    const chat = open(createStore(createDisk({ [ownLog]: unsettledLog })), host.connect);
    const seen: Array<readonly [string, boolean, string | undefined]> = [];
    const unsubscribe = chat.store.subscribeProjection(chatId, () => {
      const projection = chat.store.getProjection(chatId);
      seen.push([
        chat.store.getAttachmentStatus(chatId),
        projection !== undefined && selectCaughtUp(projection),
        chat.store.getAttachedHostId(chatId),
      ]);
    });
    try {
      await vi.waitFor(() => {
        expect(chat.store.getAttachedHostId(chatId)).toBe('desktop');
      }, coldBound);
      seen.length = 0;
      host.push(delta('before ', 'writer-a'));
      host.push(delta('after', 'writer-b'));
      await vi.waitFor(() => {
        expect(chat.text()).toContain('after');
      }, coldBound);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((entry) => entry[0] === 'attached' && entry[1] && entry[2] === 'desktop')).toBe(true);
    } finally {
      unsubscribe();
      chat.close();
    }
  });

  /* Row 4 (U4, U5): leadership taken mid-read. A local chat reads no host, so a fenced host neither hides it cold nor
   * freezes it warm, and the chat's read keeps its authority. */
  it('row 4: shows the chat cold and keeps it warm while leadership is taken', async () => {
    const host = overlayHost();
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), host.connect);
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain(recordedText);
        expect(host.connect).toHaveBeenCalled();
      }, coldBound);
      host.end(Object.assign(new Error('Leadership moved.'), { code: 'LEADERSHIP_LOST' }));
      await Promise.resolve();
      expect(chat.text()).toContain(recordedText);
      expect(chat.store.getAttachmentStatus(chatId)).toBe('attached');
    } finally {
      chat.close();
    }
  });

  /* Row 16 (AR3-4, AR4-7): "Reconnecting…" only on a transient cause fact, never on a healthy run or an idle chat. */
  it('row 16: says nothing on a 30 s tool call, an approval wait or an idle chat whose overlay is down', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cases = [
      { log: unsettledLog, connect: overlayHost().connect, wait: 30_000 }, // A live run quiet for 30 s
      { log: pausedLog, connect: deadHost('PEER_GONE'), wait: 5000 }, // An approval wait, overlay down
      { log: recordedTurn, connect: deadHost('PEER_GONE'), wait: 5000 }, // An idle chat, overlay down
    ];
    for (const { log, connect, wait } of cases) {
      const chat = open(createStore(createDisk({ [ownLog]: log })), connect);
      try {
        // oxlint-disable-next-line no-await-in-loop -- each case runs alone on the shared fake clock.
        await vi.waitFor(() => {
          expect(chat.store.getAttachmentStatus(chatId)).toBe('attached');
        }, coldBound);
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await vi.advanceTimersByTimeAsync(wait);
        expect(chat.store.isReconnecting(chatId)).toBe(false);
      } finally {
        chat.close();
      }
    }
  });

  it('should say "Reconnecting…" once a live run\'s overlay has waited its debounce, and not before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chat = open(createStore(createDisk({ [ownLog]: unsettledLog })), deadHost('PEER_GONE'));
    try {
      await vi.waitFor(() => {
        expect(chat.store.getAttachmentStatus(chatId)).toBe('attached');
      }, coldBound);
      expect(chat.store.isReconnecting(chatId)).toBe(false);
      await vi.advanceTimersByTimeAsync(reconnectingCueMilliseconds + 100);
      expect(chat.store.isReconnecting(chatId)).toBe(true);
    } finally {
      chat.close();
    }
  });
});

/* Successors (testing §14): each behaviour HA2 deleted state for now comes from the own source. */
describe('HA2 successors: a local placement keeps no attachment state', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /* Replaces "should leave the live connection lost": the status of a local chat is its file read, not its host's. */
  it.each(['PEER_GONE', 'WORKER_LOAD_FAILED'] as const)(
    'should read a local chat as read from its own file while its host fails %s',
    async (code) => {
      const connect = vi.fn(deadHost(code));
      const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), connect);
      try {
        await vi.waitFor(() => {
          expect(chat.text()).toContain(recordedText);
          expect(connect).toHaveBeenCalled();
        }, coldBound);
        await Promise.resolve();
        expect(chat.store.getAttachmentStatus(chatId)).toBe('attached');
        expect(chat.store.historicalUsageReady(chatId, projectId)).toBe(true);
      } finally {
        chat.close();
      }
    },
  );

  /* D17's local branch is deleted: a lost overlay is started again by the next own read, not by a backoff timer. */
  it('should not dial a lost overlay again on a timer while nothing wakes the own source', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const connect = vi.fn(deadHost('PEER_GONE'));
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), connect);
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain(recordedText);
        expect(connect).toHaveBeenCalled();
      }, coldBound);
      /* Past D17's whole backoff (250 ms doubling to 30 s): nothing dials the overlay again on its own. */
      await vi.advanceTimersByTimeAsync(1000);
      const dialed = connect.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledTimes(dialed);
    } finally {
      chat.close();
    }
  });

  it('should start a lost overlay again on the own reads of an unsettled run', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const connect = vi.fn(deadHost('PEER_GONE'));
    const chat = open(createStore(createDisk({ [ownLog]: unsettledLog })), connect);
    try {
      await vi.waitFor(() => {
        expect(connect).toHaveBeenCalled();
      }, coldBound);
      const before = connect.mock.calls.length;
      await vi.advanceTimersByTimeAsync(3500);
      expect(connect.mock.calls.length).toBeGreaterThan(before);
    } finally {
      chat.close();
    }
  });

  /* `getAttachedHostId` no longer reads the attachment state: a local chat's connected placement outlives an overlay
   * loss, so approvals and the sign-in card keep the run's host (U7). */
  it('should keep the connected placement of a local chat across an overlay loss', async () => {
    const host = overlayHost('desktop');
    const chat = open(createStore(createDisk({ [ownLog]: unsettledLog })), host.connect);
    try {
      await vi.waitFor(() => {
        expect(chat.store.getAttachedHostId(chatId)).toBe('desktop');
      }, coldBound);
      host.end(Object.assign(new Error('gone'), { code: 'PEER_GONE' }));
      await Promise.resolve();
      expect(chat.store.getAttachedHostId(chatId)).toBe('desktop');
      expect(chat.store.getAttachmentStatus(chatId)).toBe('attached');
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

  it('should connect a silent host whose read never answers, and send no command for a settled log', async () => {
    const commands: HostCommand[] = [];
    const connect = vi.fn(
      silentHost((command) => {
        commands.push(command);
      }),
    );
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), connect);
    try {
      await vi.waitFor(() => {
        expect(chat.text()).toContain(recordedText);
      }, coldBound);
      expect(connect).toHaveBeenCalled();
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
      chat.store.receiveHostReadAnswer(chatId, { status: 'refused', reason: 'cursor-ahead' });

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
    /* Nothing of the chat on this device's disk, so it keeps the host read, which the dead host loses. */
    const chat = open(createStore(createDisk({})), deadHost('PEER_GONE'));
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
