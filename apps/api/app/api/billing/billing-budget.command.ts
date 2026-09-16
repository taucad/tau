import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type postgres from 'postgres';
import { z } from 'zod';
import { financialEnvironmentSchema } from '@taucad/billing';

const identitySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const amountSchema = z.string().regex(/^(0|[1-9][0-9]{0,77})$/u);
const fundingSchema = z.object({
  id: identitySchema,
  kind: z.enum(['spend', 'risk']),
  scope: identitySchema,
  fundedLifetime: amountSchema,
});
const budgetSchema = z.object({
  id: identitySchema,
  fundingId: identitySchema,
  kind: z.enum(['spend', 'risk']),
  scope: identitySchema,
  periodStart: z.iso.datetime({ offset: true }),
  periodEnd: z.iso.datetime({ offset: true }),
  quantum: z.literal('pico_usd'),
  approvedCap: amountSchema,
});
const proposalSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: financialEnvironmentSchema,
    funding: z.array(fundingSchema).length(2),
    budgets: z.array(budgetSchema).length(2),
  })
  .superRefine((proposal, context) => {
    for (const kind of ['spend', 'risk'] as const) {
      const funding = proposal.funding.filter((row) => row.kind === kind);
      const budgets = proposal.budgets.filter((row) => row.kind === kind);
      if (funding.length !== 1 || budgets.length !== 1) {
        context.addIssue({ code: 'custom', message: `Proposal requires one ${kind} funding row and budget` });
        continue;
      }
      const [fundingRow] = funding;
      const [budget] = budgets;
      if (
        fundingRow === undefined ||
        budget === undefined ||
        budget.fundingId !== fundingRow.id ||
        budget.scope !== fundingRow.scope ||
        BigInt(budget.approvedCap) > BigInt(fundingRow.fundedLifetime) ||
        new Date(budget.periodStart) >= new Date(budget.periodEnd)
      ) {
        context.addIssue({ code: 'custom', message: `${kind} budget does not match its funding authority` });
      }
    }
  });

type ProvisioningResult = {
  environment: string;
  budgets: string[];
};

/** Idempotently installs the exact operator-reviewed supplier capacity proposal. */
export async function runBillingBudgetCommand(
  client: postgres.Sql,
  argv: readonly string[],
  deploymentEnvironment: string,
): Promise<ProvisioningResult> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: { environment: { type: 'string' }, file: { type: 'string' } },
  });
  if (positionals[0] !== 'provision-budgets' || !values.environment || !values.file) {
    throw new Error('Usage: provision-budgets --environment ENVIRONMENT --file JSON_FILE');
  }
  const proposal = proposalSchema.parse(JSON.parse(await readFile(values.file, 'utf8')));
  if (values.environment !== deploymentEnvironment || proposal.environment !== deploymentEnvironment) {
    throw new Error('Budget proposal environment must match the protected deployment environment');
  }

  await client.begin(async (transaction) => {
    for (const funding of proposal.funding) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction preserves proposal atomicity
      await transaction`INSERT INTO billing.billing_budget_funding(id,environment,kind,scope,funded_lifetime)
        VALUES (${funding.id},${proposal.environment},${funding.kind},${funding.scope},${funding.fundedLifetime})
        ON CONFLICT (id) DO NOTHING`;
      // oxlint-disable-next-line no-await-in-loop -- readback rejects drift in an existing financial authority
      const [actual] = await transaction`SELECT environment,kind,scope,funded_lifetime::text
        FROM billing.billing_budget_funding WHERE id = ${funding.id}`;
      if (
        actual?.['environment'] !== proposal.environment ||
        actual['kind'] !== funding.kind ||
        actual['scope'] !== funding.scope ||
        actual['funded_lifetime'] !== funding.fundedLifetime
      ) {
        throw new Error(`Existing billing funding differs from proposal: ${funding.id}`);
      }
    }
    for (const budget of proposal.budgets) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction preserves proposal atomicity
      await transaction`INSERT INTO billing.billing_budget
        (id,environment,funding_id,kind,scope,period_start,period_end,quantum,approved_cap)
        VALUES (${budget.id},${proposal.environment},${budget.fundingId},${budget.kind},${budget.scope},
          ${budget.periodStart},${budget.periodEnd},${budget.quantum},${budget.approvedCap})
        ON CONFLICT (id) DO NOTHING`;
      // oxlint-disable-next-line no-await-in-loop -- readback rejects drift in an existing financial authority
      const [actual] = await transaction`SELECT environment,funding_id,kind,scope,
          period_start::text,period_end::text,quantum,approved_cap::text
        FROM billing.billing_budget WHERE id = ${budget.id}`;
      if (
        actual?.['environment'] !== proposal.environment ||
        actual['funding_id'] !== budget.fundingId ||
        actual['kind'] !== budget.kind ||
        actual['scope'] !== budget.scope ||
        new Date(String(actual['period_start'])).toISOString() !== new Date(budget.periodStart).toISOString() ||
        new Date(String(actual['period_end'])).toISOString() !== new Date(budget.periodEnd).toISOString() ||
        actual['quantum'] !== budget.quantum ||
        actual['approved_cap'] !== budget.approvedCap
      ) {
        throw new Error(`Existing billing budget differs from proposal: ${budget.id}`);
      }
    }
  });
  return { environment: proposal.environment, budgets: proposal.budgets.map((budget) => budget.id) };
}
