import { billingBudget, billingBudgetFunding } from '#database/schema.js';
import type { DatabaseType } from '#database/database.service.js';

const developmentEnvironment = 'development';

/* One lifetime-funded period per budget covers local proofs; raise the cap rather than
 * adding periods or a flag. ponytail: deliberate. */
/* $10,000 in pico USD: admission holds the whole-context supplier maximum per turn (up to ~$26 for the
 * largest route) and the API allows four pending turns per account, so a $10 cap denied a quarter of the routes. */
const developmentBudgetCap = 10_000_000_000_000_000n;
const developmentBudgets = [
  { id: 'development-spend', kind: 'spend' },
  { id: 'development-risk', kind: 'risk' },
] as const;

/** The two supplier budget ids every development tariff route points at. */
export const developmentBudgetIds = {
  spendBudgetId: developmentBudgets[0].id,
  riskBudgetId: developmentBudgets[1].id,
};

/**
 * Seeds the two supplier budgets every enabled development policy route points at; without
 * them admission denies `budget_unavailable`. Idempotent, so `sync` can run it on every pass.
 */
export const seedDevelopmentBudgets = async (
  database: Pick<DatabaseType, 'insert'>,
): Promise<{ budgets: string[] }> => {
  await database
    .insert(billingBudgetFunding)
    .values(
      developmentBudgets.map((budget) => ({
        id: `${budget.id}-funding`,
        environment: developmentEnvironment,
        kind: budget.kind,
        scope: developmentEnvironment,
        fundedLifetime: developmentBudgetCap,
      })),
    )
    .onConflictDoNothing();
  await database
    .insert(billingBudget)
    .values(
      developmentBudgets.map((budget) => ({
        id: budget.id,
        environment: developmentEnvironment,
        fundingId: `${budget.id}-funding`,
        kind: budget.kind,
        scope: developmentEnvironment,
        periodStart: new Date('2020-01-01Z'),
        periodEnd: new Date('2030-01-01Z'),
        quantum: 'pico_usd',
        approvedCap: developmentBudgetCap,
      })),
    )
    .onConflictDoNothing();
  return { budgets: developmentBudgets.map((budget) => budget.id) };
};
