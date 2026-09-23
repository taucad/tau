import { afterEach, expect, it, vi } from 'vitest';
import { DirectIdbProvider, OPFSProvider } from '@taucad/filesystem/backend';
import { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import { agentHostTailBatchLimit } from '#workers/agent-host.contract.js';
import { agentHostAuthorityName, agentHostProtocolVersion } from '#workers/agent-host-leader.js';
import { handleAgentHostWorkerRequest } from '#workers/agent-host.impl.js';
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
    await expect(client.attach({ chatId, cursor: 0, limit: 16 })).resolves.toMatchObject({
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
    await expect(leader.attach({ chatId, cursor: 0, limit: 16 })).resolves.toMatchObject({
      leadership: { role: 'leader' },
    });
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
    await expect(follower.attach({ chatId, cursor: 0, limit: 16 })).resolves.toMatchObject({
      leadership: { role: 'follower' },
    });
    /* I4: the follower takes the log over and *records* what it found. It never
     * drives the dead leader's run — that would ask the provider again for a
     * turn nobody asked to repeat — so the run ends `failed`/`RUN_ABANDONED`
     * and waits for the person's Resume. */
    const terminal = Promise.withResolvers<void>();
    const unsubscribe = follower.subscribe((eventChatId, eventItem) => {
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
    await expect(follower.attach({ chatId, cursor: 0, limit: 16 })).resolves.toMatchObject({
      leadership: { role: 'leader' },
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
 * `fetch` around this module's real `handleAgentHostWorkerRequest`.
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
    await handleAgentHostWorkerRequest(
      {
        type: 'initialize',
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
      },
      sessionId,
    );
    await handleAgentHostWorkerRequest(
      {
        type: 'start',
        chatId: 'chat-file-tools',
        runId: 'run-file-tools',
        trigger: 'submit',
        message: { id: 'user-file-tools', role: 'user', content: 'Exercise the file tools.' },
      },
      sessionId,
    );
    // `start` returns at admission; the run settles asynchronously, exactly as
    // the client's own `waitForRunCompletion` observes it.
    const snapshot = await vi.waitFor(
      async () => {
        const attached = await handleAgentHostWorkerRequest(
          { type: 'attach', chatId: 'chat-file-tools', cursor: 0, limit: agentHostTailBatchLimit },
          sessionId,
        );
        const settled = attached.type === 'attach' ? attached.snapshot : undefined;
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
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
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
    await handleAgentHostWorkerRequest(
      {
        type: 'initialize',
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
      },
      sessionId,
    );

    await expect(
      handleAgentHostWorkerRequest(
        {
          type: 'start',
          chatId: 'chat-external-agent',
          runId: 'run-external-agent',
          trigger: 'submit',
          message: { id: 'user-external-agent', role: 'user', content: 'Run this on Codex.' },
          agent: { kind: 'acp', id: 'codex' },
        },
        sessionId,
      ),
    ).rejects.toMatchObject({ code: 'EXTERNAL_AGENT_UNAVAILABLE' });

    // The refusal is durable-free: nothing was admitted for the refused run.
    await expect(
      handleAgentHostWorkerRequest(
        { type: 'attach', chatId: 'chat-external-agent', cursor: 0, limit: agentHostTailBatchLimit },
        sessionId,
      ),
    ).resolves.toMatchObject({ type: 'attach', batch: { endCursor: 0 } });
  } finally {
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
  }
});

/*
 * V9: the run id is the admission idempotency key, so the *same* key arriving
 * twice is a duplicate dispatch — a retried post, a double-fired effect — not a
 * second turn. The worker consulted its durable log only when it knew it had
 * replayed the command, so an ordinary duplicate reached `admit` and came back
 * as a refused admission, which the page surfaces as a failed turn even though
 * the first copy ran to completion.
 */
it('answers a duplicate start under a settled run id with that run, not a conflict', async () => {
  const fileSystemProvider = new OPFSProvider();
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-duplicate-${crypto.randomUUID()}`;
  const workspace = rootedProvider(fileSystemProvider, providerBasePath);
  const sessionId = `session-${crypto.randomUUID()}`;
  const start = {
    type: 'start',
    chatId: 'chat-duplicate-start',
    runId: 'run-duplicate-start',
    trigger: 'submit',
    message: { id: 'user-duplicate-start', role: 'user', content: 'Answer once.' },
  } as const;

  try {
    await handleAgentHostWorkerRequest(
      {
        type: 'initialize',
        fileSystemPort: createFileSystemBridgePort(workspace).port,
        projectRootPort: createFileSystemBridgePort(workspace).port,
        projectStorage: { projectId: providerBasePath, backend: 'opfs', providerBasePath },
        authority: { projectId: providerBasePath, workspaceId: providerBasePath },
        gatewayBaseUrl: location.origin,
        systemPrompt: 'Browser duplicate-start fixture.',
        systemPromptBlocks: [
          { type: 'text', text: 'Browser duplicate-start fixture.' },
          { type: 'text', text: 'Dynamic fixture.' },
        ],
        model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
        runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      },
      sessionId,
    );
    await handleAgentHostWorkerRequest(start, sessionId);
    await vi.waitFor(
      async () => {
        const attached = await handleAgentHostWorkerRequest(
          { type: 'attach', chatId: start.chatId, cursor: 0, limit: agentHostTailBatchLimit },
          sessionId,
        );
        const settled = attached.type === 'attach' ? attached.snapshot : undefined;
        if (settled?.state !== 'completed') {
          throw new Error(`Run is ${settled?.state ?? 'unknown'}.`);
        }
      },
      { timeout: 20_000, interval: 50 },
    );

    await expect(handleAgentHostWorkerRequest(start, sessionId)).resolves.toMatchObject({
      type: 'result',
      operation: 'start',
      snapshot: { runId: start.runId, state: 'completed' },
    });

    // The duplicate appended no second turn under the same key.
    const attached = await handleAgentHostWorkerRequest(
      { type: 'attach', chatId: start.chatId, cursor: 0, limit: agentHostTailBatchLimit },
      sessionId,
    );
    const committed = (attached.type === 'attach' ? attached.batch.events : []).filter(
      (event) => event.type === 'turn.history-projection-committed' && event.runId === start.runId,
    );
    expect(committed).toHaveLength(1);
  } finally {
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
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
 * @returns Resolves once `handleAgentHostWorkerRequest` will answer commands.
 */
const initializeSeededSession = async (
  fileSystemProvider: FileSystemProvider,
  input: { readonly providerBasePath: string; readonly sessionId: string },
): Promise<void> => {
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const workspace = rootedProvider(fileSystemProvider, input.providerBasePath);
  await handleAgentHostWorkerRequest(
    {
      type: 'initialize',
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
    },
    input.sessionId,
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
    const attached = await handleAgentHostWorkerRequest(
      { type: 'attach', chatId, cursor: 0, limit: agentHostTailBatchLimit },
      sessionId,
    );

    expect(attached).toMatchObject({
      type: 'attach',
      takeover: true,
      snapshot: { chatId, runId, state: 'failed', failure: { code: 'RUN_ABANDONED' } },
    });
    const events = attached.type === 'attach' ? attached.batch.events : [];
    // Nothing was re-asked: no second committed turn, no assistant message.
    expect(events.filter((event) => event.type === 'turn.history-projection-committed')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'message.appended')).toHaveLength(0);
    expect(events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({ state: 'failed' });
  } finally {
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
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
    const attached = await handleAgentHostWorkerRequest(
      { type: 'attach', chatId, cursor: 0, limit: agentHostTailBatchLimit },
      sessionId,
    );

    expect(attached).toMatchObject({ type: 'attach', takeover: true, snapshot: { runId, state: 'paused' } });
    const events = attached.type === 'attach' ? attached.batch.events : [];
    expect(events.filter((event) => event.type === 'interrupt.recorded')).toMatchObject([
      { interruptId: 'interrupt-paused', phase: 'requested' },
    ]);
    // Left paused: no terminal record was invented for a run awaiting a person.
    expect(events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({ state: 'paused' });
  } finally {
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
  }
});

/*
 * T4-08 / T2-D8. `snapshot`'s `NO_RUN_ADMITTED` escaped into `attach`, so a
 * chat whose log holds records but no run could never be opened again — the
 * same permanent wedge, re-armed from the other side. `attach` answers with the
 * transcript it was asked for and no snapshot.
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
    const attached = await handleAgentHostWorkerRequest(
      { type: 'attach', chatId, cursor: 0, limit: agentHostTailBatchLimit },
      sessionId,
    );

    expect(attached).toMatchObject({ type: 'attach', takeover: false });
    expect(attached.type === 'attach' ? attached.snapshot : 'missing').toBeUndefined();
    expect(attached.type === 'attach' ? attached.batch.events : []).toHaveLength(1);
  } finally {
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
  }
});

/*
 * W10 finding 3. The follower's forwarding wait is bounded by the leader's
 * heartbeat alone (T4-11 removed the fixed 2 s deadline, which was a *work*
 * bound on someone else's command). A leader that drops a command in silence
 * therefore wedges that request for the life of the tab: it keeps heartbeating,
 * the wait never expires, `forwardCommand`'s re-address is unreachable, and the
 * composer sits on the send with no banner. Both silent drops answer now.
 *
 * UNRUN: browser tier, machine gate (W6/W10 hold).
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
  const followerChannel = new BroadcastChannel(
    agentHostAuthorityName({ projectId: providerBasePath, workspaceId: providerBasePath, chatId }),
  );
  const refusals = new Map<string, { readonly code: string; readonly targetId: string | undefined }>();
  const answered = Promise.withResolvers<void>();
  followerChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const frame = event.data as {
      readonly type?: string;
      readonly targetId?: string;
      readonly response?: { readonly type: string; readonly requestId: string; readonly code: string };
    };
    if (frame.type !== 'response' || frame.response?.type !== 'error') {
      return;
    }
    refusals.set(frame.response.requestId, { code: frame.response.code, targetId: frame.targetId });
    if (refusals.size === 2) {
      answered.resolve();
    }
  });

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    // This context takes leadership of the chat; the frames below address it.
    await handleAgentHostWorkerRequest(
      { type: 'attach', chatId, cursor: 0, limit: agentHostTailBatchLimit },
      sessionId,
    );
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
      command: { type: 'tail', chatId, cursor: 0, limit: agentHostTailBatchLimit, requestId: 'req-stale', sessionId },
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
    expect(refusals.get('req-unreadable')).toEqual({ code: 'LEADER_COMMAND_UNREADABLE', targetId: 'tab-follower' });
  } finally {
    followerChannel.close();
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
  }
});

/*
 * T4-07. The start pre-check's `try` spanned the resume and the snapshot, so a
 * resume that failed for its own reason was discarded, fell through to `admit`,
 * and came back as "this run id is already taken" — the real reason gone. Only
 * the log read is forgiven now.
 */
it('surfaces a failed resume of a duplicate start as itself, not as an admission refusal', async () => {
  const fileSystemProvider = new DirectIdbProvider(`agent-host-${crypto.randomUUID()}`);
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const providerBasePath = `agent-host-resume-failure-${crypto.randomUUID()}`;
  const chatId = 'chat-resume-failure';
  const runId = 'run-resume-failure';
  const sessionId = `session-${crypto.randomUUID()}`;
  // A paused run whose interrupt carries no durable W5 payload: `resume` cannot
  // build the request it must wait on, and says so.
  await seedChatLog(fileSystemProvider, {
    providerBasePath,
    chatId,
    runId,
    rows: [
      { type: 'run.lifecycle', state: 'admitted' },
      {
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: 'user-resume-failure', role: 'user', content: 'Ask me first.' },
        context: {
          version: 1,
          systemPrompt: 'Browser takeover fixture.',
          initialMessages: [],
          postCompactionMessages: [],
        },
      },
      { type: 'run.lifecycle', state: 'running' },
      { type: 'interrupt.recorded', interruptId: 'interrupt-resume-failure', phase: 'requested', reason: 'Approve?' },
      { type: 'run.lifecycle', state: 'paused' },
    ],
  });

  try {
    await initializeSeededSession(fileSystemProvider, { providerBasePath, sessionId });
    await expect(
      handleAgentHostWorkerRequest(
        {
          type: 'start',
          chatId,
          runId,
          trigger: 'submit',
          message: { id: 'user-resume-failure', role: 'user', content: 'Ask me first.' },
        },
        sessionId,
      ),
    ).rejects.toThrow(/has no durable W5 request payload/u);
  } finally {
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
  }
});
