/**
 * The `hostConnector` session child over fake ports, with nothing mounted (plan § 4 A7a; charter I5; rows S2, S32).
 * Path table (one state):
 *
 * 1. `running`: initial; the child keeps the connector published while the file manager is ready
 *
 * The rows keep what the binding's connector effect (`project-live-sessions.tsx`) does today; the A0.2 rows in
 * `project-live-sessions.test.tsx` characterise the same behaviour through the binding.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { CadAgentExecution } from '@taucad/chat';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { ProjectChoices } from '#runtime/choices.js';
import { createHostConnectorLogic } from '#runtime/host-connector.js';
import type { HostConnectorChatStore } from '#runtime/host-connector.js';

const agentHost = vi.hoisted(() => ({
  browserOptions: [] as Array<Readonly<Record<string, unknown>>>,
  daemonClients: 0,
  retained: [] as string[],
  released: [] as string[],
  presented: [] as string[],
  rated: [] as string[],
  dialed: [] as string[],
  dialFails: false,
}));

vi.mock('#services/agent-host-client.js', () => ({
  createBrowserAgentHostClient: (options: Readonly<Record<string, unknown>>) => {
    agentHost.browserOptions.push(options);
    return { close: async () => undefined };
  },
  createAgentHostClient: () => {
    agentHost.daemonClients += 1;
    return { close: async () => undefined };
  },
  noteBrowserRunPresented: async ({ runId }: { readonly runId: string }) => {
    agentHost.presented.push(runId);
  },
  noteBrowserRunRated: async ({ runId }: { readonly runId: string }) => {
    agentHost.rated.push(runId);
  },
  readBrowserRunStoppability: async () => 'stoppable',
  retainBrowserAgentHostProject: (options: { readonly authority: { readonly projectId: string } }) => {
    agentHost.retained.push(options.authority.projectId);
    return () => {
      agentHost.released.push(options.authority.projectId);
    };
  },
}));
vi.mock('@taucad/chat-ui/services/daemon-agent-host-client', () => ({
  createDaemonAgentHostTransport: (dial: unknown) => ({ dial }),
}));
vi.mock('#chat-clients/_internal/turn-body.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dialExecutionHost: async (execution: CadAgentExecution) => {
    agentHost.dialed.push(execution.kind === 'tau' ? String(execution.hostId) : execution.kind);
    if (agentHost.dialFails) {
      throw new Error('unreachable');
    }
    return { close: () => undefined };
  },
}));
vi.mock('#filesystem/handle-store.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProjectFileSystemConfig: async (projectId: string) => ({
    projectId,
    backend: 'opfs',
    providerBasePath: projectId,
  }),
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  readRootedBridgeCapabilities: async () => ({ writable: true, durability: 'exclusive-append' }),
}));

const projectId = 'prj_connector';

type FileManagerContext = Readonly<Record<string, unknown> & { worker?: Worker; rootDirectory: string }>;

/** The parts of a file-manager actor the child reads: its context, whether it is ready, and its changes. */
const createFileManager = (initial: FileManagerContext, ready = true) => {
  let context = initial;
  let isReady = ready;
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const ref = {
    getSnapshot: () => ({ context, matches: (state: string) => state === 'ready' && isReady }),
    subscribe: (observer: { next: () => void }) => {
      const listener = (): void => {
        observer.next();
      };
      listeners.add(listener);
      return {
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
  };
  return {
    ref: ref as unknown as ActorRefFrom<typeof fileManagerMachine>,
    set: (next: Partial<FileManagerContext>, nextReady = isReady) => {
      context = { ...context, ...next };
      isReady = nextReady;
      emit();
    },
    get listeners() {
      return listeners.size;
    },
  };
};

const baseChoices: ProjectChoices = {
  computePlacement: { state: 'local' },
  computeSelectionRevision: 0,
  computeReuseMode: 'durable',
  computeReuseRevision: 0,
  defaultExecution: { kind: 'tau', model: 'fixture-model' },
  modelCatalog: { status: 'loading' },
  modelPinning: true,
  defaultKernel: 'openscad',
  testingEnabled: true,
};

type Connector = Parameters<HostConnectorChatStore['publishProjectHostConnector']>;

const createChatStore = (settings: Map<string, Awaited<ReturnType<HostConnectorChatStore['getChatHostSettings']>>>) => {
  const published: Connector[] = [];
  const withdrawn: number[] = [];
  const store: HostConnectorChatStore = {
    publishProjectHostConnector: (...args) => {
      published.push(args);
      const index = published.length - 1;
      return () => {
        withdrawn.push(index);
      };
    },
    getChatHostSettings: async (chatId) => settings.get(chatId),
  };
  return { store, published, withdrawn };
};

const daemonExecution: CadAgentExecution = { kind: 'tau', model: 'm', hostId: 'hst_daemon' };

const workerA = { name: 'worker-a' } as unknown as Worker;
const workerB = { name: 'worker-b' } as unknown as Worker;

const createSession = (
  input: Readonly<{
    store: HostConnectorChatStore;
    choices: () => ProjectChoices;
    fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
    syncProjectRoots?: () => Promise<void>;
  }>,
  guard: ReturnType<typeof guardActors>,
) => {
  const session = setup({
    schemas: { context: types<Record<string, never>>(), events: eventSchemas<{ type: 'noop' }>() },
    actors: { hostConnector: createHostConnectorLogic({ chatSessions: input.store, choices: input.choices }) },
  }).createMachine({
    id: 'host-connector-session',
    context: {},
    initial: 'running',
    states: {
      running: {
        invoke: {
          id: 'hostConnector',
          src: 'hostConnector',
          input: {
            projectId,
            fileManagerRef: input.fileManagerRef,
            syncProjectRoots: input.syncProjectRoots ?? (async () => undefined),
          },
        },
      },
    },
  });
  return createActor(session, { clock: new StepClock(), inspect: guard.inspect });
};

const readyContext = (overrides: Partial<FileManagerContext> = {}): FileManagerContext => ({
  worker: workerA,
  rootDirectory: `/projects/${projectId}`,
  openFileSystemBridge: vi.fn((_root: string, _mode: string) => ({ bridge: 'first' })),
  openRevisionSessionPort: vi.fn(),
  openComputeStorePort: vi.fn(),
  ...overrides,
});

const promptOf = (): string =>
  String((agentHost.browserOptions.at(-1) as { readonly systemPrompt?: string } | undefined)?.systemPrompt);

describe('host connector', () => {
  beforeEach(() => {
    agentHost.browserOptions.length = 0;
    agentHost.daemonClients = 0;
    agentHost.retained.length = 0;
    agentHost.released.length = 0;
    agentHost.presented.length = 0;
    agentHost.rated.length = 0;
    agentHost.dialed.length = 0;
    agentHost.dialFails = false;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should publish once the file manager has a worker and is ready, withdraw when it is not, and publish again for a new worker (I5)', () => {
    const guard = guardActors();
    const chat = createChatStore(new Map());
    const fileManager = createFileManager({ rootDirectory: `/projects/${projectId}` }, false);
    const session = createSession(
      { store: chat.store, choices: () => baseChoices, fileManagerRef: fileManager.ref },
      guard,
    );
    session.start();
    expect(chat.published).toHaveLength(0);

    fileManager.set({ worker: workerA });
    expect(chat.published).toHaveLength(0);
    fileManager.set({}, true);
    expect(chat.published.map(([id]) => id)).toEqual([projectId]);

    fileManager.set({ rootDirectory: `/projects/${projectId}` });
    expect(chat.published).toHaveLength(1);

    fileManager.set({}, false);
    expect(chat.withdrawn).toEqual([0]);
    fileManager.set({}, true);
    fileManager.set({ worker: workerB });
    expect(chat.published).toHaveLength(3);
    expect(chat.withdrawn).toEqual([0, 1]);

    session.stop();
    expect(chat.withdrawn).toEqual([0, 1, 2]);
    expect(fileManager.listeners).toBe(0);
    expect(guard.take()).toEqual([]);
  });

  it('should read the file manager for the bridge and both ports when a chat connects, not when it publishes (S2)', async () => {
    const guard = guardActors();
    const chat = createChatStore(new Map());
    const fileManager = createFileManager(readyContext());
    const syncProjectRoots = vi.fn(async () => undefined);
    const session = createSession(
      { store: chat.store, choices: () => baseChoices, fileManagerRef: fileManager.ref, syncProjectRoots },
      guard,
    );
    session.start();
    const laterBridge = vi.fn((_root: string, _mode: string) => ({ bridge: 'later' }));
    const openRevisionSessionPort = vi.fn();
    const openComputeStorePort = vi.fn();
    fileManager.set({ openFileSystemBridge: laterBridge, openRevisionSessionPort, openComputeStorePort });

    await chat.published.at(-1)?.[1]('chat-1');

    expect(syncProjectRoots).toHaveBeenCalledOnce();
    const options = agentHost.browserOptions.at(-1) as {
      openFileSystemBridge: () => unknown;
      openRevisionsPort: () => unknown;
      openPlacementPort: () => unknown;
      openComputeStorePort: () => unknown;
      authority: unknown;
      computeMode: unknown;
    };
    expect(options.openFileSystemBridge()).toEqual({ bridge: 'later' });
    expect(laterBridge).toHaveBeenLastCalledWith(`/projects/${projectId}`, 'working-copy');
    options.openRevisionsPort();
    options.openPlacementPort();
    options.openComputeStorePort();
    expect(openRevisionSessionPort.mock.calls).toEqual([
      ['reader', projectId],
      ['placement', projectId],
    ]);
    expect(openComputeStorePort).toHaveBeenCalledExactlyOnceWith(projectId);
    expect(options.authority).toEqual({ projectId, workspaceId: 'live' });
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should hand each connect the choices current when the chat attaches, from the same connector (S32)', async () => {
    const guard = guardActors();
    const chat = createChatStore(new Map());
    const fileManager = createFileManager(readyContext());
    let choices = baseChoices;
    const session = createSession(
      { store: chat.store, choices: () => choices, fileManagerRef: fileManager.ref },
      guard,
    );
    session.start();
    const connect = chat.published.at(-1)?.[1];

    await connect?.('chat-1');
    expect(promptOf()).toContain('openscad');
    expect(promptOf()).toContain('fixture-model');
    expect((agentHost.browserOptions.at(-1) as { computeMode?: unknown }).computeMode).toBe('durable');

    choices = {
      ...baseChoices,
      defaultExecution: { kind: 'tau', model: 'later-model' },
      defaultKernel: 'replicad',
      computeReuseMode: 'memory',
    };
    await connect?.('chat-2');

    expect(chat.published).toHaveLength(1);
    expect(promptOf()).toContain('replicad');
    expect(promptOf()).toContain('later-model');
    expect(promptOf()).not.toContain('fixture-model');
    expect((agentHost.browserOptions.at(-1) as { computeMode?: unknown }).computeMode).toBe('memory');
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it("should run a chat's stored manual kernel and execution over the defaults", async () => {
    const guard = guardActors();
    const chat = createChatStore(
      new Map([
        [
          'chat-1',
          {
            activeExecution: { kind: 'tau', model: 'stored-model' },
            kernelPreference: 'replicad',
            activeKernel: 'openscad',
          },
        ],
      ]),
    );
    const fileManager = createFileManager(readyContext());
    const session = createSession(
      { store: chat.store, choices: () => baseChoices, fileManagerRef: fileManager.ref },
      guard,
    );
    session.start();

    await chat.published.at(-1)?.[1]('chat-1');

    expect(promptOf()).toContain('replicad');
    expect(promptOf()).toContain('stored-model');
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should resolve the model against the catalog choices hold', async () => {
    const guard = guardActors();
    const chat = createChatStore(new Map());
    const fileManager = createFileManager(readyContext());
    const choices: ProjectChoices = {
      ...baseChoices,
      modelCatalog: {
        status: 'loaded',
        models: [
          {
            id: 'fixture-model',
            name: 'Fixture',
            provider: { id: 'anthropic', name: 'Anthropic' },
            details: { family: 'claude' },
          } as unknown as Extract<ProjectChoices['modelCatalog'], { status: 'loaded' }>['models'][number],
        ],
      },
    };
    let current = choices;
    const session = createSession(
      { store: chat.store, choices: () => current, fileManagerRef: fileManager.ref },
      guard,
    );
    session.start();

    const connect = chat.published.at(-1)?.[1];
    await connect?.('chat-1');
    expect((agentHost.browserOptions.at(-1) as { model?: unknown }).model).toBeDefined();

    current = baseChoices;
    await connect?.('chat-2');
    expect((agentHost.browserOptions.at(-1) as { model?: unknown }).model).toBeUndefined();
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should connect a chat placed on a daemon through its host, with its placement, and never retain the browser host', async () => {
    const guard = guardActors();
    const chat = createChatStore(new Map([['chat-1', { activeExecution: daemonExecution }]]));
    const fileManager = createFileManager(readyContext());
    const session = createSession(
      { store: chat.store, choices: () => baseChoices, fileManagerRef: fileManager.ref },
      guard,
    );
    session.start();

    const client = await chat.published.at(-1)?.[1]('chat-1');

    expect(client?.placement).toEqual({ hostId: 'hst_daemon' });
    expect(agentHost.daemonClients).toBe(1);
    expect(agentHost.browserOptions).toEqual([]);
    expect(agentHost.retained).toEqual([]);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should refuse a chat whose connect finishes after the connector was withdrawn', async () => {
    const guard = guardActors();
    const chat = createChatStore(new Map());
    const fileManager = createFileManager(readyContext());
    const sync = Promise.withResolvers<void>();
    const session = createSession(
      {
        store: chat.store,
        choices: () => baseChoices,
        fileManagerRef: fileManager.ref,
        syncProjectRoots: async () => sync.promise,
      },
      guard,
    );
    session.start();
    const attaching = chat.published.at(-1)?.[1]('chat-1');
    await Promise.resolve();

    fileManager.set({}, false);
    sync.resolve();

    await expect(attaching).rejects.toThrow(
      `Project ${projectId}'s host connector closed before chat chat-1 attached.`,
    );
    expect(agentHost.browserOptions).toEqual([]);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should retain the browser agent host once for the project and release it once when it stops', async () => {
    const guard = guardActors();
    const chat = createChatStore(new Map());
    const fileManager = createFileManager(readyContext());
    const session = createSession(
      { store: chat.store, choices: () => baseChoices, fileManagerRef: fileManager.ref },
      guard,
    );
    session.start();
    const connect = chat.published.at(-1)?.[1];
    await connect?.('chat-1');
    await connect?.('chat-2');
    fileManager.set({}, false);
    fileManager.set({}, true);
    await chat.published.at(-1)?.[1]('chat-3');
    expect(agentHost).toMatchObject({ retained: [projectId], released: [] });

    session.stop();

    expect(agentHost).toMatchObject({ retained: [projectId], released: [projectId] });
    expect(guard.take()).toEqual([]);
  });

  it('should answer stoppability, presentation and rating by placement', async () => {
    const guard = guardActors();
    const chat = createChatStore(new Map([['daemon-chat', { activeExecution: daemonExecution }]]));
    const fileManager = createFileManager(readyContext());
    const session = createSession(
      { store: chat.store, choices: () => baseChoices, fileManagerRef: fileManager.ref },
      guard,
    );
    session.start();
    const extras = chat.published.at(-1)?.[2];

    expect(await extras?.stoppability?.('browser-chat')).toBe('stoppable');
    expect(await extras?.stoppability?.('daemon-chat')).toBe('stoppable');
    agentHost.dialFails = true;
    expect(await extras?.stoppability?.('daemon-chat')).toBe('background-window');
    expect(agentHost.dialed).toEqual(['hst_daemon', 'hst_daemon']);

    await extras?.presented?.('browser-chat', 'run-browser', 1);
    await extras?.presented?.('daemon-chat', 'run-daemon', 2);
    expect(agentHost.presented).toEqual(['run-browser']);

    await extras?.rated?.({ chatId: 'browser-chat', runId: 'run-rated', value: 'positive', at: 3 });
    expect(agentHost.rated).toEqual(['run-rated']);
    session.stop();
    expect(guard.take()).toEqual([]);
  });
});
