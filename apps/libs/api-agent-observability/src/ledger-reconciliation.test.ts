import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { OtlpSpan, SettlementFact } from '#langfuse-observation.js';
import { langfuseObservation, pseudonymKey } from '#langfuse-observation.js';
import { providerAttemptEvidence } from '#model-invocation-evidence.js';
import type { LangfuseObservationRow } from '#langfuse-scorecard.js';
import type { LedgerSettlement } from '#ledger-reconciliation.js';
import { reconcileLedger } from '#ledger-reconciliation.js';
import type { ObservedSettlement } from '@taucad/api-billing';
import { settlementEvidence } from '#settlement-evidence.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');
const pseudonym = pseudonymKey(Uint8Array.from(randomBytes(32)));
const metadataPrefix = 'langfuse.observation.metadata.';
const authority = { policyEpoch: 'epoch-1', protection: 'free', project: 'project-a' } as const;

/* What Langfuse's v2 observations API returns for a span's metadata: an integer comes back as a number. */
const rowOf = (span: OtlpSpan): LangfuseObservationRow => {
  const metadata: Record<string, unknown> = {};
  for (const { key, value } of span.attributes) {
    const scalar = Object.values(value)[0] as unknown;
    if (key.startsWith(metadataPrefix)) {
      metadata[key.slice(metadataPrefix.length)] = 'intValue' in value ? Number(scalar) : scalar;
    }
  }
  return { id: span.spanId, startTime: new Date(at).toISOString(), metadata };
};

const settled = (operation: string, chargedAtoms: bigint, terminalRevision = 1n): ObservedSettlement => ({
  operation: {
    id: operation,
    accountId: 'account-a',
    environment: 'synthetic',
    attemptKey: `run-1:1:${operation}`,
    projectHint: 'project-a',
    chatHint: 'chat-1',
    admittedAt: new Date(at),
    activationId: 'activation-1',
  },
  receipt: { terminalRevision, chargedAtoms, supplierCostPicoUsd: null, resolvedAt: new Date(at + 1000) },
  normalization: 'openai-responses-v1',
});

/* The generation of the call a settlement settled, as delivery sends it: with the settlement's values, or without. */
const generationOf = async (settlement: ObservedSettlement, carried: boolean): Promise<LangfuseObservationRow> => {
  const call = await providerAttemptEvidence(
    {
      principal: 'user-a',
      project: 'project-a',
      attemptKey: settlement.operation.attemptKey,
      chat: 'chat-1',
      surface: 'gateway',
      wire: 'anthropic',
      requestedModel: undefined,
      provider: undefined,
      operation: settlement.operation.id,
      startedAt: at,
      duration: 900,
      stream: undefined,
      ended: 'completed',
    },
    authority,
  );
  const evidence = await settlementEvidence(settlement, 'user-a', authority);
  const fact = evidence.payload.fact as SettlementFact;
  const observation = langfuseObservation(
    call,
    { environment: 'synthetic', protection: 'free', settlement: carried ? fact : undefined },
    pseudonym,
  );
  return rowOf(observation!.spans[0]!);
};

/* Each settlement's generation, carrying its values. */
const delivered = async (settlements: readonly ObservedSettlement[]): Promise<LangfuseObservationRow[]> =>
  Promise.all(settlements.map(async (settlement) => generationOf(settlement, true)));

const ledgerOf = ({ operation, receipt }: ObservedSettlement, principal = 'user-a'): LedgerSettlement => ({
  principal,
  operation: operation.id,
  terminalRevision: receipt.terminalRevision,
  chargedAtoms: receipt.chargedAtoms,
});

