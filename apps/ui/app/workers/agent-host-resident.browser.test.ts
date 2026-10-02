import { afterEach, expect, it, vi } from 'vitest';
import { Topic } from '@taucad/events';
import { toolName } from '@taucad/chat/constants';
import { createMemoryComputeEngine, exposeComputeStoreChannel } from '@taucad/runtime/host';
import type { HostRunSnapshot, TurnPlacementFact } from '@taucad/agent-host';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import { createBrowserAgentHostClient, residentAgentWorker } from '#services/agent-host-client.js';
import { openBrowserProjectHost } from '#workers/agent-host.impl.js';
import {
  controlOf,
  disposeOpfsProject,
  opfsProject,
  opfsProvider,
  placementFacts,
  retireWorkers,
} from '#workers/test/agent-host-resident.fixture.js';
import { rootedProvider } from '#workers/test/rooted-provider.fixture.js';

afterEach(disposeOpfsProject);

it('should release settlement waits on abort and after a fact wakes them', async () => {
  const wakes = new Topic<void>();
  const facts: TurnPlacementFact[] = [
    {
      kind: 'leaseHeld',
      key: { chatId: 'chat', turnId: 'turn', runId: 'run', attempt: 1 },
      checkoutId: 'checkout',
    },
  ];
  const abort = new AbortController();
  const iterator = placementFacts(facts, wakes, abort.signal);

  const first = await iterator.next();
  expect(first.value).toEqual(facts[0]);
  abort.abort();
  await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  expect(wakes.size).toBe(0);

  const nextAbort = new AbortController();
  const nextIterator = placementFacts([], wakes, nextAbort.signal);
  const pending = nextIterator.next();
  expect(wakes.size).toBe(1);
  nextAbort.abort();
  await expect(pending).resolves.toEqual({ done: true, value: undefined });
  expect(wakes.size).toBe(0);

  const wakeAbort = new AbortController();
  const removeAbortListener = vi.spyOn(wakeAbort.signal, 'removeEventListener');
  const wakeIterator = placementFacts(facts, wakes, wakeAbort.signal);
  const wakeFirst = await wakeIterator.next();
  expect(wakeFirst.value).toEqual(facts[0]);
  const waking = wakeIterator.next();
  expect(wakes.size).toBe(1);
  wakes.emit();
  expect(wakes.size).toBe(0);
  expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
  wakeAbort.abort();
  await expect(waking).resolves.toEqual({ done: true, value: undefined });
});

const visibility = { visible: () => true, subscribe: () => () => undefined };

/** A `provide` of one host incarnation over the control channel, with fresh bridges. */
const provideOver = (control: ReturnType<typeof controlOf>, options: Awaited<ReturnType<typeof opfsProject>>) => {
  const {
    openFileSystemBridge: _fs,
    openProjectRootBridge: _root,
    openPlacementPort: _placement,
    durability: _durability,
    ...rest
  } = options;
  return async (hostId: string) => {
    const fileSystem = options.openFileSystemBridge();
    const projectRoot = options.openProjectRootBridge();
    const placementPort = options.openPlacementPort();
    return control.call('provide', {
      value: {
        ...rest,
        projectId: options.authority.projectId,
        hostId,
        fileSystemPort: fileSystem.port,
        projectRootPort: projectRoot.port,
        placementPort,
      },
      transferables: [fileSystem.port, projectRoot.port, placementPort],
    });
  };
};

/** One agent-wire stream on the named host, or the worker's `needs`. */
const streamOn = async (control: ReturnType<typeof controlOf>, projectId: string, hostId: string) => {
  const { port1, port2 } = new MessageChannel();
  const answer = await control.call('connect', { value: { projectId, hostId, port: port1 }, transferables: [port1] });
  return {
    answer,
    client: createAgentChannelClient({ connect: () => port2, sessionKey: `stream-${hostId}` }),
  };
};

/* RH-A26 (I31, RH-R4, RV3-F1): the page's last-close `release` names its incarnation, so one that arrives after a
 * newer provide replaced that incarnation closes nothing; the newer host keeps serving on its own bridges. */
