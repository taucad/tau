import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { connectAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';

/* The page's half of the worker's control channel. */
type PageChannel = ReturnType<typeof connectAgentWorkerChannel<AgentHostWorkerProtocol>>;

/* Records evaluations of the host implementation, the module a `provide` needs. */
const implementation = vi.hoisted(() => ({ evaluations: 0 }));

/* A `provide` the wire accepts; each call transfers fresh ports. */
const provideArgs = (
  hostId: string,
): Readonly<{ value: AgentHostWorkerProtocol['calls']['provide']['args']; transferables: MessagePort[] }> => {
  const fileSystem = new MessageChannel();
  const projectRoot = new MessageChannel();
  const placement = new MessageChannel();
  return {
    value: {
      projectId: 'project-1',
      hostId,
      fileSystemPort: fileSystem.port1,
      projectRootPort: projectRoot.port1,
      placementPort: placement.port1,
      projectStorage: { projectId: 'project-1', backend: 'opfs', providerBasePath: '/projects' },
      authority: { projectId: 'project-1', workspaceId: 'workspace-1' },
      gatewayBaseUrl: 'http://localhost:4000',
      systemPrompt: '',
      systemPromptBlocks: [
        { type: 'text', text: 'static' },
        { type: 'text', text: 'dynamic' },
      ],
      runtimeConfig: { tauApiUrl: 'http://localhost:4000', tauWebSocketUrl: 'ws://localhost:4001' },
    },
    transferables: [fileSystem.port1, projectRoot.port1, placement.port1],
  };
};

/* A lower bound, not a guarantee: long enough for a load started at the connection to have evaluated (the mock
   evaluates within a few ticks), so a regression to loading at connect turns the zero check red on a normal run. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
};

/**
 * Connect a page-side channel to a fresh copy of the worker module. Each test re-imports the module after
 * `vi.resetModules()`, so its `connected` latch and its loader are its own; the copies earlier tests left on
 * `globalThis` are already connected and ignore the frame.
 */
const connectWorker = async (): Promise<PageChannel> => {
  const { connectAgentWorkerChannel } = await import('@taucad/agent-host/channel-client');
  const { agentHostWorkerProtocolSchemas } = await import('#workers/agent-host.contract.js');
  await import('#workers/agent-host.worker.js');
  const { port1, port2 } = new MessageChannel();
  globalThis.dispatchEvent(
    new MessageEvent('message', { data: { type: 'agent-host/connect', sessionId: 'session-1', port: port1 } }),
  );
  return connectAgentWorkerChannel<AgentHostWorkerProtocol>(port2, {
    sessionKey: 'session-1',
    protocolSchemas: agentHostWorkerProtocolSchemas,
    label: 'test-page',
  });
};

describe('agent-host worker', () => {
  let channel: PageChannel | undefined;

  beforeEach(() => {
    vi.resetModules();
    implementation.evaluations = 0;
  });

  afterEach(async () => {
    /* Closing the page's half closes the worker's, which stops its keepalive. */
    channel?.close();
    await channel?.closed;
    channel = undefined;
    vi.doUnmock('#workers/agent-host.impl.js');
  });

  it('starts loading its host implementation once its capabilities have answered, before any provide', async () => {
    vi.doMock('#workers/agent-host.impl.js', () => {
      implementation.evaluations += 1;
      return { openBrowserProjectHost: vi.fn() };
    });
    channel = await connectWorker();

    await channel.call('init', { tabId: 'tab-1' });
    await settle();
    /* Connected and initialised, not yet probed: the session's readiness probe has the worker to itself. */
    expect(implementation.evaluations).toBe(0);

    await channel.call('capabilities', { durability: 'exclusive-append' });
    /* No `provide` is sent: the implementation loads while the page is still opening the project. */
    await vi.waitFor(() => {
      expect(implementation.evaluations).toBe(1);
    });
  });

  it('does not make capabilities wait on the implementation load', async () => {
    vi.doMock('#workers/agent-host.impl.js', async () => {
      implementation.evaluations += 1;
      return new Promise<never>(() => {
        /* Never settles: the import stays pending for the whole test. */
      });
    });
    channel = await connectWorker();
    await channel.call('init', { tabId: 'tab-1' });

    const report = await channel.call('capabilities', { durability: 'exclusive-append' });
    expect(report.checks.worker).toBe(true);
    /* A second probe answers too, with the import still pending. */
    await expect(channel.call('capabilities', { durability: 'ephemeral' })).resolves.toMatchObject({
      checks: { worker: true },
    });
    await vi.waitFor(() => {
      expect(implementation.evaluations).toBe(1);
    });
  });

  /* STO-25 SP6: the page sends its connect right behind its provide, so the worker answers it in the project's order. */
  it('connects a connect that arrives while its provide is still opening the host, opening it once', async () => {
    const opening = Promise.withResolvers<void>();
    const connected: MessagePort[] = [];
    const openBrowserProjectHost = vi.fn(async (args: { hostId: string }) => {
      await opening.promise;
      return {
        hostId: args.hostId,
        connect: (port: MessagePort) => {
          connected.push(port);
        },
        rebridge: vi.fn(async () => undefined),
        drain: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        needsRebridge: () => false,
      };
    });
    vi.doMock('#workers/agent-host.impl.js', () => ({ openBrowserProjectHost }));
    channel = await connectWorker();
    await channel.call('init', { tabId: 'tab-1' });

    const provide = channel.call('provide', provideArgs('host-1'));
    const stream = new MessageChannel();
    const connect = channel.call('connect', {
      value: { projectId: 'project-1', hostId: 'host-1', port: stream.port1 },
      transferables: [stream.port1],
    });
    await vi.waitFor(() => {
      expect(openBrowserProjectHost).toHaveBeenCalledOnce();
    });
    opening.resolve();

    await expect(provide).resolves.toEqual({});
    await expect(connect).resolves.toEqual({ status: 'connected' });
    expect(openBrowserProjectHost).toHaveBeenCalledOnce();
    expect(connected).toHaveLength(1);
  });
});
