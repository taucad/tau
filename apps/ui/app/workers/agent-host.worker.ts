/** Browser agent-host bootstrap: one raw port transfer, then validated @taucad/rpc frames only. */
import type { ChannelServer } from '@taucad/agent-host';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import type {
  AgentHostWorkerCallRequest,
  AgentHostWorkerProtocol,
  AgentHostWorkerEvent,
  AgentHostWorkerLiveEvent,
} from '#workers/agent-host.contract.js';
import {
  agentHostWorkerProtocolSchemas,
  createAgentHostCapabilityReport,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';
import { randomUuid } from '@taucad/utils/id';

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
};

const workerScope = globalThis as unknown as WorkerScope;

const probeCapabilities = async (
  durability: Extract<AgentHostWorkerCallRequest, { readonly type: 'capabilities' }>['durability'],
): Promise<ReturnType<typeof createAgentHostCapabilityReport>> => {
  const checks = {
    worker: true,
    webLocks: 'locks' in navigator,
    broadcastChannel: typeof BroadcastChannel !== 'undefined',
    opfs: 'storage' in navigator && typeof navigator.storage.getDirectory === 'function',
    syncAccessHandle: false,
  };
  if (durability !== 'exclusive-append' || !checks.opfs) {
    return createAgentHostCapabilityReport(checks, durability);
  }
  const name = `.agent-host-capability-${randomUuid()}`;
  let root: FileSystemDirectoryHandle | undefined;
  try {
    root = await navigator.storage.getDirectory();
    const file = (await root.getFileHandle(name, { create: true })) as FileSystemFileHandle & {
      createSyncAccessHandle?: () => Promise<{ close(): void }>;
    };
    if (typeof file.createSyncAccessHandle === 'function') {
      const access = await file.createSyncAccessHandle();
      access.close();
      checks.syncAccessHandle = true;
    }
  } catch {
    checks.syncAccessHandle = false;
  } finally {
    await root?.removeEntry(name).catch(() => undefined);
  }
  return createAgentHostCapabilityReport(checks, durability);
};

const loadImplementation = async () => {
  try {
    return await import('./agent-host.impl.js');
  } catch (error) {
    throw Object.assign(
      new Error(`Agent host worker failed to load: ${error instanceof Error ? error.message : String(error)}`),
      { code: 'WORKER_LOAD_FAILED' },
    );
  }
};

let connected = false;
workerScope.addEventListener('message', (event) => {
  if (connected) {
    return;
  }
  const connection = parseAgentHostWorkerConnect(event.data);
  connected = true;
  const server: ChannelServer<AgentHostWorkerProtocol> = {
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    call: async (_context, _name, request) => {
      if (request.type === 'capabilities') {
        return { type: 'capabilities', report: await probeCapabilities(request.durability) };
      }
      const loaded = await loadImplementation();
      return loaded.handleAgentHostWorkerRequest(request, connection.sessionId);
    },
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    listen: async (_context, name, _args, signal) => {
      const loaded = await loadImplementation();
      return (
        name === 'events' ? loaded.listenAgentHostWorkerEvents(signal) : loaded.listenAgentHostWorkerLiveEvents(signal)
      ) as AsyncIterable<AgentHostWorkerEvent & AgentHostWorkerLiveEvent>;
    },
  };
  serveAgentWorkerChannel<AgentHostWorkerProtocol>(connection.port, {
    sessionKey: connection.sessionId,
    protocolSchemas: agentHostWorkerProtocolSchemas,
    impl: server,
    label: 'agent-host-worker',
  });
});
