/**
 * A real OPFS project and a resident worker's control channel: the browser tier's shared facade for the suites that
 * drive a real resident worker (agent-host and agent-host-resident).
 */
import { expect, vi } from 'vitest';
import { OPFSProvider } from '@taucad/filesystem/backend';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { createFileSystemBridgePort as createBridgePort } from '@taucad/fs-bridge';
import { connectAgentWorkerChannel } from '@taucad/agent-host/channel-client';
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

/** The client options over one OPFS project directory. */
const projectOptions = (
  fileSystemProvider: FileSystemProvider,
  providerBasePath: string,
  createFileSystemBridgePort: typeof createBridgePort,
) =>
  ({
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(rootedProvider(fileSystemProvider, providerBasePath)),
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
