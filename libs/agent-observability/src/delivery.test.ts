import { describe, expect, it, vi } from 'vitest';
import type { Evidence } from '#contract.js';
import type { EvidenceReceipt, SubmitOutcome } from '#delivery.js';
import { createEvidenceOutbox, evidenceContentType, memoryPendingStore, submitEvidence } from '#delivery.js';
import { projectRun } from '#projection.js';
import { verifyEvidenceDigest } from '#identity.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');

/** Distinct, valid host envelopes for one scope, one outcome fact per run. */
const envelopes = async (
  count: number,
  scope: Readonly<{ principal?: string; policyEpoch?: string; project?: string }> = {},
): Promise<Evidence[]> => {
  const projections = await Promise.all(
    Array.from({ length: count }, async (_, index) =>
      projectRun(
        {
          chatId: 'chat-1',
          runId: `run-${index}`,
          termination: 'completed',
          tools: [],
          intervals: [],
          ending: { source: { chatId: 'chat-1', leaderEpoch: 'epoch-a', sequence: index }, at: at + index },
        },
        {
          principal: scope.principal ?? 'user-a',
          project: scope.project ?? 'project-a',
          policyEpoch: scope.policyEpoch ?? 'epoch-1',
          protection: 'free',
          uploader: 'device-a',
          ownsEpoch: () => true,
          grantedAt: at,
          hostBuild: undefined,
        },
      ),
    ),
  );
  return projections.flatMap((projection) => projection.evidence);
};

const receipt = (disposition: EvidenceReceipt['disposition'] = 'accepted'): SubmitOutcome => ({
  kind: 'receipt',
  receipt: { receipt: 'r', disposition, duplicate: false, receivedAt: '', expiresAt: '' },
});

const scope = { principal: 'user-a', project: 'project-a', policyEpoch: 'epoch-1' };

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status, headers }));

