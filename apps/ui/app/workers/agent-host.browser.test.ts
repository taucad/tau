import { afterEach, expect, it, vi } from 'vitest';
import { DirectIdbProvider, OPFSProvider } from '@taucad/filesystem/backend';
import { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import { agentHostTailBatchLimit } from '#workers/agent-host.contract.js';
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
        trigger: 'retry',
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

it('detects a dead leader and proactively reattaches the follower from its durable cursor', async () => {
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
    const terminal = Promise.withResolvers<void>();
    const unsubscribe = follower.subscribe((eventChatId, eventItem) => {
      if (
        eventChatId === chatId &&
        eventItem.runId === runId &&
        eventItem.type === 'run.lifecycle' &&
        eventItem.state === 'completed'
      ) {
        terminal.resolve();
      }
    });
    leaderWorker.terminate();

    const outcome = await Promise.race([
      terminal.promise.then(() => 'completed'),
      new Promise<'timeout'>((resolve) => {
        globalThis.setTimeout(() => {
          resolve('timeout');
        }, 5000);
      }),
    ]);
    unsubscribe();
    expect(outcome).toBe('completed');
    await expect(follower.attach({ chatId, cursor: 0, limit: 16 })).resolves.toMatchObject({
      leadership: { role: 'leader' },
      snapshot: { runId, state: 'completed' },
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
 * as RUN_ADMISSION_CONFLICT, which the page surfaces as a failed turn even
 * though the first copy ran to completion.
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
