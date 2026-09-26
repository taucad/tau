/**
 * The chat-run registry (W7 RA-S3) through the Tau host's command path: one incarnation per chat, a claim that is the
 * only takeover, and a close barrier that opens nothing after it.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTauAgentHost } from '#host/tau-agent-host.js';
import {
  completedFirstTurn,
  createMemoryLogFile,
  hostOptions,
  readLog,
  seedLog,
  tools,
} from '#host/tau-agent-host.fixture.js';
import type { SeededLogEvent } from '#host/tau-agent-host.fixture.js';
import { createNodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
import type {
  ModelStreamEvent,
  ModelTransport,
  ToolRegistry,
  TurnAttemptKey,
  TurnPlacementFact,
  TurnPlacementPort,
} from '#waist/ports.js';
import type { ExternalAgentPort, ExternalAgentTurn, TauAgentHost } from '#host/tau-agent-host.js';
import type { CommandAnswer } from '#wire/commands.schema.js';

/** A model call that waits until released, as a call binding at the gateway does. */
const heldTransport = () => {
  const waiting: Array<() => void> = [];
  let calls = 0;
  const transport: ModelTransport = {
    funding: { type: 'unfunded' },
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      calls++;
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
        request.signal.addEventListener('abort', () => {
          resolve();
        });
      });
      yield { type: 'text-delta', text: 'Done.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
  return {
    transport,
    calls: () => calls,
    release: () => {
      waiting.shift()?.();
    },
  };
};

const idle = tools(async () => ({ content: null, isError: false }));

