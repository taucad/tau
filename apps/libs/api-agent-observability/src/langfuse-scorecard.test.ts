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

const delivered = (evidence: readonly Evidence[]): LangfuseObservationRow[] =>
  evidence.flatMap((item) => {
    const observation = langfuseObservation(item, { environment: 'synthetic', protection: 'free' }, pseudonym);
    return observation === undefined ? [] : [rowOf(observation.spans[0]!)];
  });

/* The same settlement as `langfuse-v4.3` wrote it: a family and a source beside the same facts. */
const asV43 = (row: LangfuseObservationRow): LangfuseObservationRow => ({
  ...row,
  id: `${row.id}-v4.3`,
  metadata: { ...row.metadata, mapper: 'langfuse-v4.3', family: 'financial', source: `source-${row.id}` },
});

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
    attemptKey: 'attempt-1',
    projectHint: 'project-a',
    chatHint: 'chat-1',
    admittedAt: new Date(at),
    activationId: 'activation-1',
  },
  receipt: { terminalRevision: 1n, chargedAtoms, supplierCostPicoUsd, resolvedAt: new Date(at + 1000) },
  normalization: 'openai-responses-v1',
});

const settlements = async (): Promise<Evidence[]> =>
  Promise.all([
    settlementEvidence(settlement('op-1', 2_500_000n, 750_000_000_000n), 'user-a', {
      ...authority,
      project: 'project-a',
    }),
    settlementEvidence(settlement('op-2', 1_000_000n, null), 'user-a', { ...authority, project: 'project-a' }),
  ]);

describe('scoreObservations', () => {
  it('costs settlements from Langfuse exactly as the evidence does, from v5 and v4.3 rows alike', async () => {
    const evidence = await settlements();
    const [first, second] = delivered(evidence);

    const fromLangfuse = scoreObservations([first!, asV43(second!)]);

    expect(fromLangfuse.cost).toEqual(scorecard(evidence).attempts.cost);
    expect(fromLangfuse.cost).toMatchObject({ settlements: 2, credits: 3.5, supplierCostUnknown: 1 });
    expect(fromLangfuse.reconciliation).toEqual({ read: 2, duplicates: 0, unscorable: 0 });
    const read = JSON.stringify(fromLangfuse);
    for (const id of ['attempt-1', 'chat-1', 'user-a', 'project-a', 'op-1']) {
      expect(read).not.toContain(id);
    }
  });

  it('counts a settlement once across replays and mappers, and reads no other row', async () => {
    const rows = delivered(await settlements());
    const generation = delivered([await providerAttemptEvidence(attempt(), authority)]);
    const older = { ...rows[0]!, id: 'older', metadata: { ...rows[0]!.metadata, mapper: 'langfuse-v4.1' } };
    const timed = { ...rows[1]!, id: 'timed', metadata: { ...rows[1]!.metadata, intervals: '[["admission"' } };

    const card = scoreObservations([...rows, ...rows.map((item) => asV43(item)), ...generation, older, timed]);

    expect(card.reconciliation).toEqual({ read: 7, duplicates: 3, unscorable: 2 });
    expect(card.cost).toMatchObject({ settlements: 2, credits: 3.5 });
    expect(Object.keys(card)).toEqual(['reconciliation', 'cost']);
  });
});
