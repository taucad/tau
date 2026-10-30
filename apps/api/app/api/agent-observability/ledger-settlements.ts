import { and, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { billingOwnerBinding, creditOperation } from '#database/schema.js';
import type { LedgerSettlement } from '#api/agent-observability/ledger-reconciliation.js';

/** The ledger window a reconciliation reads. @public */
export type LedgerWindow = Readonly<{
  /** The billing environment, as the ledger names it. */
  environment: string;
  /** Inclusive, by when the ledger resolved the operation. */
  from: Date;
  /** Exclusive. */
  to: Date;
}>;

/**
 * The ledger's terminal settlements in a window, each under its account's
 * active owner, for `reconcileLedger` (T15, U36). It reads only what a
 * settlement fact could have been admitted for: a resolved operation with a
 * project hint, on an account that still has an owner. The owner is read now,
 * so a settlement from before an ownership change reads as the new owner's
 * and is reported apart, never joined to another user's fact.
 *
 * @param database - The billing database.
 * @param window - The environment and resolution window.
 * @returns One settlement per terminal operation.
 * @public
 */
export const ledgerSettlements = async (database: Database, window: LedgerWindow): Promise<LedgerSettlement[]> => {
  const rows = await database
    .select({
      principal: billingOwnerBinding.authUserId,
      operation: creditOperation.id,
      terminalRevision: creditOperation.terminalRevision,
      chargedAtoms: creditOperation.chargedAtoms,
    })
    .from(creditOperation)
    .innerJoin(
      billingOwnerBinding,
      and(
        eq(billingOwnerBinding.accountId, creditOperation.accountId),
        eq(billingOwnerBinding.environment, creditOperation.environment),
        isNull(billingOwnerBinding.revokedAt),
        isNotNull(billingOwnerBinding.authUserId),
      ),
    )
    .where(
      and(
        eq(creditOperation.environment, window.environment),
        isNotNull(creditOperation.projectHint),
        isNotNull(creditOperation.terminalRevision),
        isNotNull(creditOperation.chargedAtoms),
        gte(creditOperation.resolvedAt, window.from),
        lt(creditOperation.resolvedAt, window.to),
      ),
    );
  return rows.flatMap(({ principal, operation, terminalRevision, chargedAtoms }) =>
    principal === null || terminalRevision === null || chargedAtoms === null
      ? []
      : [{ principal, operation, terminalRevision, chargedAtoms }],
  );
};
