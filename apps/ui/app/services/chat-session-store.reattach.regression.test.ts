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
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { projectSessionsStandIn } from '#services/project-sessions.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { ChatSessionStore } from '#services/chat-session-store.js';
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
const silentHost = (hostCommand: (command: HostCommand) => unknown) => async (): Promise<AgentHostClient> =>
  ({
    hostCommand: vi.fn(async (command: HostCommand) => hostCommand(command)),
    read: vi.fn(),
    subscribe: () => vi.fn(),
    close: vi.fn(async () => undefined),
  }) as unknown as AgentHostClient;

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

  /* Row 5 (U1): the byte-source observation (the other devices' segment scan) fails. The own turn still shows. HA1. */
  // Expected-failure: @rifont until 2026-12-15
  it.fails('row 5: shows the own log cold when the segment scan fails', async () => {
    const disk = createDisk({ [ownLog]: recordedTurn }, new Set([`${chatDirectory}/events`]));
    const chat = open(createStore(disk), deadHost('PEER_GONE'));
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
    const rows = [
      logRow(0, { ...lifecycleRow(0, 'admitted'), admission: { kind: 'tau', turnId: 'user_1' } }),
      lifecycleRow(1, 'running'),
    ];
    const commands: HostCommand[] = [];
    const disk = createDisk({ [ownLog]: `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` });
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
// Sink calls (HA0 telemetry, green)
// ===========================================================================

describe('host attachment reporting (HA0)', () => {
  it('should report a cold, hidden chat once per open while its host stays gone', async () => {
    const report = vi.spyOn(chatReadReporter, 'report');
    const chat = open(createStore(createDisk({ [ownLog]: recordedTurn })), deadHost('PEER_GONE'));
    try {
      /* The attachment retries at 250 ms, 500 ms, …: wait for a second loss, which must not report again. */
      await vi.waitFor(() => {
        expect(report.mock.calls.filter(([code]) => code === 'chat.read.cold-hidden').length).toBeGreaterThan(0);
      }, coldBound);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 900);
      });
      const coldHidden = report.mock.calls.filter(([code]) => code === 'chat.read.cold-hidden');
      expect(new Set(coldHidden.map(([, observation]) => observation.occurrence)).size).toBe(1);
    } finally {
      chat.close();
    }
  });
});
