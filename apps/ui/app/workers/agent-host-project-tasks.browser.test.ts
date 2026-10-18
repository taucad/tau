import { expect, it, vi } from 'vitest';
import { OPFSProvider } from '@taucad/filesystem/backend';
import type { CheckedFileWrite, CheckedFileWriteResult } from '@taucad/filesystem';
import { Topic } from '@taucad/events';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import { serveTurnPlacementChannel } from '@taucad/agent-host/channel-client';
import type { TurnPlacementFact } from '@taucad/agent-host';
import type { WorkerRevisionRequest, WorkerRevisionResponse } from '#machines/file-manager.worker.revisions.js';
import { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import { rootedProvider } from '#workers/test/rooted-provider.fixture.js';
import { placementFacts } from '#workers/test/agent-host-resident.fixture.js';

it('runs nested Tau tasks in a real browser worker over isolated revision candidates', async () => {
  const provider = new OPFSProvider();
  await provider.initialize();
  const projectId = `browser-tasks-${crypto.randomUUID()}`;
  const storageRoot = await navigator.storage.getDirectory();
  await storageRoot.getDirectoryHandle(projectId, { create: true });
  await provider.writeFile(`${projectId}/main.scad`, 'cube(99);\n');
  const root = rootedProvider(provider, projectId);
  const encoder = new TextEncoder();
  const rootedAuthority = {
    ...root,
    writeFileChecked: async (input: CheckedFileWrite): Promise<CheckedFileWriteResult> => {
      for (const precondition of input.preconditions) {
        // oxlint-disable-next-line no-await-in-loop -- compare the preconditions against the same rooted provider.
        const actual = (await root.exists(precondition.path)) ? await root.readFile(precondition.path) : null;
        const expected =
          precondition.expected === null
            ? null
            : typeof precondition.expected === 'string'
              ? encoder.encode(precondition.expected)
              : precondition.expected;
        if (
          actual === null
            ? expected !== null
            : expected === null || new TextDecoder().decode(actual) !== new TextDecoder().decode(expected)
        ) {
          return { status: 'conflict', conflicts: [{ path: precondition.path, actual }] };
        }
      }
      await root.writeFile(input.path, input.data);
      return {
        status: 'applied',
        content: typeof input.data === 'string' ? encoder.encode(input.data) : input.data,
      };
    },
  };
  const allocated: Array<{ checkoutId: string; from: string; requestId: string }> = [];
  const revisionPorts: MessagePort[] = [];
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const client = createBrowserAgentHostClient({
    createWorker: () => worker,
    openFileSystemBridge: () => createFileSystemBridgePort(rootedAuthority),
    openProjectRootBridge: () => createFileSystemBridgePort(rootedAuthority),
    openTaskRevisionsPort: () => {
      const { port1, port2 } = new MessageChannel();
      revisionPorts.push(port2);
      port2.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionRequest>) => {
        if (
          data.command !== 'createBranch' ||
          data.id === undefined ||
          data.from === undefined ||
          data.requestId === undefined
        ) {
          return;
        }
        const checkoutId = `candidate-${allocated.length + 1}`;
        const { id } = data;
        allocated.push({ checkoutId, from: data.from, requestId: data.requestId });
        // async-iife: bootstrap -- the candidate must exist before this revision request is answered.
        void (async () => {
          await provider.writeFile(`${projectId}/checkouts/${checkoutId}/main.scad`, 'cube(11);\n');
          port2.postMessage({
            type: 'result',
            id,
            result: { kind: 'branch', branch: data.name, checkoutId, checkoutRoot: `/checkouts/${checkoutId}` },
          } satisfies WorkerRevisionResponse);
        })();
      });
      port2.start();
      return port1;
    },
    openPlacementPort: () => {
      const { port1, port2 } = new MessageChannel();
      const facts: TurnPlacementFact[] = [];
      const wakes = new Topic<void>({ name: 'browser-task-placement' });
      serveTurnPlacementChannel({
        port: port2,
        projectId,
        session: {
          admit: async ({ requestId, checkoutId }) => {
            const selected = checkoutId ?? 'live';
            return {
              requestId,
              status: 'applied',
              placement: {
                checkoutId: selected,
                baseRevisionId: 'fixture-revision',
                mode: 'direct',
                root: selected === 'live' ? `/projects/${projectId}` : `/checkouts/${selected}`,
                tools: {
                  port: createFileSystemBridgePort(
                    selected === 'live' ? root : rootedProvider(provider, `${projectId}/checkouts/${selected}`),
                  ).port,
                },
              },
            };
          },
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
          settlements: ({ signal }) => placementFacts(facts, wakes, signal),
        },
      });
      return port1;
    },
    projectStorage: { projectId, backend: 'opfs', providerBasePath: projectId },
    durability: 'exclusive-append',
    authority: { projectId, workspaceId: projectId },
    gatewayBaseUrl: `${location.origin}/task-fixture`,
    systemPrompt: 'Nested browser task fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Nested browser task fixture.' },
      { type: 'text', text: 'Static task fixture.' },
      { type: 'text', text: 'Dynamic task fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
  });
  try {
    await expect(
      client.hostCommand({
        type: 'start',
        commandId: 'browser-task-root-command',
        payload: {
          chatId: 'browser-task-root-chat',
          runId: 'browser-task-root-run',
          trigger: 'submit',
          message: { id: 'browser-task-root-message', role: 'user', content: 'BROWSER_ROOT_TASK' },
          config: { systemPrompt: '', toolChoice: 'auto' },
        },
      }),
    ).resolves.toMatchObject({ status: 'applied' });
    const snapshot = await vi.waitFor(
      async () => {
        const answer = await client.projectTasks!({ operation: 'read', input: {} });
        if (
          answer.kind !== 'snapshot' ||
          answer.snapshot.tasks.length !== 3 ||
          answer.snapshot.tasks.some((task) => task.attempts.at(-1)?.status !== 'completed')
        ) {
          throw new Error(JSON.stringify(answer));
        }
        return answer.snapshot;
      },
      { timeout: 40_000, interval: 100 },
    );
    const [rootTask, child, grandchild] = snapshot.tasks;
    expect(child).toMatchObject({ parentTaskId: rootTask!.id, depth: 1 });
    expect(grandchild).toMatchObject({ parentTaskId: child!.id, depth: 2 });
    const childRecord = JSON.parse(
      await provider.readFile(`${projectId}/.tau/chats/${child!.chatId}/chat.json`, 'utf8'),
    ) as { taskLineage: unknown };
    const grandchildRecord = JSON.parse(
      await provider.readFile(`${projectId}/.tau/chats/${grandchild!.chatId}/chat.json`, 'utf8'),
    ) as { taskLineage: unknown };
    expect(childRecord.taskLineage).toMatchObject({ parentTaskId: rootTask!.id, rootChatId: rootTask!.chatId });
    expect(grandchildRecord.taskLineage).toMatchObject({ parentTaskId: child!.id, rootChatId: rootTask!.chatId });
    expect(allocated).toHaveLength(2);
    expect(allocated.every(({ from }) => from === 'fixture-revision')).toBe(true);
    expect(await provider.readFile(`${projectId}/main.scad`, 'utf8')).toBe('cube(99);\n');
    for (const { checkoutId } of allocated) {
      // oxlint-disable-next-line no-await-in-loop -- each candidate is independently read back.
      expect(await provider.readFile(`${projectId}/checkouts/${checkoutId}/main.scad`, 'utf8')).toBe('cube(11);\n');
    }
    await expect(
      provider.readFile(`${projectId}/checkouts/${allocated[1]!.checkoutId}/candidate.txt`, 'utf8'),
    ).resolves.toBe('grandchild-only\n');
    const attached = await client.hostCommand({
      type: 'attach',
      commandId: 'browser-grandchild-attach',
      payload: { chatId: grandchild!.chatId },
    });
    expect(JSON.stringify(attached)).toContain('cube(11);');
    await expect(
      client.projectTasks!({
        operation: 'send',
        input: {
          requestId: 'browser-mailbox',
          taskId: child!.id,
          text: 'Browser mailbox delivery',
        },
      }),
    ).resolves.toMatchObject({ kind: 'message' });
    const mailbox = await client.projectTasks!({ operation: 'read', input: { taskId: child!.id } });
    expect(mailbox).toMatchObject({
      kind: 'snapshot',
      snapshot: { messages: [expect.objectContaining({ text: 'Browser mailbox delivery' })] },
    });
  } finally {
    await client.close();
    for (const port of revisionPorts) {
      port.close();
    }
    provider.dispose();
  }
}, 90_000);
