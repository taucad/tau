import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { creditOperation, user } from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { QualifiedAdmissionInput } from '#api/billing/credit-ledger.types.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';
import { fulfillPaidFixture, seedPaidPurchase } from '#testing/billing-payment.fixture.js';
import type { OtlpSpan } from '#api/agent-observability/langfuse-observation.js';
import { langfuseObservation, pseudonymKey } from '#api/agent-observability/langfuse-observation.js';
import type { LangfuseObservationRow } from '#api/agent-observability/langfuse-scorecard.js';
import { reconcileLedger } from '#api/agent-observability/ledger-reconciliation.js';
import { ledgerSettlements } from '#api/agent-observability/ledger-settlements.js';
import { settlementEvidence } from '#api/agent-observability/settlement-evidence.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client, { schema });
const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
afterAll(async () => client.end());

const environment = 'development';

const createFixture = async () => {
  const suffix = randomUUID();
  const userId = `settlements-user-${suffix}`;
  const sku = `settlements-sku-${suffix}`;
  const meterContractId = `settlements-meter-${suffix}`;
  const rateId = `settlements-rate-${suffix}`;
  await database
    .insert(user)
    .values({ id: userId, name: 'Settlements owner', email: `${suffix}@test.invalid`, emailVerified: true });
  qualifiedMeterContracts.set(meterContractId, new Set(['uncached_input:']));
  const policy = validateCommercialPolicy({
    schemaVersion: 1,
    environment,
    markupBps: 0,
    offers: [
      {
        offerId: `settlements-pro-${suffix}`,
        kind: 'pro_monthly',
        currency: 'usd',
        principalMinor: '1',
        grantCreditAtoms: '1',
        ceilingCreditAtoms: '1',
      },
      {
        offerId: `settlements-top-up-${suffix}`,
        kind: 'top_up',
        currency: 'usd',
        minimumPrincipalMinor: '1',
        maximumPrincipalMinor: '1',
        creditAtomsPerPrincipalMinor: '1',
      },
    ],
    promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    policyVersion: `settlements-${suffix}`,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId] },
    rates: [
      {
        rateId,
        meterContractId,
        dimension: 'uncached_input',
        tier: null,
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
    ],
    routes: [{ routeId: `settlements-route-${suffix}`, sku, meterContractId, rateIds: [rateId], enabled: true }],
  });
  await seedBillingFixturePolicy({ database, policy: policy.policy, activationId: `settlements-activation-${suffix}` });
  const accountId = await ledger.ensureAccountBinding({ environment, authUserId: userId });
  const { purchaseId } = await seedPaidPurchase({ database, accountId, environment, atoms: 1000n });
  await fulfillPaidFixture({ database, ledger, source: 'purchased', accountId, causeId: purchaseId });
  return { userId, accountId, sku, replica: { schemaVersion: 1, meterContractIds: [meterContractId] } };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const admission = (fixture: Fixture, key: string, projectHint: string | undefined): QualifiedAdmissionInput => ({
  environment,
  authUserId: fixture.userId,
  surface: 'chat',
  attemptKey: key,
  requestDigest: `sha256:${key}`,
  requestKeyVersion: 1,
  category: 'llm',
  modelId: 'settlements-model',
  modelDisplayName: 'Settlements Model',
  providerId: 'provider-test',
  activity: 'agent',
  ...(projectHint === undefined ? {} : { projectHint }),
  chatHint: 'chat-hint',
  sku: fixture.sku,
  maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: 10n }],
  replica: fixture.replica,
  executionDeadline: new Date(Date.now() + 300_000),
});

const admitted = async (fixture: Fixture, key: string, projectHint?: string) => {
  const result = await ledger.admitOperation(admission(fixture, key, projectHint));
  if (result.status !== 'admitted') {
    throw new Error(`${key} was not admitted`);
  }
  expect(await ledger.markDispatchIntent(result.operationId, result.generation)).toBe(true);
  return result;
};

const settle = async (fixture: Fixture, key: string, input: [projectHint: string | undefined, tokens: bigint]) => {
  const [projectHint, tokens] = input;
  const { operationId, generation } = await admitted(fixture, key, projectHint);
  const receipt = await ledger.terminalizeOperation({
    operationId,
    accountId: fixture.accountId,
    requestDigest: `sha256:${key}`,
    expectedGeneration: generation,
    evidence: {
      kind: 'final_usage',
      usageOccurredAt: new Date(),
      executionStatus: 'succeeded',
      meterItems: [{ dimension: 'uncached_input', tier: null, quantity: tokens }],
      normalizationEvidence: { version: 'test-v1', providerRequestId: `request-${key}`, fields: {} },
    },
    resolvedAt: new Date(),
  });
  const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, operationId));
  return { operation: operation!, receipt };
};

