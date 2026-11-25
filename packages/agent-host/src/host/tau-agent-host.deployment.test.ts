/**
 * One run, one billing mode (D1, I1, I3, I4): the host asks the transport's deployment port at a run's admission,
 * records the mode on the run's lifecycle row, drives the run on that mode's transport, and a resumed attempt keeps the
 * recorded mode whatever the port answers now.
 */

import { describe, expect, it, vi } from 'vitest';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import type { CreateTauAgentHostOptions } from '#host/tau-agent-host.js';
import { createMemoryLogFile, hostOptions, readLog, seedLog, tools } from '#host/tau-agent-host.fixture.js';
import type { MemoryLogFile, SeededLogEvent } from '#host/tau-agent-host.fixture.js';
import { emptyChatLedger, foldChatLedger, unresolvedInvocations } from '#log/chat-ledger.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { isResumableRunFailure } from '#log/resumable.js';
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
import type { DeploymentModeAnswer, ModelTransport } from '#waist/ports.js';
import { refusalOf } from '#wire/refusals.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;

/** How the fake gateway answers the next model POST. */
type Reply = 'funded' | 'plain' | 'drop';

type Gateway = Readonly<{
  fetch: typeof globalThis.fetch;
  /** Every model POST's `x-tau-attempt-id`, in order. */
  attempts: string[];
  /** Every attempt the billing route was asked about, in order. */
  lookups: string[];
}>;

/**
 * A gateway that answers model POSTs from a script, and the billing route with `voided` for any attempt.
 *
 * @param script - One reply per model POST; a POST past the script is a funded reply.
 * @returns The fetch and what it saw.
 */
const fakeGateway = (script: readonly Reply[]): Gateway => {
  const attempts: string[] = [];
  const lookups: string[] = [];
  let calls = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const lookup = /\/v1\/billing\/attempts\/gateway\/([^/?]+)/u.exec(url);
    if (lookup !== null) {
      lookups.push(decodeURIComponent(lookup[1]!));
      return Response.json({ state: 'not_found', voided: true });
    }
    attempts.push(new Headers(init?.headers).get('x-tau-attempt-id') ?? '');
    const reply = script[calls] ?? 'funded';
    calls++;
    if (reply === 'drop') {
      throw new TypeError('fetch failed');
    }
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          for (const chunk of authoritativeGatewayWireFixtures.browserTurn) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      }),
      {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          ...(reply === 'funded' ? { 'x-tau-operation-id': `operation-${String(calls)}` } : {}),
        },
      },
    );
  }) as unknown as typeof globalThis.fetch;
  return { fetch, attempts, lookups };
};

const unifiedTransport = (gateway: Gateway, deployment: () => Promise<DeploymentModeAnswer>): ModelTransport =>
  createGatewayModelTransport({
    baseUrl: 'https://api.example/',
    fetch: gateway.fetch,
    billing: { deployment, principal: () => 'account-1' },
  });

const hostOver = (
  { file, transport, idPrefix }: Readonly<{ file: MemoryLogFile; transport: ModelTransport; idPrefix: string }>,
  extra: Partial<CreateTauAgentHostOptions> = {},
) =>
  createTauAgentHost({
    ...hostOptions({
      openEventLog: file.open,
      transport,
      toolRegistry: tools(async () => ({ content: null, isError: false })),
      idPrefix,
    }),
    model,
    ...extra,
  });

const rowsOf = (events: readonly AgentLogEvent[], type: AgentLogEvent['type'], runId?: string): AgentLogEvent[] =>
  events.filter((event) => event.type === type && (runId === undefined || event.runId === runId));

const lifecycleOf = (events: readonly AgentLogEvent[], runId: string): Array<Record<string, unknown>> =>
  rowsOf(events, 'run.lifecycle', runId).map((event) => event as unknown as Record<string, unknown>);

const admit = async (host: ReturnType<typeof createTauAgentHost>, chatId: string, runId: string): Promise<void> => {
  await host.admit({
    chatId,
    runId,
    trigger: 'submit',
    message: { id: `turn-${runId}`, role: 'user', content: 'Say hello.' },
  });
};

