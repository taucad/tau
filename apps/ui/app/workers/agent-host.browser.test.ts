import { afterEach, expect, it, vi } from 'vitest';
import { DirectIdbProvider, OPFSProvider } from '@taucad/filesystem/backend';
import type { AgentLogEvent, HostRunSnapshot } from '@taucad/agent-host';
import { agentWireLimits } from '@taucad/agent-host/wire';
import type { CommandAnswer, CommandVerb, ReadAnswer } from '@taucad/agent-host/wire';
import { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import type { AgentHostWorkerInitializeRequest } from '#workers/agent-host.contract.js';
import { agentHostAuthorityName, agentHostProtocolVersion } from '#workers/agent-host-leader.js';
import { handleAgentHostWorkerCall } from '#workers/agent-host.impl.js';
import type { FileSystemProvider } from '@taucad/filesystem';
// eslint-disable-next-line @nx/enforce-module-boundaries -- The browser vitest config reads this same composed source fixture until FIX-PROJ adds the UI package dependency.
import { authoritativeGatewayWireFixtures } from '../../../../packages/agent-host/src/transport/gateway-wire.fixture.js';

let provider: FileSystemProvider | undefined;

/* eslint-disable @typescript-eslint/promise-function-async -- This test facade forwards provider promises unchanged. */
const rootedProvider = (source: FileSystemProvider, root: string): FileSystemProvider => {
  const resolve = (path: string): string => `${root}/${path.replace(/^\/+/, '')}`;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? source.readFile(resolve(path), encoding) : source.readFile(resolve(path));
  }
  return {
    id: `rooted:${source.id}`,
    capabilities: source.capabilities,
    readFile,
    writeFile: (path, data) => source.writeFile(resolve(path), data),
    appendFile: (path, data) => source.appendFile!(resolve(path), data),
    readdir: (path) => source.readdir(resolve(path)),
    stat: (path) => source.stat(resolve(path)),
    lstat: (path) => source.lstat(resolve(path)),
    mkdir: (path, options) => source.mkdir(resolve(path), options),
    unlink: (path) => source.unlink(resolve(path)),
    rmdir: (path) => source.rmdir(resolve(path)),
    rename: (from, to) => source.rename(resolve(from), resolve(to)),
    exists: (path) => source.exists(resolve(path)),
    dispose: () => undefined,
  };
};
/* eslint-enable @typescript-eslint/promise-function-async -- Restore the project default after the forwarding facade. */

afterEach(() => {
  provider?.dispose();
  provider = undefined;
});

let keys = 0;

/** One keyed command to this module's worker session, as the page's channel delivers it; a new key unless named. */
const command = async (
  sessionId: string,
  input: { readonly type: CommandVerb; readonly payload: unknown; readonly commandId?: string },
): Promise<CommandAnswer> => {
  keys += 1;
  const commandId = input.commandId ?? `req_browser-test-${String(keys)}`;
  const answer = await handleAgentHostWorkerCall(input.type, { commandId, payload: input.payload }, { sessionId });
  return answer as CommandAnswer;
};

/** Every durable row of a chat, read page by page without parking at the end. */
const readAll = async (sessionId: string, chatId: string): Promise<AgentLogEvent[]> => {
  const events: AgentLogEvent[] = [];
  for (let cursor = 0; ; ) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order.
    const answer = (await handleAgentHostWorkerCall(
      'read',
      { chatId, cursor, limit: agentWireLimits.batchRows, maxBytes: agentWireLimits.batchBytes },
      { sessionId, signal: AbortSignal.abort() },
    )) as ReadAnswer;
    if (answer.status !== 'batch') {
      throw new Error(`The read of chat ${chatId} was refused (${answer.reason}).`);
    }
    events.push(...(answer.events as AgentLogEvent[]));
    if (answer.nextCursor >= answer.endCursor) {
      return events;
    }
    cursor = answer.nextCursor;
  }
};

type Attached = {
  readonly answer: CommandAnswer;
  readonly snapshot?: HostRunSnapshot;
  readonly takeover?: boolean;
  readonly events: AgentLogEvent[];
};

