import type { CostRecord, CostScore } from '@taucad/agent-observability/scorecard';
import { summarizeAttempts } from '@taucad/agent-observability/scorecard';
import { settlementMappers } from '#langfuse-observation.js';

/**
 * T15: the settled cost read back from Langfuse. Runs, attempts and phases are scored by the Langfuse dashboards
 * (LQ10), so this reader keeps only the `tau.financial` settlements that `langfuse-v4.3` and `langfuse-v5` both write,
 * until LW4 moves their values onto the generation. It reads only closed metadata, never an input, an output or an
 * interval list.
 */

/** One observation as Langfuse's v2 observations API returns it with the `core`, `basic` and `metadata` fields. */
export type LangfuseObservationRow = Readonly<{
  id: string;
  startTime: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

/** How the observations read were counted. @public */
export type ObservationReconciliation = Readonly<{
  /** Every row read. */
  read: number;
  /** A row naming a settlement already counted: a replay, or the same settlement under another mapper version. */
  duplicates: number;
  /** A row that is not a settlement one of the accepted mapper versions wrote. */
  unscorable: number;
}>;

/** The Langfuse scorecard: the settled cost, as the evidence scorecard costs it. @public */
export type ObservationScorecard = Readonly<{ reconciliation: ObservationReconciliation; cost: CostScore }>;

const text = (metadata: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
};

/* Langfuse returns a number, or a numeric string for some stored values; anything else is unreported. */
const numeric = (metadata: Readonly<Record<string, unknown>>, key: string): CostRecord['supplierCost'] => {
  const value = metadata[key];
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

const costOf = (metadata: Readonly<Record<string, unknown>>): CostRecord => ({
  run: 'unknown',
  credits: numeric(metadata, 'fact.credits') ?? 0,
  supplierCost: numeric(metadata, 'fact.supplierCost'),
  adjustment: metadata['fact.adjustment'] === true || metadata['fact.adjustment'] === 'true',
});

/**
 * Cost Tau's Langfuse settlements: count each settlement once, by its ledger id, whichever mapper version wrote it.
 *
 * @param rows - Observations read from one environment, in any order.
 * @returns The settled cost and how the rows were counted.
 * @public
 */
export const scoreObservations = (rows: readonly LangfuseObservationRow[]): ObservationScorecard => {
  const ledgers = new Set<string>();
  const costs: CostRecord[] = [];
  let duplicates = 0;
  let unscorable = 0;
  /* Langfuse pages newest first; the earliest of two copies stands, as delivery wrote it. */
  const ordered = [...rows].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  for (const { metadata = {} } of ordered) {
    const ledger = text(metadata, 'fact.ledger');
    if (
      !settlementMappers.has(text(metadata, 'mapper') ?? '') ||
      text(metadata, 'authority') !== 'api-reported' ||
      text(metadata, 'fact.kind') !== 'financial' ||
      ledger === undefined
    ) {
      unscorable++;
    } else if (ledgers.has(ledger)) {
      duplicates++;
    } else {
      ledgers.add(ledger);
      costs.push(costOf(metadata));
    }
  }
  return {
    reconciliation: { read: rows.length, duplicates, unscorable },
    cost: summarizeAttempts([], costs).cost,
  };
};