describe('submitEvidence', () => {
  it('posts the canonical envelope under its own media type with the session’s credentials', async () => {
    const [evidence] = await envelopes(1);
    const fetchMock = answer(200, { receipt: 'r-1', disposition: 'accepted', duplicate: false });

    const outcome = await submitEvidence({ fetch: fetchMock, baseUrl: 'https://api.test' }, evidence!);

    expect(outcome).toMatchObject({ kind: 'receipt', receipt: { receipt: 'r-1' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/agent-observability/evidence');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(new Headers(init?.headers).get('content-type')).toBe(evidenceContentType);
    expect(JSON.parse(init?.body as string)).toEqual(evidence);
  });

  it.each([
    [409, { code: 'EVIDENCE_POLICY_STALE' }, { kind: 'stale', code: 'EVIDENCE_POLICY_STALE' }],
    [403, { code: 'EVIDENCE_PURPOSE' }, { kind: 'stale', code: 'EVIDENCE_PURPOSE' }],
    [409, { code: 'EVIDENCE_CONFLICT' }, { kind: 'refused', code: 'EVIDENCE_CONFLICT' }],
    [400, { code: 'EVIDENCE_INVALID' }, { kind: 'refused', code: 'EVIDENCE_INVALID' }],
    [410, { code: 'PROJECT_DELETED' }, { kind: 'gone' }],
    [401, {}, { kind: 'unauthenticated' }],
    [
      429,
      { code: 'EVIDENCE_BUSY', retryAfterSeconds: 1 },
      { kind: 'retry', afterMilliseconds: 1000, code: 'EVIDENCE_BUSY' },
    ],
    [
      503,
      { code: 'EVIDENCE_CAPACITY', retryAfterSeconds: 60 },
      { kind: 'retry', afterMilliseconds: 60_000, code: 'EVIDENCE_CAPACITY' },
    ],
    [503, {}, { kind: 'retry', afterMilliseconds: 30_000 }],
  ])('reads HTTP %i as what it means for the envelope', async (status, body, expected) => {
    const [evidence] = await envelopes(1);

    await expect(
      submitEvidence({ fetch: answer(status, body), baseUrl: 'https://api.test' }, evidence!),
    ).resolves.toEqual(expected);
  });

  it('treats a network failure as a retry', async () => {
    const [evidence] = await envelopes(1);
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));

    await expect(submitEvidence({ fetch: fetchMock, baseUrl: '' }, evidence!)).resolves.toMatchObject({
      kind: 'retry',
    });
  });
});

describe('EvidenceOutbox', () => {
  const outbox = (submit: (evidence: Evidence) => Promise<SubmitOutcome>, items = 100) => {
    const store = memoryPendingStore();
    return {
      store,
      outbox: createEvidenceOutbox({ store, submit, now: () => at, limits: { items, bytes: 1_000_000, batch: 2 } }),
    };
  };

  it('queues only the bound scope, holds a replayed source once and drains every envelope', async () => {
    const submit = vi.fn(async () => receipt());
    const { outbox: box, store } = outbox(submit);
    await box.bind(scope);
    const evidence = await envelopes(3);

    await box.enqueue([...evidence, evidence[0]!, ...(await envelopes(1, { principal: 'user-b' }))]);
    expect(await box.drain()).toEqual({ stop: 'empty' });

    expect(submit).toHaveBeenCalledTimes(3);
    expect(await store.size()).toEqual({ items: 0, bytes: 0 });
    expect(box.report()).toMatchObject({ held: 3, duplicate: 1, outOfScope: 1, accepted: 3 });
  });

  it('refuses new evidence once full rather than waiting', async () => {
    const { outbox: box } = outbox(async () => receipt(), 2);
    await box.bind(scope);

    expect(await box.enqueue(await envelopes(3))).toMatchObject({ held: 2, full: 1 });
  });

  it('stops at a retry and keeps the queue in order', async () => {
    const submit = vi
      .fn<(evidence: Evidence) => Promise<SubmitOutcome>>()
      .mockResolvedValueOnce(receipt())
      .mockResolvedValueOnce({ kind: 'retry', afterMilliseconds: 5000 });
    const { outbox: box, store } = outbox(submit);
    await box.bind(scope);
    const evidence = await envelopes(3);
    await box.enqueue(evidence);

    expect(await box.drain()).toEqual({ stop: 'retry', retryAfterMilliseconds: 5000 });
    const held = await store.oldest(10);
    expect(held.map((item) => item.evidence)).toEqual(evidence.slice(1));
  });

  it('drops everything held under an epoch the server says is stale', async () => {
    const { outbox: box, store } = outbox(async () => ({ kind: 'stale' }));
    await box.bind(scope);
    await box.enqueue(await envelopes(3));

    expect(await box.drain()).toEqual({ stop: 'stale' });
    expect(await store.size()).toEqual({ items: 0, bytes: 0 });
    expect(box.report()).toMatchObject({ stale: 3 });
  });

  it('purges what the previous account or grant held when it is rebound', async () => {
    const submit = vi.fn(async () => receipt());
    const { outbox: box, store } = outbox(submit);
    await box.bind(scope);
    await box.enqueue(await envelopes(2));

    expect(await box.bind({ ...scope, policyEpoch: 'epoch-2' })).toBe(2);
    expect(await box.bind(undefined)).toBe(0);
    expect(await box.drain()).toEqual({ stop: 'unbound' });
    expect(submit).not.toHaveBeenCalled();
    expect(await store.size()).toEqual({ items: 0, bytes: 0 });
  });

  it('counts a revoked replay without sending it again', async () => {
    const submit = vi.fn(async () => receipt('revoked'));
    const { outbox: box } = outbox(submit);
    await box.bind(scope);
    await box.enqueue(await envelopes(1));

    await box.drain();
    await box.drain();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(box.report()).toMatchObject({ revoked: 1 });
  });
});

describe('a content envelope the API will not take (LW6)', () => {
  const contentEnvelopes = async (): Promise<Evidence[]> => {
    const projection = await projectRun(
      {
        chatId: 'chat-1',
        runId: 'run-1',
        termination: 'completed',
        tools: [],
        intervals: [],
        ending: { source: { chatId: 'chat-1', leaderEpoch: 'epoch-a', sequence: 1 }, at },
        content: { prompt: 'SYNTHETIC_PROMPT', reply: 'SYNTHETIC_REPLY', changedPaths: [] },
      },
      {
        principal: 'user-a',
        project: 'project-a',
        policyEpoch: 'epoch-1',
        protection: 'free',
        uploader: 'device-a',
        ownsEpoch: () => true,
        grantedAt: at,
        hostBuild: undefined,
        content: { since: at },
      },
    );
    return [...projection.evidence];
  };

  it.each<[string, SubmitOutcome]>([
    ['withdrawn', { kind: 'stale', code: 'EVIDENCE_PURPOSE' }],
    ['at capacity', { kind: 'retry', afterMilliseconds: 60_000, code: 'EVIDENCE_CAPACITY' }],
    ['refused by an older API', { kind: 'refused', code: 'EVIDENCE_INVALID' }],
  ])('should send the same fact as its summary when its content is %s', async (_, refusal) => {
    const submit = vi
      .fn<(evidence: Evidence) => Promise<SubmitOutcome>>()
      .mockResolvedValueOnce(refusal)
      .mockResolvedValue(receipt());
    const store = memoryPendingStore();
    const box = createEvidenceOutbox({ store, submit, now: () => at });
    await box.bind(scope);
    const [content] = await contentEnvelopes();
    expect(content?.payload.plane).toBe('content');
    await box.enqueue([content!]);

    expect(await box.drain()).toEqual({ stop: 'empty' });
    const summary = submit.mock.calls[1]![0];
    expect(summary.payload).toEqual({ plane: 'summary', fact: content!.payload.fact });
    expect(summary).toMatchObject({
      source: content!.source,
      projection: { redactor: 'summary-only' },
      coverage: { input: 'omitted', output: 'omitted' },
    });
    expect(await verifyEvidenceDigest(summary)).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('SYNTHETIC');
    expect(box.report()).toMatchObject({ accepted: 1, summarized: 1, stale: 0, refused: 0 });
  });

  it('should still purge on a stale epoch, and hold the summary when the content does not fit the queue', async () => {
    const [content] = await contentEnvelopes();
    const stale = createEvidenceOutbox({
      store: memoryPendingStore(),
      submit: async () => ({ kind: 'stale', code: 'EVIDENCE_POLICY_STALE' }),
      now: () => at,
    });
    await stale.bind(scope);
    await stale.enqueue([content!]);
    expect(await stale.drain()).toEqual({ stop: 'stale' });

    const summaryBytes = new TextEncoder().encode(
      JSON.stringify({ ...content!, payload: { plane: 'summary', fact: content!.payload.fact } }),
    ).byteLength;
    const store = memoryPendingStore();
    const small = createEvidenceOutbox({
      store,
      submit: async () => receipt(),
      now: () => at,
      limits: { items: 10, bytes: summaryBytes + 64, batch: 4 },
    });
    await small.bind(scope);
    expect(await small.enqueue([content!])).toMatchObject({ held: 1, full: 0, summarized: 1 });
    const [held] = await store.oldest(1);
    expect(held?.evidence.payload.plane).toBe('summary');
  });
});