/** The page's reattach: the `attach` command, then the chat's rows. */
const attach = async (sessionId: string, chatId: string): Promise<Attached> => {
  const answer = await command(sessionId, { type: 'attach', payload: { chatId } });
  const details = answer.status === 'applied' && answer.effect === 'not-applied' ? answer.details : {};
  return { answer, ...(details as Omit<Attached, 'answer' | 'events'>), events: await readAll(sessionId, chatId) };
};

const initializeSession = async (
  sessionId: string,
  request: Omit<AgentHostWorkerInitializeRequest, 'computeMode' | 'computeStorePort'>,
): Promise<void> => {
  await handleAgentHostWorkerCall('initialize', request, { sessionId });
};

const closeSession = async (sessionId: string): Promise<void> => {
  await handleAgentHostWorkerCall('close', undefined, { sessionId });
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

it('detects a dead leader, takes its log over and records the run it left as abandoned', async () => {
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
    closeTimeout: 20,
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
    // The first attach makes this context the chat's leader; the wire does not name roles.
    await expect(leader.attach({ chatId, cursor: 0 })).resolves.toMatchObject({ status: 'batch', takeover: false });
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
    // The live leader is the canonical writer; the out-of-band seed above is
    // invisible to it by design. Only the post-takeover replay must see it.
    // Forwarded to the live leader, which never saw the out-of-band seed.
    await expect(follower.attach({ chatId, cursor: 0 })).resolves.toMatchObject({ status: 'batch', takeover: false });
    /* I4: the follower takes the log over and *records* what it found. It never
     * drives the dead leader's run — that would ask the provider again for a
     * turn nobody asked to repeat — so the run ends `failed`/`RUN_ABANDONED`
     * and waits for the person's Resume. */
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
    leaderWorker.terminate();

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
    leaderWorker.terminate();
    followerWorker.terminate();
    await Promise.allSettled([leader.close(), follower.close()]);
  }
});

/*
 * The worker's own tool path, driven in the page: the config's gateway
 * middleware answers every call with the same single-turn script, so a
 * multi-tool turn has to script the wire per call — done here by swapping
 * `fetch` around this module's real `handleAgentHostWorkerCall`.
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
 * @returns Resolves once `handleAgentHostWorkerCall` will answer commands.
 */