/** A run whose executing host is gone: a `running` tail and no live writer. */
const orphanedRun: readonly SeededLogEvent[] = [
  { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
  { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
  { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
];

let keys = 0;
const key = (): string => `command-${String(++keys)}`;

const attachDetails = (answer: CommandAnswer) => {
  expect(answer).toMatchObject({ status: 'applied', effect: 'not-applied' });
  return (answer as Extract<CommandAnswer, { details?: unknown }>).details as Readonly<{
    takeover: boolean;
    snapshot?: Readonly<{ state: string; failure?: Readonly<{ code?: string }> }>;
  }>;
};

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('the chat-run registry (RA-S3)', () => {
  it('should not abandon a run whose resume is binding when attach arrives', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      ...orphanedRun.slice(0, 3),
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
      },
    ]);
    const model = heldTransport();
    const host = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport: model.transport, toolRegistry: idle, idPrefix: 'binding' }),
    );

    const resumed = host.command({
      type: 'resume',
      commandId: key(),
      payload: { chatId: 'chat-binding', runId: 'run-1' },
    });
    await vi.waitFor(() => {
      expect(model.calls()).toBe(1);
    });

    // D4: the attach reads; it does not re-check the log and abandon the run this host is executing.
    const attached = attachDetails(
      await host.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-binding' } }),
    );
    expect(attached).toMatchObject({ takeover: false, snapshot: { state: 'running' } });

    model.release();
    await resumed;
    await vi.waitFor(async () => {
      expect(await host.snapshot('chat-binding')).toMatchObject({ state: 'completed' });
    });
    const abandonedLog = await readLog(file);
    const abandoned = abandonedLog.filter(
      (event) =>
        event.type === 'run.lifecycle' &&
        event.state === 'failed' &&
        (event.detail as { code?: string } | undefined)?.code === 'RUN_ABANDONED',
    );
    expect(abandoned).toHaveLength(1);
    await host.close();
  });

  it('should refuse commands with HOST_CLOSED and open no log after close', async () => {
    const file = createMemoryLogFile();
    const opened = vi.fn(file.open);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: opened,
        transport: heldTransport().transport,
        toolRegistry: idle,
        idPrefix: 'closed',
      }),
    );

    await host.close();

    const answers = await Promise.all([
      host.command({
        type: 'start',
        commandId: key(),
        payload: {
          chatId: 'chat-closed',
          runId: 'run-1',
          trigger: 'submit',
          message: { id: 'turn-1', role: 'user', content: 'Hello.' },
        },
      }),
      host.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-closed' } }),
      host.command({ type: 'cancel', commandId: key(), payload: { chatId: 'chat-closed', runId: 'run-1' } }),
    ]);

    for (const answer of answers) {
      expect(answer).toMatchObject({ status: 'refused', code: 'HOST_CLOSED' });
    }
    expect(opened).not.toHaveBeenCalled();
  });

  it('should describe no run when the chat is reserving behind a rewind row', async () => {
    const file = createMemoryLogFile();
    /* A rewind a pre-M1 host appended before routing, with no intent row after it (D19). */
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-0', message: { id: 'turn-0', role: 'user', content: 'Before.' } },
      { type: 'history.rewound', runId: 'run-0', trigger: 'edit', retainedMessageIds: [] },
    ]);
    let admit: () => void = () => undefined;
    const context = new Promise<undefined>((resolve) => {
      admit = () => {
        resolve(undefined);
      };
    });
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: heldTransport().transport,
        toolRegistry: idle,
        idPrefix: 'rewind-tail',
      }),
      clientContext: async () => context,
    });

    const started = host.command({
      type: 'start',
      commandId: key(),
      payload: {
        chatId: 'chat-rewind-tail',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1', role: 'user', content: 'Hello.' },
      },
    });

    // Reserving: no intent row is durable, so there is no run to describe; nothing is inferred as `admitted`.
    await expect(host.describeRun('chat-rewind-tail')).resolves.toBeUndefined();
    await expect(host.snapshot('chat-rewind-tail')).rejects.toMatchObject({ code: 'NO_RUN_ADMITTED' });

    admit();
    await expect(started).resolves.toMatchObject({ status: 'applied', effect: 'durable' });
    await expect(host.describeRun('chat-rewind-tail')).resolves.toMatchObject({ runId: 'run-1' });
    await host.close();
  });

  it('should take over on the same rule on both hosts', async () => {
    /* The browser's host: the Tau host over a memory log. */
    const file = createMemoryLogFile();
    await seedLog(file, orphanedRun);
    const browser = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: heldTransport().transport,
        toolRegistry: idle,
        idPrefix: 'tab',
      }),
    );

    /* The daemon: the Node launcher over the same rows on disk. */
    const root = await mkdtemp(join(tmpdir(), 'tau-registry-'));
    roots.push(root);
    await mkdir(join(root, '.tau', 'chats', 'chat-orphan'), { recursive: true });
    const base = {
      version: 1,
      leaderEpoch: 'seed-term',
      epoch: 1,
      recordedAt: new Date(Date.UTC(2026, 8, 1)).toISOString(),
    };
    await writeFile(
      join(root, '.tau', 'chats', 'chat-orphan', 'events.jsonl'),
      orphanedRun.map((row, sequence) => JSON.stringify({ ...base, sequence, ...row })).join('\n') + '\n',
      'utf8',
    );
    const daemon = createNodeAgentLauncher({
      workspaceRoot: root,
      gatewayBaseUrl: 'https://gateway.example',
      model: { id: 'fixture-model', contextWindow: 200_000, maxTokens: 4096 },
      systemPrompt: 'You are Tau.',
      toolRegistry: idle,
      auth: () => 'daemon-bearer',
      fetch: vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof globalThis.fetch,
    });

    const attach = { type: 'attach', payload: { chatId: 'chat-orphan' } } as const;
    const answers = [
      [await browser.command({ ...attach, commandId: key() }), await browser.command({ ...attach, commandId: key() })],
      [await daemon.execute({ ...attach, commandId: key() }), await daemon.execute({ ...attach, commandId: key() })],
    ].map(([first, second]) => [attachDetails(first!), attachDetails(second!)]);

    // L2b F2: one rule, M1's opening; the first claim takes over, a second attach is a read.
    for (const [first, second] of answers) {
      expect(first).toMatchObject({
        takeover: true,
        snapshot: { state: 'failed', failure: { code: 'RUN_ABANDONED' } },
      });
      expect(second).toMatchObject({ takeover: false, snapshot: { state: 'failed' } });
    }
    await browser.close();
    await daemon.close();
  });

  it('should keep a settlement recorded before the running row', async () => {
    const file = createMemoryLogFile();
    /* S5 D3 / L2a D17: a settlement written before `running` belongs to the attempt, and `running` does not reset it. */
    await seedLog(file, [
      ...completedFirstTurn.slice(0, 2),
      { type: 'turn.failed', runId: 'run-1', chatId: 'chat-settled', turnId: 'turn-1', reason: 'Placement refused.' },
      ...completedFirstTurn.slice(2),
    ]);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: heldTransport().transport,
        toolRegistry: idle,
        idPrefix: 'settled',
      }),
    );

    const answer = await host.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-settled' } });

    expect(attachDetails(answer)).toMatchObject({ takeover: false, snapshot: { state: 'completed' } });
    expect(await host.ledger('chat-settled')).toMatchObject({
      runs: { 'run-1': { appendState: 'settled', settlements: [{ attempt: 1, event: { type: 'turn.failed' } }] } },
    });
    await host.close();
  });
  it('should answer a final ledger read after close', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    let opens = 0;
    const open = async (): ReturnType<typeof file.open> => {
      opens += 1;
      return file.open();
    };
    const host = createTauAgentHost(
      hostOptions({ openEventLog: open, transport: heldTransport().transport, toolRegistry: idle, idPrefix: 'final' }),
    );
    await host.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-final' } });
    await host.close();

    const opened = opens;

    // The revisions port settles the chats a close drained from this read (host revisions.close); it opens no log.
    await expect(host.ledger('chat-final')).resolves.toMatchObject({ runs: { 'run-1': { lifecycle: 'completed' } } });
    expect(opens).toBe(opened);
    await expect(host.ledger('chat-never-read')).rejects.toMatchObject({ code: 'HOST_CLOSED' });
    expect(opens).toBe(opened);
  });
});