it("should keep a new project host's bridges when the previous host's project-closed arrives late", async () => {
  const options = await opfsProject('late-release');
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const control = controlOf(worker);
  const provide = provideOver(control, options);
  const { projectId } = options.authority;
  try {
    await control.call('init', { tabId: `tab-${crypto.randomUUID()}` });
    await expect(provide('host-1')).resolves.toEqual({});
    await expect(provide('host-2')).resolves.toEqual({ replaced: 'host-1' });

    await control.call('release', { projectId, hostId: 'host-1' });

    await expect(control.call('status', { projectId })).resolves.toMatchObject({ hostId: 'host-2' });
    const stream = await streamOn(control, projectId, 'host-2');
    expect(stream.answer).toEqual({ status: 'connected' });
    await expect(
      stream.client.execute({
        type: 'attach',
        commandId: 'req_late-release',
        payload: { chatId: 'chat-late' },
      } as Parameters<AgentChannelClient['execute']>[0]),
    ).resolves.toMatchObject({ status: 'applied' });
    stream.client.close();
  } finally {
    control.close();
    worker.terminate();
  }
});

/* RH-A26: bridges sent for an incarnation that is no longer open are closed, never handed to the registered host. */
it('should answer needs to a rebridge that names a host that is no longer open', async () => {
  const options = await opfsProject('stale-host');
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const control = controlOf(worker);
  const provide = provideOver(control, options);
  const { projectId } = options.authority;
  try {
    await control.call('init', { tabId: `tab-${crypto.randomUUID()}` });
    await expect(provide('host-1')).resolves.toEqual({});
    await expect(provide('host-2')).resolves.toEqual({ replaced: 'host-1' });
    /* The first host closes once its (empty) drain ends; a rebridge naming it then finds nothing to rebridge. */
    await control.call('release', { projectId, hostId: 'host-1' });
    const fileSystem = options.openFileSystemBridge();
    const projectRoot = options.openProjectRootBridge();

    /* Closed in the worker, which this Chromium does not report to the page (no MessagePort `close` event); the
     * registry's test asserts the close. */
    await expect(
      control.call('rebridge', {
        value: { projectId, hostId: 'host-1', fileSystemPort: fileSystem.port, projectRootPort: projectRoot.port },
        transferables: [fileSystem.port, projectRoot.port],
      }),
    ).resolves.toEqual({ status: 'needs' });
    await expect(streamOn(control, projectId, 'host-1')).resolves.toMatchObject({ answer: { status: 'needs' } });
    const stream = await streamOn(control, projectId, 'host-2');
    await expect(
      stream.client.execute({
        type: 'attach',
        commandId: 'req_stale-host',
        payload: { chatId: 'chat-stale' },
      } as Parameters<AgentChannelClient['execute']>[0]),
    ).resolves.toMatchObject({ status: 'applied' });
    stream.client.close();
  } finally {
    control.close();
    worker.terminate();
  }
});

/* W6.r1 round 3: a host whose project-root bridge rejects (a read-only root) closes the bridge that did open and every
 * port its provide transferred, the unused ones included. Opened in the page, so the ports' closes are observed. */
it('should close every transferred port when the project host fails to open', async () => {
  const options = await opfsProject('failed-open');
  const {
    openFileSystemBridge: _fs,
    openProjectRootBridge: _root,
    openPlacementPort: _placement,
    durability: _durability,
    ...rest
  } = options;
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const fileSystem = options.openFileSystemBridge();
  const rooted = rootedProvider(opfsProvider(), options.projectStorage.providerBasePath);
  const projectRoot = createFileSystemBridgePort({
    ...rooted,
    capabilities: { ...rooted.capabilities, writable: false },
  });
  const revisions = new MessageChannel();
  const placement = new MessageChannel();
  const ports = [fileSystem.port, projectRoot.port, revisions.port1, placement.port1];
  const closes = ports.map((port) => vi.spyOn(port, 'close'));

  await expect(
    openBrowserProjectHost(
      {
        ...rest,
        projectId: options.authority.projectId,
        hostId: 'host-failed',
        computeMode: 'off',
        fileSystemPort: fileSystem.port,
        projectRootPort: projectRoot.port,
        revisionsPort: revisions.port1,
        placementPort: placement.port1,
      },
      { tabId: `tab-${crypto.randomUUID()}`, visibility },
    ),
  ).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });

  expect(closes.map((close) => close.mock.calls.length > 0)).toEqual([true, true, true, true]);
  fileSystem.dispose();
  projectRoot.dispose();
});

