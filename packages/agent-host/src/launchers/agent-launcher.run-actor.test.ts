/**
 * The run actor (M1, W7) through the daemon's command path: every verb is answered only once its rows are durable,
 * a pause survives a restart, and intent rows journal what a restart needs to finish a turn.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeLauncher } from '#launchers/node-launcher.fixture.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { ToolRegistry } from '#waist/ports.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;

const emptyTools: ToolRegistry = {
  list: () => [],
  invoke: async () => ({ content: 'no tools', isError: true }),
};

const sse = (chunks: readonly string[]): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-1' } },
  );
};

type Gateway = Readonly<{
  fetch: typeof globalThis.fetch;
  /** Model ids of every generation request, in order. */
  models: string[];
  /** Resolve the next stalled request with a finished turn. */
  release: () => void;
}>;

/**
 * A gateway whose model requests stall until released or aborted.
 *
 * @param stall - Whether requests wait for `release`.
 * @returns The fetch and its controls.
 */
const gateway = (stall: boolean): Gateway => {
  const models: string[] = [];
  const waiting: Array<() => void> = [];
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { model?: string }) : {};
    models.push(body.model ?? '');
    if (!stall) {
      return sse(authoritativeGatewayWireFixtures.browserTurn);
    }
    return new Promise<Response>((resolve, reject) => {
      waiting.push(() => {
        resolve(sse(authoritativeGatewayWireFixtures.browserTurn));
      });
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  }) as unknown as typeof globalThis.fetch;
  return {
    fetch,
    models,
    release: () => {
      waiting.shift()?.();
    },
  };
};

const roots: string[] = [];
const launchers: AgentLauncher[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-run-actor-'));
  roots.push(root);
  return root;
};

const makeLauncher = (workspaceRoot: string, fetch: typeof globalThis.fetch): AgentLauncher => {
  const launcher = createNodeLauncher({
    workspaceRoot,
    gatewayBaseUrl: 'https://gateway.example',
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    auth: () => 'daemon-bearer',
    fetch,
  });
  launchers.push(launcher);
  return launcher;
};

afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const logPath = (root: string, chatId: string): string => join(root, '.tau', 'chats', chatId, 'events.jsonl');

const rowsOf = async (root: string, chatId: string): Promise<AgentLogEvent[]> => {
  const text = await readFile(logPath(root, chatId), 'utf8');
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AgentLogEvent);
};

/** Write a chat's log as a host that died left it. Rows get the base fields a writer stamps. */
const seed = async (root: string, chatId: string, rows: ReadonlyArray<Record<string, unknown>>): Promise<void> => {
  await mkdir(join(root, '.tau', 'chats', chatId), { recursive: true });
  const base = {
    version: 1,
    leaderEpoch: 'seed-term',
    epoch: 1,
    recordedAt: new Date(Date.UTC(2026, 8, 1)).toISOString(),
  };
  await writeFile(
    logPath(root, chatId),
    rows.map((row, sequence) => JSON.stringify({ ...base, sequence, ...row })).join('\n') + '\n',
    'utf8',
  );
};

let keys = 0;
const nextKey = (): string => {
  keys += 1;
  return `key-${String(keys)}`;
};

const execute = async (launcher: AgentLauncher, command: Omit<HostCommand, 'commandId'> & { commandId?: string }) =>
  launcher.execute({ commandId: nextKey(), ...command } as HostCommand);

const startRun = async (launcher: AgentLauncher, chatId: string, runId: string): Promise<CommandAnswer> =>
  execute(launcher, {
    type: 'start',
    payload: { chatId, runId, trigger: 'submit', message: { id: `user-${runId}`, role: 'user', content: 'hello' } },
  });