describe('keyed commands (RA-S6)', () => {
  it('should apply a resume once when the host dies before answering', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      ...orphanedRun,
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
      },
    ]);
    const first = heldTransport();
    const dead = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport: first.transport, toolRegistry: idle, idPrefix: 'dead' }),
    );
    const resume = {
      type: 'resume',
      commandId: 'resume-once',
      payload: { chatId: 'chat-once', runId: 'run-1' },
    } as const;
    // async-iife: the host dies before it answers; its answer never arrives.
    void dead.command(resume);
    await vi.waitFor(() => {
      expect(first.calls()).toBe(1);
    });

    const second = heldTransport();
    const survivor = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport: second.transport, toolRegistry: idle, idPrefix: 'survivor' }),
    );
    const answer = await survivor.command(resume);

    // C1: the re-sent key is answered from the applied set; no second attempt starts.
    expect(answer).toMatchObject({ commandId: 'resume-once', status: 'replayed', effect: 'durable' });
    expect(second.calls()).toBe(0);
    const resumedRowsLog = await readLog(file);
    const resumedRows = resumedRowsLog.filter(
      (event) => event.type === 'run.lifecycle' && event.runId === 'run-1' && event.state === 'running',
    );
    expect(resumedRows).toHaveLength(2);
    await survivor.close();
  });
});

describe('terms and fencing (RA-S8)', () => {
  it('should reread, not abandon twice, when a stale writer appends after the read', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, orphanedRun);
    let hold: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      hold = resolve;
    });
    let reachedAppend: () => void = () => undefined;
    const appending = new Promise<void>((resolve) => {
      reachedAppend = resolve;
    });
    /* Y's first append waits until X has appended after Y's read. */
    const slow = async () => {
      const opened = await file.open();
      let first = true;
      return {
        ...opened,
        append: async (...args: Parameters<typeof opened.append>) => {
          if (first) {
            first = false;
            reachedAppend();
            await held;
          }
          return opened.append(...args);
        },
      };
    };
    const hostY = createTauAgentHost(
      hostOptions({ openEventLog: slow, transport: heldTransport().transport, toolRegistry: idle, idPrefix: 'y' }),
    );
    const hostX = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport: heldTransport().transport, toolRegistry: idle, idPrefix: 'x' }),
    );

    const attachY = hostY.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-stale' } });
    await appending;
    const attachX = attachDetails(
      await hostX.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-stale' } }),
    );
    hold?.();
    await attachY;

    expect(attachX).toMatchObject({ takeover: true });
    // Y's append after X's is fenced; the next command rereads and finds the run already abandoned.
    const again = attachDetails(
      await hostY.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-stale' } }),
    );
    expect(again).toMatchObject({ takeover: false, snapshot: { state: 'failed', failure: { code: 'RUN_ABANDONED' } } });
    const abandonedLog = await readLog(file);
    const abandoned = abandonedLog.filter(
      (event) =>
        event.type === 'run.lifecycle' && (event.detail as { code?: string } | undefined)?.code === 'RUN_ABANDONED',
    );
    expect(abandoned).toHaveLength(1);
    await hostX.close();
    await hostY.close();
  });

  it('should revoke the tool port before writing cancelled', async () => {
    const file = createMemoryLogFile();
    const order: string[] = [];
    let calls = 0;
    const transport: ModelTransport = {
      funding: { type: 'unfunded' },
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        calls++;
        yield { type: 'tool-input', toolCallId: 'read-1', toolName: 'read_file', input: { targetFile: 'a.ts' } };
        yield { type: 'completed', stopReason: 'toolUse' };
      },
    };
    let toolStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      toolStarted = resolve;
    });
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: async () => {
          const opened = await file.open();
          return {
            ...opened,
            append: async (event: Parameters<typeof opened.append>[0]) => {
              if (event.type === 'run.lifecycle' && event.state === 'cancelled') {
                order.push('cancelled row');
              }
              return opened.append(event);
            },
          };
        },
        transport,
        toolRegistry: tools(
          async ({ signal }) =>
            new Promise((resolve) => {
              toolStarted();
              signal.addEventListener('abort', () => {
                order.push('tool port revoked');
                resolve({ content: 'aborted', isError: true });
              });
            }),
        ),
        idPrefix: 'revoke',
      }),
    );
    const startedRun = host.command({
      type: 'start',
      commandId: key(),
      payload: {
        chatId: 'chat-revoke',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1', role: 'user', content: 'Read a.ts.' },
      },
    });
    await started;

    const cancelled = await host.command({
      type: 'cancel',
      commandId: key(),
      payload: { chatId: 'chat-revoke', runId: 'run-1' },
    });

    // D13: nothing the cancelled attempt's tools do can land after its ending row.
    expect(cancelled).toMatchObject({ status: 'applied', effect: 'durable' });
    expect(order).toEqual(['tool port revoked', 'cancelled row']);
    expect(calls).toBe(1);
    await startedRun;
    await host.close();
  });
});