const metadataPrefix = 'langfuse.observation.metadata.';
/* What Langfuse's v2 observations API returns for a span's metadata: an integer comes back as a number. */
const rowOf = (span: OtlpSpan): LangfuseObservationRow => {
  const metadata: Record<string, unknown> = {};
  for (const { key, value } of span.attributes) {
    const scalar = Object.values(value)[0] as unknown;
    if (key.startsWith(metadataPrefix)) {
      metadata[key.slice(metadataPrefix.length)] = 'intValue' in value ? Number(scalar) : scalar;
    }
  }
  return { id: span.spanId, startTime: new Date().toISOString(), metadata };
};

describe('ledgerSettlements PostgreSQL foundation', () => {
  it("reads a window's terminal settlements under the account owner and reconciles them with the facts written for them", async () => {
    const fixture = await createFixture();
    const from = new Date(Date.now() - 1000);
    const charged = [
      await settle(fixture, `charged-a-${randomUUID()}`, ['project-a', 7n]),
      await settle(fixture, `charged-b-${randomUUID()}`, ['project-a', 3n]),
    ];
    const unscoped = await settle(fixture, `unscoped-${randomUUID()}`, [undefined, 5n]);
    const pending = await admitted(fixture, `pending-${randomUUID()}`, 'project-a');
    const window = { environment, from, to: new Date(Date.now() + 1000) };

    const settlements = (await ledgerSettlements(database, window)).filter(
      ({ principal }) => principal === fixture.userId,
    );

    expect(settlements.toSorted((a, b) => Number(b.chargedAtoms - a.chargedAtoms))).toEqual(
      charged.map(({ operation, receipt }) => ({
        principal: fixture.userId,
        operation: operation.id,
        terminalRevision: receipt.terminalRevision,
        chargedAtoms: receipt.chargedAtoms,
      })),
    );
    expect(charged.map(({ receipt }) => receipt.chargedAtoms)).toEqual([7n, 3n]);
    expect(settlements.map(({ operation }) => operation)).not.toContain(unscoped.operation.id);
    expect(settlements.map(({ operation }) => operation)).not.toContain(pending.operationId);

    const pseudonym = pseudonymKey(Uint8Array.from(randomBytes(32)));
    const authority = { policyEpoch: 'epoch-1', protection: 'free', project: 'project-a' } as const;
    const rows = await Promise.all(
      charged.map(async ({ operation, receipt }, index) => {
        const evidence = await settlementEvidence(
          { operation, receipt, normalization: 'test-v1' },
          fixture.userId,
          authority,
        );
        const { span } = langfuseObservation(
          evidence,
          { environment: 'synthetic', receipt: `evr_${index}`, protection: 'free' },
          pseudonym,
        );
        return rowOf(span);
      }),
    );
    expect(await reconcileLedger(settlements, rows, 'synthetic')).toEqual({
      ledger: { settlements: 2, credits: 0.00001 },
      observed: { settlements: 2, credits: 0.00001 },
      matched: 2,
      missing: { settlements: 0, credits: 0 },
      unexpected: { settlements: 0, credits: 0 },
      mismatched: 0,
      drift: 0,
    });
  });

  it('reads nothing outside the window or from another environment', async () => {
    const fixture = await createFixture();
    const before = new Date(Date.now() - 1000);
    await settle(fixture, `outside-${randomUUID()}`, ['project-a', 2n]);
    const after = new Date(Date.now() + 1000);
    const mine = async (window: Parameters<typeof ledgerSettlements>[1]) =>
      (await ledgerSettlements(database, window)).filter(({ principal }) => principal === fixture.userId);

    expect(await mine({ environment, from: before, to: after })).toHaveLength(1);
    expect(await mine({ environment, from: new Date(before.getTime() - 60_000), to: before })).toEqual([]);
    expect(await mine({ environment, from: after, to: new Date(after.getTime() + 60_000) })).toEqual([]);
    expect(await mine({ environment: 'production', from: before, to: after })).toEqual([]);
  });
});
