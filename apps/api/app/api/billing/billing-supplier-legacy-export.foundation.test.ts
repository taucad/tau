import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, onTestFinished } from 'vitest';
import postgres from 'postgres';
import {
  createSupplierLegacyStore,
  deleteSupplierLegacy,
  exportSupplierLegacy,
} from '#api/billing/billing-supplier-legacy-export.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
/* The fixture login owns the schema, as the deployment's owner identity does. */
const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice() {
    /* Expected fixture notices are not diagnostics. */
  },
});
afterAll(async () => client.end());

const environment = 'prod-us';

/** Legacy supplier rows as an upgraded database holds them, beside rows the export must leave alone. */
const seedLegacyRows = async () => {
  const id = randomUUID();
  const ids = {
    account: `legacy-account-${id}`,
    policy: `legacy-policy-${id}`,
    activation: `legacy-activation-${id}`,
    operation: `legacy-operation-${id}`,
    spendBudget: `legacy-spend-${id}`,
    riskBudget: `legacy-risk-${id}`,
    promotionBudget: `legacy-promotion-${id}`,
    hold: `legacy-hold-${id}`,
    automaticPause: `legacy-automatic-${id}`,
    operatorPause: `legacy-operator-${id}`,
    evidence: `legacy-evidence-${id}`,
  };
  await client.begin(async (transaction) => {
    await transaction`INSERT INTO billing.credit_account(id, environment) VALUES (${ids.account}, ${environment})`;
    await transaction`INSERT INTO billing.billing_policy(id, environment, policy_version, schema_version, content_hash, canonical_content)
      VALUES (${ids.policy}, ${environment}, ${ids.policy}, 1, ${ids.policy}, '{}')`;
    await transaction`INSERT INTO billing.billing_policy_activation(id, environment, policy_id, job_key, request_hash, announced_at, effective_at)
      VALUES (${ids.activation}, ${environment}, ${ids.policy}, ${ids.activation}, ${ids.activation}, now(), now())`;
    for (const [budget, kind] of [
      [ids.spendBudget, 'spend'],
      [ids.riskBudget, 'risk'],
      [ids.promotionBudget, 'promotion_issuance'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one fixture transaction
      await transaction`INSERT INTO billing.billing_budget_funding(id, environment, kind, scope, funded_lifetime)
        VALUES (${`${budget}-funding`}, ${environment}, ${kind}, ${id}, 500000000000000)`;
      // oxlint-disable-next-line no-await-in-loop -- one fixture transaction
      await transaction`INSERT INTO billing.billing_budget(id, environment, funding_id, kind, scope, period_start, period_end, quantum, approved_cap)
        VALUES (${budget}, ${environment}, ${`${budget}-funding`}, ${kind}, ${id}, now(), now() + interval '1 day', 'pico_usd', 500000000000000)`;
    }
    await transaction`INSERT INTO billing.credit_operation(id, account_id, environment, surface, attempt_key, request_digest,
        request_key_version, category, model_id, sku, pinned_tariff, maximum_quantities, activity, policy_id, activation_id,
        meter_contract_id, authorized_atoms, promo_held_atoms, plan_held_atoms, purchased_held_atoms, due_at)
      VALUES (${ids.operation}, ${ids.account}, ${environment}, 'fixture', ${ids.operation}, 'digest', 1, 'llm', 'fixture',
        'model:legacy', '[]', '[]', 'agent', ${ids.policy}, ${ids.activation}, 'fixture', 0, 0, 0, 0, now())`;
    await transaction`INSERT INTO billing.billing_budget_hold(id, budget_id, operation_id, initial_bound, remaining_held)
      VALUES (${ids.hold}, ${ids.spendBudget}, ${ids.operation}, 10, 0)`;
    await transaction`INSERT INTO billing.billing_route_pause(id, environment, sku, operation_id, actor, reason,
        resumed_at, resumed_by, resume_reason)
      VALUES (${ids.automaticPause}, ${environment}, ${`model:legacy-${id}`}, ${ids.operation}, 'automatic', 'retail_overrun',
        now(), 'migration-0049', 'superseded_by_charter'),
        (${ids.operatorPause}, ${environment}, ${`model:operator-${id}`}, NULL, 'op', 'Provider incident', NULL, NULL, NULL)`;
    await transaction`INSERT INTO billing.supplier_cost_evidence(id, operation_id, environment, provider, credential_account,
        source_object_id, source_revision, payload_digest, numerator, denominator, currency, completeness, finality, received_at)
      VALUES (${ids.evidence}, ${ids.operation}, ${environment}, 'anthropic', 'credential', ${ids.operation},
        'provider_rejected_v1', 'sha256:fixture', 0, 1, 'usd', 'complete', 'final', now())`;
  });
  return ids;
};

const exists = async (table: string, id: string): Promise<boolean> => {
  const rows = await client.unsafe(`SELECT 1 FROM billing.${table} WHERE id = $1`, [id]);
  return rows.length === 1;
};

describe('supplier legacy export against the owner identity', () => {
  it('should export the retired rows with digests, then delete only the budget, hold and automatic pause rows', async () => {
    const ids = await seedLegacyRows();
    const directory = await mkdtemp(join(tmpdir(), 'tau-supplier-legacy-'));
    onTestFinished(async () => rm(directory, { recursive: true, force: true }));
    const store = createSupplierLegacyStore(client, environment);

    const manifest = await exportSupplierLegacy({ store, environment, outDirectory: directory, now: new Date() });

    const csv = async (table: string) => {
      const content = await readFile(join(directory, `${table}.csv`), 'utf8');
      return content.split('\n');
    };
    for (const file of manifest.files) {
      // oxlint-disable-next-line no-await-in-loop -- each file is checked against its manifest entry
      const lines = await csv(file.table);
      // A header line and a trailing newline around the rows.
      expect(lines.length - 2).toBe(file.rows);
    }
    const budgets = await csv('billing_budget');
    expect(budgets.some((line) => line.includes(ids.spendBudget))).toBe(true);
    expect(budgets.some((line) => line.includes(ids.riskBudget))).toBe(true);
    expect(budgets.some((line) => line.includes(ids.promotionBudget))).toBe(false);
    const holds = await csv('billing_budget_hold');
    expect(holds.some((line) => line.includes(ids.hold))).toBe(true);
    const pauses = await csv('billing_route_pause');
    expect(pauses[0]?.split(',')).toEqual(expect.arrayContaining(['id', 'operation_id', 'actor', 'resumed_by']));
    expect(pauses.some((line) => line.includes(ids.automaticPause))).toBe(true);
    expect(pauses.some((line) => line.includes(ids.operatorPause))).toBe(false);
    const evidence = await csv('supplier_cost_evidence');
    expect(evidence.some((line) => line.includes(ids.evidence))).toBe(true);

    const deletion = await deleteSupplierLegacy({ store, environment, outDirectory: directory, now: new Date() });

    expect(deletion.deleted).toEqual(
      Object.fromEntries(
        manifest.files
          .filter(({ table }) => table !== 'supplier_cost_evidence')
          .map(({ table, rows }) => [table, rows]),
      ),
    );
    expect({
      spend: await exists('billing_budget', ids.spendBudget),
      risk: await exists('billing_budget', ids.riskBudget),
      spendFunding: await exists('billing_budget_funding', `${ids.spendBudget}-funding`),
      hold: await exists('billing_budget_hold', ids.hold),
      automaticPause: await exists('billing_route_pause', ids.automaticPause),
      promotion: await exists('billing_budget', ids.promotionBudget),
      promotionFunding: await exists('billing_budget_funding', `${ids.promotionBudget}-funding`),
      operatorPause: await exists('billing_route_pause', ids.operatorPause),
      evidence: await exists('supplier_cost_evidence', ids.evidence),
    }).toEqual({
      spend: false,
      risk: false,
      spendFunding: false,
      hold: false,
      automaticPause: false,
      promotion: true,
      promotionFunding: true,
      operatorPause: true,
      evidence: true,
    });
  });

  it('should refuse to delete when rows changed after the export, deleting nothing', async () => {
    const ids = await seedLegacyRows();
    const directory = await mkdtemp(join(tmpdir(), 'tau-supplier-legacy-'));
    onTestFinished(async () => rm(directory, { recursive: true, force: true }));
    const store = createSupplierLegacyStore(client, environment);
    await exportSupplierLegacy({ store, environment, outDirectory: directory, now: new Date() });
    await client`UPDATE billing.billing_budget SET consumed = 1 WHERE id = ${ids.riskBudget}`;

    await expect(
      deleteSupplierLegacy({ store, environment, outDirectory: directory, now: new Date() }),
    ).rejects.toThrow('billing_budget changed since the export; export again before deleting');
    expect(await exists('billing_budget', ids.spendBudget)).toBe(true);
    expect(await exists('billing_budget_hold', ids.hold)).toBe(true);
  });
});
