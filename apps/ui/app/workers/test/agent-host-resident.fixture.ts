/**
 * A real OPFS project and a resident worker's control channel: the browser tier's shared facade for the suites that
 * drive a real resident worker (agent-host and agent-host-resident).
 */
import { expect, vi } from 'vitest';
import { OPFSProvider } from '@taucad/filesystem/backend';
import { Topic } from '@taucad/events';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { createFileSystemBridgePort as createBridgePort } from '@taucad/fs-bridge';
import { connectAgentWorkerChannel, serveTurnPlacementChannel } from '@taucad/agent-host/channel-client';
import type { TurnPlacementFact } from '@taucad/agent-host';
import type { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';
import { agentHostWorkerProtocolSchemas, parseAgentHostWorkerConnect } from '#workers/agent-host.contract.js';
import { rootedProvider } from '#workers/test/rooted-provider.fixture.js';
import { randomUuid } from '@taucad/utils/id';

let provider: FileSystemProvider | undefined;

/** The provider the last {@link opfsProject} opened, until {@link disposeOpfsProject}. */
export const opfsProvider = (): FileSystemProvider => {
  if (provider === undefined) {
    throw new Error('No OPFS project is open.');
  }
  return provider;
};

/** Disposes the provider the last {@link opfsProject} opened; each suite calls it after each test. */
export const disposeOpfsProject = (): void => {
  provider?.dispose();
  provider = undefined;
};

/**
 * A page-side placement session (W8 TS-S5) that places every attempt directly on the project root and settles it
 * `turn.finalized` on complete: the file-manager worker's session without revisions, for suites that run turns.
 */
export const livePlacementPort = (
  projectRoot: FileSystemProvider,
  projectId: string,
  createFileSystemBridgePort: typeof createBridgePort,
): MessagePort => {
  const facts: TurnPlacementFact[] = [];
  const wakes = new Topic<void>({ name: 'resident-placement.settlements' });
  const { port1, port2 } = new MessageChannel();
  serveTurnPlacementChannel({
    port: port2,
    projectId,
    session: {
      admit: async ({ requestId, checkoutId }) => ({
        requestId,
        status: 'applied',
        placement: {
          checkoutId: checkoutId ?? 'live',
          mode: 'direct',
          root: '/',
          tools: { port: createFileSystemBridgePort(projectRoot).port },
        },
      }),
      complete: async ({ requestId, key }) => {
        facts.push({
          kind: 'settled',
          key,
          row: {
            type: 'turn.finalized',
            runId: key.runId,
            attempt: key.attempt,
            turnId: key.turnId,
            chatId: key.chatId,
            projectId,
            changedPaths: [],
            trigger: 'turn',
            runIds: [key.runId],
          },
        });
        wakes.emit();
        return { requestId, status: 'applied' };
      },
      abandon: async ({ requestId }) => ({ requestId, status: 'applied' }),
      acknowledge: async ({ requestId }) => ({ requestId, status: 'applied' }),
      reconcile: async ({ requestId }) => ({ requestId, status: 'applied', held: [] }),
      async *settlements({ signal }) {
        let next = 0;
        while (!signal.aborted) {
          while (next < facts.length) {
            yield facts[next++]!;
          }
          // oxlint-disable-next-line no-await-in-loop -- a listen waits for its next fact.
          await new Promise<void>((resolve) => {
            const abort = (): void => {
              unsubscribe();
              resolve();
            };
            const unsubscribe = wakes.subscribe(() => {
              signal.removeEventListener('abort', abort);
              unsubscribe();
              resolve();
            });
            signal.addEventListener('abort', abort, { once: true });
          });
        }
      },
    },
  });
  return port1;
};

/** The client options over one OPFS project directory. */
const projectOptions = (
  fileSystemProvider: FileSystemProvider,
  providerBasePath: string,
  createFileSystemBridgePort: typeof createBridgePort,
) =>
  ({
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(rootedProvider(fileSystemProvider, providerBasePath)),
    openPlacementPort: () =>
      livePlacementPort(
        rootedProvider(fileSystemProvider, providerBasePath),
        providerBasePath,
        createFileSystemBridgePort,
      ),
    projectStorage: { projectId: providerBasePath, backend: 'opfs', providerBasePath },
    durability: 'exclusive-append',
    authority: { projectId: providerBasePath, workspaceId: providerBasePath },
    gatewayBaseUrl: location.origin,
    systemPrompt: 'Browser launcher fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Browser launcher fixture.' },
      { type: 'text', text: 'Dynamic fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
  }) as const satisfies Parameters<typeof createBrowserAgentHostClient>[0];

/** Client options over a real OPFS project, for the rows that drive a real resident worker. */
export const opfsProject = async (label: string): Promise<ReturnType<typeof projectOptions>> => {
  const fileSystemProvider = new OPFSProvider();
  provider = fileSystemProvider;
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-${label}-${randomUuid()}`;
  const storageRoot = await navigator.storage.getDirectory();
  await storageRoot.getDirectoryHandle(providerBasePath, { create: true });
  return projectOptions(fileSystemProvider, providerBasePath, createFileSystemBridgePort);
};

/** The worker's control channel, opened the way the page's resident opens it. */
export const controlOf = (worker: Worker): ReturnType<typeof connectAgentWorkerChannel<AgentHostWorkerProtocol>> => {
  const { port1, port2 } = new MessageChannel();
  const sessionId = randomUuid();
  worker.postMessage(parseAgentHostWorkerConnect({ type: 'agent-host/connect', sessionId, port: port1 }), [port1]);
  return connectAgentWorkerChannel<AgentHostWorkerProtocol>(port2, {
    sessionKey: sessionId,
    protocolSchemas: agentHostWorkerProtocolSchemas,
  });
};

/**
 * Terminate workers a resident drives, after the case closed its clients, and wait until the resident retires each
 * one. The page cannot see a terminated worker, so its resident retires it only once the liveness bound (3.5 s)
 * passes; waiting here keeps that retire inside the case that caused it.
 */
export const retireWorkers = async (...workers: readonly Worker[]): Promise<void> => {
  const warn = vi.spyOn(console, 'warn');
  try {
    for (const worker of workers) {
      worker.terminate();
    }
    await vi.waitFor(
      () => {
        const retired = warn.mock.calls.filter(([message]) => String(message).includes('resident worker is gone'));
        expect(retired).toHaveLength(workers.length);
      },
      { timeout: 10_000, interval: 100 },
    );
  } finally {
    warn.mockRestore();
  }
};