/* RV1-F1: a file-manager restart swaps fresh bridges into the open host; the old ones go, the host and its stream stay. */
it('should rebridge an open project host without replacing it', async () => {
  const options = await opfsProject('rebridge');
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const createWorker = (): Worker => worker;
  const disposals: Array<ReturnType<typeof vi.fn>> = [];
  const tracked =
    (open: () => ReturnType<(typeof options)['openFileSystemBridge']>) =>
    (): ReturnType<(typeof options)['openFileSystemBridge']> => {
      const connection = open();
      const dispose = vi.fn(() => {
        connection.dispose();
      });
      disposals.push(dispose);
      return { ...connection, dispose };
    };
  const client = createBrowserAgentHostClient({
    ...options,
    openFileSystemBridge: tracked(options.openFileSystemBridge),
    openProjectRootBridge: tracked(options.openProjectRootBridge),
    createWorker,
  });
  try {
    await client.hostCommand({
      type: 'attach',
      commandId: 'attach-before-rebridge',
      payload: { chatId: 'chat-rebridge' },
    });

    await residentAgentWorker(createWorker).reprovide();

    expect(disposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1, 0, 0]);
    await expect(
      client.hostCommand({
        type: 'attach',
        commandId: 'attach-after-rebridge',
        payload: { chatId: 'chat-rebridge' },
      }),
    ).resolves.toMatchObject({ status: 'applied' });
  } finally {
    await client.close();
    await retireWorkers(worker);
  }
});