describe('tool results per call (RA-S9, EQ6)', () => {
  /** One batch of two parallel reads, then a closing reply. */
  const batchTransport = (requests: Array<readonly unknown[]>): ModelTransport => ({
    funding: { type: 'unfunded' },
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      requests.push(request.messages);
      if (requests.length === 1) {
        yield { type: 'tool-input', toolCallId: 'call-a', toolName: 'read_file', input: { targetFile: 'a.ts' } };
        yield { type: 'tool-input', toolCallId: 'call-b', toolName: 'read_file', input: { targetFile: 'b.ts' } };
        yield { type: 'completed', stopReason: 'toolUse' };
        return;
      }
      yield { type: 'text-delta', text: 'Done.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  });

  const toolOutputs = (events: ReadonlyArray<{ type: string; message?: unknown }>) =>
    events.flatMap((event) => {
      const message = event.message as { role?: string; toolCallId?: string } | undefined;
      return event.type === 'message.appended' && message?.role === 'tool-output' ? [message.toolCallId] : [];
    });

  it('should keep completed tool results when the host dies mid-batch', async () => {
    const file = createMemoryLogFile();
    const requests: Array<readonly unknown[]> = [];
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: batchTransport(requests),
        toolRegistry: tools(async ({ input }) =>
          (input as { targetFile: string }).targetFile === 'a.ts'
            ? { content: 'contents of a', isError: false }
            : new Promise(() => {
                /* B.ts never returns: the host dies with it in flight. */
              }),
        ),
        idPrefix: 'mid-batch',
      }),
    );
    // async-iife: the host dies mid-batch, so its turn never ends.
    void host.command({
      type: 'start',
      commandId: key(),
      payload: {
        chatId: 'chat-mid-batch',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1', role: 'user', content: 'Read both.' },
      },
    });

    // L4 D-103: a's result is durable as it completes, before the batch ends.
    await vi.waitFor(async () => {
      expect(toolOutputs(await readLog(file))).toEqual(['call-a']);
    });
  });

  it('should send tool results in call order and log them in completion order', async () => {
    const file = createMemoryLogFile();
    const requests: Array<readonly unknown[]> = [];
    let releaseA: () => void = () => undefined;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: batchTransport(requests),
        toolRegistry: tools(async ({ input }) => {
          if ((input as { targetFile: string }).targetFile === 'a.ts') {
            await new Promise<void>((resolve) => {
              releaseA = resolve;
            });
            return { content: 'contents of a', isError: false };
          }
          setTimeout(() => {
            releaseA();
          }, 0);
          return { content: 'contents of b', isError: false };
        }),
        idPrefix: 'call-order',
      }),
    );

    await host.admit({
      chatId: 'chat-call-order',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Read both.' },
    });

    expect(toolOutputs(await readLog(file))).toEqual(['call-b', 'call-a']);
    const sent = (requests[1] ?? []).flatMap((message) => {
      const { role, toolCallId } = message as { role?: string; toolCallId?: string };
      return role === 'tool-output' ? [toolCallId] : [];
    });
    expect(sent).toEqual(['call-a', 'call-b']);
    await host.close();

    /* A later host reads the log's completion order back and still sends the calls' order. */
    const later = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: batchTransport(requests),
        toolRegistry: idle,
        idPrefix: 'call-order-later',
      }),
    );
    await later.admit({
      chatId: 'chat-call-order',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Again.' },
    });
    const resent = (requests[2] ?? []).flatMap((message) => {
      const { role, toolCallId } = message as { role?: string; toolCallId?: string };
      return role === 'tool-output' ? [toolCallId] : [];
    });
    expect(resent).toEqual(['call-a', 'call-b']);
    await later.close();
  });

  it('should run a batch in call order when a tool declares sequential execution', async () => {
    const file = createMemoryLogFile();
    let running = 0;
    let overlapped = false;
    const registry = tools(async () => {
      running++;
      overlapped ||= running > 1;
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      running--;
      return { content: 'ok', isError: false };
    });
    const [definition] = registry.list();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: batchTransport([]),
        toolRegistry: {
          ...registry,
          list: () => (definition === undefined ? [] : [{ ...definition, executionMode: 'sequential' }]),
        },
        idPrefix: 'sequential',
      }),
    );

    await host.admit({
      chatId: 'chat-sequential',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Read both.' },
    });

    expect(overlapped).toBe(false);
    expect(toolOutputs(await readLog(file))).toEqual(['call-a', 'call-b']);
    await host.close();
  });
});

