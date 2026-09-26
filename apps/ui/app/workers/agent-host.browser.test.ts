import { afterEach, expect, it, vi } from 'vitest';
import { DirectIdbProvider, OPFSProvider } from '@taucad/filesystem/backend';
import type { AgentLogEvent, HostRunSnapshot } from '@taucad/agent-host';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import { agentWireLimits } from '@taucad/agent-host/wire';
import type { CommandAnswer, CommandVerb } from '@taucad/agent-host/wire';
import { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import type { AgentHostProjectProvide } from '#workers/agent-host.contract.js';
import { openBrowserProjectHost } from '#workers/agent-host.impl.js';
import { createProjectHosts } from '#workers/agent-host-projects.js';
import { rootedProvider } from '#workers/test/rooted-provider.fixture.js';
import {
  controlOf,
  disposeOpfsProject,
  opfsProject,
  retireWorkers,
} from '#workers/test/agent-host-resident.fixture.js';
import type { BrowserProjectHost, ResidentWorkerContext } from '#workers/agent-host.impl.js';
import type { FileSystemProvider } from '@taucad/filesystem';
// eslint-disable-next-line @nx/enforce-module-boundaries -- The browser vitest config reads this same composed source fixture until FIX-PROJ adds the UI package dependency.
import { authoritativeGatewayWireFixtures } from '../../../../packages/agent-host/src/transport/gateway-wire.fixture.js';

let provider: FileSystemProvider | undefined;

afterEach(() => {
  provider?.dispose();
  provider = undefined;
  disposeOpfsProject();
});

let keys = 0;

/**
 * A project host opened in this page, as the resident worker opens one on `provide` (RH-S8), and one agent-wire
 * stream to it: the same launcher and channel the worker serves, driven without a second worker.
 */
const sessions = new Map<string, { readonly host: BrowserProjectHost; readonly client: AgentChannelClient }>();
const visibility = { visible: () => true, subscribe: () => () => undefined };

const sessionOf = (sessionId: string): AgentChannelClient => {
  const session = sessions.get(sessionId);
  if (session === undefined) {
    throw new Error(`No project host is open for ${sessionId}.`);
  }
  return session.client;
};

/** One keyed command over the session's stream; a new key unless named. */
const command = async (
  sessionId: string,
  input: { readonly type: CommandVerb; readonly payload: unknown; readonly commandId?: string },
): Promise<CommandAnswer> => {
  keys += 1;
  const commandId = input.commandId ?? `req_browser-test-${String(keys)}`;
  return sessionOf(sessionId).execute({ type: input.type, commandId, payload: input.payload } as Parameters<
    AgentChannelClient['execute']
  >[0]);
};

/** Every durable row of a chat up to the end `attach` reports, read page by page without parking at the end. */
const readAll = async (sessionId: string, chatId: string, endCursor?: number): Promise<AgentLogEvent[]> => {
  let end = endCursor;
  if (end === undefined) {
    const answer = await command(sessionId, { type: 'attach', payload: { chatId } });
    end = answer.status === 'applied' && answer.effect === 'not-applied' ? Number(answer.details['endCursor'] ?? 0) : 0;
  }
  const events: AgentLogEvent[] = [];
  for (let cursor = 0; cursor < end; ) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order.
    const answer = await sessionOf(sessionId).read({
      chatId,
      cursor,
      limit: agentWireLimits.batchRows,
      maxBytes: agentWireLimits.batchBytes,
    });
    if (answer.status !== 'batch') {
      throw new Error(`The read of chat ${chatId} was refused (${answer.reason}).`);
    }
    events.push(...(answer.events as AgentLogEvent[]));
    cursor = answer.nextCursor;
  }
  return events;
};

type Attached = {
  readonly answer: CommandAnswer;
  readonly snapshot?: HostRunSnapshot;
  readonly takeover?: boolean;
  readonly events: AgentLogEvent[];
};

/** The page's reattach: the `attach` command, then the chat's rows up to the end it reported. */
const attach = async (sessionId: string, chatId: string): Promise<Attached> => {
  const answer = await command(sessionId, { type: 'attach', payload: { chatId } });
  const details = answer.status === 'applied' && answer.effect === 'not-applied' ? answer.details : {};
  const endCursor = Number((details as { endCursor?: number }).endCursor ?? 0);
  return {
    answer,
    ...(details as Omit<Attached, 'answer' | 'events'>),
    events: await readAll(sessionId, chatId, endCursor),
  };
};

const initializeSession = async (
  sessionId: string,
  request: Omit<AgentHostProjectProvide, 'computeMode' | 'computeStorePort' | 'projectId' | 'hostId'>,
  delays?: ResidentWorkerContext['delays'],
): Promise<BrowserProjectHost> => {
  const host = await openBrowserProjectHost(
    { ...request, projectId: request.authority.projectId, hostId: sessionId, computeMode: 'off' },
    { tabId: sessionId, visibility, ...(delays === undefined ? {} : { delays }) },
  );
  const client = createAgentChannelClient({
    connect: () => {
      const { port1, port2 } = new MessageChannel();
      host.connect(port1);
      return port2;
    },
    sessionKey: sessionId,
  });
  sessions.set(sessionId, { host, client });
  return host;
};

const closeSession = async (sessionId: string): Promise<void> => {
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  session?.client.close();
  await session?.host.close();
};

