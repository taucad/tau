import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '@taucad/agent-observability/contract';
import { scorecard } from '@taucad/agent-observability/scorecard';
import type { OtlpSpan } from '#langfuse-observation.js';
import { langfuseObservation, pseudonymKey } from '#langfuse-observation.js';
import type { LangfuseObservationRow } from '#langfuse-scorecard.js';
import { scoreObservations } from '#langfuse-scorecard.js';
import type { ObservedAttempt } from '#model-invocation-evidence.js';
import { providerAttemptEvidence } from '#model-invocation-evidence.js';
import type { ObservedSettlement } from '@taucad/api-billing';
import { settlementEvidence } from '#settlement-evidence.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');
const pseudonym = pseudonymKey(Uint8Array.from(randomBytes(32)));
const metadataPrefix = 'langfuse.observation.metadata.';
const authority = { policyEpoch: 'epoch-1', protection: 'free' } as const;

/* What Langfuse's v2 observations API returns for a span's metadata: an integer comes back as a number. */
const rowOf = (span: OtlpSpan): LangfuseObservationRow => {
  const metadata: Record<string, unknown> = {};
  for (const { key, value } of span.attributes) {
    const scalar = Object.values(value)[0] as unknown;
    if (key.startsWith(metadataPrefix)) {
      metadata[key.slice(metadataPrefix.length)] = 'intValue' in value ? Number(scalar) : scalar;
    }
  }
  return {
    id: span.spanId,
    startTime: new Date(Number(BigInt(span.startTimeUnixNano) / 1_000_000n)).toISOString(),
    metadata,
  };
};

const attempt = (change: Partial<ObservedAttempt> = {}): ObservedAttempt => ({
  principal: 'user-a',
  project: 'project-a',
  attemptKey: 'attempt-1',
  chat: 'chat-1',
  surface: 'gateway',
  wire: 'openai-responses',
  requestedModel: 'model-a',
  provider: 'provider-a',
  operation: 'op-1',
  startedAt: at,
  duration: 900,
  stream: {
    stop: 'stop',
    usage: { input: 120, output: 40, cacheRead: 100, cacheWrite: null, reasoning: 8, missing: 'none' },
    resolvedModel: 'model-a',
    response: 'response-1',
    firstChunk: 150,
    firstText: 210,
  },
  ended: 'completed',
  ...change,
});

const settlement = (
  operation: string,
  chargedAtoms: bigint,
  supplierCostPicoUsd: ObservedSettlement['receipt']['supplierCostPicoUsd'],
): ObservedSettlement => ({
  operation: {
    id: operation,
    accountId: 'account-a',
    environment: 'synthetic',
    attemptKey: `attempt-${operation}`,
    projectHint: 'project-a',
    chatHint: 'chat-1',
    admittedAt: new Date(at),
    activationId: 'activation-1',
  },
  receipt: { terminalRevision: 1n, chargedAtoms, supplierCostPicoUsd, resolvedAt: new Date(at + 1000) },
  normalization: 'openai-responses-v1',
});

/* Two funded calls and their settlements: one priced, one whose supplier cost the ledger could not price. */
const funded = async (): Promise<Array<Readonly<{ call: Evidence; settled: Evidence }>>> =>
  Promise.all(
    (
      [
        ['op-1', 2_500_000n, 750_000_000_000n],
        ['op-2', 1_000_000n, null],
      ] as const
    ).map(async ([operation, atoms, cost]) => ({
      call: await providerAttemptEvidence(attempt({ attemptKey: `attempt-${operation}`, operation }), authority),
      settled: await settlementEvidence(settlement(operation, atoms, cost), 'user-a', {
        ...authority,
        project: 'project-a',
      }),
    })),
  );

/* Each generation as delivery sends it, carrying its settlement's values (LW4). */
const delivered = (calls: ReadonlyArray<Readonly<{ call: Evidence; settled?: Evidence }>>): LangfuseObservationRow[] =>
  calls.map(({ call, settled }) => {
    const fact = settled?.payload.fact.kind === 'financial' ? settled.payload.fact : undefined;
    const observation = langfuseObservation(
      call,
      { environment: 'synthetic', protection: 'free', settlement: fact },
      pseudonym,
    );
    return rowOf(observation!.spans[0]!);
  });

describe('scoreObservations', () => {
  it('costs settlements from the generations that carry them exactly as the evidence does', async () => {
    const calls = await funded();

    const fromLangfuse = scoreObservations(delivered(calls));

    expect(fromLangfuse.cost).toEqual(scorecard(calls.map(({ settled }) => settled)).attempts.cost);
    expect(fromLangfuse.cost).toMatchObject({ settlements: 2, credits: 3.5, supplierCostUnknown: 1 });
    expect(fromLangfuse.reconciliation).toEqual({ read: 2, duplicates: 0, unscorable: 0 });
    const read = JSON.stringify(fromLangfuse);
    for (const id of ['attempt-op-1', 'chat-1', 'user-a', 'project-a', 'op-1']) {
      expect(read).not.toContain(id);
    }
  });

  it('counts a settlement once across replays, and reads no unsettled generation, older row or tau.financial span', async () => {
    const calls = await funded();
    const rows = delivered(calls);
    const unsettled = delivered([{ call: calls[0]!.call }]);
    const older = { ...rows[0]!, id: 'older', metadata: { ...rows[0]!.metadata, mapper: 'langfuse-v4.3' } };
    /* A settlement span as LW2 wrote it: the same values under `fact.*` keys. */
    const span = {
      ...rows[1]!,
      id: 'span',
      metadata: {
        mapper: 'langfuse-v5',
        authority: 'api-reported',
        'fact.kind': 'financial',
        'fact.ledger': rows[1]!.metadata!['ledger'],
        'fact.credits': 1,
      },
    };

    const card = scoreObservations([...rows, ...rows, ...unsettled, older, span]);

    expect(card.reconciliation).toEqual({ read: 7, duplicates: 2, unscorable: 3 });
    expect(card.cost).toMatchObject({ settlements: 2, credits: 3.5 });
    expect(Object.keys(card)).toEqual(['reconciliation', 'cost']);
  });
});
