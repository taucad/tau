import type { creditOperation } from '@taucad/api-database/schema';
import type { TerminalReceipt } from '#credit-ledger.types.js';

/** One funded operation the ledger has just terminalized, live or by recovery. */
export type ObservedSettlement = Readonly<{
  operation: Pick<
    typeof creditOperation.$inferSelect,
    'id' | 'accountId' | 'environment' | 'attemptKey' | 'projectHint' | 'chatHint' | 'admittedAt' | 'activationId'
  >;
  receipt: Pick<TerminalReceipt, 'terminalRevision' | 'chargedAtoms' | 'supplierCostPicoUsd' | 'resolvedAt'>;
  /** The terminal evidence's normalization version, when it carries one. */
  normalization: string | undefined;
}>;