it('runs a gateway turn in the dedicated launcher and commits its OPFS event log', async () => {
  const fileSystemProvider = new OPFSProvider();
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-${crypto.randomUUID()}`;
  const storageRoot = await navigator.storage.getDirectory();
  await storageRoot.getDirectoryHandle(providerBasePath, { create: true });
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tau-agent-host-browser-test',
  });
  const clientOptions = {
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(rootedProvider(fileSystemProvider, providerBasePath)),
    projectStorage: { projectId: providerBasePath, backend: 'opfs', providerBasePath },
    durability: 'exclusive-append',
    authority: { projectId: providerBasePath, workspaceId: providerBasePath },
    gatewayBaseUrl: location.origin,
    systemPrompt: 'Browser launcher fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Browser launcher fixture.' },
      { type: 'text', text: 'Workspace fixture.' },
      { type: 'text', text: 'Dynamic fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
  } as const satisfies Parameters<typeof createBrowserAgentHostClient>[0];
  const client = createBrowserAgentHostClient({
    ...clientOptions,
    createWorker: () => worker,
  });

  try {
    const snapshot = await client.start({
      chatId: 'chat-browser-fixture',
      runId: 'run-browser-fixture',
      trigger: 'submit',
      message: 'Confirm the browser launcher.',
    });
    expect(snapshot).toMatchObject({
      chatId: 'chat-browser-fixture',
      runId: 'run-browser-fixture',
      state: 'completed',
    });
    expect(snapshot.messages).toContainEqual(
      expect.objectContaining({ role: 'assistant', content: [{ type: 'text', text: 'Worker ready.' }] }),
    );

    const root = await navigator.storage.getDirectory();
    const project = await root.getDirectoryHandle(providerBasePath);
    const tau = await project.getDirectoryHandle('.tau');
    const chats = await tau.getDirectoryHandle('chats');
    const chat = await chats.getDirectoryHandle('chat-browser-fixture');
    const logHandle = await chat.getFileHandle('events.jsonl');
    const log = await logHandle.getFile();
    const logText = await log.text();
    const events = logText
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            readonly leaderEpoch?: unknown;
            readonly runId?: unknown;
            readonly state?: unknown;
            readonly storageDurability?: unknown;
          },
      );
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => typeof event.leaderEpoch === 'string')).toBe(true);
    expect(events.every((event) => event.runId === 'run-browser-fixture')).toBe(true);
    expect(events.find((event) => event.state === 'admitted')?.storageDurability).toBe('exclusive-append');

    const retryMessage = snapshot.messages.findLast((message) => message.role === 'user');
    if (!retryMessage) {
      throw new Error('Completed browser turn did not retain its user message.');
    }
    await client.close();
    const retryClient = createBrowserAgentHostClient({
      ...clientOptions,
      authority: { projectId: providerBasePath, workspaceId: `${providerBasePath}-retry` },
    });
    try {
      // A settled publication creates a fresh workspace and worker. Retry must
      // rewind before re-projecting the same durable user-message identity.
      const retried = await retryClient.start({
        chatId: 'chat-browser-fixture',
        runId: 'run-browser-retry',
        trigger: 'regenerate',
        retainedMessageIds: [],
        message: retryMessage,
      });
      expect(retried).toMatchObject({
        chatId: 'chat-browser-fixture',
        runId: 'run-browser-retry',
        state: 'completed',
      });
    } finally {
      await retryClient.close();
    }
  } finally {
    await client.close();
  }
});

it('refuses initialization when the persisted project root is missing', async () => {
  const fileSystemProvider = new OPFSProvider();
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `missing-agent-host-${crypto.randomUUID()}`;
  const client = createBrowserAgentHostClient({
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(rootedProvider(fileSystemProvider, providerBasePath)),
    projectStorage: { projectId: providerBasePath, backend: 'opfs', providerBasePath },
    durability: 'exclusive-append',
    authority: { projectId: providerBasePath, workspaceId: providerBasePath },
    gatewayBaseUrl: location.origin,
    systemPrompt: 'Browser launcher fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Browser launcher fixture.' },
      { type: 'text', text: 'Workspace fixture.' },
      { type: 'text', text: 'Dynamic fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
  });

  await expect(
    client.start({ chatId: 'missing-chat', runId: 'missing-run', trigger: 'submit', message: 'Do not create it.' }),
  ).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });
  await client.close();
});

it('reclaims an abandoned transactional writer lock after winning attach takeover', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-${crypto.randomUUID()}`;
  const chatId = 'chat-browser-recovery';
  const runId = 'run-browser-recovery';
  const eventPath = `${providerBasePath}/.tau/chats/${chatId}/events.jsonl`;
  const event = (sequence: number, value: Readonly<Record<string, unknown>>): string =>
    `${JSON.stringify({
      version: 1,
      leaderEpoch: 'abandoned-leader',
      sequence,
      recordedAt: '2026-09-01T00:00:00.000Z',
      runId,
      ...value,
    })}\n`;
  await fileSystemProvider.writeFile(
    eventPath,
    [
      event(0, { type: 'run.lifecycle', state: 'admitted', storageDurability: 'transactional-rewrite' }),
      event(1, {
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: 'user-recovery', role: 'user', content: 'Recover the terminal run.' },
        context: {
          version: 1,
          systemPrompt: 'Browser launcher fixture.',
          initialMessages: [],
          postCompactionMessages: [],
        },
      }),
      event(2, { type: 'run.lifecycle', state: 'running' }),
      event(3, {
        type: 'message.appended',
        message: { id: 'assistant-recovery', role: 'assistant', content: 'Recovered.' },
      }),
      event(4, { type: 'run.lifecycle', state: 'completed' }),
    ].join(''),
  );
  await fileSystemProvider.writeFile(`${eventPath}.lock`, 'abandoned\n');
  const client = createBrowserAgentHostClient({
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(rootedProvider(fileSystemProvider, providerBasePath)),
    projectStorage: { projectId: providerBasePath, backend: 'indexeddb', providerBasePath },
    durability: 'transactional-rewrite',
    authority: { projectId: providerBasePath, workspaceId: providerBasePath },
    gatewayBaseUrl: location.origin,
    systemPrompt: 'Browser launcher fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Browser launcher fixture.' },
      { type: 'text', text: 'Workspace fixture.' },
      { type: 'text', text: 'Dynamic fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
  });

  try {
    await expect(client.attach({ chatId, cursor: 0 })).resolves.toMatchObject({
      snapshot: { chatId, runId, state: 'completed' },
    });
  } finally {
    await client.close();
  }
});

