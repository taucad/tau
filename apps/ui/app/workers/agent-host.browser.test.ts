import { afterEach, expect, it } from 'vitest';
import { DirectIdbProvider, OPFSProvider } from '@taucad/filesystem/backend';
import { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import type { FileSystemProvider } from '@taucad/filesystem';

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
    lengthSymbol: 'mm',
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
    lengthSymbol: 'mm',
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
    lengthSymbol: 'mm',
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
    lengthSymbol: 'mm',
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
