/** Browser agent-host bootstrap: one raw port transfer, then validated @taucad/rpc frames only. */
import type { ChannelServer } from '@taucad/agent-host';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { agentWireVersion } from '@taucad/agent-host/wire';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';
import {
  agentHostWorkerBuild,
  agentHostWorkerProtocolSchemas,
  createAgentHostCapabilityReport,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';
import { randomUuid } from '@taucad/utils/id';

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
};

const workerScope = globalThis as unknown as WorkerScope;

/** The keepalive this worker sends so the page can tell slow from dead (T9 E3). Milliseconds. */
const keepaliveInterval = 1000;

const probeCapabilities = async (
  durability: AgentHostWorkerProtocol['calls']['capabilities']['args']['durability'],
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
    call: async (_context, name, args, signal) => {
      if (name === 'capabilities') {
        return probeCapabilities((args as AgentHostWorkerProtocol['calls']['capabilities']['args']).durability);
      }
      const loaded = await loadImplementation();
      const result = await loaded.handleAgentHostWorkerCall(name, args, { sessionId: connection.sessionId, signal });
      // The handler answers each call with its own result; the protocol schemas validate it on the way out.
      return result as AgentHostWorkerProtocol['calls'][typeof name]['result'];
    },
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    listen: async (_context, _name, args, signal) => {
      const loaded = await loadImplementation();
      return loaded.listenAgentHostWorkerLiveEvents(args.chatId, signal);
    },
  };
  serveAgentWorkerChannel<AgentHostWorkerProtocol>(connection.port, {
    sessionKey: connection.sessionId,
    protocolSchemas: agentHostWorkerProtocolSchemas,
    impl: server,
    label: 'agent-host-worker',
    hello: { wire: agentWireVersion, build: agentHostWorkerBuild },
    keepaliveInterval,
  });
});