it('records the run a dead leader left as abandoned, observed on the stream', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-${crypto.randomUUID()}`;
  const chatId = 'chat-follower-recovery';
  const runId = 'run-follower-recovery';
  const eventPath = `${providerBasePath}/.tau/chats/${chatId}/events.jsonl`;
  const clientOptions = {
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(rootedProvider(fileSystemProvider, providerBasePath)),
    projectStorage: { projectId: providerBasePath, backend: 'indexeddb', providerBasePath },
    durability: 'transactional-rewrite',
    authority: { projectId: providerBasePath, workspaceId: providerBasePath },
    gatewayBaseUrl: location.origin,
    systemPrompt: 'Browser launcher fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Browser launcher fixture.' },
      { type: 'text', text: 'Workspace fixture.' },
      { type: 'text', text: 'Dynamic fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
  } as const satisfies Parameters<typeof createBrowserAgentHostClient>[0];
  const leaderWorker = new Worker(new URL('agent-host.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tau-agent-host-leader-test',
  });
  const followerWorker = new Worker(new URL('agent-host.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tau-agent-host-follower-test',
  });
  const leader = createBrowserAgentHostClient({ ...clientOptions, createWorker: () => leaderWorker });
  const follower = createBrowserAgentHostClient({ ...clientOptions, createWorker: () => followerWorker });

  try {
    /* RH-R1: `attach` is a read. It takes no lock, so neither worker leads an empty chat. */
    await expect(leader.attach({ chatId, cursor: 0 })).resolves.toMatchObject({ status: 'batch' });
    const event = (sequence: number, value: Readonly<Record<string, unknown>>): string =>
      `${JSON.stringify({
        version: 1,
        leaderEpoch: 'dead-leader',
        sequence,
        recordedAt: '2026-09-01T00:00:00.000Z',
        runId,
        ...value,
      })}\n`;
    await fileSystemProvider.writeFile(
      eventPath,
      [
        event(0, { type: 'run.lifecycle', state: 'admitted', storageDurability: 'transactional-rewrite' }),
        event(1, {
          type: 'turn.history-projection-committed',
          retainedMessageIds: [],
          message: { id: 'follower-turn', role: 'user', content: 'Recover without another command.' },
          context: {
            version: 1,
            systemPrompt: 'Browser launcher fixture.',
            model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
            initialMessages: [],
            postCompactionMessages: [],
          },
        }),
        event(2, { type: 'run.lifecycle', state: 'running' }),
      ].join(''),
    );
    /* The dead leader's run has no driver in any live worker. The attach answers at once; the claim it asks for,
     * not the attach, writes the outcome, so the test watches the stream for it (RH-R1). */
    await expect(follower.attach({ chatId, cursor: 0 })).resolves.toMatchObject({ status: 'batch' });
    /* I4: the claim *records* what it found. It never drives the dead leader's run — that would ask the provider
     * again for a turn nobody asked to repeat — so the run ends `failed`/`RUN_ABANDONED` and waits for Resume. */
    const terminal = Promise.withResolvers<void>();
    const unsubscribe = follower.subscribe({ chatId, cursor: 0 }, (eventChatId, eventItem) => {
      if (
        eventChatId === chatId &&
        eventItem.runId === runId &&
        eventItem.type === 'run.lifecycle' &&
        eventItem.state === 'failed'
      ) {
        terminal.resolve();
      }
    });

    const outcome = await Promise.race([
      terminal.promise.then(() => 'abandoned'),
      new Promise<'timeout'>((resolve) => {
        globalThis.setTimeout(() => {
          resolve('timeout');
        }, 5000);
      }),
    ]);
    unsubscribe();
    expect(outcome).toBe('abandoned');
    await expect(follower.attach({ chatId, cursor: 0 })).resolves.toMatchObject({
      snapshot: { runId, state: 'failed', failure: { code: 'RUN_ABANDONED' } },
    });
  } finally {
    await Promise.allSettled([leader.close(), follower.close()]);
    await retireWorkers(leaderWorker, followerWorker);
  }
});

/*
 * The worker's own tool path, driven in the page: the config's gateway
 * middleware answers every call with the same single-turn script, so a
 * multi-tool turn has to script the wire per call — done here by swapping
 * `fetch` around this module's real project host (`openBrowserProjectHost`).
 *
 * `export_geometry` stays out: it connects the runtime worker, whose
 * shared-memory transport needs a cross-origin-isolated page, and those headers
 * live in the browser vitest config (a W10 test hold).
 */
it('runs the file tools over the one relayed workspace provider and refuses a non-empty directory delete', async () => {
  const fileSystemProvider = new OPFSProvider();
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-tools-${crypto.randomUUID()}`;
  const workspace = rootedProvider(fileSystemProvider, providerBasePath);
  const sessionId = `session-${crypto.randomUUID()}`;
  const turns = authoritativeGatewayWireFixtures.browserFileToolTurns;
  let served = 0;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes('/v1/llm/')) {
      return realFetch(input, init);
    }
    const frames = turns[Math.min(served++, turns.length - 1)] ?? [];
    return new Response(frames.join(''), {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-file-tool-fixture' },
    });
  };

  try {
    await initializeSession(sessionId, {
      fileSystemPort: createFileSystemBridgePort(workspace).port,
      projectRootPort: createFileSystemBridgePort(workspace).port,
      projectStorage: { projectId: providerBasePath, backend: 'opfs', providerBasePath },
      authority: { projectId: providerBasePath, workspaceId: providerBasePath },
      gatewayBaseUrl: location.origin,
      systemPrompt: 'Browser file-tool fixture.',
      systemPromptBlocks: [
        { type: 'text', text: 'Browser file-tool fixture.' },
        { type: 'text', text: 'Dynamic fixture.' },
      ],
      model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
    });
    await expect(
      command(sessionId, {
        type: 'start',
        payload: {
          chatId: 'chat-file-tools',
          runId: 'run-file-tools',
          trigger: 'submit',
          message: { id: 'user-file-tools', role: 'user', content: 'Exercise the file tools.' },
        },
      }),
    ).resolves.toMatchObject({ status: 'applied', effect: 'durable' });
    // `start` answers at admission; the run settles asynchronously, exactly as
    // the client's own `waitForRunCompletion` observes it.
    const snapshot = await vi.waitFor(
      async () => {
        const { snapshot: settled } = await attach(sessionId, 'chat-file-tools');
        if (settled?.state !== 'completed') {
          throw new Error(`Run is ${settled?.state ?? 'unknown'}.`);
        }
        return settled;
      },
      { timeout: 20_000, interval: 50 },
    );
    expect(snapshot).toMatchObject({ runId: 'run-file-tools', state: 'completed' });
    const outputFor = (toolName: string): string =>
      JSON.stringify(
        snapshot.messages.find((message) => message.role === 'tool-output' && message.toolName === toolName),
      );

    // `create_file` wrote, and `edit_file` changed exactly the requested occurrence.
    expect(await fileSystemProvider.readFile(`${providerBasePath}/agent/main.ts`, 'utf8')).toBe(
      'export const main = 2;\n',
    );
    // `read_file` returned the edited bytes through the same provider.
    expect(outputFor('read_file')).toContain('export const main = 2;');
    // `delete_file` refuses a non-empty directory instead of removing the subtree.
    expect(outputFor('delete_file')).toContain('ENOTEMPTY');
    expect(await fileSystemProvider.readFile(`${providerBasePath}/doomed/child.ts`, 'utf8')).toBe('keep me\n');
  } finally {
    globalThis.fetch = realFetch;
    await closeSession(sessionId);
  }
});

/*
 * An `acp` agent is a daemon placement: the browser worker has no external
 * runner to give it to. Answering the wire with the same typed refusal the
 * host raises beats silently running the turn on a Tau model the user did not
 * choose.
 */