describe('placement and settlement per attempt (RA-S13)', () => {
  type Call = Readonly<{ verb: string; key: TurnAttemptKey; checkoutId?: string | undefined; rows: number }>;

  /** W8's port as a fake: every call records the log's length when it was made; settlements publish on complete. */
  const fakePort = (file: ReturnType<typeof createMemoryLogFile>, registry: ToolRegistry) => {
    const calls: Call[] = [];
    const facts: TurnPlacementFact[] = [];
    let wake: () => void = () => undefined;
    let acknowledgeGate: Promise<void> = Promise.resolve();
    const rows = async (): Promise<number> => {
      const log = await readLog(file);
      return log.length;
    };
    const port: TurnPlacementPort = {
      admit: async ({ requestId, key, checkoutId }) => {
        calls.push({ verb: 'admit', key, checkoutId, rows: await rows() });
        return {
          requestId,
          status: 'applied',
          placement: { checkoutId: checkoutId ?? 'checkout-live', mode: 'direct', root: '/work', tools: registry },
        };
      },
      complete: async ({ requestId, key }) => {
        calls.push({ verb: 'complete', key, rows: await rows() });
        facts.push({
          kind: 'settled',
          key,
          row: {
            type: 'turn.finalized',
            runId: key.runId,
            attempt: key.attempt,
            turnId: key.turnId,
            chatId: key.chatId,
            projectId: 'project-1',
            changedPaths: [],
            trigger: 'turn',
            runIds: [key.runId],
          },
        });
        wake();
        return { requestId, status: 'applied' };
      },
      abandon: async ({ requestId, key }) => {
        calls.push({ verb: 'abandon', key, rows: await rows() });
        return { requestId, status: 'applied' };
      },
      reconcile: async ({ requestId }) => ({ requestId, status: 'applied', held: [] }),
      async *settlements({ signal }) {
        let next = 0;
        const nextFact = async (): Promise<void> =>
          new Promise<void>((resolve) => {
            wake = resolve;
            signal.addEventListener('abort', () => {
              resolve();
            });
          });
        while (!signal.aborted) {
          while (next < facts.length) {
            const fact = facts[next++];
            if (fact !== undefined) {
              yield fact;
            }
          }
          // oxlint-disable-next-line no-await-in-loop -- a listen waits for the next fact.
          await nextFact();
        }
      },
      acknowledge: async ({ requestId, key }) => {
        await acknowledgeGate;
        calls.push({ verb: 'acknowledge', key, rows: await rows() });
        return { requestId, status: 'applied' };
      },
    };
    return {
      port,
      calls,
      holdAcknowledge: () => {
        let release: () => void = () => undefined;
        acknowledgeGate = new Promise((resolve) => {
          release = resolve;
        });
        return release;
      },
    };
  };

  const placedHost = (
    file: ReturnType<typeof createMemoryLogFile>,
    port: TurnPlacementPort,
    idPrefix: string,
  ): TauAgentHost =>
    createTauAgentHost({
      ...hostOptions({ openEventLog: file.open, transport: done, toolRegistry: idle, idPrefix }),
      placement: port,
    });

  const done: ModelTransport = {
    funding: { type: 'unfunded' },
    async *stream(): AsyncGenerator<ModelStreamEvent> {
      yield { type: 'text-delta', text: 'Done.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };

  const start = async (host: TauAgentHost, chatId: string, runId: string) =>
    host.command({
      type: 'start',
      commandId: key(),
      payload: { chatId, runId, trigger: 'submit', message: { id: `turn-${runId}`, role: 'user', content: 'Go.' } },
    });

  it('should never enqueue admitPlacement before the intent row is durable', async () => {
    const file = createMemoryLogFile();
    const fake = fakePort(file, idle);
    const host = placedHost(file, fake.port, 'place-order');

    await start(host, 'chat-place', 'run-1');
    await vi.waitFor(() => {
      expect(fake.calls.map((call) => call.verb)).toEqual(['admit', 'complete', 'acknowledge']);
    });

    const events = await readLog(file);
    const intent = events.findIndex((event) => event.type === 'run.lifecycle' && event.state === 'admitted');
    expect(intent).toBeGreaterThanOrEqual(0);
    expect(fake.calls[0]?.rows).toBeGreaterThan(intent);
    // Attempt 1's running row carries the placement of record; the settlement row precedes acknowledge (I19).
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'run.lifecycle',
        state: 'running',
        placement: expect.objectContaining({ checkoutId: 'checkout-live' }) as unknown,
      }),
    );
    const settled = events.findIndex((event) => event.type === 'turn.finalized');
    expect(settled).toBeGreaterThan(0);
    expect(fake.calls[2]?.rows).toBeGreaterThan(settled);
    await host.close();
  });

  it('should place a resumed attempt on the run checkout with a new lease', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'running',
        attempt: 1,
        placement: { checkoutId: 'checkout-branch', mode: 'direct' },
      },
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        attempt: 1,
        detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
      },
      /* Attempt 1 was settled by the host that abandoned it; its lease is gone. */
      {
        type: 'turn.failed',
        runId: 'run-1',
        attempt: 1,
        chatId: 'chat-resume',
        turnId: 'turn-1',
        checkoutId: 'checkout-branch',
        reason: 'The host executing this run is gone.',
      },
    ]);
    const fake = fakePort(file, idle);
    const host = placedHost(file, fake.port, 'place-resume');

    await host.command({ type: 'resume', commandId: key(), payload: { chatId: 'chat-resume', runId: 'run-1' } });
    await vi.waitFor(() => {
      expect(fake.calls.some((call) => call.verb === 'acknowledge' && call.key.attempt === 2)).toBe(true);
    });

    expect(fake.calls.find((call) => call.verb === 'admit' && call.key.attempt === 2)).toMatchObject({
      checkoutId: 'checkout-branch',
      key: { runId: 'run-1', attempt: 2 },
    });
    await host.close();
  });

  it('should not admit the next attempt before acknowledge', async () => {
    const file = createMemoryLogFile();
    const fake = fakePort(file, idle);
    const release = fake.holdAcknowledge();
    const host = placedHost(file, fake.port, 'place-ack');

    await start(host, 'chat-ack', 'run-1');
    await vi.waitFor(async () => {
      const log = await readLog(file);
      expect(log.some((event) => event.type === 'turn.finalized')).toBe(true);
    });
    const next = await start(host, 'chat-ack', 'run-2');

    expect(next).toMatchObject({ status: 'refused', code: 'CHAT_RUN_LIVE' });
    expect(fake.calls.filter((call) => call.verb === 'admit').map((call) => call.key.runId)).toEqual(['run-1']);
    release();
    await vi.waitFor(() => {
      expect(fake.calls.map((call) => call.verb)).toContain('acknowledge');
    });
    await expect(start(host, 'chat-ack', 'run-2')).resolves.toMatchObject({ status: 'applied' });
    await host.close();
  });

  it('should run the attempt with the tools its placement granted', async () => {
    const file = createMemoryLogFile();
    const granted = vi.fn(async () => ({ content: 'granted read', isError: false }));
    const fake = fakePort(file, tools(granted));
    let call = 0;
    const reads: ModelTransport = {
      funding: { type: 'unfunded' },
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        call++;
        if (call === 1) {
          yield { type: 'tool-input', toolCallId: 'call-a', toolName: 'read_file', input: { targetFile: 'a.ts' } };
          yield { type: 'completed', stopReason: 'toolUse' };
          return;
        }
        yield { type: 'text-delta', text: 'Done.' };
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: reads,
        toolRegistry: tools(async () => {
          throw new Error('The host registry is not the attempt tool port.');
        }),
        idPrefix: 'granted',
      }),
      placement: fake.port,
    });

    await start(host, 'chat-granted', 'run-1');
    await vi.waitFor(() => {
      expect(fake.calls.map((entry) => entry.verb)).toContain('acknowledge');
    });

    expect(granted).toHaveBeenCalledOnce();
    await host.close();
  });
});