const initializeSeededSession = async (
  fileSystemProvider: FileSystemProvider,
  input: { readonly providerBasePath: string; readonly sessionId: string },
): Promise<void> => {
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const workspace = rootedProvider(fileSystemProvider, input.providerBasePath);
  await initializeSession(input.sessionId, {
    fileSystemPort: createFileSystemBridgePort(workspace).port,
    projectRootPort: createFileSystemBridgePort(workspace).port,
    projectStorage: {
      projectId: input.providerBasePath,
      backend: 'indexeddb',
      providerBasePath: input.providerBasePath,
    },
    authority: { projectId: input.providerBasePath, workspaceId: input.providerBasePath },
    gatewayBaseUrl: location.origin,
    systemPrompt: 'Browser takeover fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Browser takeover fixture.' },
      { type: 'text', text: 'Dynamic fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
  });
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
    const attached = await attach(sessionId, chatId);

    expect(attached).toMatchObject({
      takeover: true,
      snapshot: { chatId, runId, state: 'failed', failure: { code: 'RUN_ABANDONED' } },
    });
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
 * not render, because the transcript comes from that very attach. The attach
 * republishes the pending interrupt and leaves the run paused.
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

    expect(attached).toMatchObject({ takeover: true, snapshot: { runId, state: 'paused' } });
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

/*
 * W10 finding 3, I15. The follower's forwarding wait is bounded by the
 * leader's heartbeat alone, so a leader that drops a command in silence wedges
 * that request for the life of the tab. Every command it declines is answered:
 * a stale generation, and a frame of this protocol it cannot read.
 */
it('answers every command it declines: a stale generation and a frame it cannot read', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const providerBasePath = `agent-host-refusals-${crypto.randomUUID()}`;
  const chatId = 'chat-refusals';
  const sessionId = `session-${crypto.randomUUID()}`;
  await seedChatLog(fileSystemProvider, {
    providerBasePath,
    chatId,
    runId: 'run-refusals',
    rows: [{ type: 'run.lifecycle', state: 'admitted' }],
  });
  // A second channel object receives its own context's posts; only the sending
  // object is skipped. This one plays the follower whose command is declined.
  const followerChannel = new BroadcastChannel(agentHostAuthorityName({ projectId: providerBasePath, chatId }));
  const refusals = new Map<string, { readonly code: string; readonly targetId: string | undefined }>();
  const answered = Promise.withResolvers<void>();
  followerChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const frame = event.data as {
      readonly type?: string;
      readonly targetId?: string;
      readonly response?: {
        readonly type: string;
        readonly requestId: string;
        readonly code?: string;
        readonly answer?: { readonly code?: string };
      };
    };
    if (frame.type !== 'response' || frame.response === undefined) {
      return;
    }
    const code = frame.response.code ?? frame.response.answer?.code ?? '';
    refusals.set(frame.response.requestId, { code, targetId: frame.targetId });
    if (refusals.size === 2) {
      answered.resolve();
    }
  });

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    // This context takes leadership of the chat; the frames below address it.
    await attach(sessionId, chatId);
    const binding = {
      version: agentHostProtocolVersion,
      projectId: providerBasePath,
      workspaceId: providerBasePath,
      chatId,
    };
    // A well-formed command addressed to a generation that has rolled over.
    followerChannel.postMessage({
      ...binding,
      type: 'command',
      senderId: 'tab-follower',
      targetGeneration: 'generation-that-has-rolled-over',
      command: { type: 'attach', commandId: 'req_stale', payload: { chatId }, requestId: 'req-stale', sessionId },
    });
    // A command frame this protocol cannot read, whose envelope still survives.
    followerChannel.postMessage({
      ...binding,
      type: 'command',
      senderId: 'tab-follower',
      command: { type: 'teleport', chatId, requestId: 'req-unreadable', sessionId },
    });

    await answered.promise;
    expect(refusals.get('req-stale')).toEqual({ code: 'LEADER_GENERATION_STALE', targetId: 'tab-follower' });
    expect(refusals.get('req-unreadable')).toEqual({ code: 'COMMAND_UNREADABLE', targetId: 'tab-follower' });
  } finally {
    followerChannel.close();
    await closeSession(sessionId);
  }
});

type LeaderFrame = Readonly<Record<string, unknown>> & {
  readonly type?: string;
  readonly senderId?: string;
  readonly targetId?: string;
  readonly requestId?: string;
  readonly read?: { readonly cursor: number };
  readonly command?: { readonly type: string; readonly requestId: string; readonly commandId?: string };
  readonly response?: { readonly type: string; readonly requestId: string; readonly code?: string };
  readonly answer?: Readonly<Record<string, unknown>>;
};

/** Collects the frames a channel hears and waits for the first one a predicate accepts. */
const frameLog = (channel: BroadcastChannel) => {
  const frames: LeaderFrame[] = [];
  const waiters = new Set<{
    readonly accept: (frame: LeaderFrame) => boolean;
    readonly found: (frame: LeaderFrame) => void;
  }>();
  channel.addEventListener('message', (event: MessageEvent<LeaderFrame>) => {
    frames.push(event.data);
    for (const waiter of waiters) {
      if (waiter.accept(event.data)) {
        waiters.delete(waiter);
        waiter.found(event.data);
      }
    }
  });
  return {
    frames,
    next: async (accept: (frame: LeaderFrame) => boolean, within: number): Promise<LeaderFrame> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`No matching leader frame within ${String(within)} ms.`));
        }, within);
        waiters.add({
          accept,
          found: (frame) => {
            clearTimeout(timer);
            resolve(frame);
          },
        });
      }),
  };
};

/*
 * W0.17 (L2b HD-2, O3). The channel was keyed on the protocol version and the
 * checkout while the lock was keyed on the project and chat, so a follower of
 * another build or checkout lost the lock race to a leader it could never hear,
 * and timed out about seven seconds later.
 */