it('refuses a start that names an external agent instead of running it on Tau', async () => {
  const fileSystemProvider = new OPFSProvider();
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-external-${crypto.randomUUID()}`;
  const workspace = rootedProvider(fileSystemProvider, providerBasePath);
  const sessionId = `session-${crypto.randomUUID()}`;

  try {
    await initializeSession(sessionId, {
      fileSystemPort: createFileSystemBridgePort(workspace).port,
      projectRootPort: createFileSystemBridgePort(workspace).port,
      projectStorage: { projectId: providerBasePath, backend: 'opfs', providerBasePath },
      authority: { projectId: providerBasePath, workspaceId: providerBasePath },
      gatewayBaseUrl: location.origin,
      systemPrompt: 'Browser external-agent fixture.',
      systemPromptBlocks: [
        { type: 'text', text: 'Browser external-agent fixture.' },
        { type: 'text', text: 'Dynamic fixture.' },
      ],
      model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
    });

    // Drift 2: the selector rides in `config.agent`.
    await expect(
      command(sessionId, {
        type: 'start',
        payload: {
          chatId: 'chat-external-agent',
          runId: 'run-external-agent',
          trigger: 'submit',
          message: { id: 'user-external-agent', role: 'user', content: 'Run this on Codex.' },
          config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
        },
      }),
    ).resolves.toMatchObject({ status: 'refused', effect: 'not-applied', code: 'EXTERNAL_AGENT_UNAVAILABLE' });

    // The refusal is durable-free: nothing was admitted for the refused run.
    await expect(readAll(sessionId, 'chat-external-agent')).resolves.toEqual([]);
  } finally {
    await closeSession(sessionId);
  }
});

/**
 * Seed one chat's durable log directly, as a dead document would have left it.
 *
 * @param fileSystemProvider - The provider the worker session is opened over.
 * @param input - Where the log lives and the record bodies to write.
 * @returns Resolves once the log is on disk.
 */
const seedChatLog = async (
  fileSystemProvider: FileSystemProvider,
  input: {
    readonly providerBasePath: string;
    readonly chatId: string;
    readonly runId: string;
    readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
  },
): Promise<void> => {
  await fileSystemProvider.writeFile(
    `${input.providerBasePath}/.tau/chats/${input.chatId}/events.jsonl`,
    input.rows
      .map(
        (row, sequence) =>
          `${JSON.stringify({
            version: 1,
            leaderEpoch: 'abandoned-leader',
            sequence,
            recordedAt: '2026-09-01T00:00:00.000Z',
            runId: input.runId,
            ...row,
          })}\n`,
      )
      .join(''),
  );
};

/**
 * Open a worker session over a seeded project, with no gateway turn to run.
 *
 * @param fileSystemProvider - The provider the session is opened over.
 * @param input - The project root and the session key to initialize under.
 * @returns The project host, once it answers commands.
 */
const initializeSeededSession = async (
  fileSystemProvider: FileSystemProvider,
  input: {
    readonly providerBasePath: string;
    readonly sessionId: string;
    readonly workspaceId?: string;
    readonly delays?: ResidentWorkerContext['delays'];
  },
): Promise<BrowserProjectHost> => {
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const workspace = rootedProvider(fileSystemProvider, input.providerBasePath);
  return initializeSession(
    input.sessionId,
    {
      fileSystemPort: createFileSystemBridgePort(workspace).port,
      projectRootPort: createFileSystemBridgePort(workspace).port,
      projectStorage: {
        projectId: input.providerBasePath,
        backend: 'indexeddb',
        providerBasePath: input.providerBasePath,
      },
      authority: { projectId: input.providerBasePath, workspaceId: input.workspaceId ?? input.providerBasePath },
      gatewayBaseUrl: location.origin,
      systemPrompt: 'Browser takeover fixture.',
      systemPromptBlocks: [
        { type: 'text', text: 'Browser takeover fixture.' },
        { type: 'text', text: 'Dynamic fixture.' },
      ],
      model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
    },
    input.delays,
  );
};

/*
 * I4: a takeover *records* what it found; it never drives a run. Resuming the
 * orphan re-asked the provider for a turn the person had already paid for — on
 * a run no page owned, so it minted no revision and wrote no settlement — and
 * it fired on the next gesture's attach rather than on any decision. The run is
 * failed with `RUN_ABANDONED`, which `isResumableRunFailure` accepts, so the
 * saved-turn card offers Resume and the person decides.
 */
it('records an attached run whose driver is gone as abandoned instead of resuming it', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const providerBasePath = `agent-host-abandoned-${crypto.randomUUID()}`;
  const chatId = 'chat-abandoned';
  const runId = 'run-abandoned';
  const sessionId = `session-${crypto.randomUUID()}`;
  // A partial stream is never durable, so the orphan carries its user turn and
  // no assistant content — exactly what a resume would have re-asked for.
  await seedChatLog(fileSystemProvider, {
    providerBasePath,
    chatId,
    runId,
    rows: [
      { type: 'run.lifecycle', state: 'admitted' },
      {
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: 'user-abandoned', role: 'user', content: 'Build it.' },
        context: {
          version: 1,
          systemPrompt: 'Browser takeover fixture.',
          initialMessages: [],
          postCompactionMessages: [],
        },
      },
      { type: 'run.lifecycle', state: 'running' },
    ],
  });

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    /* RH-R1: the attach is a read that asks for a claim (`takeover`); the claim writes the outcome. */
    await expect(attach(sessionId, chatId)).resolves.toMatchObject({ takeover: true });
    await expect(settled(sessionId, chatId, 'failed')).resolves.toMatchObject({
      chatId,
      runId,
      failure: { code: 'RUN_ABANDONED' },
    });
    const attached = await attach(sessionId, chatId);
    // Nothing was re-asked: no second committed turn, no assistant message.
    expect(attached.events.filter((event) => event.type === 'turn.history-projection-committed')).toHaveLength(1);
    expect(attached.events.filter((event) => event.type === 'message.appended')).toHaveLength(0);
    expect(attached.events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({ state: 'failed' });
  } finally {
    await closeSession(sessionId);
  }
});

/*
 * T2-D6. A paused run is waiting on a person, not on a host, so a takeover has
 * nothing to record: resuming it blocked on an interrupt answer the UI could
 * not render, because the transcript comes from that very attach. A paused Tau
 * run is no orphan (its pause survives a restart, RA-S7), so the attach asks
 * for no claim, takes no lock, and the pause stays resumable.
 *
 * Reachability, checked at the source: `run.lifecycle: paused` has exactly two
 * writers, `TauAgentHost.interrupt` (called only by the node launcher) and the
 * external-agent runner's approval, and this worker refuses every external
 * agent. A browser-placed Tau turn cannot pause today — this row pins the
 * behaviour for the placement that can, and for the day one does.
 */
it('leaves an attached paused run paused and republishes its pending interrupt', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const providerBasePath = `agent-host-paused-${crypto.randomUUID()}`;
  const chatId = 'chat-paused';
  const runId = 'run-paused';
  const sessionId = `session-${crypto.randomUUID()}`;
  await seedChatLog(fileSystemProvider, {
    providerBasePath,
    chatId,
    runId,
    rows: [
      { type: 'run.lifecycle', state: 'admitted' },
      {
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: 'user-paused', role: 'user', content: 'Ask me first.' },
        context: {
          version: 1,
          systemPrompt: 'Browser takeover fixture.',
          initialMessages: [],
          postCompactionMessages: [],
        },
      },
      { type: 'run.lifecycle', state: 'running' },
      {
        type: 'interrupt.recorded',
        interruptId: 'interrupt-paused',
        phase: 'requested',
        reason: 'May I write this file?',
        payload: { kind: 'approval', prompt: 'May I write this file?' },
      },
      { type: 'run.lifecycle', state: 'paused' },
    ],
  });

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    const attached = await attach(sessionId, chatId);

    expect(attached).toMatchObject({ takeover: false, snapshot: { runId, state: 'paused' } });
    expect(await chatLocks(providerBasePath)).toEqual({ held: [], pending: [] });
    expect(attached.events.filter((event) => event.type === 'interrupt.recorded')).toMatchObject([
      { interruptId: 'interrupt-paused', phase: 'requested' },
    ]);
    // Left paused: no terminal record was invented for a run awaiting a person.
    expect(attached.events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({ state: 'paused' });
  } finally {
    await closeSession(sessionId);
  }
});

/*
 * T4-08 / T2-D8. `snapshot`'s `NO_RUN_ADMITTED` escaped into `attach`, so a
 * chat whose log holds records but no run could never be opened again — the
 * same permanent wedge, re-armed from the other side. `attach` answers with no
 * snapshot, and the rows stay readable.
 */
it('attaches to a chat whose log holds records but no admitted run', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const providerBasePath = `agent-host-runless-${crypto.randomUUID()}`;
  const chatId = 'chat-runless';
  const runId = 'run-runless';
  const sessionId = `session-${crypto.randomUUID()}`;
  await seedChatLog(fileSystemProvider, {
    providerBasePath,
    chatId,
    runId,
    rows: [
      {
        type: 'turn.failed',
        chatId,
        turnId: 'user-runless',
        reason: 'The turn ended before it recorded a revision.',
      },
    ],
  });

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    const attached = await attach(sessionId, chatId);

    expect(attached).toMatchObject({ answer: { status: 'applied' }, takeover: false });
    expect(attached.snapshot).toBeUndefined();
    expect(attached.events).toHaveLength(1);
  } finally {
    await closeSession(sessionId);
  }
});

/* ============================================================================ *
 * W6 resident host (RH-S8 to RH-S10): deferred browser tier, run at the gate.  *
 * ============================================================================ */

/** The chat's lock name, as `chatLeadershipNames` derives it (RH-R6). */
const chatLockName = (projectId: string, chatId: string): string =>
  `agent-host-log:${[projectId, chatId].map((part) => encodeURIComponent(part)).join(':')}`;

/** The chat locks this origin holds or waits for; of one project's chats when named, so no other test's leak counts. */
const chatLocks = async (projectId?: string): Promise<Readonly<{ held: string[]; pending: string[] }>> => {
  const snapshot = await navigator.locks.query();
  const prefix = projectId === undefined ? 'agent-host-log:' : chatLockName(projectId, '');
  const names = (locks: readonly LockInfo[] | undefined): string[] =>
    (locks ?? []).map((lock) => lock.name ?? '').filter((name) => name.startsWith(prefix));
  return { held: names(snapshot.held), pending: names(snapshot.pending) };
};

/**
 * Hold the model's answer for every gateway call until `release`, so a run stays `running`. The held call rejects on
 * its signal, as a real `fetch` does: a cancel is answered once the driver ends, which waits on this call.
 */
const gateModel = () => {
  const realFetch = globalThis.fetch.bind(globalThis);
  const gate = Promise.withResolvers<void>();
  const bodies: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/v1/llm/')) {
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      signal?.throwIfAborted();
      const aborted = Promise.withResolvers<never>();
      signal?.addEventListener(
        'abort',
        () => {
          aborted.reject(signal.reason);
        },
        { once: true },
      );
      await Promise.race([gate.promise, aborted.promise]);
      return new Response(authoritativeGatewayWireFixtures.browserTurn.join(''), {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-gated-fixture' },
      });
    }
    return realFetch(input, init);
  };
  return {
    bodies,
    release: () => {
      gate.resolve();
    },
    restore: () => {
      gate.resolve();
      globalThis.fetch = realFetch;
    },
  };
};

const startPayload = (chatId: string, runId: string) => ({
  chatId,
  runId,
  trigger: 'submit',
  message: { id: `user-${runId}`, role: 'user', content: 'Build it.' },
});

/** A seeded IndexedDB project for the in-page host rows. */
const seededProject = async (label: string) => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  return { fileSystemProvider, providerBasePath: `agent-host-${label}-${crypto.randomUUID()}` };
};

const settled = async (sessionId: string, chatId: string, state: HostRunSnapshot['state']) =>
  vi.waitFor(
    async () => {
      const { snapshot } = await attach(sessionId, chatId);
      if (snapshot?.state !== state) {
        throw new Error(`Run is ${snapshot?.state ?? 'unknown'}.`);
      }
      return snapshot;
    },
    { timeout: 20_000, interval: 50 },
  );

/* RH-A1 (RH-S8): one resident worker serves every chat of a project, one stream each. */
it('should serve two chats of one project over two connections in one worker', async () => {
  const options = await opfsProject('two-chats');
  const workers: Worker[] = [];
  /* A fresh worker each call, as the page's factory makes one: a retired worker is never handed back. */
  const createWorker = vi.fn(() => {
    const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
    workers.push(worker);
    return worker;
  });
  const first = createBrowserAgentHostClient({ ...options, createWorker });
  const second = createBrowserAgentHostClient({ ...options, createWorker });

  try {
    const [a, b] = await Promise.all([
      first.start({ chatId: 'chat-a', runId: 'run-a', trigger: 'submit', message: 'A.' }),
      second.start({ chatId: 'chat-b', runId: 'run-b', trigger: 'submit', message: 'B.' }),
    ]);
    expect(a).toMatchObject({ runId: 'run-a', state: 'completed' });
    expect(b).toMatchObject({ runId: 'run-b', state: 'completed' });
    expect(createWorker).toHaveBeenCalledOnce();
  } finally {
    await Promise.allSettled([first.close(), second.close()]);
    await retireWorkers(...workers);
  }
});

/* RH-A2 (D17): closing a stream only detaches it; the run goes on and a new stream replays it. */
it('should keep executing a run after its connection closes and replay it on reattach', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('detach');
  const sessionId = `session-${crypto.randomUUID()}`;
  const model = gateModel();
  try {
    const host = await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    await expect(
      command(sessionId, { type: 'start', payload: startPayload('chat-detach', 'run-detach') }),
    ).resolves.toMatchObject({ status: 'applied' });
    sessionOf(sessionId).close();
    sessions.set(sessionId, {
      host,
      client: createAgentChannelClient({
        connect: () => {
          const { port1, port2 } = new MessageChannel();
          host.connect(port1);
          return port2;
        },
      }),
    });
    model.release();

    const snapshot = await settled(sessionId, 'chat-detach', 'completed');
    expect(snapshot).toMatchObject({ runId: 'run-detach' });
  } finally {
    model.restore();
    await closeSession(sessionId);
  }
});

/* RH-A4 (W0.17, RH-R6): the channel is keyed on the project and chat alone. */
it('should answer a follower on another checkout within one heartbeat', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('checkouts');
  const leader = `session-${crypto.randomUUID()}`;
  const follower = `session-${crypto.randomUUID()}`;
  const model = gateModel();
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: leader });
    await initializeSeededSession(fileSystemProvider, {
      providerBasePath,
      sessionId: follower,
      workspaceId: 'another-checkout',
    });
    /* A chat is led only while it needs a writer (RH-R8): a held run keeps the leader's lock. */
    await command(leader, { type: 'start', payload: startPayload('chat-checkouts', 'run-checkouts') });
    await settled(leader, 'chat-checkouts', 'running');

    const began = performance.now();
    await expect(readAll(follower, 'chat-checkouts')).resolves.not.toHaveLength(0);
    expect(performance.now() - began).toBeLessThan(1500);
    expect(await chatLocks(providerBasePath)).toMatchObject({
      held: [chatLockName(providerBasePath, 'chat-checkouts')],
    });
  } finally {
    model.restore();
    await closeSession(follower);
    await closeSession(leader);
  }
});

/** Serve every gateway call from `frames(call)`, counting calls from 0; other requests go to the network. */
const scriptModel = (frames: (call: number) => readonly string[]) => {
  const realFetch = globalThis.fetch.bind(globalThis);
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes('/v1/llm/')) {
      return realFetch(input, init);
    }
    const call = calls;
    calls += 1;
    return new Response(frames(call).join(''), {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': `operation-scripted-${String(call)}` },
    });
  };
  return {
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
};

/** One `get_kernel_result` call on `targetFile`, as the gateway streams it. */
const kernelToolCall = (callId: string, targetFile: string): readonly string[] => [
  `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"${callId}","function":{"name":"get_kernel_result","arguments":"{\\"targetFile\\":\\"${targetFile}\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n`,
  'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\n',
  'data: [DONE]\n\n',
];

/* RH-A6 (RH-S9): the runtime client lives with the project host, not with a turn or a stream. Every turn asks the
 * kernel, so a runtime worker per turn (or per stream) would show as more than one. */
it('should construct one runtime worker across three turns on one checkout', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('kernel');
  await fileSystemProvider.writeFile(`${providerBasePath}/main.scad`, 'cube(10);\n');
  const sessionId = `session-${crypto.randomUUID()}`;
  /* Even calls ask the kernel; odd calls close the turn. */
  const model = scriptModel((call) =>
    call % 2 === 0
      ? kernelToolCall(`call-kernel-${String(call)}`, 'main.scad')
      : authoritativeGatewayWireFixtures.browserTurn,
  );
  const realWorker = globalThis.Worker;
  let runtimeWorkers = 0;
  globalThis.Worker = class extends realWorker {
    public constructor(scriptUrl: string | URL, options?: WorkerOptions) {
      super(scriptUrl, options);
      if (options?.name === 'tau-ui-runtime-worker') {
        runtimeWorkers += 1;
      }
    }
  };
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    for (const runId of ['run-1', 'run-2', 'run-3']) {
      // oxlint-disable-next-line no-await-in-loop -- turns run in order.
      await command(sessionId, { type: 'start', payload: startPayload('chat-kernel', runId) });
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const snapshot = await settled(sessionId, 'chat-kernel', 'completed');
      expect(snapshot.messages).toContainEqual(
        expect.objectContaining({ role: 'tool-output', toolName: 'get_kernel_result' }),
      );
    }

    expect(runtimeWorkers).toBe(1);
  } finally {
    globalThis.Worker = realWorker;
    model.restore();
    await closeSession(sessionId);
  }
});

/* RH-A15 (T7, EQ4): a finished chat's actors stop, its writer closes and it holds no lock; its next command opens it
 * again. On this leg EQ4's relinquish does it before the eviction bound (C6), which the Node leg's RH-A15 covers. */
it("should stop an idle chat's actors and hold no lock", async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('idle');
  const sessionId = `session-${crypto.randomUUID()}`;
  const writerLock = `${providerBasePath}/.tau/chats/chat-idle/events.jsonl.lock`;
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId, delays: { idleEviction: 250 } });
    await command(sessionId, { type: 'start', payload: startPayload('chat-idle', 'run-idle') });
    await settled(sessionId, 'chat-idle', 'completed');

    await vi.waitFor(
      async () => {
        expect(await chatLocks(providerBasePath)).toEqual({ held: [], pending: [] });
        expect(await fileSystemProvider.exists(writerLock)).toBe(false);
      },
      { timeout: 5000, interval: 50 },
    );
    await expect(attach(sessionId, 'chat-idle')).resolves.toMatchObject({
      snapshot: { runId: 'run-idle', state: 'completed' },
    });
  } finally {
    await closeSession(sessionId);
  }
});

/* RH-A17 (D-092, W6.r1 finding 6), M1's leg: chat a's run actors fail to open a log that cannot be read; chat b keeps
 * streaming, and chat a's next command, once its log is readable, is answered by a fresh incarnation instead of
 * hanging. M2's leg (its `onError`) is `leadership.test.ts`'s "should keep chat b leading when chat a's leadership
 * faults". */
it("should keep chat b streaming when chat a's actor fails", async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('fault');
  const sessionId = `session-${crypto.randomUUID()}`;
  const faultedLog = `${providerBasePath}/.tau/chats/chat-a/events.jsonl`;
  /* A directory where chat a's log belongs: every read of it throws inside the chat's actors. */
  await fileSystemProvider.mkdir(faultedLog, { recursive: true });
  const model = gateModel();
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    await expect(
      command(sessionId, { type: 'start', payload: startPayload('chat-b', 'run-b') }),
    ).resolves.toMatchObject({ status: 'applied' });
    const faulted = await command(sessionId, { type: 'start', payload: startPayload('chat-a', 'run-a') }).then(
      (answer) => answer,
      (error: unknown) => error,
    );
    expect(faulted).not.toMatchObject({ status: 'applied' });

    /* Chat b is still streaming: its gated turn is running, and it completes once the model answers. */
    await expect(settled(sessionId, 'chat-b', 'running')).resolves.toMatchObject({ runId: 'run-b' });
    model.release();
    await expect(settled(sessionId, 'chat-b', 'completed')).resolves.toMatchObject({ runId: 'run-b' });

    await fileSystemProvider.rmdir(faultedLog);
    await expect(
      command(sessionId, { type: 'start', payload: startPayload('chat-a', 'run-a-again') }),
    ).resolves.toMatchObject({ status: 'applied' });
    await expect(settled(sessionId, 'chat-a', 'completed')).resolves.toMatchObject({ runId: 'run-a-again' });
  } finally {
    model.restore();
    await closeSession(sessionId);
  }
});

const runningRows = (runId: string) => [
  { type: 'run.lifecycle', state: 'admitted' },
  {
    type: 'turn.history-projection-committed',
    retainedMessageIds: [],
    message: { id: `user-${runId}`, role: 'user', content: 'Build it.' },
    context: { version: 1, systemPrompt: 'Browser takeover fixture.', initialMessages: [], postCompactionMessages: [] },
  },
  { type: 'run.lifecycle', state: 'running' },
];

/* RH-A19 (I25): reconciliation never takes a chat another live tab leads; it runs when that tab lets go. */
it("should skip a chat another tab leads and reconcile it when that tab's lock is released", async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('skip');
  const leader = `session-${crypto.randomUUID()}`;
  const other = `session-${crypto.randomUUID()}`;
  const model = gateModel();
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: leader });
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: other });
    await command(leader, { type: 'start', payload: startPayload('chat-skip', 'run-skip') });
    await settled(leader, 'chat-skip', 'running');

    /* RH-R1: the attach answers at once and may ask for a claim; while the leader holds the lock the claim writes
     * nothing, so the log still ends `running` a heartbeat and more later. */
    await attach(other, 'chat-skip');
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 1500);
    });
    const { snapshot, events } = await attach(other, 'chat-skip');
    expect(snapshot).toMatchObject({ state: 'running' });
    expect(events.filter((event) => event.type === 'run.lifecycle' && event.state === 'failed')).toEqual([]);
    await closeSession(leader);

    await expect(settled(other, 'chat-skip', 'failed')).resolves.toMatchObject({
      failure: { code: 'RUN_ABANDONED' },
    });
  } finally {
    model.restore();
    await closeSession(other);
    await closeSession(leader);
  }
});

/* T3: the last client's release never stops a live run. The host drains it to its end, then closes. */
it('should finish a live run after its project host is released, then close', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('drain');
  const sessionId = `session-${crypto.randomUUID()}`;
  const reader = `session-${crypto.randomUUID()}`;
  const model = gateModel();
  try {
    const host = await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    const hosts = createProjectHosts(async () => host);
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the registry reads only these two.
    await hosts.provide({ projectId: providerBasePath, hostId: host.hostId } as AgentHostProjectProvide);
    await command(sessionId, { type: 'start', payload: startPayload('chat-drain', 'run-drain') });
    await settled(sessionId, 'chat-drain', 'running');

    let released = false;
    const releasing = (async (): Promise<void> => {
      await hosts.release({ projectId: providerBasePath, hostId: host.hostId });
      released = true;
    })();
    sessions.delete(sessionId);
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 500);
    });
    expect(released).toBe(false);
    model.release();
    await releasing;

    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: reader });
    await expect(attach(reader, 'chat-drain')).resolves.toMatchObject({
      snapshot: { runId: 'run-drain', state: 'completed' },
    });
    expect(await chatLocks(providerBasePath)).toEqual({ held: [], pending: [] });
  } finally {
    model.restore();
    await closeSession(reader);
    await closeSession(sessionId);
  }
});

/* RH-A19 with W8 (TS-R16): the placement's `leaseHeld` fact reaches `reconcile{wait:true}` (RH-S11). */
it.todo("should queue for a chat's lock on a leaseHeld fact");

/* RH-A19 (RH-R16): a hidden page never queues for a chat's lock; it queues again once visible. */
it('should drop a queued reconcile request when the page is hidden and queue it again when visible', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('hidden');
  const chatId = 'chat-hidden';
  await seedChatLog(fileSystemProvider, { providerBasePath, chatId, runId: 'run-hidden', rows: runningRows('x') });
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const workspace = rootedProvider(fileSystemProvider, providerBasePath);
  let visible = true;
  const listeners = new Set<(value: boolean) => void>();
  const held = Promise.withResolvers<void>();
  const leased = Promise.withResolvers<void>();
  const lease = navigator.locks.request(chatLockName(providerBasePath, chatId), async () => {
    leased.resolve();
    await held.promise;
  });
  await leased.promise;
  const host = await openBrowserProjectHost(
    {
      projectId: providerBasePath,
      hostId: `host-${crypto.randomUUID()}`,
      fileSystemPort: createFileSystemBridgePort(workspace).port,
      projectRootPort: createFileSystemBridgePort(workspace).port,
      projectStorage: { projectId: providerBasePath, backend: 'indexeddb', providerBasePath },
      authority: { projectId: providerBasePath, workspaceId: providerBasePath },
      gatewayBaseUrl: location.origin,
      systemPrompt: 'Browser takeover fixture.',
      systemPromptBlocks: [
        { type: 'text', text: 'Browser takeover fixture.' },
        { type: 'text', text: 'Dynamic fixture.' },
      ],
      model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
    },
    {
      tabId: `tab-${crypto.randomUUID()}`,
      visibility: {
        visible: () => visible,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    },
  );
  const client = createAgentChannelClient({
    connect: () => {
      const { port1, port2 } = new MessageChannel();
      host.connect(port1);
      return port2;
    },
  });
  const setVisible = (value: boolean): void => {
    visible = value;
    for (const listener of listeners) {
      listener(value);
    }
  };
  try {
    /* The silent holder is past its heartbeat bound, so the chat queues for its lock. */
    void client.execute({ type: 'attach', commandId: 'req_hidden', payload: { chatId } } as Parameters<
      AgentChannelClient['execute']
    >[0]);
    await vi.waitFor(
      async () => {
        const { pending } = await chatLocks(providerBasePath);
        expect(pending).toContain(chatLockName(providerBasePath, chatId));
      },
      { timeout: 10_000 },
    );

    setVisible(false);
    await vi.waitFor(async () => {
      const { pending } = await chatLocks(providerBasePath);
      expect(pending).toEqual([]);
    });

    setVisible(true);
    await vi.waitFor(
      async () => {
        const { pending } = await chatLocks(providerBasePath);
        expect(pending).toContain(chatLockName(providerBasePath, chatId));
      },
      { timeout: 10_000 },
    );
  } finally {
    held.resolve();
    await lease;
    client.close();
    await host.close();
  }
});

/* RH-A21 (RH-S10): the worker reports its capability with each project host's status. */
it("should publish the worker's capability in the project-host status", async () => {
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const control = controlOf(worker);
  try {
    await control.call('init', { tabId: `tab-${crypto.randomUUID()}` });
    await expect(control.call('status', { projectId: 'no-such-project' })).resolves.toEqual({
      capability: expect.objectContaining({ supported: true }) as unknown,
    });
  } finally {
    control.close();
    worker.terminate();
  }
});

/* RH-A21 (SC-R12): a reader refused `owner-fenced` reads again from whoever holds the chat now. */
it('should serve a re-read after owner-fenced from the new holder', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('fenced');
  const chatId = 'chat-fenced';
  const leader = `session-${crypto.randomUUID()}`;
  const reader = `session-${crypto.randomUUID()}`;
  const model = gateModel();
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: leader });
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: reader });
    /* The leader holds the chat while its run waits on the model (RH-R8); `attach` alone leads nothing (RH-R1). */
    await command(leader, { type: 'start', payload: startPayload(chatId, 'run-fenced') });
    await settled(leader, chatId, 'running');
    const before = await readAll(reader, chatId);
    expect(before).not.toHaveLength(0);
    await closeSession(leader);

    /* The same rows from whoever holds the chat now; the reader's own claim may add the orphan's outcome after them. */
    const after = await readAll(reader, chatId);
    expect(after.slice(0, before.length)).toEqual(before);
  } finally {
    model.restore();
    await closeSession(reader);
    await closeSession(leader);
  }
});

/* RH-A21 (RH-R7): a follower's cancel runs on the tab that leads the run. */
it("should forward a follower's cancel to the tab that leads the run", async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('cancel');
  const leader = `session-${crypto.randomUUID()}`;
  const follower = `session-${crypto.randomUUID()}`;
  const model = gateModel();
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: leader });
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId: follower });
    await command(leader, { type: 'start', payload: startPayload('chat-cancel', 'run-cancel') });

    await expect(
      command(follower, { type: 'cancel', payload: { chatId: 'chat-cancel', runId: 'run-cancel' } }),
    ).resolves.toMatchObject({ status: 'applied' });
    await expect(settled(leader, 'chat-cancel', 'cancelled')).resolves.toMatchObject({ runId: 'run-cancel' });
  } finally {
    model.restore();
    await closeSession(follower);
    await closeSession(leader);
  }
});

/* RH-A22 (RH-S8): the browser host offers the read-only `revisions` tool once it has a revisions port. */
it('should offer the revisions tool on the browser host', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('revisions');
  const sessionId = `session-${crypto.randomUUID()}`;
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const workspace = rootedProvider(fileSystemProvider, providerBasePath);
  const revisions = new MessageChannel();
  const model = gateModel();
  try {
    await initializeSession(sessionId, {
      fileSystemPort: createFileSystemBridgePort(workspace).port,
      projectRootPort: createFileSystemBridgePort(workspace).port,
      revisionsPort: revisions.port1,
      projectStorage: { projectId: providerBasePath, backend: 'indexeddb', providerBasePath },
      authority: { projectId: providerBasePath, workspaceId: providerBasePath },
      gatewayBaseUrl: location.origin,
      systemPrompt: 'Browser revisions fixture.',
      systemPromptBlocks: [
        { type: 'text', text: 'Browser revisions fixture.' },
        { type: 'text', text: 'Dynamic fixture.' },
      ],
      model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
    });
    await command(sessionId, { type: 'start', payload: startPayload('chat-revisions', 'run-revisions') });
    await vi.waitFor(() => {
      expect(model.bodies).toHaveLength(1);
    });

    expect(model.bodies[0]).toContain('"revisions"');
  } finally {
    model.restore();
    await closeSession(sessionId);
    revisions.port2.close();
  }
});

/* RH-A23 (RH-R21): reading a chat observes it; it takes no lock, opens no writer and starts no run actor or timer. */
it('should observe fifty listed chats with no lock, writer, run actor or timer', async () => {
  const { fileSystemProvider, providerBasePath } = await seededProject('observe');
  const sessionId = `session-${crypto.randomUUID()}`;
  const chatIds = Array.from({ length: 50 }, (_, index) => `chat-${String(index)}`);
  for (const chatId of chatIds) {
    // oxlint-disable-next-line no-await-in-loop -- seeding is ordered.
    await seedChatLog(fileSystemProvider, {
      providerBasePath,
      chatId,
      runId: `run-${chatId}`,
      rows: [{ type: 'run.lifecycle', state: 'completed' }],
    });
  }
  /* A distinctive idle bound: an M1 incarnation, which every run actor is, arms it as soon as it rests. */
  const idleEviction = 424_242;
  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId, delays: { idleEviction } });
    /* The first read dials the stream, whose keepalive is the connection's (E3d), not a chat's. */
    await expect(readAll(sessionId, 'chat-0', 1)).resolves.toHaveLength(1);
    const timeouts = vi.spyOn(globalThis, 'setTimeout');
    const intervals = vi.spyOn(globalThis, 'setInterval');
    let pages: AgentLogEvent[][];
    try {
      pages = await Promise.all(chatIds.map(async (chatId) => readAll(sessionId, chatId, 1)));
    } finally {
      timeouts.mockRestore();
      intervals.mockRestore();
    }

    expect(pages.every((events) => events.length === 1)).toBe(true);
    expect(timeouts.mock.calls.filter(([, delay]) => delay === idleEviction)).toEqual([]);
    expect(intervals).not.toHaveBeenCalled();
    expect(await chatLocks(providerBasePath)).toEqual({ held: [], pending: [] });
    for (const chatId of chatIds) {
      // oxlint-disable-next-line no-await-in-loop -- one stat per chat.
      expect(await fileSystemProvider.exists(`${providerBasePath}/.tau/chats/${chatId}/events.jsonl.lock`)).toBe(false);
    }
  } finally {
    await closeSession(sessionId);
  }
});

/* RH-S8 (RV9-F1): the revisions port is asked for when the host is provided, never when the client is composed; a
 * host provided while the project's revision client is closed gets no port, and so offers no `revisions` tool. */
it("should broker the revisions port only after the project's revision client opens", async () => {
  const options = await opfsProject('revisions-port');
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  /* The revision client has not opened: the composition has no port to give. */
  const openRevisionsPort = vi.fn((): MessagePort | undefined => undefined);
  const client = createBrowserAgentHostClient({ ...options, openRevisionsPort, createWorker: () => worker });
  const { fileSystemProvider, providerBasePath } = await seededProject('revisions-gate');
  const sessionId = `session-${crypto.randomUUID()}`;
  const model = gateModel();
  try {
    expect(openRevisionsPort).not.toHaveBeenCalled();
    await client.attach({ chatId: 'chat-revisions-port', cursor: 0 });
    expect(openRevisionsPort).toHaveBeenCalledOnce();

    /* The same host with no revisions port, opened in this page so its model request can be read. */
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    await command(sessionId, { type: 'start', payload: startPayload('chat-revisions-gate', 'run-revisions-gate') });
    await vi.waitFor(() => {
      expect(model.bodies).toHaveLength(1);
    });
    expect(model.bodies[0]).not.toContain('"revisions"');
  } finally {
    model.restore();
    await closeSession(sessionId);
    await client.close();
    await retireWorkers(worker);
  }
});
