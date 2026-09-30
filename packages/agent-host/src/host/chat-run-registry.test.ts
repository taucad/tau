/**
 * The chat-run registry (W7 RA-S3) through the Tau host's command path: one incarnation per chat, a claim that is the
 * only takeover, and a close barrier that opens nothing after it.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTauAgentHost } from '#host/tau-agent-host.js';
import { createChatRunRegistry } from '#host/chat-run-registry.js';
import {
  completedFirstTurn,
  createMemoryLogFile,
  fakePlacement,
  hostOptions,
  readLog,
  seedLog,
  tools,
} from '#host/tau-agent-host.fixture.js';
import type { SeededLogEvent } from '#host/tau-agent-host.fixture.js';
import { createNodeLauncher } from '#launchers/node-launcher.fixture.js';
import type {
  ModelStreamEvent,
  ModelTransport,
  ToolRegistry,
  TurnAttemptKey,
  TurnPlacementPort,
} from '#waist/ports.js';
import type { ExternalAgentPort, ExternalAgentTurn, TauAgentHost } from '#host/tau-agent-host.js';
import type { CommandAnswer } from '#wire/commands.schema.js';
import { emptyChatLedger } from '#log/chat-ledger.js';

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

  /* W6 RH-R8: a new incarnation reports its own quiescence at open, so leadership never acts on a stale `true`. */
  it('should report a new incarnation as not quiescent until it rests', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const onChatQuiescent = vi.fn<(chatId: string, quiescent: boolean) => void>();
    const host = createTauAgentHost({
      ...hostOptions({ openEventLog: file.open, transport: heldTransport().transport, toolRegistry: idle }),
      onChatQuiescent,
    });

    await host.claim('chat-quiet');

    expect(onChatQuiescent.mock.calls).toEqual([
      ['chat-quiet', false],
      ['chat-quiet', true],
    ]);
    await host.close();
  });

  it('should settle a second concurrent close only after the first finishes', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport: heldTransport().transport, toolRegistry: idle }),
    );
    await host.claim('chat-closing');
    let firstDone = false;
    const closeFirst = async (): Promise<void> => {
      await host.close();
      firstDone = true;
    };
    const first = closeFirst();

    await host.close();

    expect(firstDone).toBe(true);
    await first;
  });

  it('should not reopen an incarnation closed by eviction while its first command waits for serving', async () => {
    const opening = Promise.withResolvers<void>();
    const releaseOpen = Promise.withResolvers<void>();
    let opens = 0;
    const registry = createChatRunRegistry({
      createTerm: () => 'term-1',
      services: {
        openLog: async () => {
          opens++;
          if (opens === 1) {
            opening.resolve();
            await releaseOpen.promise;
          }
          return { ledger: emptyChatLedger, repair: [] };
        },
        append: async () => {
          throw new Error('Unexpected append');
        },
        prepareAdmission: async () => {
          throw new Error('Unexpected admission');
        },
        prepareResume: async () => {
          throw new Error('Unexpected resume');
        },
        startDriver: () => {
          throw new Error('Unexpected driver');
        },
        closeLog: async () => undefined,
      },
    });
    const command = registry.execute({
      type: 'start',
      commandId: key(),
      payload: {
        chatId: 'chat-evict-opening',
        runId: 'run-evict-opening',
        trigger: 'submit',
        message: { id: 'turn-evict-opening', role: 'user', content: 'Start.' },
      },
    });
    await opening.promise;
    await registry.evict('chat-evict-opening');
    await expect(command).resolves.toMatchObject({ status: 'refused', code: 'HOST_CLOSED' });
    expect(opens).toBe(1);
    releaseOpen.resolve();
    await registry.close();
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
    const daemon = createNodeLauncher({
      workspaceRoot: root,
      gatewayBaseUrl: 'https://gateway.example',
      model: { id: 'fixture-model', contextWindow: 200_000, maxTokens: 4096 },
      systemPrompt: 'You are Tau.',
      toolRegistry: idle,
      auth: () => 'daemon-bearer',
      fetch: vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof globalThis.fetch,
    });

    const attach = { type: 'attach', payload: { chatId: 'chat-orphan' } } as const;
    /* The host's own claim (the legacy attach verb) abandons at once. */
    const hostAnswers = [
      attachDetails(await browser.command({ ...attach, commandId: key() })),
      attachDetails(await browser.command({ ...attach, commandId: key() })),
    ];
    /* The launcher's attach is a read (W6 RH-R1): it reports the driverless run and asks leadership to claim, and
     * the claim writes the abandonment on the same rule, M1's opening. */
    const found = attachDetails(await daemon.execute({ ...attach, commandId: key() }));
    expect(found).toMatchObject({ takeover: true, snapshot: { state: 'running' } });
    let settled = attachDetails(await daemon.execute({ ...attach, commandId: key() }));
    for (
      let attempt = 0;
      attempt < 100 && (settled.snapshot as { state?: string } | undefined)?.state !== 'failed';
      attempt++
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling the claim's durable row.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      // oxlint-disable-next-line no-await-in-loop -- each poll reads the log again.
      settled = attachDetails(await daemon.execute({ ...attach, commandId: key() }));
    }
    const answers = [hostAnswers, [{ ...found, snapshot: settled.snapshot }, settled]];

    // L2b F2: one rule, M1's opening; the first claim takes over, a later attach is a read.
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

describe('deliberate Stop continuation', () => {
  it('should resume the committed stopped turn once on the same run after reload', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      ...orphanedRun.slice(1),
      {
        type: 'turn.history-projection-committed',
        runId: 'run-1',
        retainedMessageIds: [],
        message: { id: 'turn-1', role: 'user', content: 'First.' },
        context: { version: 1, systemPrompt: '', initialMessages: [], postCompactionMessages: [] },
      },
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'cancelled',
        detail: { code: 'USER_STOPPED', message: 'Stopped.' },
      },
    ]);
    const model = heldTransport();
    const host = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport: model.transport, toolRegistry: idle, idPrefix: 'stopped' }),
    );
    const command = {
      type: 'resume',
      commandId: 'resume-stopped',
      payload: { chatId: 'chat-stopped', runId: 'run-1' },
    } as const;
    const answer = await host.command(command);
    expect(answer).toMatchObject({ status: 'applied', effect: 'durable' });
    await vi.waitFor(() => {
      expect(model.calls()).toBe(1);
    });
    expect(await host.command(command)).toMatchObject({ status: 'replayed' });
    const resumed = await host.ledger('chat-stopped');
    expect(resumed.runs['run-1']).toMatchObject({ attempt: 2, lifecycle: 'running' });
    const rows = await readLog(file);
    expect(rows.filter((row) => row.type === 'turn.history-projection-committed')).toHaveLength(1);
    await host.cancel({ runId: 'run-1', commandId: 'stop-again' });
    const stopped = await host.ledger('chat-stopped');
    expect(stopped.runs['run-1']).toMatchObject({ lifecycle: 'cancelled', failure: { code: 'USER_STOPPED' } });
    await host.close();
  });

  it.each([true, false])(
    'should refuse cancellation without retained Stop evidence (committed=%s)',
    async (committed) => {
      const file = createMemoryLogFile();
      await seedLog(file, [
        ...orphanedRun.filter((row) => committed || row.type !== 'turn.history-projection-committed'),
        {
          type: 'run.lifecycle',
          runId: 'run-1',
          state: 'cancelled',
          ...(committed ? {} : { detail: { code: 'USER_STOPPED', message: 'Stopped.' } }),
        },
      ]);
      const model = heldTransport();
      const host = createTauAgentHost(
        hostOptions({
          openEventLog: file.open,
          transport: model.transport,
          toolRegistry: idle,
          idPrefix: 'not-stopped',
        }),
      );
      const answer = await host.command({
        type: 'resume',
        commandId: key(),
        payload: { chatId: 'chat-not-stopped', runId: 'run-1' },
      });
      expect(answer).toMatchObject({ status: 'refused', code: 'RESUME_UNAVAILABLE' });
      expect(model.calls()).toBe(0);
      await host.close();
    },
  );
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
  /** W8's port as a fake: every call records the log's length when it was made; settlements publish on complete. */
  const fakePort = (file: ReturnType<typeof createMemoryLogFile>, registry: ToolRegistry) =>
    fakePlacement({
      registry,
      rows: async () => {
        const rows = await readLog(file);
        return rows.length;
      },
    });

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

  /* D13 (W8.r1 M1, probe P5): a host with no placement runs no CAD turn; it refuses before any row. */
  it('should refuse a start and a resume REVISIONS_UNAVAILABLE on a host with no placement, writing no row', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      ...completedFirstTurn.slice(0, 3),
      { type: 'run.lifecycle', runId: 'run-1', state: 'failed', detail: { code: 'RATE_LIMITED', message: 'Busy.' } },
    ]);
    const host = createTauAgentHost({
      ...hostOptions({ openEventLog: file.open, transport: done, toolRegistry: idle, idPrefix: 'unplaced' }),
      placement: undefined,
    });
    const before = await readLog(file);

    const resumed = await host.command({
      type: 'resume',
      commandId: key(),
      payload: { chatId: 'chat-unplaced', runId: 'run-1' },
    });
    const started = await start(host, 'chat-unplaced', 'run-2');

    expect(resumed).toMatchObject({ status: 'refused', code: 'REVISIONS_UNAVAILABLE', effect: 'not-applied' });
    expect(started).toMatchObject({ status: 'refused', code: 'REVISIONS_UNAVAILABLE', effect: 'not-applied' });
    const after = await readLog(file);
    expect(
      after.slice(before.length).filter((row) => row.type === 'turn.finalized' || row.type === 'turn.failed'),
    ).toEqual([]);
    expect(
      after.slice(before.length).filter((row) => row.type === 'run.lifecycle' && row.state === 'admitted'),
    ).toEqual([]);
    await host.close();
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

  /* HD-3 (W8.a2): a refused placement's rows are written in the one settlement shape, attempt included (TS-S9). */
  it('should append a refused placement with its attempt, so the run ends with the refusal code', async () => {
    const file = createMemoryLogFile();
    const fake = fakePort(file, idle);
    const port: TurnPlacementPort = {
      ...fake.port,
      admit: async ({ requestId }) => ({
        requestId,
        status: 'refused',
        code: 'BASE_CUT_FAILED',
        message: 'The files already in checkout live could not be saved before the agent started.',
      }),
    };
    const host = placedHost(file, port, 'place-refused');

    await start(host, 'chat-refused', 'run-1');

    await vi.waitFor(async () => {
      const log = await readLog(file);
      expect(log).toContainEqual(
        expect.objectContaining({ type: 'turn.failed', runId: 'run-1', attempt: 1, code: 'BASE_CUT_FAILED' }),
      );
    });
    expect(await readLog(file)).toContainEqual(
      expect.objectContaining({
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        detail: expect.objectContaining({ code: 'BASE_CUT_FAILED' }) as unknown,
      }),
    );
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

  it('should root an external attempt at the root its placement granted', async () => {
    const file = createMemoryLogFile();
    const fake = fakePort(file, idle);
    const rooted: Array<string | undefined> = [];
    const external: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        rooted.push(turn.root);
        return undefined;
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({ openEventLog: file.open, transport: done, toolRegistry: idle, idPrefix: 'rooted' }),
      placement: fake.port,
      externalRunners: { acp: external },
    });

    await host.command({
      type: 'start',
      commandId: key(),
      payload: {
        chatId: 'chat-rooted',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-run-1', role: 'user', content: 'Run this elsewhere.' },
        config: { systemPrompt: 'unused', toolChoice: 'none', agent: { kind: 'acp', id: 'stub-agent' } },
      },
    });
    await vi.waitFor(() => {
      expect(fake.calls.map((call) => call.verb)).toContain('acknowledge');
    });

    expect(rooted).toEqual(['/work']);
    await host.close();
  });

  // TS-S9: M1 writes a published settlement only in the one shape (`turnSettlementSchema`), attempt and code included.
  it('should not append a published settlement the write gate refuses', async () => {
    const file = createMemoryLogFile();
    const fake = fakePort(file, idle);
    let listenEnded = false;
    const port: TurnPlacementPort = {
      ...fake.port,
      async *settlements(input) {
        input.signal.addEventListener('abort', () => {
          listenEnded = true;
        });
        for await (const fact of fake.port.settlements(input)) {
          yield fact.kind === 'settled'
            ? {
                ...fact,
                row: {
                  type: 'turn.failed',
                  runId: fact.key.runId,
                  attempt: fact.key.attempt,
                  turnId: fact.key.turnId,
                  chatId: fact.key.chatId,
                  reason: 'A row with no code.',
                },
              }
            : fact;
        }
      },
    };
    const host = placedHost(file, port, 'gated');

    await start(host, 'chat-gated', 'run-1');
    await vi.waitFor(() => {
      expect(listenEnded).toBe(true);
    });

    const log = await readLog(file);
    expect(log.filter((event) => event.type === 'turn.failed')).toEqual([]);
    expect(fake.calls.map((call) => call.verb)).not.toContain('acknowledge');
    await host.close();
  });

  // TS-S7 step 4, first row (RA-S13's deferred half): a lease whose attempt the log already settled is acknowledged at
  // opening, before any command is served; the host died between the row and its acknowledge.
  it('should acknowledge at opening a held lease whose attempt the log already settled', async () => {
    const file = createMemoryLogFile();
    const settledKey: TurnAttemptKey = { chatId: 'chat-reopen', turnId: 'turn-1', runId: 'run-1', attempt: 1 };
    await seedLog(file, [
      ...completedFirstTurn,
      {
        type: 'turn.finalized',
        runId: 'run-1',
        attempt: 1,
        turnId: 'turn-1',
        chatId: 'chat-reopen',
        projectId: 'project-1',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-1'],
      },
    ]);
    const fake = fakePort(file, idle);
    const host = placedHost(
      file,
      {
        ...fake.port,
        reconcile: async ({ requestId }) => ({
          requestId,
          status: 'applied',
          held: [{ key: settledKey, checkoutId: 'checkout-live' }],
        }),
      },
      'reopen-ack',
    );

    await start(host, 'chat-reopen', 'run-2');
    await vi.waitFor(() => {
      expect(fake.calls.filter((call) => call.verb === 'acknowledge').map((call) => call.key.runId)).toEqual([
        'run-1',
        'run-2',
      ]);
    });

    expect(fake.calls[0]).toMatchObject({ verb: 'acknowledge', key: settledKey });
    await host.close();
  });

  /* A held lease at opening, with the reconcile answer and seed each row names. */
  const openWith = async (
    held: readonly TurnAttemptKey[],
    seed: readonly SeededLogEvent[],
    prefix: string,
  ): Promise<Readonly<{ fake: ReturnType<typeof fakePort>; file: ReturnType<typeof createMemoryLogFile> }>> => {
    const file = createMemoryLogFile();
    await seedLog(file, seed);
    const fake = fakePort(file, idle);
    const host = placedHost(
      file,
      {
        ...fake.port,
        reconcile: async ({ requestId }) => ({
          requestId,
          status: 'applied',
          held: held.map((key) => ({ key, checkoutId: 'checkout-live' })),
        }),
      },
      prefix,
    );
    const claimed = await host.claim(held[0]?.chatId ?? 'chat-held');
    expect(claimed).not.toHaveProperty('refused');
    await host.close();
    return { fake, file };
  };

  // TS-Q5 (W8.r1 H2, probe P4): a record written before W5 is attempt 0, which the run's row of any attempt settles.
  it('should acknowledge at opening a lease written before W5 whose run the log already settled', async () => {
    const legacy: TurnAttemptKey = { chatId: 'chat-legacy', turnId: 'turn-1', runId: 'run-1', attempt: 0 };
    const { fake } = await openWith(
      [legacy],
      [
        ...completedFirstTurn,
        {
          type: 'turn.finalized',
          runId: 'run-1',
          turnId: 'turn-1',
          chatId: 'chat-legacy',
          projectId: 'project-1',
          changedPaths: [],
          trigger: 'turn',
          runIds: ['run-1'],
        },
      ],
      'legacy-ack',
    );

    expect(fake.calls).toEqual([expect.objectContaining({ verb: 'acknowledge', key: legacy })]);
  });

  // TS-Q5, W8.r1 MU1: a held lease whose attempt has no row is settled first: complete, the row, then acknowledge.
  it('should settle a held lease of an ended run the log has no row for, before acknowledging it', async () => {
    const heldKey: TurnAttemptKey = { chatId: 'chat-unsettled', turnId: 'turn-1', runId: 'run-1', attempt: 1 };
    const { fake, file } = await openWith([heldKey], completedFirstTurn, 'unsettled-ack');

    const log = await readLog(file);
    const row = log.findIndex((event) => event.type === 'turn.finalized' && event.runId === 'run-1');
    expect(row).toBeGreaterThanOrEqual(completedFirstTurn.length);
    expect(fake.calls.map((call) => call.verb)).toEqual(['complete', 'acknowledge']);
    /* W8.r1 M-A: the held attempt's tools may have written, so its settlement cuts. */
    expect(fake.calls[0]).toMatchObject({ verb: 'complete', key: heldKey, cut: true });
    expect(fake.calls[1]?.rows).toBeGreaterThan(row);
  });

  // TS-Q5: a lease of a run that is not the chat's current one, and a pre-W5 one, settle as that run's current attempt.
  it('should settle the lease of a run that is not current, and a pre-W5 lease, as their runs current attempts', async () => {
    const older: TurnAttemptKey = { chatId: 'chat-older', turnId: 'turn-1', runId: 'run-1', attempt: 0 };
    const { fake, file } = await openWith(
      [older],
      [
        ...completedFirstTurn,
        { type: 'message.appended', runId: 'run-2', message: { id: 'turn-2', role: 'user', content: 'Second.' } },
        { type: 'run.lifecycle', runId: 'run-2', state: 'admitted' },
        { type: 'run.lifecycle', runId: 'run-2', state: 'running' },
        { type: 'run.lifecycle', runId: 'run-2', state: 'completed' },
        {
          type: 'turn.finalized',
          runId: 'run-2',
          turnId: 'turn-2',
          chatId: 'chat-older',
          projectId: 'project-1',
          changedPaths: [],
          trigger: 'turn',
          runIds: ['run-2'],
        },
      ],
      'older-run',
    );

    const settled = { ...older, attempt: 1 };
    expect(fake.calls).toEqual([
      expect.objectContaining({ verb: 'complete', key: settled, cut: true }),
      expect.objectContaining({ verb: 'acknowledge', key: settled }),
    ]);
    expect(await readLog(file)).toContainEqual(
      expect.objectContaining({ type: 'turn.finalized', runId: 'run-1', attempt: 1 }),
    );
  });

  // I25, TS-A14 (W8.r1 H1): another live root holds the attempt, so M1 appends at most RUN_ABANDONED and leaves it.
  it('should append at most RUN_ABANDONED and leave the attempt when another root holds its lease', async () => {
    const heldKey: TurnAttemptKey = { chatId: 'chat-elsewhere', turnId: 'turn-1', runId: 'run-1', attempt: 1 };
    const file = createMemoryLogFile();
    await seedLog(file, [
      { ...completedFirstTurn[0]!, commandId: 'start-1' } satisfies SeededLogEvent,
      ...completedFirstTurn.slice(1, 3),
    ]);
    const fake = fakePort(file, idle);
    const host = placedHost(
      file,
      {
        ...fake.port,
        reconcile: async ({ requestId }) => ({
          requestId,
          status: 'applied',
          held: [{ key: heldKey, checkoutId: 'checkout-live' }],
        }),
        complete: async ({ requestId, key: completed }) => {
          fake.calls.push({ verb: 'complete', key: completed, rows: 0 });
          return { requestId, status: 'refused', code: 'LEASE_HELD_ELSEWHERE', message: 'Another tab holds it.' };
        },
      },
      'elsewhere',
    );

    await host.claim('chat-elsewhere');
    await vi.waitFor(() => {
      expect(fake.calls.map((call) => call.verb)).toEqual(['complete']);
    });
    await host.close();

    const rows = await readLog(file);
    const appended = rows.slice(3);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ type: 'run.lifecycle', state: 'failed', detail: { code: 'RUN_ABANDONED' } });
  });

  // TS-Q5: a lease naming a run this chat's log does not hold (another device's, or a deleted chat's) is left and reported.
  it('should leave and report a held lease whose run the log does not hold', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const foreign: TurnAttemptKey = { chatId: 'chat-foreign', turnId: 'turn-9', runId: 'run-9', attempt: 1 };
    const { fake, file } = await openWith([foreign], completedFirstTurn, 'foreign');

    expect(fake.calls).toEqual([]);
    expect(await readLog(file)).toHaveLength(completedFirstTurn.length);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Lease run-9 on checkout checkout-live names chat chat-foreign'),
    );
    warn.mockRestore();
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