/* CBR-RED: the first real runtime evaluation must accept the registered durable store handed to this host. */
it('should use registered durable compute before and after a project-host rebridge', async () => {
  const options = await opfsProject('durable-compute');
  await opfsProvider().writeFile(`${options.projectStorage.providerBasePath}/main.scad`, 'cube(10);\n');
  const authority = createMemoryComputeEngine();
  const computePorts = new MessageChannel();
  const computeServer = exposeComputeStoreChannel({
    port: computePorts.port1,
    engine: authority.engine,
    workspace: options.authority.workspaceId,
    control: authority.control({ workspace: options.authority.workspaceId }),
  });
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const runtimeRoot = rootedProvider(opfsProvider(), options.projectStorage.providerBasePath);
  const fileSystem = createFileSystemBridgePort(runtimeRoot);
  const projectRoot = options.openProjectRootBridge();
  const placementPort = options.openPlacementPort();
  const {
    openFileSystemBridge: _fileSystem,
    openProjectRootBridge: _projectRoot,
    openPlacementPort: _placement,
    durability: _durability,
    ...rest
  } = options;
  const realFetch = globalThis.fetch.bind(globalThis);
  let modelCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes('/v1/llm/')) {
      return realFetch(input, init);
    }
    const call = modelCalls++;
    const tool = {
      choices: [
        {
          delta: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible provider wire keys use snake_case.
            tool_calls: [
              {
                index: 0,
                id: `call-durable-compute-${String(call)}`,
                function: { name: toolName.evaluateModel, arguments: JSON.stringify({ targetFile: 'main.scad' }) },
              },
            ],
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible provider wire keys use snake_case.
          finish_reason: 'tool_calls',
        },
      ],
    };
    const frames =
      call % 2 === 0
        ? [
            `data: ${JSON.stringify(tool)}\n\n`,
            'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\n',
            'data: [DONE]\n\n',
          ]
        : [
            'data: {"choices":[{"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\n',
            'data: [DONE]\n\n',
          ];
    return new Response(frames.join(''), {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-durable-compute' },
    });
  };
  let host: Awaited<ReturnType<typeof openBrowserProjectHost>> | undefined;
  let client: AgentChannelClient | undefined;
  let reboundServer: ReturnType<typeof exposeComputeStoreChannel> | undefined;
  let reboundFileSystem: ReturnType<typeof options.openFileSystemBridge> | undefined;
  let reboundProjectRoot: ReturnType<typeof options.openProjectRootBridge> | undefined;
  let reboundPorts: MessageChannel | undefined;
  try {
    host = await openBrowserProjectHost(
      {
        ...rest,
        projectId: options.authority.projectId,
        hostId: 'host-durable-compute',
        computeMode: 'durable',
        computeStorePort: computePorts.port2,
        fileSystemPort: fileSystem.port,
        projectRootPort: projectRoot.port,
        placementPort,
      },
      { tabId: `tab-${crypto.randomUUID()}`, visibility },
    );
    const channel = new MessageChannel();
    host.connect(channel.port1);
    const openClient = createAgentChannelClient({ connect: () => channel.port2, sessionKey: 'durable-compute' });
    client = openClient;
    let priorRunId: string | undefined;
    const runKernelTurn = async (runId: string, toolCallId: string) => {
      const deadline = Date.now() + 20_000;
      const command: Parameters<AgentChannelClient['execute']>[0] = {
        type: 'start',
        commandId: runId,
        payload: {
          chatId: 'chat-durable-compute',
          runId,
          trigger: 'submit',
          message: { id: `user-${runId}`, role: 'user', content: 'Evaluate main.scad.' },
        },
      };
      const started = await vi.waitUntil(
        async () => {
          const answer = await openClient.execute(command);
          if (
            answer.status === 'refused' &&
            answer.code === 'CHAT_RUN_LIVE' &&
            answer.details?.['state'] === 'settling' &&
            priorRunId !== undefined &&
            answer.details['runId'] === priorRunId
          ) {
            return false;
          }
          return answer;
        },
        { timeout: Math.max(1, deadline - Date.now()), interval: 50 },
      );
      expect(started, JSON.stringify(started)).toMatchObject({ status: 'applied', effect: 'durable' });
      const output = await vi.waitFor(
        async () => {
          const answer = await openClient.execute({
            type: 'attach',
            commandId: `attach-${runId}-${crypto.randomUUID()}`,
            payload: { chatId: 'chat-durable-compute' },
          } as Parameters<AgentChannelClient['execute']>[0]);
          expect(answer).toMatchObject({
            status: 'applied',
            details: { snapshot: { runId, state: 'completed' } },
          });
          if (answer.status !== 'applied' || answer.effect !== 'not-applied') {
            throw new Error('Expected a completed host snapshot.');
          }
          const snapshot = answer.details['snapshot'] as HostRunSnapshot;
          return snapshot.messages.find(
            (message) =>
              message.role === 'tool-output' &&
              message.toolName === toolName.evaluateModel &&
              message.toolCallId === toolCallId,
          );
        },
        { timeout: Math.max(1, deadline - Date.now()), interval: 50 },
      );
      expect(output, JSON.stringify(output)).toMatchObject({ content: { success: true, status: 'ready' } });
      priorRunId = runId;
    };
    await runKernelTurn('run-durable-before', 'call-durable-compute-0');

    reboundPorts = new MessageChannel();
    let reboundOpens = 0;
    reboundServer = exposeComputeStoreChannel({
      port: reboundPorts.port1,
      engine: {
        open: async (input) => {
          reboundOpens += 1;
          return authority.engine.open(input);
        },
      },
      workspace: options.authority.workspaceId,
      control: authority.control({ workspace: options.authority.workspaceId }),
    });
    reboundFileSystem = createFileSystemBridgePort(runtimeRoot);
    reboundProjectRoot = options.openProjectRootBridge();
    await host.rebridge({
      projectId: options.authority.projectId,
      hostId: 'host-durable-compute',
      fileSystemPort: reboundFileSystem.port,
      projectRootPort: reboundProjectRoot.port,
      computeStorePort: reboundPorts.port2,
    });
    await opfsProvider().writeFile(`${options.projectStorage.providerBasePath}/main.scad`, 'cube(20);\n');
    await runKernelTurn('run-durable-after', 'call-durable-compute-2');
    expect(reboundOpens).toBe(1);
  } finally {
    globalThis.fetch = realFetch;
    client?.close();
    await host?.close();
    fileSystem.dispose();
    projectRoot.dispose();
    computeServer.dispose();
    reboundFileSystem?.dispose();
    reboundProjectRoot?.dispose();
    reboundServer?.dispose();
    computePorts.port1.close();
    computePorts.port2.close();
    reboundPorts?.port1.close();
    reboundPorts?.port2.close();
  }
});
