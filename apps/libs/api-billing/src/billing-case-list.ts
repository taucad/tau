import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { DatabaseService } from '@taucad/api-database';
import { billingFinancialCase } from '@taucad/api-database/schema';
import type { FinancialEnvironment } from '#billing-policy.js';

/** The states a financial case row can hold. */
export const financialCaseStates = ['open', 'attention', 'resolved'] as const;

type FinancialCaseRow = typeof billingFinancialCase.$inferSelect;

/**
 * One listed financial case: what an operator needs to triage and close it. Evidence and customer
 * fields are left out so the output can be pasted into an incident record.
 */
export type FinancialCaseListing = Pick<
  FinancialCaseRow,
  | 'id'
  | 'kind'
  | 'state'
  | 'accountId'
  | 'sourceType'
  | 'sourceId'
  | 'currency'
  | 'knownAmountMinor'
  | 'owner'
  | 'nextStep'
  | 'deadlineAt'
  | 'firstSeenAt'
  | 'lastSeenAt'
> & {
  /** Whether the case names an account; an unattributed case is operator work. */
  readonly attributed: boolean;
  /** Whole seconds since the case was first seen, on the database clock. */
  readonly ageSeconds: number;
};

/**
 * Lists the financial cases of one Stripe scope, oldest first, for the `list-cases` lifecycle operation.
 * Read-only: it filters on the same environment, Stripe account and mode as `resolveCaseByOperator`,
 * so every listed id can be passed to `resolve-case` unchanged.
 */
export async function listFinancialCases(
  databaseService: Pick<DatabaseService, 'database'>,
  scope: { readonly environment: FinancialEnvironment; readonly stripeAccountId: string; readonly livemode: boolean },
  filter: {
    readonly state: ReadonlyArray<(typeof financialCaseStates)[number]>;
    readonly attributed: 'any' | boolean;
    readonly limit: number;
  },
): Promise<{ readonly cases: readonly FinancialCaseListing[] }> {
  let attribution: SQL | undefined;
  if (filter.attributed !== 'any') {
    attribution = filter.attributed
      ? isNotNull(billingFinancialCase.accountId)
      : isNull(billingFinancialCase.accountId);
  }
  const rows = await databaseService.database.query.billingFinancialCase.findMany({
    columns: {
      id: true,
      kind: true,
      state: true,
      accountId: true,
      sourceType: true,
      sourceId: true,
      currency: true,
      knownAmountMinor: true,
      owner: true,
      nextStep: true,
      deadlineAt: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
    extras: (table, { sql }) => ({
      ageSeconds: sql<number>`extract(epoch FROM clock_timestamp() - ${table.firstSeenAt})::int`.as('age_seconds'),
    }),
    where: and(
      eq(billingFinancialCase.environment, scope.environment),
      eq(billingFinancialCase.stripeAccountId, scope.stripeAccountId),
      eq(billingFinancialCase.livemode, scope.livemode),
      inArray(billingFinancialCase.state, [...filter.state]),
      attribution,
    ),
    orderBy: [asc(billingFinancialCase.firstSeenAt), asc(billingFinancialCase.id)],
    limit: filter.limit,
  });
  return {
    cases: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      state: row.state,
      attributed: row.accountId !== null,
      accountId: row.accountId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      currency: row.currency,
      knownAmountMinor: row.knownAmountMinor,
      owner: row.owner,
      nextStep: row.nextStep,
      deadlineAt: row.deadlineAt,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      ageSeconds: row.ageSeconds,
    })),
  };
}