describe('per-run billing mode from the deployment answer', () => {
  it('funds a run on a Cloud answer: prepared, bound and settled rows, mode recorded on admission', async () => {
    const file = createMemoryLogFile();
    const gateway = fakeGateway(['drop', 'funded']);
    const deployment = vi.fn(async (): Promise<DeploymentModeAnswer> => 'funded');
    const host = hostOver({ file, transport: unifiedTransport(gateway, deployment), idPrefix: 'funded' });
    try {
      await admit(host, 'chat-funded', 'run-funded');
      await expect(host.snapshot('chat-funded')).resolves.toMatchObject({ state: 'completed' });
    } finally {
      await host.close();
    }
    const events = await readLog(file);
    const prepared = rowsOf(events, 'model.invocation-prepared', 'run-funded');
    expect(prepared.map((event) => (event.type === 'model.invocation-prepared' ? event.attemptId : ''))).toEqual([
      'run-funded:1:0',
      'run-funded:1:1',
    ]);
    expect(rowsOf(events, 'model.invocation-bound')).toHaveLength(1);
    /* The dropped call's attempt was asked about and settled before the next one was prepared (EQ1). */
    expect(gateway.lookups).toEqual(['run-funded:1:0']);
    expect(rowsOf(events, 'model.invocation-settled')).toMatchObject([
      { attemptId: 'run-funded:1:0', outcome: 'voided' },
    ]);
    expect(gateway.attempts).toEqual(['run-funded:1:0', 'run-funded:1:1']);
    expect(lifecycleOf(events, 'run-funded')[0]).toMatchObject({ state: 'admitted', deployment: 'funded' });
    expect(deployment).toHaveBeenCalledTimes(1);
  });

  it('runs plain on a self-host answer: no ledger rows, run-scoped attempt ids, no billing lookups', async () => {
    const file = createMemoryLogFile();
    const gateway = fakeGateway(['plain']);
    const host = hostOver({ file, transport: unifiedTransport(gateway, async () => 'unfunded'), idPrefix: 'plain' });
    try {
      await admit(host, 'chat-plain', 'run-plain');
      await expect(host.snapshot('chat-plain')).resolves.toMatchObject({ state: 'completed' });
    } finally {
      await host.close();
    }
    const events = await readLog(file);
    expect(rowsOf(events, 'model.invocation-prepared')).toEqual([]);
    expect(rowsOf(events, 'model.invocation-bound')).toEqual([]);
    expect(rowsOf(events, 'model.invocation-settled')).toEqual([]);
    expect(gateway.lookups).toEqual([]);
    expect(gateway.attempts).toHaveLength(1);
    expect(gateway.attempts[0]).toMatch(/^run-plain:1:\d+$/u);
    expect(lifecycleOf(events, 'run-plain')[0]).toMatchObject({ state: 'admitted', deployment: 'unfunded' });
  });

  it.each([
    ['answers unknown', async (): Promise<DeploymentModeAnswer> => 'unknown'],
    [
      'throws',
      async (): Promise<DeploymentModeAnswer> => {
        throw new Error('The deployment answer timed out.');
      },
    ],
  ])('ends the run DEPLOYMENT_UNKNOWN before any gateway call when the port %s (I1)', async (_label, answer) => {
    const file = createMemoryLogFile();
    const gateway = fakeGateway([]);
    const host = hostOver({ file, transport: unifiedTransport(gateway, answer), idPrefix: 'unknown' });
    try {
      await admit(host, 'chat-unknown', 'run-unknown');
      const snapshot = await host.snapshot('chat-unknown');
      expect(snapshot).toMatchObject({ state: 'failed', failure: { code: 'DEPLOYMENT_UNKNOWN' } });
      expect(snapshot.failure && isResumableRunFailure(snapshot.failure)).toBe(true);
    } finally {
      await host.close();
    }
    expect(gateway.fetch).not.toHaveBeenCalled();
    const events = await readLog(file);
    expect(rowsOf(events, 'model.invocation-prepared')).toEqual([]);
    expect(lifecycleOf(events, 'run-unknown').some((row) => row['deployment'] !== undefined)).toBe(false);
    expect(refusalOf('DEPLOYMENT_UNKNOWN')).toEqual({ owner: 'host', retry: 'resume' });
  });

  it('resumes a run refused DEPLOYMENT_UNKNOWN once the answer is known, recording the mode then', async () => {
    const file = createMemoryLogFile();
    const gateway = fakeGateway(['funded']);
    let answer: DeploymentModeAnswer = 'unknown';
    const host = hostOver({ file, transport: unifiedTransport(gateway, async () => answer), idPrefix: 'retry-known' });
    try {
      await admit(host, 'chat-retry', 'run-retry');
      await expect(host.snapshot('chat-retry')).resolves.toMatchObject({ state: 'failed' });
      answer = 'funded';
      await host.resume('chat-retry');
      await expect(host.snapshot('chat-retry')).resolves.toMatchObject({ state: 'completed' });
    } finally {
      await host.close();
    }
    const events = await readLog(file);
    expect(lifecycleOf(events, 'run-retry').filter((row) => row['deployment'] !== undefined)).toMatchObject([
      { state: 'running', deployment: 'funded' },
    ]);
    expect(rowsOf(events, 'model.invocation-prepared')).toMatchObject([{ attemptId: 'run-retry:2:0' }]);
  });

  it('keeps a resumed run on its recorded mode whatever the port answers now (I3)', async () => {
    const file = createMemoryLogFile();
    const gateway = fakeGateway(['drop', 'funded']);
    let answer: DeploymentModeAnswer = 'funded';
    const deployment = vi.fn(async () => answer);
    const host = hostOver(
      { file, transport: unifiedTransport(gateway, deployment), idPrefix: 'recorded' },
      { lostReplyRetries: 0 },
    );
    try {
      await admit(host, 'chat-recorded', 'run-recorded');
      await expect(host.snapshot('chat-recorded')).resolves.toMatchObject({
        state: 'failed',
        failure: { code: 'NETWORK_ERROR' },
      });
      answer = 'unfunded';
      await host.resume('chat-recorded');
      await expect(host.snapshot('chat-recorded')).resolves.toMatchObject({ state: 'completed' });
    } finally {
      await host.close();
    }
    expect(deployment).toHaveBeenCalledTimes(1);
    const events = await readLog(file);
    expect(
      rowsOf(events, 'model.invocation-prepared').map((event) => (event as { attemptId: string }).attemptId),
    ).toEqual(['run-recorded:1:0', 'run-recorded:2:0']);
    expect(rowsOf(events, 'model.invocation-bound')).toMatchObject([{ attemptId: 'run-recorded:2:0' }]);
    expect(rowsOf(events, 'model.invocation-settled')).toMatchObject([{ attemptId: 'run-recorded:1:0' }]);
    /* Recorded once, on admission: the resume neither asked again nor recorded another mode. */
    expect(lifecycleOf(events, 'run-recorded').filter((row) => row['deployment'] !== undefined)).toMatchObject([
      { state: 'admitted', deployment: 'funded' },
    ]);
  });

  it('continues funded a chat whose earlier run was unfunded', async () => {
    const file = createMemoryLogFile();
    const gateway = fakeGateway(['plain', 'funded']);
    let answer: DeploymentModeAnswer = 'unfunded';
    const host = hostOver({ file, transport: unifiedTransport(gateway, async () => answer), idPrefix: 'switch' });
    try {
      await admit(host, 'chat-switch', 'run-a');
      await expect(host.snapshot('chat-switch')).resolves.toMatchObject({ state: 'completed' });
      answer = 'funded';
      await admit(host, 'chat-switch', 'run-b');
      await expect(host.snapshot('chat-switch')).resolves.toMatchObject({ state: 'completed' });
    } finally {
      await host.close();
    }
    const events = await readLog(file);
    expect(rowsOf(events, 'model.invocation-prepared', 'run-a')).toEqual([]);
    expect(rowsOf(events, 'model.invocation-prepared', 'run-b')).toMatchObject([{ attemptId: 'run-b:1:0' }]);
    expect(rowsOf(events, 'model.invocation-bound', 'run-b')).toHaveLength(1);
  });

  it('replays a chat today’s funded host wrote unchanged, and records a mode only for runs it admits (I4)', async () => {
    const file = createMemoryLogFile();
    /* Today's funded web host: the Cloud transport, chosen at build time, recording no mode. */
    const before = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: createTauCloudGatewayModelTransport({
          baseUrl: 'https://api.example/',
          fetch: fakeGateway(['funded', 'drop']).fetch,
          principal: () => 'account-1',
        }),
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'legacy',
      }),
      model,
      lostReplyRetries: 0,
    });
    try {
      await admit(before, 'chat-legacy', 'run-old');
      await admit(before, 'chat-legacy', 'run-cut');
      await expect(before.snapshot('chat-legacy')).resolves.toMatchObject({ state: 'failed' });
    } finally {
      await before.close();
    }
    const written = await readLog(file);
    expect(written.some((event) => (event as { deployment?: unknown }).deployment !== undefined)).toBe(false);
    expect(
      rowsOf(written, 'model.invocation-prepared').map((event) => (event as { attemptId: string }).attemptId),
    ).toEqual(['run-old:1:0', 'run-cut:1:0']);

    /* The unified host opens it: the cut run, admitted with no recorded mode, takes the answer at its resume. */
    const gateway = fakeGateway(['funded', 'funded']);
    const deployment = vi.fn(async (): Promise<DeploymentModeAnswer> => 'funded');
    const after = hostOver({ file, transport: unifiedTransport(gateway, deployment), idPrefix: 'unified' });
    try {
      await after.resume('chat-legacy');
      await expect(after.snapshot('chat-legacy')).resolves.toMatchObject({ state: 'completed' });
      await admit(after, 'chat-legacy', 'run-new');
      await expect(after.snapshot('chat-legacy')).resolves.toMatchObject({ state: 'completed' });
    } finally {
      await after.close();
    }
    const events = await readLog(file);
    /* Every row the old host wrote reads back byte for byte the same. */
    expect(events.slice(0, written.length)).toEqual(written);
    expect(gateway.lookups).toEqual(['run-cut:1:0']);
    expect(
      rowsOf(events, 'model.invocation-prepared').map((event) => (event as { attemptId: string }).attemptId),
    ).toEqual(['run-old:1:0', 'run-cut:1:0', 'run-cut:2:0', 'run-new:1:0']);
    expect(lifecycleOf(events, 'run-cut').filter((row) => row['deployment'] !== undefined)).toMatchObject([
      { state: 'running', deployment: 'funded' },
    ]);
    expect(lifecycleOf(events, 'run-new')[0]).toMatchObject({ state: 'admitted', deployment: 'funded' });
    expect(unresolvedInvocations(foldChatLedger(emptyChatLedger, events))).toEqual([]);
  });

  /**
   * A run that ended resumably with every call it made shown, so no attempt is left to resolve: what Resume reopens
   * depends on the recorded mode alone.
   *
   * @param runId - The run.
   * @param modes - The `deployment` of its admitted row, then of its running row (`undefined` records none).
   */
  const shownRun = (runId: string, modes: readonly [string | undefined, string | undefined]): SeededLogEvent[] => [
    { type: 'message.appended', runId, message: { id: `turn-${runId}`, role: 'user', content: 'Say hello.' } },
    {
      type: 'run.lifecycle',
      runId,
      state: 'admitted',
      ...(modes[0] === undefined ? {} : { deployment: modes[0] }),
    },
    {
      type: 'run.lifecycle',
      runId,
      state: 'running',
      ...(modes[1] === undefined ? {} : { deployment: modes[1] }),
    },
    {
      type: 'run.lifecycle',
      runId,
      state: 'failed',
      detail: { message: 'Tau model gateway request failed.', code: 'NETWORK_ERROR' },
    },
  ];

  it('refuses to resume a funded run on a transport that cannot fund it, with no call made (I1, I3)', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, shownRun('run-shown', ['funded', undefined]));
    const gateway = fakeGateway(['plain']);
    const plain = createGatewayModelTransport({ baseUrl: 'https://api.example/', fetch: gateway.fetch });
    const host = hostOver({ file, transport: plain, idPrefix: 'mismatch' });
    try {
      await host.resume('chat-shown');
      const snapshot = await host.snapshot('chat-shown');
      expect(snapshot).toMatchObject({ state: 'failed', failure: { code: 'DEPLOYMENT_UNKNOWN' } });
      expect(snapshot.failure && isResumableRunFailure(snapshot.failure)).toBe(true);
    } finally {
      await host.close();
    }
    expect(gateway.fetch).not.toHaveBeenCalled();
  });

  it('refuses every Resume of a run recorded under a mode this build cannot read', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, shownRun('run-future', ['metered', undefined]));
    const gateway = fakeGateway([]);
    const deployment = vi.fn(async (): Promise<DeploymentModeAnswer> => 'funded');
    const host = hostOver({ file, transport: unifiedTransport(gateway, deployment), idPrefix: 'future' });
    try {
      for (const _ of [1, 2]) {
        // oxlint-disable-next-line no-await-in-loop -- one Resume after the other.
        await host.resume('chat-future');
        // oxlint-disable-next-line no-await-in-loop -- as above.
        const snapshot = await host.snapshot('chat-future');
        expect(snapshot).toMatchObject({ state: 'failed', failure: { code: 'DEPLOYMENT_UNKNOWN' } });
        expect(snapshot.failure?.message).toMatch(/update Tau/u);
      }
    } finally {
      await host.close();
    }
    expect(deployment).not.toHaveBeenCalled();
    expect(gateway.fetch).not.toHaveBeenCalled();
  });

  it('keeps the first mode a run recorded when a later row names another (I3)', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, shownRun('run-first', ['funded', 'unfunded']));
    const gateway = fakeGateway(['funded']);
    const host = hostOver({ file, transport: unifiedTransport(gateway, async () => 'unfunded'), idPrefix: 'first' });
    try {
      await host.resume('chat-first');
      await expect(host.snapshot('chat-first')).resolves.toMatchObject({ state: 'completed' });
    } finally {
      await host.close();
    }
    const events = await readLog(file);
    expect(rowsOf(events, 'model.invocation-prepared', 'run-first')).toMatchObject([{ attemptId: 'run-first:2:0' }]);
    expect(rowsOf(events, 'model.invocation-bound', 'run-first')).toHaveLength(1);
  });
});
