/**
 * The resident agent-host worker (W6 RH-S8): one per document. The page drives it over one control channel, which
 * one raw port transfer opens, and gives it one `MessagePort` per stream. It keeps one project host per project and
 * serves each port with the agent wire; closing a port only detaches it (D17), so runs continue.
 */
import type { ChannelServer } from '@taucad/agent-host';
import { Topic } from '@taucad/events';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { agentWireVersion } from '@taucad/agent-host/wire';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';
import {
  agentHostWorkerBuild,
  agentHostWorkerProtocolSchemas,
  createAgentHostCapabilityReport,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';
import type { BrowserProjectHost, ResidentWorkerContext } from '#workers/agent-host.impl.js';
import { createProjectHosts } from '#workers/agent-host-projects.js';
import { randomUuid } from '@taucad/utils/id';

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
};

const workerScope = globalThis as unknown as WorkerScope;

/** The keepalive this worker sends so the page can tell slow from dead (T9 E3). Milliseconds. */
const keepaliveInterval = 1000;

type Calls = AgentHostWorkerProtocol['calls'];

const probeCapabilities = async (
  durability: Calls['capabilities']['args']['durability'],
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

/** One probe per durability class for the worker's life; `status` reports the same (RH-S10, LT14). */
const capabilities = new Map<string, Promise<ReturnType<typeof createAgentHostCapabilityReport>>>();
const capabilityOf = async (
  durability: Calls['capabilities']['args']['durability'],
): Promise<ReturnType<typeof createAgentHostCapabilityReport>> => {
  const probe = capabilities.get(durability) ?? probeCapabilities(durability);
  capabilities.set(durability, probe);
  return probe;
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

/* D-092: a fault in one chat or one project host is logged and the worker continues. */
workerScope.addEventListener('error', (event) => {
  console.error('[agent-host worker] uncaught error', event.error ?? event.message);
});
workerScope.addEventListener('unhandledrejection', (event) => {
  console.error('[agent-host worker] unhandled rejection', event.reason);
});

/* The page's visibility, which every project host's chat store reads (RH-R16). */
let visible = true;
const visibilityTopic = new Topic<boolean>();
const visibility: ResidentWorkerContext['visibility'] = {
  visible: () => visible,
  subscribe: (listener) => visibilityTopic.subscribe(listener),
};

let tabId: string | undefined;

const requireTab = (): string => {
  if (tabId === undefined) {
    throw Object.assign(new Error('The agent host worker has no tab identity yet.'), {
      code: 'WORKER_NOT_INITIALIZED',
    });
  }
  return tabId;
};

/** One project host per project; a newer `provide` replaces the incarnation, and `release` closes it (RH-R4). */
const hosts = createProjectHosts<BrowserProjectHost>(async (args) => {
  const loaded = await loadImplementation();
  return loaded.openBrowserProjectHost(args, { tabId: requireTab(), visibility });
});

let connected = false;
workerScope.addEventListener('message', (event) => {
  if (connected) {
    return;
  }
  const connection = parseAgentHostWorkerConnect(event.data);
  connected = true;
  const server: ChannelServer<AgentHostWorkerProtocol> = {
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    call: async (_context, name, args) => {
      switch (name) {
        case 'init': {
          tabId ??= (args as Calls['init']['args']).tabId;
          return undefined;
        }
        case 'capabilities': {
          return capabilityOf((args as Calls['capabilities']['args']).durability);
        }
        case 'provide': {
          return hosts.provide(args as Calls['provide']['args']);
        }
        case 'rebridge': {
          return hosts.rebridge(args as Calls['rebridge']['args']);
        }
        case 'release': {
          await hosts.release(args as Calls['release']['args']);
          return undefined;
        }
        case 'connect': {
          const { projectId, hostId, port } = args as Calls['connect']['args'];
          const host = hosts.hostOf(projectId);
          if (host?.hostId !== hostId) {
            port.close();
            return { status: 'needs' };
          }
          host.connect(port);
          return { status: 'connected' };
        }
        case 'status': {
          const host = hosts.hostOf((args as Calls['status']['args']).projectId);
          return {
            ...(host === undefined ? {} : { hostId: host.hostId }),
            capability: await capabilityOf('exclusive-append'),
          };
        }
        case 'runStoppability': {
          const { projectId, chatId } = args as Calls['runStoppability']['args'];
          return hosts.hostOf(projectId)?.stoppability(chatId) ?? 'background-window';
        }
        case 'visibility': {
          visible = (args as Calls['visibility']['args']).visible;
          visibilityTopic.emit(visible);
          return undefined;
        }
        default: {
          throw Object.assign(new Error(`Unknown agent host worker call: ${String(name)}.`), {
            code: 'COMMAND_UNREADABLE',
          });
        }
      }
    },
    listen: () => {
      throw Object.assign(new Error('The agent host control channel has no streams.'), { code: 'COMMAND_UNREADABLE' });
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