describe('reconcileLedger', () => {
  it('matches each settlement Langfuse holds to the ledger, and counts one it does not hold as missing', async () => {
    const charged = [settled('op-1', 2_500_000n), settled('op-2', 333_333n), settled('op-3', 1_000_000n)];
    const rows = await delivered(charged.slice(0, 2));

    const reconciliation = await reconcileLedger(
      charged.map((settlement) => ledgerOf(settlement)),
      [...rows, ...rows],
      'synthetic',
    );

    expect(reconciliation).toEqual({
      ledger: { settlements: 3, credits: 3.833333 },
      observed: { settlements: 2, credits: 2.833333 },
      matched: 2,
      missing: { settlements: 1, credits: 1 },
      unexpected: { settlements: 0, credits: 0 },
      mismatched: 0,
      drift: 0,
    });
  });

  it('reports a changed charge as drift and a settlement the ledger does not hold as unexpected', async () => {
    const rows = await delivered([settled('op-1', 2_000_000n), settled('op-2', 500_000n), settled('op-4', 100n)]);

    const reconciliation = await reconcileLedger(
      [ledgerOf(settled('op-1', 2_000_000n)), ledgerOf(settled('op-2', 400_000n)), ledgerOf(settled('op-3', 1n, 2n))],
      rows,
      'synthetic',
    );

    expect(reconciliation).toMatchObject({
      matched: 1,
      mismatched: 1,
      drift: 0.1,
      missing: { settlements: 1 },
      unexpected: { settlements: 1, credits: 0.0001 },
    });
  });

  it('reads a late settlement, whose generation went without its values, as missing and never as drift', async () => {
    const charged = [settled('op-1', 2_000_000n), settled('op-2', 500_000n)];
    const rows = [await generationOf(charged[0]!, true), await generationOf(charged[1]!, false)];

    const reconciliation = await reconcileLedger(
      charged.map((settlement) => ledgerOf(settlement)),
      rows,
      'synthetic',
    );

    expect(reconciliation).toMatchObject({
      matched: 1,
      missing: { settlements: 1, credits: 0.5 },
      unexpected: { settlements: 0 },
      mismatched: 0,
      drift: 0,
    });
  });

  it('reads only v5 generations the API reported, and no longer reads a tau.financial row', async () => {
    const charged = settled('op-1', 2_000_000n);
    const [row] = await delivered([charged]);
    const ledger = [ledgerOf(charged)];
    /* A settlement span as LW2 wrote it: the same values under `fact.*` keys. */
    const span = {
      ...row!,
      metadata: {
        mapper: 'langfuse-v5',
        authority: 'api-reported',
        'fact.kind': 'financial',
        'fact.ledger': row!.metadata!['ledger'],
        'fact.credits': 2,
      },
    };

    await expect(reconcileLedger(ledger, [span], 'synthetic')).resolves.toMatchObject({
      matched: 0,
      missing: { settlements: 1 },
    });
    for (const metadata of [
      { ...row!.metadata, mapper: 'langfuse-v4.3' },
      { ...row!.metadata, authority: 'host-reported' },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- two independent readings of one fixture
      await expect(reconcileLedger(ledger, [{ ...row!, metadata }], 'synthetic')).resolves.toMatchObject({
        matched: 0,
        missing: { settlements: 1 },
      });
    }
    /* A replay of the same generation is one settlement. */
    await expect(reconcileLedger(ledger, [row!, row!], 'synthetic')).resolves.toMatchObject({
      matched: 1,
      observed: { settlements: 1, credits: 2 },
    });
  });

  it("never joins another principal's settlement, a later revision, or another environment", async () => {
    const charged = settled('op-1', 2_000_000n);
    const rows = await delivered([charged]);

    const reconciliations = await Promise.all(
      (
        [
          [ledgerOf(charged, 'user-b'), 'synthetic'],
          [ledgerOf(settled('op-1', 2_000_000n, 2n)), 'synthetic'],
          [ledgerOf(charged), 'production'],
        ] as const
      ).map(async ([ledger, environment]) => reconcileLedger([ledger], rows, environment)),
    );

    for (const reconciliation of reconciliations) {
      expect(reconciliation).toMatchObject({ matched: 0, unexpected: { settlements: 1 } });
    }
  });
});
