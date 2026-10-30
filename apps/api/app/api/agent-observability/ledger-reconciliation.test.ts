import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { OtlpSpan } from '#api/agent-observability/langfuse-observation.js';
import { langfuseObservation, pseudonymKey } from '#api/agent-observability/langfuse-observation.js';
import type { LangfuseObservationRow } from '#api/agent-observability/langfuse-scorecard.js';
import type { LedgerSettlement } from '#api/agent-observability/ledger-reconciliation.js';
import { reconcileLedger } from '#api/agent-observability/ledger-reconciliation.js';
import type { ObservedSettlement } from '#api/agent-observability/settlement-evidence.js';
import { settlementEvidence } from '#api/agent-observability/settlement-evidence.js';

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

let receipts = 0;
const delivered = async (settlements: readonly ObservedSettlement[]): Promise<LangfuseObservationRow[]> =>
  Promise.all(
    settlements.map(async (settlement) => {
      receipts++;
      const evidence = await settlementEvidence(settlement, 'user-a', authority);
      const { span } = langfuseObservation(
        evidence,
        { environment: 'synthetic', receipt: `evr_${receipts}`, protection: 'free' },
        pseudonym,
      );
      return rowOf(span);
    }),
  );

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
