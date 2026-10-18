import { readChannelDiagnostics } from '#db/channel-diagnostics.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import type { RevisionFileSystem } from '@taucad/revisions/revision-effects';
import { createProjectRevisionsActor } from '@taucad/revisions/revision-effects';
import { selectRevisionStatus } from '@taucad/revisions/project-revisions-machine';
import { createTurnPlacementPort } from '@taucad/revisions/turn-placement';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import { createAgentChannelClient, serveTurnPlacementChannel } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import type { TurnPlacementPort } from '@taucad/agent-host';
import { WorkspaceFileService, MountTable, ProviderRegistry, ResourceQueue, ChangeEventBus } from '@taucad/filesystem';
import { openBrowserProjectHost } from '#workers/agent-host.impl.js';
import type { WorkerRevisionRequest, WorkerRevisionResponse } from '#machines/file-manager.worker.revisions.js';
import type { BrowserProjectHost } from '#workers/agent-host.impl.js';
import { disposeOpfsProject, opfsProject, opfsProvider } from '#workers/test/agent-host-resident.fixture.js';
import { rootedProvider } from '#workers/test/rooted-provider.fixture.js';

afterEach(disposeOpfsProject);

it.each(['admit', 'complete', 'acknowledge', 'bridges', 'active', 'restart', 'reader', 'reopen'] as const)(
  'should recover %s interruption with the same attempt and no repeated model invocation',
  async (lost) => {
    const options = await opfsProject(`lost-${lost}`);
    const mounts = new MountTable();
    mounts.mount('/', rootedProvider(opfsProvider(), options.projectStorage.providerBasePath), {
      class: 'authored',
      backend: 'opfs',
      storageRootKey: 'recovery',
    });
    const filesystem = new WorkspaceFileService({
      mountTable: mounts,
      providerRegistry: new ProviderRegistry(),
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
    });
    const root = filesystem.createRootedFileSystem('/');
    const revisions = createIsomorphicGitRevisionPort({
      filesystem: root,
      checkouts: { projectId: options.authority.projectId, root: () => root },
    });
    await revisions.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await root.writeFile('source.txt', 'Recovery source revision.\n');
    let tree = createProjectRevisionsActor({
      port: revisions,
      projectId: options.authority.projectId,
      filesystem: () => root,
    });
    tree.actor.start();
    await vi.waitFor(() => {
      expect(selectRevisionStatus(tree.actor.getSnapshot()).checkoutId).toBeDefined();
    });
    tree.actor.send({
      type: 'cut',
      requestId: 'recovery-source',
      trigger: 'save',
      checkoutId: selectRevisionStatus(tree.actor.getSnapshot()).checkoutId,
      leaseIds: [],
    });
    await vi.waitFor(() => {
      expect(selectRevisionStatus(tree.actor.getSnapshot()).headRevisionId).toBeDefined();
    });
    let session: ReturnType<typeof createTurnPlacementPort<{ port: MessagePort }>> | undefined;
    const servers: MessagePort[] = [];
    const bridges: Array<ReturnType<typeof createFileSystemBridgePort>> = [];
    const admissions: Array<Parameters<TurnPlacementPort['admit']>[0]> = [];
    const completions: Array<Parameters<TurnPlacementPort['complete']>[0]> = [];
    const acknowledgements: Array<Parameters<TurnPlacementPort['acknowledge']>[0]> = [];
    const grants: RevisionFileSystem[] = [];
    let dropped = false;
    let host: BrowserProjectHost | undefined;
    let client: AgentChannelClient | undefined;
    const openPlacement = async (): Promise<MessagePort> => {
      await session?.fence();
      if (lost === 'restart' && servers.length === 1) {
        tree.actor.stop();
        await tree.settled();
        tree = createProjectRevisionsActor({
          port: revisions,
          projectId: options.authority.projectId,
          filesystem: () => root,
        });
        tree.actor.start();
      }
      const active = createTurnPlacementPort({
        revisions: tree,
        openTools: ({ filesystem }) => {
          grants.push(filesystem);
          const bridge = createFileSystemBridgePort(filesystem);
          bridges.push(bridge);
          return bridge;
        },
      });
      session = active;
      const { port1, port2 } = new MessageChannel();
      servers.push(port2);
      const first = servers.length === 1;
      serveTurnPlacementChannel({
        port: port2,
        projectId: options.authority.projectId,
        session: {
          ...active,
          admit: async (input) => {
            admissions.push(input);
            const answer = await active.admit(input);
            if (lost === 'admit' && !dropped) {
              dropped = true;
              port2.close();
            }
            return answer;
          },
          complete: async (input) => {
            completions.push(input);
            const answer = await active.complete(input);
            if ((lost === 'complete' || lost === 'restart' || lost === 'reopen') && !dropped) {
              dropped = true;
              port2.close();
            }
            return answer;
          },
          acknowledge: async (input) => {
            acknowledgements.push(input);
            const answer = await active.acknowledge(input);
            if (lost === 'acknowledge' && !dropped) {
              dropped = true;
              port2.close();
            }
            return answer;
          },
          async *settlements({ signal }) {
            for await (const fact of active.settlements({ signal })) {
              // Lose both the completion response and its notification; the successor must replay durable proof.
              if (
                first &&
                (lost === 'complete' || lost === 'restart' || lost === 'reopen') &&
                fact.kind === 'settled'
              ) {
                continue;
              }
              yield fact;
            }
          },
        },
      });
      return port1;
    };
    const openFiles = () => {
      const fileSystem = createFileSystemBridgePort(root);
      const projectRoot = createFileSystemBridgePort(root);
      bridges.push(fileSystem, projectRoot);
      return { fileSystemPort: fileSystem.port, projectRootPort: projectRoot.port };
    };
    const readers: MessagePort[] = [];
    const readerCalls: number[] = [];
    const openReader = (): MessagePort | undefined => {
      if (lost !== 'reader') {
        return undefined;
      }
      const { port1, port2 } = new MessageChannel();
      const generation = readers.length;
      readers.push(port2);
      port2.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionRequest>) => {
        if (data.id === undefined) {
          return;
        }
        if (data.command === 'log') {
          readerCalls.push(generation);
          port2.postMessage({
            type: 'result',
            id: data.id,
            result: { kind: 'log', rows: [] },
          } satisfies WorkerRevisionResponse);
        } else if (data.command === 'fetchGeoSpecCandidates') {
          port2.postMessage({
            type: 'result',
            id: data.id,
            result: { kind: 'geoSpecCandidates', candidates: [] },
          } satisfies WorkerRevisionResponse);
        }
      });
      port2.start();
      port2.postMessage({ type: 'status', status: { line: { kind: 'branch', name: 'main' }, branches: [] } });
      return port1;
    };
    let requestedHistory = false;
    const fetchOriginal = globalThis.fetch;
    const modelCalls = vi.fn(async () => {
      if (lost === 'reader' && !requestedHistory) {
        requestedHistory = true;
        const frame = {
          choices: [
            {
              delta: {
                // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI wire field.
                tool_calls: [
                  {
                    index: 0,
                    id: 'history',
                    type: 'function',
                    function: { name: 'revisions', arguments: JSON.stringify({ action: 'log', branch: 'main' }) },
                  },
                ],
              },
              // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI wire field.
              finish_reason: 'tool_calls',
            },
          ],
        };
        return new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`, {
          headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-history' },
        });
      }
      if (lost === 'active') {
        const grant = grants[0]!;
        await grant.writeFile('accepted.txt', 'before reconnect');
        servers[0]!.close();
        await vi.waitFor(
          () => {
            expect(recoveries).toHaveLength(1);
          },
          { timeout: 10_000 },
        );
        await Promise.all(recoveries);
        await expect(grant.writeFile('duplicate.txt', 'after reconnect')).rejects.toBeDefined();
        expect(await root.readFile('accepted.txt', 'utf8')).toBe('before reconnect');
        expect(await root.exists('duplicate.txt')).toBe(false);
      }
      return new Response(
        'data: {"choices":[{"delta":{"content":"Done."},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-recovery' } },
      );
    });
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.includes('/v1/llm/') ? modelCalls() : fetchOriginal(input, init);
    };
    const recoveries: Array<Promise<void>> = [];
    let hostId = 'recovery-host';
    const openHost = async () =>
      openBrowserProjectHost(
        {
          projectId: options.authority.projectId,
          hostId,
          ...openFiles(),
          placementPort: await openPlacement(),
          revisionsPort: openReader(),
          projectStorage: options.projectStorage,
          authority: options.authority,
          computeMode: 'off',
          gatewayBaseUrl: location.origin,
          systemPrompt: options.systemPrompt,
          systemPromptBlocks: options.systemPromptBlocks,
          model: options.model,
          runtimeConfig: options.runtimeConfig,
        },
        {
          tabId: crypto.randomUUID(),
          visibility: { visible: () => true, subscribe: () => () => undefined },
          requestRebridge: () => {
            const recovery = (async () => {
              const placementPort = await openPlacement();
              await host!.rebridge({
                projectId: options.authority.projectId,
                hostId,
                ...openFiles(),
                placementPort,
                revisionsPort: openReader(),
              });
            })();
            recoveries.push(recovery);
          },
        },
      );
    try {
      host = await openHost();
      if (lost === 'reader') {
        servers[0]!.close();
      }
      if (lost === 'bridges') {
        const broken = createFileSystemBridgePort({ ...root, capabilities: { ...root.capabilities, writable: false } });
        bridges.push(broken);
        await expect(
          host.rebridge({
            projectId: options.authority.projectId,
            hostId,
            ...openFiles(),
            projectRootPort: broken.port,
            placementPort: await openPlacement(),
          }),
        ).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });
      }
      const channel = new MessageChannel();
      host.connect(channel.port1);
      client = createAgentChannelClient({ connect: () => channel.port2, sessionKey: 'recovery-test' });
      const command = {
        type: 'start',
        commandId: 'start-once',
        payload: {
          chatId: 'chat',
          runId: 'run',
          trigger: 'submit',
          message: { id: 'user', role: 'user', content: 'Hello.' },
        },
      } as const;
      await expect(client.execute(command)).resolves.toMatchObject({ status: 'applied' });
      await vi.waitFor(
        async () => {
          const answer = await client!.execute({
            type: 'attach',
            commandId: crypto.randomUUID(),
            payload: { chatId: 'chat' },
          });
          expect(answer, JSON.stringify(answer)).toMatchObject({
            status: 'applied',
            details: { snapshot: { runId: 'run', state: 'completed' } },
          });
          expect(await tree.turns.leases()).toEqual([]);
        },
        { timeout: 15_000 },
      );
      await vi.waitFor(
        () => {
          expect(recoveries).toHaveLength(1);
          expect(acknowledgements).toHaveLength(lost === 'acknowledge' ? 2 : 1);
        },
        { timeout: 10_000 },
      );
      await Promise.all(recoveries);
      expect(recoveries).toHaveLength(1);
      expect(modelCalls).toHaveBeenCalledTimes(lost === 'reader' ? 2 : 1);
      if (lost === 'reader') {
        expect(readerCalls).toEqual([1]);
      }
      expect(admissions).toHaveLength(lost === 'admit' ? 2 : 1);
      expect(completions).toHaveLength(lost === 'complete' || lost === 'restart' || lost === 'reopen' ? 2 : 1);
      expect(new Set(admissions.map((input) => JSON.stringify(input))).size).toBe(1);
      expect(new Set(completions.map((input) => JSON.stringify(input))).size).toBe(1);
      expect(admissions[0]?.key).toMatchObject({ chatId: 'chat', runId: 'run', attempt: 1 });
      await vi.waitFor(async () => {
        const saved = await readChannelDiagnostics();
        const rows = saved.filter((row) => row.projectId === options.authority.projectId);
        expect(rows).toContainEqual(expect.objectContaining({ event: 'placement.closed', hostId, generation: 1 }));
        expect(rows).toContainEqual(
          expect.objectContaining({ event: 'placement.replaced', hostId, generation: 2, previousGeneration: 1 }),
        );
      });
      if (lost === 'reopen') {
        client.close();
        await host.drain(AbortSignal.timeout(5000));
        await host.close();
        hostId = 'reopened-host';
        host = await openHost();
        const reopened = new MessageChannel();
        host.connect(reopened.port1);
        client = createAgentChannelClient({ connect: () => reopened.port2, sessionKey: 'reopened-test' });
        await vi.waitFor(async () => {
          const saved = await readChannelDiagnostics();
          const rows = saved.filter((row) => row.projectId === options.authority.projectId);
          expect(rows).toContainEqual(expect.objectContaining({ event: 'host.released', hostId: 'recovery-host' }));
          expect(rows).toContainEqual(expect.objectContaining({ event: 'host.closed', hostId: 'recovery-host' }));
          expect(rows).toContainEqual(expect.objectContaining({ event: 'host.opened', hostId: 'reopened-host' }));
        });
      }
      await expect(client.execute(command)).resolves.toMatchObject({ status: 'replayed' });
      expect(modelCalls).toHaveBeenCalledTimes(lost === 'reader' ? 2 : 1);
      if (lost === 'reader') {
        expect(readerCalls).toEqual([1]);
      }
    } finally {
      client?.close();
      await host?.close();
      globalThis.fetch = fetchOriginal;
      await session?.fence();
      tree.actor.stop();
      filesystem.dispose();
      await tree.settled();
      for (const bridge of bridges) {
        bridge.dispose();
      }
      for (const reader of readers) {
        reader.close();
      }
      for (const server of servers) {
        server.close();
      }
    }
  },
  30_000,
);