it('should refuse a follower of another build within one heartbeat and answer one on another checkout', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const providerBasePath = `agent-host-keys-${crypto.randomUUID()}`;
  const chatId = 'chat-keys';
  const sessionId = `session-${crypto.randomUUID()}`;
  await seedChatLog(fileSystemProvider, {
    providerBasePath,
    chatId,
    runId: 'run-keys',
    rows: [{ type: 'run.lifecycle', state: 'admitted' }],
  });
  const name = agentHostAuthorityName({ projectId: providerBasePath, chatId });
  const followerChannel = new BroadcastChannel(name);
  const heard = frameLog(followerChannel);

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    await attach(sessionId, chatId);
    const attachCommand = { type: 'attach', commandId: 'req_keys', payload: { chatId }, sessionId } as const;

    followerChannel.postMessage({
      version: agentHostProtocolVersion + 1,
      projectId: providerBasePath,
      workspaceId: providerBasePath,
      chatId,
      type: 'command',
      senderId: 'tab-next-build',
      command: { ...attachCommand, requestId: 'req-next-build' },
    });
    const refused = await heard.next((frame) => frame.response?.requestId === 'req-next-build', 1000);
    expect(refused).toMatchObject({
      targetId: 'tab-next-build',
      response: { type: 'error', code: 'LEADER_VERSION_MISMATCH' },
    });

    followerChannel.postMessage({
      version: agentHostProtocolVersion,
      projectId: providerBasePath,
      workspaceId: 'another-checkout',
      chatId,
      type: 'command',
      senderId: 'tab-other-checkout',
      command: { ...attachCommand, requestId: 'req-other-checkout' },
    });
    const answered = await heard.next((frame) => frame.response?.requestId === 'req-other-checkout', 1000);
    expect(answered).toMatchObject({
      targetId: 'tab-other-checkout',
      response: { type: 'answer', answer: { status: 'applied', commandId: 'req_keys' } },
    });

    // One writer: the lease is still this context's.
    await expect(
      navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => lock !== null),
    ).resolves.toBe(false);
  } finally {
    followerChannel.close();
    await closeSession(sessionId);
  }
});

/*
 * SC-R12, replacing W0.13. A follower keeps no replication cursor: each page
 * read goes to the leader from the reader's own cursor, and the leader's answer
 * comes back as it was given — a refusal is handed to the reader to reset on,
 * never clamped into a short batch. This context follows; the test leads.
 */
it('should forward a page read from its own cursor and hand the leader’s refusal back unclamped', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const providerBasePath = `agent-host-cursor-${crypto.randomUUID()}`;
  const chatId = 'chat-cursor';
  const sessionId = `session-${crypto.randomUUID()}`;
  const generation = 'generation-test-leader';
  const name = agentHostAuthorityName({ projectId: providerBasePath, chatId });
  const leaderChannel = new BroadcastChannel(name);
  const heard = frameLog(leaderChannel);
  const binding = {
    version: agentHostProtocolVersion,
    projectId: providerBasePath,
    workspaceId: providerBasePath,
    chatId,
  };
  const held = Promise.withResolvers<void>();
  const leased = Promise.withResolvers<void>();
  const lease = navigator.locks.request(name, { mode: 'exclusive' }, async () => {
    leased.resolve();
    await held.promise;
  });
  await leased.promise;

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    const read = async (cursor: number): Promise<unknown> =>
      handleAgentHostWorkerCall(
        'read',
        { chatId, cursor, limit: agentWireLimits.batchRows, maxBytes: agentWireLimits.batchBytes },
        { sessionId },
      );

    const forwarded = heard.next((frame) => frame.type === 'tail-request', 2000);
    const reading = read(7);
    const request = await forwarded;
    expect(request.read).toMatchObject({ chatId, cursor: 7, limit: agentWireLimits.batchRows });
    const refusal = { status: 'refused', chatId, reason: 'cursor-ahead', expected: { endCursor: 4 } } as const;
    leaderChannel.postMessage({
      ...binding,
      type: 'tail',
      targetId: request.senderId,
      generation,
      requestId: request.requestId,
      answer: refusal,
    });
    await expect(reading).resolves.toEqual(refusal);
  } finally {
    held.resolve();
    await lease;
    leaderChannel.close();
    await closeSession(sessionId);
  }
});