/** Poll a condition over the durable rows. */
const until = async (
  root: string,
  chatId: string,
  done: (rows: AgentLogEvent[]) => boolean,
): Promise<AgentLogEvent[]> => {
  for (let attempt = 0; attempt < 300; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling a durable file is sequential by nature.
    const rows = await rowsOf(root, chatId);
    if (done(rows)) {
      return rows;
    }
    // oxlint-disable-next-line no-await-in-loop -- as above.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error(`Timed out waiting on ${chatId}: ${JSON.stringify(await rowsOf(root, chatId))}`);
};

const lifecycleStates = (rows: readonly AgentLogEvent[]): string[] =>
  rows.flatMap((row) => (row.type === 'run.lifecycle' ? [row.state] : []));

const completedTurn = (runId: string): ReadonlyArray<Record<string, unknown>> => [
  { runId, type: 'run.lifecycle', state: 'admitted', attempt: 1 },
  {
    runId,
    type: 'turn.history-projection-committed',
    retainedMessageIds: [],
    message: { id: `user-${runId}`, role: 'user', content: 'First.' },
    context: {
      version: 1,
      systemPrompt: 'You are Tau.',
      model,
      toolChoice: 'auto',
      initialMessages: [],
      postCompactionMessages: [],
    },
  },
  { runId, type: 'run.lifecycle', state: 'running', attempt: 1 },
  {
    runId,
    type: 'message.appended',
    message: { id: `assistant-${runId}`, role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
  },
  { runId, type: 'run.lifecycle', state: 'completed', attempt: 1 },
];

describe('the run actor on the daemon (W7)', () => {
  it('should write paused without a terminal row when a native run is interrupted', async () => {
    const root = await makeRoot();
    const launcher = makeLauncher(root, gateway(true).fetch);
    await startRun(launcher, 'chat-pause', 'run-pause');
    await until(root, 'chat-pause', (rows) => lifecycleStates(rows).includes('running'));

    const answer = await execute(launcher, {
      type: 'interrupt',
      payload: { chatId: 'chat-pause', runId: 'run-pause', interruptId: 'int-1', kind: 'approval', prompt: 'Write?' },
    });

    expect(answer).toMatchObject({ status: 'applied', effect: 'durable' });
    const rows = await rowsOf(root, 'chat-pause');
    expect(lifecycleStates(rows)).toEqual(['admitted', 'running', 'paused']);
  });

  it('should answer a steer only after its message row is durable', async () => {
    const root = await makeRoot();
    const upstream = gateway(true);
    const launcher = makeLauncher(root, upstream.fetch);
    await startRun(launcher, 'chat-steer', 'run-steer');
    await until(root, 'chat-steer', (rows) => lifecycleStates(rows).includes('running'));

    const steered = execute(launcher, {
      type: 'steer',
      commandId: 'steer-1',
      payload: { chatId: 'chat-steer', runId: 'run-steer', message: 'Also check the fillet.' },
    });
    upstream.release();
    const answer = await steered;

    expect(answer).toMatchObject({ status: 'applied', effect: 'durable' });
    const rows = await rowsOf(root, 'chat-steer');
    const cursor = answer.status === 'applied' && answer.effect === 'durable' ? answer.cursor : -1;
    expect(rows[cursor]).toMatchObject({
      type: 'message.appended',
      commandId: 'steer-1',
      message: { id: 'steer:steer-1' },
    });
  });

  it('should answer A0 to a resume after the run already continued', async () => {
    const root = await makeRoot();
    const launcher = makeLauncher(root, gateway(true).fetch);
    await startRun(launcher, 'chat-a0', 'run-a0');
    await until(root, 'chat-a0', (rows) => lifecycleStates(rows).includes('running'));

    const answer = await execute(launcher, { type: 'resume', payload: { chatId: 'chat-a0', runId: 'run-a0' } });

    expect(answer).toMatchObject({ status: 'applied', effect: 'not-applied', details: { state: 'running' } });
  });

  /* A native pause settles before the run rests (TS-R10), and its `cancelled` row is then legal: the settled pause is
   * `paused-reopenable` (W8.a2 round 3, coordinator ruling). */
  it('should approve and cancel a durable pause after a restart', async () => {
    const root = await makeRoot();
    const first = makeLauncher(root, gateway(true).fetch);
    await startRun(first, 'chat-restart', 'run-restart');
    await until(root, 'chat-restart', (rows) => lifecycleStates(rows).includes('running'));
    await execute(first, {
      type: 'interrupt',
      payload: {
        chatId: 'chat-restart',
        runId: 'run-restart',
        interruptId: 'int-1',
        kind: 'approval',
        prompt: 'Write?',
      },
    });
    await until(root, 'chat-restart', (rows) => lifecycleStates(rows).includes('paused'));
    await first.close();

    const second = makeLauncher(root, gateway(true).fetch);
    const approved = await execute(second, {
      type: 'resolve-interrupt',
      payload: { chatId: 'chat-restart', runId: 'run-restart', interruptId: 'int-1', outcome: 'approved' },
    });
    expect(approved).toMatchObject({ status: 'applied', effect: 'durable' });

    const cancelled = await execute(second, {
      type: 'cancel',
      payload: { chatId: 'chat-restart', runId: 'run-restart' },
    });
    expect(cancelled).toMatchObject({ status: 'applied', effect: 'durable' });
    expect(lifecycleStates(await rowsOf(root, 'chat-restart')).at(-1)).toBe('cancelled');
  });

  it('should refuse INTERRUPT_PENDING instead of holding the slot', async () => {
    const root = await makeRoot();
    const launcher = makeLauncher(root, gateway(true).fetch);
    await startRun(launcher, 'chat-held', 'run-held');
    await until(root, 'chat-held', (rows) => lifecycleStates(rows).includes('running'));
    await execute(launcher, {
      type: 'interrupt',
      payload: { chatId: 'chat-held', runId: 'run-held', interruptId: 'int-1', kind: 'approval', prompt: 'Write?' },
    });
    /* A native pause ends its attempt, which settles before the run rests (W8 TS-R10); a command in between waits. */
    await until(root, 'chat-held', (rows) => rows.some((row) => row.type === 'turn.finalized'));
    let ended = false;
    const deadline = Date.now() + 500;
    const resume = async (): Promise<Awaited<ReturnType<typeof execute>> | 'held'> => {
      while (Date.now() < deadline) {
        if (ended) {
          return 'held';
        }
        // oxlint-disable-next-line no-await-in-loop -- Commands retry sequentially while the real attempt settles.
        const answer = await execute(launcher, { type: 'resume', payload: { chatId: 'chat-held', runId: 'run-held' } });
        if (answer.status !== 'refused' || answer.code !== 'CHAT_RUN_LIVE') {
          return answer;
        }
        // Let the actual FileHandle close/settlement acknowledgement and the refusal deadline run.
        // oxlint-disable-next-line no-await-in-loop -- A macrotask yield prevents command microtasks starving settlement I/O.
        await yieldToEventLoop();
      }
      return 'held';
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refusalDeadline = new Promise<'held'>((resolve) => {
      timer = setTimeout(() => {
        resolve('held');
      }, 500);
    });
    let resumed: Awaited<ReturnType<typeof resume>>;
    try {
      resumed = await Promise.race([resume(), refusalDeadline]);
    } finally {
      ended = true;
      clearTimeout(timer);
    }

    expect(resumed).toMatchObject({ status: 'refused', code: 'INTERRUPT_PENDING' });
  });

  it('should keep the first request when a pause is repeated', async () => {
    const root = await makeRoot();
    const launcher = makeLauncher(root, gateway(true).fetch);
    await startRun(launcher, 'chat-twice', 'run-twice');
    await until(root, 'chat-twice', (rows) => lifecycleStates(rows).includes('running'));
    const pause = async (interruptId: string, prompt: string) =>
      execute(launcher, {
        type: 'interrupt',
        payload: { chatId: 'chat-twice', runId: 'run-twice', interruptId, kind: 'approval', prompt },
      });

    const [first, second] = await Promise.all([pause('int-1', 'Write main.ts?'), pause('int-2', 'Delete main.ts?')]);

    // D11: the second pause neither overwrites nor adds a request; the durable pending set holds the first.
    expect(first).toMatchObject({ status: 'applied', effect: 'durable' });
    expect(second).toMatchObject({ status: 'refused' });
    const requestedLog = await rowsOf(root, 'chat-twice');
    const requested = requestedLog.filter((row) => row.type === 'interrupt.recorded' && row.phase === 'requested');
    expect(requested).toEqual([expect.objectContaining({ interruptId: 'int-1' })]);
    await expect(launcher.pendingInterrupts('run-twice')).resolves.toEqual([
      expect.objectContaining({ interruptId: 'int-1', prompt: 'Write main.ts?' }),
    ]);
  });

  it('should leave history unchanged when an edit is refused EXTERNAL_AGENT_UNAVAILABLE', async () => {
    const root = await makeRoot();
    await seed(root, 'chat-edit', completedTurn('run-1'));
    const launcher = makeLauncher(root, gateway(false).fetch);
    const before = await rowsOf(root, 'chat-edit');

    const answer = await execute(launcher, {
      type: 'start',
      payload: {
        chatId: 'chat-edit',
        runId: 'run-2',
        trigger: 'edit',
        retainedMessageIds: [],
        message: { id: 'user-run-1', role: 'user', content: 'First, edited.' },
        config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', agent: { kind: 'acp', id: 'missing-agent' } },
      },
    });

    expect(answer).toMatchObject({ status: 'refused', code: 'EXTERNAL_AGENT_UNAVAILABLE' });
    expect(await rowsOf(root, 'chat-edit')).toEqual(before);
  });

  it('should use the model selected at resume', async () => {
    const root = await makeRoot();
    await seed(root, 'chat-switch', [
      ...completedTurn('run-1').slice(0, 3),
      {
        runId: 'run-1',
        type: 'run.lifecycle',
        state: 'failed',
        attempt: 1,
        detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
      },
    ]);
    const upstream = gateway(false);
    const launcher = makeLauncher(root, upstream.fetch);

    const answer = await execute(launcher, {
      type: 'resume',
      payload: {
        chatId: 'chat-switch',
        runId: 'run-1',
        selection: { id: 'switched-model', providerKind: 'vertexai', contextWindow: 100_000 },
      },
    });

    expect(answer).toMatchObject({ status: 'applied', effect: 'durable' });
    await until(root, 'chat-switch', (rows) => lifecycleStates(rows).at(-1) === 'completed');
    expect(upstream.models).toEqual(['switched-model']);
  });

  it('should answer a replayed start with its admission and restart an uncommitted run from its payload', async () => {
    const root = await makeRoot();
    const message = { id: 'user-uncommitted', role: 'user', content: 'Journaled.' } as const;
    await seed(root, 'chat-journal', [
      {
        runId: 'run-journal',
        commandId: 'start-journal',
        type: 'run.lifecycle',
        state: 'admitted',
        attempt: 1,
        admission: { kind: 'tau', trigger: 'submit', turnId: message.id, message, selection: model },
      },
    ]);
    const launcher = makeLauncher(root, gateway(false).fetch);

    const replayed = await launcher.execute({
      type: 'start',
      commandId: 'start-journal',
      payload: { chatId: 'chat-journal', runId: 'run-journal', trigger: 'submit', message },
    });
    expect(replayed).toMatchObject({ status: 'replayed', effect: 'durable', cursor: 0 });

    const resumed = await execute(launcher, {
      type: 'resume',
      payload: { chatId: 'chat-journal', runId: 'run-journal' },
    });
    expect(resumed).toMatchObject({ status: 'applied', effect: 'durable' });
    const rows = await until(root, 'chat-journal', (all) => lifecycleStates(all).at(-1) === 'completed');
    expect(rows.find((row) => row.type === 'turn.history-projection-committed')).toMatchObject({
      message: { id: 'user-uncommitted' },
    });
  });
});
