/** Real Tau ACP/Pi, revision candidates and CLI CAD runtime; model decisions are explicitly scripted. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import { projectTaskSnapshotSchema } from '@taucad/agent-host/wire';
import type { ModelStreamEvent, ModelTransport } from '@taucad/agent-host';
import { reduceEventLog } from '@taucad/agent-host';
import { createProjectTasksHarness } from '#project-tasks-harness.fixture.js';
import type { HostRuntimeClient } from '#agent-tools.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import { startRuntimeChild } from '#runtime-child-supervisor.js';

if (process.argv[2] === '--seed-native-resume') {
  const workspaceRoot = process.argv[3];
  const checkoutsDirectory = process.argv[4];
  if (!workspaceRoot || !checkoutsDirectory) {
    throw new Error('Native recovery seed requires project paths.');
  }
  const entered = Promise.withResolvers<void>();
  const seeded = await createProjectTasksHarness({
    agents: [],
    reopen: { workspaceRoot, checkoutsDirectory },
    model: { id: 'scripted-native-resume', contextWindow: 200_000 },
    modelTransport: {
      funding: { type: 'unfunded' },
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        entered.resolve();
        yield { type: 'text-delta', text: 'Native paused recovery fixture.' };
        await new Promise<void>((resolve) => {
          if (request.signal.aborted) {
            resolve();
            return;
          }
          request.signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });
        request.signal.throwIfAborted();
      },
    },
  });
  await seeded.host.launcher.execute({
    type: 'start',
    commandId: 'native-seed-start',
    payload: {
      chatId: 'native-recovery',
      runId: 'native-recovery-run',
      trigger: 'submit',
      message: { id: 'native-seed-message', role: 'user', content: 'Pause this disposable native recovery turn.' },
      config: {
        systemPrompt: 'Native fixture.',
        toolChoice: ['task_read', 'task_spawn'],
        allowedTools: ['task_read', 'task_spawn', 'export_model'],
      },
    },
  });
  await entered.promise;
  await seeded.host.launcher.execute({
    type: 'interrupt',
    commandId: 'native-seed-interrupt',
    payload: {
      chatId: 'native-recovery',
      runId: 'native-recovery-run',
      interruptId: 'native-gate',
      kind: 'operator',
      prompt: 'Continue recovery test?',
    },
  });
  const deadline = Date.now() + 10_000;
  let paused = await seeded.host.launcher.host.snapshot('native-recovery');
  while (paused.state !== 'paused') {
    if (Date.now() >= deadline) {
      throw new Error('Native fixture did not pause.');
    }
    // oxlint-disable-next-line no-await-in-loop -- wait for the canonical native interrupt owner before simulated process loss.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
    // oxlint-disable-next-line no-await-in-loop -- observe the same canonical run after its interrupt settles.
    paused = await seeded.host.launcher.host.snapshot('native-recovery');
  }
  let resolution = await seeded.host.launcher.execute({
    type: 'resolve-interrupt',
    commandId: 'native-seed-resolution',
    payload: {
      chatId: 'native-recovery',
      runId: 'native-recovery-run',
      interruptId: 'native-gate',
      outcome: 'approved',
    },
  });
  let resolutionAttempt = 0;
  while (resolution.status === 'refused' && resolution.code === 'CHAT_RUN_LIVE' && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- settling releases the native attempt before its resolution command is admissible.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
    resolutionAttempt += 1;
    // oxlint-disable-next-line no-await-in-loop -- retry only a non-applied canonical settling refusal.
    resolution = await seeded.host.launcher.execute({
      type: 'resolve-interrupt',
      commandId: `native-seed-resolution-${resolutionAttempt}`,
      payload: {
        chatId: 'native-recovery',
        runId: 'native-recovery-run',
        interruptId: 'native-gate',
        outcome: 'approved',
      },
    });
  }
  if (resolution.status !== 'applied') {
    throw new Error(JSON.stringify(resolution));
  }
  const snapshot = await seeded.tasks.read();
  process.stdout.write(`NATIVE_TASK_SEED ${JSON.stringify({ ...snapshot, resolution })}\n`);
  // oxlint-disable-next-line unicorn/no-process-exit -- deliberate process-loss fixture; the next host must reconcile actual journal and lease ownership.
  process.exit(0);
}

const frames: AcpWireFrame[] = [];
let step = 0;
let cadResult: unknown;
let modelRequest: string | undefined;
let taskContext:
  | {
      projectId: string;
      taskId: string;
      parentTaskId: string;
      attemptId: string;
      attemptNumber: number;
      candidateCheckoutId: string;
      sourceRevisionId: string;
      sourceCheckoutId: string;
    }
  | undefined;
const projectedToolResult = (value: unknown): unknown => {
  if (!Array.isArray(value)) {
    return value;
  }
  const block: unknown = value.find(
    (entry: unknown) => typeof entry === 'object' && entry !== null && 'type' in entry && entry.type === 'text',
  );
  if (typeof block !== 'object' || block === null || !('text' in block) || typeof block.text !== 'string') {
    return value;
  }
  const parsed: unknown = JSON.parse(block.text);
  return parsed;
};
const modelTransport: ModelTransport = {
  funding: { type: 'unfunded' },
  async *stream(request): AsyncGenerator<ModelStreamEvent> {
    step += 1;
    const lastTool = request.messages.findLast((message) => message.role === 'tool-output');
    if (lastTool?.role === 'tool-output' && lastTool.isError) {
      throw new Error(`Actual Tau tool failed: ${JSON.stringify(lastTool.content)}`);
    }
    switch (step) {
      case 1: {
        modelRequest = request.messages
          .map((message) => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)))
          .join('\n');
        const envelope = /Task execution context: (\{[^\n]+\})/u.exec(modelRequest)?.[1];
        if (!envelope) {
          throw new Error('Actual Pi model request omitted task execution context.');
        }
        taskContext = JSON.parse(envelope) as typeof taskContext;
        if (!taskContext?.taskId || !taskContext.parentTaskId) {
          throw new Error('Actual Pi model request omitted task or parent identity.');
        }
        yield {
          type: 'tool-input',
          toolCallId: 'cad-task-read',
          toolName: 'task_read',
          input: { taskId: taskContext.taskId },
        };

        break;
      }
      case 2: {
        const snapshot = projectTaskSnapshotSchema.parse(lastTool?.content);
        if (!snapshot.tasks.some((entry) => entry.id === taskContext?.taskId)) {
          throw new Error('Host-supplied Tau CAD identity did not permit a self read.');
        }
        yield {
          type: 'tool-input',
          toolCallId: 'cad-create-file',
          toolName: 'create_file',
          input: { targetFile: 'part.scad', content: 'cube(12);\n' },
        };

        break;
      }
      case 3: {
        yield {
          type: 'tool-input',
          toolCallId: 'cad-evaluate',
          toolName: 'evaluate_model',
          input: { targetFile: 'part.scad' },
        };

        break;
      }
      case 4: {
        cadResult = projectedToolResult(lastTool?.content);
        if (!JSON.stringify(cadResult).includes('"status":"ready"')) {
          throw new Error(`Actual CAD evaluation was not ready: ${JSON.stringify(cadResult)}`);
        }
        if (!taskContext?.parentTaskId) {
          throw new Error('Tau parent identity missing.');
        }
        yield {
          type: 'tool-input',
          toolCallId: 'cad-send-result',
          toolName: 'task_send',
          input: { requestId: 'cad-ready', taskId: taskContext.parentTaskId, text: 'CAD_READY_NONCE' },
        };

        break;
      }
      default: {
        yield { type: 'text-delta', text: 'Actual CAD runtime evaluated part.scad. CAD_READY_NONCE' };
        yield { type: 'completed', stopReason: 'stop' };
        return;
      }
    }
    yield { type: 'completed', stopReason: 'toolUse' };
  },
};
const child = await startRuntimeChild({
  modulePath: fileURLToPath(new URL('../../../cli/src/host-runtime-child.ts', import.meta.url)),
});
const clients = new Map<string, HostRuntimeClient>();
const harness = await createProjectTasksHarness({
  agents: [
    {
      id: 'codex',
      package: 'scripted-project-tasks-fixture',
      version: '0.0.0',
      configEnv: [],
      displayName: 'Scripted ACP parent',
      modulePath: fileURLToPath(new URL('../acp/fixtures/project-tasks-agent.ts', import.meta.url)),
    },
  ],
  modelTransport,
  model: { id: 'scripted-task-model', contextWindow: 200_000 },
  runtimeClient: async (root) => {
    let client = clients.get(root);
    if (!client) {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- The runtime's plugin tuple is intentionally erased at the established host runtime boundary, matching the daemon composition.
      client = createRuntimeClient({
        transport: webSocketTransport({
          url: child.url,
          fileSystem: fromNodeFs(root),
          createSocket: (url) =>
            new WebSocket(url, { headers: { authorization: `Bearer ${child.authorizationToken}` } }),
        }),
      }) as unknown as HostRuntimeClient;
      clients.set(root, client);
    }
    return client;
  },
  tauAcp: {
    onFrame: (frame) => {
      frames.push(frame);
    },
  },
});
try {
  const accepted = await harness.host.launcher.execute({
    type: 'start',
    commandId: 'cad-parent-start',
    payload: {
      chatId: 'cad-parent',
      runId: 'cad-parent-run',
      trigger: 'submit',
      message: { id: 'cad-parent-message', role: 'user', content: 'PROJECT_TASK_FIXTURE:tau-root' },
      config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
    },
  });
  if (accepted.status === 'refused') {
    throw new Error(accepted.message);
  }
  const deadline = Date.now() + 120_000;
  let snapshot = await harness.tasks.read();
  while (
    Date.now() < deadline &&
    (snapshot.tasks.length !== 2 || snapshot.tasks.some((task) => task.attempts.at(-1)?.status !== 'completed'))
  ) {
    const failed = snapshot.tasks.find((task) => task.attempts.at(-1)?.status === 'failed');
    if (failed) {
      // oxlint-disable-next-line no-await-in-loop -- failure diagnostics belong to this exact terminal task.
      const events = await harness.readLog(failed.chatId);
      throw new Error(`Task failed: ${JSON.stringify(events.slice(-5))}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- observe actual independent task settlement.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    // oxlint-disable-next-line no-await-in-loop -- the durable projection is the authority.
    snapshot = await harness.tasks.read();
  }
  if (snapshot.tasks.length !== 2 || snapshot.tasks.some((task) => task.attempts.at(-1)?.status !== 'completed')) {
    throw new Error(`Actual task did not settle: ${JSON.stringify(snapshot)}`);
  }
  const cadTask = snapshot.tasks.find((task) => task.provider.id === 'tau');
  if (!cadTask) {
    throw new Error('Actual Tau child missing.');
  }
  const attempt = cadTask.attempts[0];
  if (
    !attempt ||
    !taskContext ||
    !modelRequest ||
    taskContext.projectId !== cadTask.projectId ||
    taskContext.taskId !== cadTask.id ||
    taskContext.parentTaskId !== cadTask.parentTaskId ||
    taskContext.attemptId !== attempt.id ||
    taskContext.attemptNumber !== attempt.number ||
    taskContext.candidateCheckoutId !== attempt.candidateCheckoutId ||
    taskContext.sourceRevisionId !== attempt.source.revisionId ||
    taskContext.sourceCheckoutId !== attempt.source.checkoutId ||
    !modelRequest.includes('File tools and CAD execution are rooted in the assigned candidate checkout.') ||
    !modelRequest.includes('Revision history and describe report the project live history')
  ) {
    throw new Error('Actual Pi model request did not contain the authoritative task and placement context.');
  }
  const candidate = harness.host.revisions
    .status()
    .branches.find((branch) => branch.name.startsWith(`task-${cadTask.id}-`))?.checkoutRoot;
  if (!candidate) {
    throw new Error('Actual Tau candidate root missing.');
  }
  const part = await readFile(join(candidate, 'part.scad'), 'utf8');
  let livePartAbsent = false;
  try {
    await readFile(join(harness.workspaceRoot, 'part.scad'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      livePartAbsent = true;
    } else {
      throw error;
    }
  }
  const messages = reduceEventLog(await harness.readLog(cadTask.chatId));
  const toolInputs = messages.flatMap((message) => (message.role === 'tool-input' ? [message.toolName] : []));
  const protocol = frames.map(({ direction, frame }) => {
    const parsed = JSON.parse(frame) as { method?: string; params?: { update?: { sessionUpdate?: string } } };
    return { direction, method: parsed.method, update: parsed.params?.update?.sessionUpdate };
  });
  process.stdout.write(
    `TASK_CAD_PROOF ${JSON.stringify({ model: 'scripted', runtime: 'actual CLI CAD runtime', part, livePartAbsent, taskContext, toolInputs, protocol, cadResult, messages: snapshot.messages.map((message) => ({ from: message.senderTaskId, to: message.recipientTaskId, text: message.text })), tasks: snapshot.tasks.map((task) => ({ id: task.id, provider: task.provider.id, depth: task.depth, status: task.attempts.at(-1)?.status })) })}\n`,
  );
} finally {
  await harness.close();
  await child.close();
}
// oxlint-disable-next-line unicorn/no-process-exit -- the one-shot fixture has closed its owners; runtime clients retain loopback sockets until process exit.
process.exit(0);