describe('the external slot through its driver handle (RA-S14, with W10 EA-S8)', () => {
  const external = { systemPrompt: 'unused', toolChoice: 'none', agent: { kind: 'acp', id: 'stub-agent' } } as const;
  const neverTau: ModelTransport = {
    funding: { type: 'unfunded' },
    // oxlint-disable-next-line require-yield -- an external turn never reaches the Tau model.
    async *stream(): AsyncGenerator<ModelStreamEvent> {
      throw new Error('An external turn must never reach the Tau model.');
    },
  };
  const externalHost = (file: ReturnType<typeof createMemoryLogFile>, port: ExternalAgentPort, idPrefix: string) =>
    createTauAgentHost({
      ...hostOptions({ openEventLog: file.open, transport: neverTau, toolRegistry: idle, idPrefix }),
      externalRunners: { acp: port },
    });
  const startExternal = async (
    host: TauAgentHost,
    { chatId, runId, trigger = 'submit' }: Readonly<{ chatId: string; runId: string; trigger?: 'submit' | 'edit' }>,
  ): Promise<CommandAnswer> =>
    host.command({
      type: 'start',
      commandId: key(),
      payload: {
        chatId,
        runId,
        trigger,
        ...(trigger === 'edit' ? { retainedMessageIds: [] } : {}),
        message: { id: `turn-${runId}`, role: 'user', content: 'Run this elsewhere.' },
        config: external,
      },
    });
  const pendingOf = async (file: ReturnType<typeof createMemoryLogFile>): Promise<string[]> => {
    const log = await readLog(file);
    return log.flatMap((event) =>
      event.type === 'interrupt.recorded' && event.phase === 'requested' ? [event.interruptId] : [],
    );
  };

  it('should resolve approve only after the resolved row is durable', async () => {
    const file = createMemoryLogFile();
    let durableAtResolve: boolean | undefined;
    const port: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        const decision = await turn.approve({ prompt: 'Write main.ts?' });
        const log = await readLog(file);
        durableAtResolve = log.some(
          (event) =>
            event.type === 'interrupt.recorded' &&
            event.phase === 'resolved' &&
            event.interruptId === decision.interruptId,
        );
        return undefined;
      },
    };
    const host = externalHost(file, port, 'approve');
    await startExternal(host, { chatId: 'chat-approve', runId: 'run-1' });
    await vi.waitFor(async () => {
      expect(await pendingOf(file)).toHaveLength(1);
    });
    const [interruptId = ''] = await pendingOf(file);

    const answer = await host.command({
      type: 'resolve-interrupt',
      commandId: key(),
      payload: { chatId: 'chat-approve', runId: 'run-1', interruptId, outcome: 'approved' },
    });

    expect(answer).toMatchObject({ status: 'applied', effect: 'durable' });
    await vi.waitFor(() => {
      expect(durableAtResolve).toBe(true);
    });
    await host.close();
  });

  it('should hand the port its attempt after the admitted row precedes the user message', async () => {
    const file = createMemoryLogFile();
    const attempts: Array<number | undefined> = [];
    const port: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        attempts.push(turn.attempt);
        return undefined;
      },
    };
    const host = externalHost(file, port, 'attempt');

    await startExternal(host, { chatId: 'chat-attempt', runId: 'run-1' });

    await vi.waitFor(() => {
      expect(attempts).toEqual([1]);
    });
    // W10 EA-S8 (RowsNeedRun): the run exists before any of its rows.
    const typesLog = await readLog(file);
    const types = typesLog.map((event) =>
      event.type === 'run.lifecycle' ? `${event.type}:${event.state}` : event.type,
    );
    expect(types.indexOf('run.lifecycle:admitted')).toBeLessThan(types.indexOf('message.appended'));
    await host.close();
  });

  it('should keep session state the agent reports after its turn ended', async () => {
    const file = createMemoryLogFile();
    let later: ExternalAgentTurn['appendSession'];
    const port: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        later = turn.appendSession;
        return undefined;
      },
    };
    const host = externalHost(file, port, 'session-state');
    await startExternal(host, { chatId: 'chat-session-state', runId: 'run-1' });
    await vi.waitFor(async () => {
      expect(await host.describeRun('chat-session-state')).toMatchObject({ state: 'completed' });
    });

    // VSC3: commands and configuration ACP reports between prompts are the session's, not the ended attempt's.
    await later?.([
      {
        type: 'message.appended',
        message: { id: 'session-1', role: 'assistant', content: [{ type: 'text', text: 'Commands.' }] },
      },
    ]);

    const log = await readLog(file);
    expect(log.some((event) => event.type === 'message.appended' && event.message.id === 'session-1')).toBe(true);
    await host.close();
  });

  // W7.r1 finding 8 (L2a D14): once the host closed, session state has no incarnation to go through.
  it('should refuse session state after the host closed, and not reopen the log', async () => {
    const file = createMemoryLogFile();
    let opens = 0;
    const counted = {
      open: async (): ReturnType<typeof file.open> => {
        opens += 1;
        return file.open();
      },
    };
    let later: ExternalAgentTurn['appendSession'];
    const port: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        later = turn.appendSession;
        return undefined;
      },
    };
    const host = externalHost(counted, port, 'session-closed');
    await startExternal(host, { chatId: 'chat-session-closed', runId: 'run-1' });
    await vi.waitFor(async () => {
      expect(await host.describeRun('chat-session-closed')).toMatchObject({ state: 'completed' });
    });
    await host.close();
    const opened = opens;

    await expect(
      later?.([
        {
          type: 'message.appended',
          message: { id: 'session-2', role: 'assistant', content: [{ type: 'text', text: 'Late.' }] },
        },
      ]),
    ).rejects.toMatchObject({ code: 'HOST_CLOSED' });
    expect(opens).toBe(opened);
    const log = await readLog(file);
    expect(log.some((event) => event.type === 'message.appended' && event.message.id === 'session-2')).toBe(false);
  });

  it('should call closeChat only after the external run settled', async () => {
    const file = createMemoryLogFile();
    const order: string[] = [];
    const port: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        await new Promise<void>((resolve) => {
          turn.signal.addEventListener('abort', () => {
            /* The vendor settles after the abort, not at it (M3's close ladder). */
            setTimeout(resolve, 5);
          });
        });
        order.push('run settled');
        return undefined;
      },
      closeChat: async () => {
        order.push('closeChat');
      },
    };
    const host = externalHost(file, port, 'close-after');
    await startExternal(host, { chatId: 'chat-close-after', runId: 'run-1' });
    await vi.waitFor(async () => {
      const log = await readLog(file);
      expect(log.some((event) => event.type === 'run.lifecycle' && event.state === 'running')).toBe(true);
    });

    await host.close();

    expect(order).toEqual(['run settled', 'closeChat']);
  });

  it('should refuse a rewind with CHAT_RUN_LIVE before any row while M3 holds a turn', async () => {
    const file = createMemoryLogFile();
    let live = false;
    const port: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async () => undefined,
      closeChat: async () => {
        if (live) {
          throw Object.assign(new Error('A turn of this chat is still live at the agent.'), { code: 'CHAT_RUN_LIVE' });
        }
      },
    };
    const host = externalHost(file, port, 'rewind-live');
    await startExternal(host, { chatId: 'chat-rewind-live', runId: 'run-1' });
    await vi.waitFor(async () => {
      expect(await host.describeRun('chat-rewind-live')).toMatchObject({ state: 'completed' });
    });
    live = true;
    const before = await readLog(file);

    const answer = await startExternal(host, { chatId: 'chat-rewind-live', runId: 'run-2', trigger: 'edit' });

    expect(answer).toMatchObject({ status: 'refused', code: 'CHAT_RUN_LIVE' });
    expect(await readLog(file)).toEqual(before);
    await host.close();
  });

  it('should resolve an orphaned external approval with a code', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      {
        type: 'message.appended',
        runId: 'run-1',
        message: {
          id: 'turn-1',
          role: 'user',
          content: 'Elsewhere.',
          metadata: { tauInternal: { kind: 'external-agent', runKind: 'acp', agentId: 'stub-agent' } },
        },
      },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running', attempt: 1 },
      {
        type: 'interrupt.recorded',
        runId: 'run-1',
        interruptId: 'int-orphan',
        phase: 'requested',
        reason: 'approval',
        payload: { kind: 'approval', prompt: 'Write main.ts?', agentId: 'stub-agent' },
      },
    ]);
    const host = externalHost(file, { list: () => ['stub-agent'], run: async () => undefined }, 'orphan-approval');

    await host.command({ type: 'attach', commandId: key(), payload: { chatId: 'chat-orphan-approval' } });

    // L4 D-112: the request no host will answer is resolved, with the code that says why.
    const log = await readLog(file);
    const ending = log.slice(
      log.findIndex(
        (event) =>
          event.type === 'interrupt.recorded' && event.phase === 'resolved' && event.interruptId === 'int-orphan',
      ),
    );
    expect(ending.slice(0, 2)).toMatchObject([
      {
        type: 'interrupt.recorded',
        phase: 'resolved',
        reason: 'cancelled',
        payload: { outcome: 'cancelled', code: 'EXTERNAL_AGENT_RECOVERY_UNKNOWN' },
      },
      { type: 'run.lifecycle', state: 'failed', detail: { code: 'EXTERNAL_AGENT_RECOVERY_UNKNOWN' } },
    ]);
    expect(await host.ledger('chat-orphan-approval')).toMatchObject({ runs: { 'run-1': { pendingInterrupts: {} } } });
    await host.close();
  });

  it('should end the attempt failed when the external port throws synchronously', async () => {
    const file = createMemoryLogFile();
    const port: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: () => {
        throw Object.assign(new Error('The agent binary is missing.'), { code: 'EXTERNAL_AGENT_UNAVAILABLE' });
      },
    };
    const host = externalHost(file, port, 'sync-throw');

    await startExternal(host, { chatId: 'chat-sync-throw', runId: 'run-1' });

    await vi.waitFor(async () => {
      expect(await host.describeRun('chat-sync-throw')).toMatchObject({
        state: 'failed',
        failure: { code: 'EXTERNAL_AGENT_UNAVAILABLE' },
      });
    });
    await expect(startExternal(host, { chatId: 'chat-sync-throw', runId: 'run-2' })).resolves.toMatchObject({
      status: 'applied',
    });
    await host.close();
  });
});
