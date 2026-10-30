import { contractId } from '@taucad/agent-observability/identity';
import { observationGroup, observationMapperVersion } from '#api/agent-observability/langfuse-observation.js';
import type { LangfuseObservationRow } from '#api/agent-observability/langfuse-scorecard.js';
import { creditsOfAtoms } from '#api/agent-observability/settlement-evidence.js';

/*
 * T15 (U36): the settled credits Langfuse holds, checked against the ledger
 * that settled them. The ledger is the financial truth; Langfuse holds a copy
 * for analysis. Every observed settlement must name a ledger settlement and
 * carry its charge exactly. A ledger settlement Langfuse does not hold is
 * counted apart: the account may not have allowed summaries, or delivery is
 * still behind, so it is coverage, never drift.
 */

/** One terminal settlement, as the ledger holds it. @public */
export type LedgerSettlement = Readonly<{
  /** The Tau user the funded account's owner was when it settled. */
  principal: string;
  operation: string;
  terminalRevision: bigint;
  chargedAtoms: bigint;
}>;

/** Settlements and their credits. @public */
export type SettlementTotal = Readonly<{ settlements: number; credits: number }>;

/** How the settled credits Langfuse holds compare with the ledger. @public */
export type LedgerReconciliation = Readonly<{
  ledger: SettlementTotal;
  observed: SettlementTotal;
  /** Observed settlements that carry the ledger's charge exactly. */
  matched: number;
  /** Ledger settlements Langfuse does not hold: not permitted or not yet delivered. */
  missing: SettlementTotal;
  /** Observed settlements naming no ledger settlement in the window. */
  unexpected: SettlementTotal;
  /** Observed settlements whose charge differs from the ledger's. */
  mismatched: number;
  /** Observed credits less the ledger's, over the settlements both hold. */
  drift: number;
}>;

const text = (metadata: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
};

/* Credits compare as whole atoms, so a charge round-tripped through Langfuse's doubles never reads as drift. */
const atomsOf = (credits: number): number => Math.round(credits * 1_000_000);

const totalOf = (atoms: readonly number[]): SettlementTotal => ({
  settlements: atoms.length,
  credits: creditsOfAtoms(BigInt(atoms.reduce((sum, value) => sum + value, 0))),
});

/**
 * Compare the settlements Langfuse holds with the ledger's, settlement by settlement.
 *
 * @param settlements - The ledger's terminal settlements in the window.
 * @param rows - Observations read from the same environment and window.
 * @param environment - The Langfuse environment the rows were read from.
 * @returns What matched, what is missing, and any drift.
 * @public
 */
export const reconcileLedger = async (
  settlements: readonly LedgerSettlement[],
  rows: readonly LangfuseObservationRow[],
  environment: string,
): Promise<LedgerReconciliation> => {
  const expected = new Map(
    await Promise.all(
      settlements.map(async (settlement) => {
        const ledger = await contractId('ledger', `${settlement.operation}:${settlement.terminalRevision}`);
        return [observationGroup(environment, settlement.principal, ledger), Number(settlement.chargedAtoms)] as const;
      }),
    ),
  );
  /* One settlement is one fact: a replay or another projector version of it names the same source. */
  const observed = new Map<string, number>();
  const sources = new Set<string>();
  for (const { metadata = {} } of rows) {
    const source = text(metadata, 'source');
    const ledger = text(metadata, 'fact.ledger');
    const value = metadata['fact.credits'];
    /* Langfuse returns a number, or a numeric string for some stored values; anything else carries no charge. */
    const credits = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (
      text(metadata, 'mapper') === observationMapperVersion &&
      text(metadata, 'authority') === 'api-reported' &&
      text(metadata, 'family') === 'financial' &&
      source !== undefined &&
      !sources.has(source) &&
      ledger !== undefined &&
      typeof credits === 'number' &&
      Number.isFinite(credits)
    ) {
      sources.add(source);
      observed.set(ledger, atomsOf(credits));
    }
  }
  const held = [...observed].filter(([ledger]) => expected.has(ledger));
  const mismatched = held.filter(([ledger, atoms]) => expected.get(ledger) !== atoms);
  const drift = held.reduce((sum, [ledger, atoms]) => sum + atoms - (expected.get(ledger) ?? 0), 0);
  return {
    ledger: totalOf([...expected.values()]),
    observed: totalOf([...observed.values()]),
    matched: held.length - mismatched.length,
    missing: totalOf([...expected].filter(([ledger]) => !observed.has(ledger)).map(([, atoms]) => atoms)),
    unexpected: totalOf([...observed].filter(([ledger]) => !expected.has(ledger)).map(([, atoms]) => atoms)),
    mismatched: mismatched.length,
    drift: drift / 1_000_000,
  };
};
