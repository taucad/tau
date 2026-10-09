import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import type { InputCountCapability } from '#api/billing/billable-model-input-count.js';
import { DefaultChatTransport, readUIMessageStream } from 'ai';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { ConflictException, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Auth } from 'better-auth';
import { afterAll, describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingBudget,
  billingBudgetFunding,
  billingFinancialCase,
  supplierCostEvidence,
  billingPromotionIssuance,
  creditAccount,
  creditOperation,
  user,
} from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import { assertNewCollectionCashScope } from '#api/billing/billing-cash-reconciliation.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import {
  CodeOwnedBillableModelQualificationResolver,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import { createBillableModelProviderAdapters } from '#api/billing/billable-model-provider.js';
import { BillingController } from '#api/billing/billing.controller.js';
import { BillingAttemptController } from '#api/billing/billing-attempt.controller.js';
import { BillingService } from '#api/billing/billing.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import { BillingEstimatesService } from '#api/billing/billing-estimates.service.js';
import { ChatController } from '#api/chat/chat.controller.js';
import { ChatService } from '#api/chat/chat.service.js';
import { CodeCompletionController } from '#api/code-completion/code-completion.controller.js';
import { CodeCompletionService } from '#api/code-completion/code-completion.service.js';
import { LlmGatewayController } from '#api/llm/llm-gateway.controller.js';
import { LlmGatewayAuthGuard } from '#api/llm/llm-gateway.guard.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';
import { modelInvocationServiceKey } from '#api/llm/model-invocation.types.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { DatabaseService } from '#database/database.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client, { schema });
const policy = new BillingPolicyService({ database });
const ledger = new CreditLedgerService({ database }, policy);
const children = new Set<ReturnType<typeof fork>>();
const childDiagnostics = new WeakMap<ReturnType<typeof fork>, string>();
afterAll(async () => {
  for (const child of children) {
    child.kill('SIGKILL');
  }
  await client.end();
});

const nextMessage = async (child: ReturnType<typeof fork>, state: string): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const onMessage = (candidate: unknown): void => {
      if (candidate !== null && typeof candidate === 'object' && 'state' in candidate && candidate.state === state) {
        cleanup();
        resolve(candidate);
      } else {
        cleanup();
        reject(new Error(`Expected child checkpoint ${state}`));
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (code: unknown, signal: unknown): void => {
      cleanup();
      reject(
        new Error(
          `Invocation child exited before ${state}: ${String(code)} ${String(signal)} ${childDiagnostics.get(child) ?? ''}`,
        ),
      );
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for child checkpoint ${state}`));
    }, 10_000);
    child.once('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
  });
};

const startChild = async (input: {
  providerUrl: string;
  authUserId: string;
  attemptKey: string;
  digestSecret: string;
  exactCount?: boolean;
}) => {
  const childEnvironment = { ...process.env };
  childEnvironment['TSX_TSCONFIG_PATH'] = resolve(import.meta.dirname, '../../../tsconfig.spec.json');
  const child = fork(resolve(import.meta.dirname, '../../testing/billable-invocation-child.ts'), [], {
    execArgv: ['--import', 'tsx'],
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.add(child);
  childDiagnostics.set(child, '');
  child.stderr?.on('data', (chunk: unknown) => {
    childDiagnostics.set(child, `${childDiagnostics.get(child) ?? ''}${String(chunk)}`.slice(-4096));
  });
  child.once('exit', () => children.delete(child));
  child.send(input);
  try {
    await nextMessage(child, 'ready');
    return child;
  } catch (error) {
    await kill(child);
    throw error;
  }
};

const kill = async (child: ReturnType<typeof fork>): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
};

const createFixture = async (options: { promotion?: boolean; longContextPremium?: boolean } = {}) => {
  registerBillableModelMeterContracts();
  const suffix = randomUUID();
  const environment = 'development';
  const authUserId = `invocation-${suffix}`;
  const meterContractId = 'model-meter-v1:openai-gpt-5.6-luna';
  const sku = 'model:openai-gpt-5.6-luna';
  /* A tiered route funds one meter contract per pinned tariff, so a body whose proved input bound
   * reaches the premium threshold resolves the `:long-context` sibling instead of the base sku. */
  const longContextMeterContractId = `${meterContractId}:long-context`;
  const longContextSku = `${sku}:long-context`;
  const promotionProgramId = `invocation-promotion-${suffix}`;
  const promotionBudgetId = `invocation-promotion-budget-${suffix}`;
  const promotionFundingId = `invocation-promotion-funding-${suffix}`;
  const now = new Date();
  const promotionPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const promotionPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await database
    .insert(user)
    .values({ id: authUserId, name: 'Invocation fixture', email: `${suffix}@test.invalid`, emailVerified: true });
  // Supplier spend is metered after settlement, so the only budget a route can need is the promotion's.
  if (options.promotion) {
    await database.insert(billingBudgetFunding).values({
      id: promotionFundingId,
      environment,
      kind: 'promotion_issuance',
      scope: promotionProgramId,
      fundedLifetime: 50n,
    });
    await database.insert(billingBudget).values({
      id: promotionBudgetId,
      environment,
      fundingId: promotionFundingId,
      kind: 'promotion_issuance',
      scope: promotionProgramId,
      periodStart: promotionPeriodStart,
      periodEnd: promotionPeriodEnd,
      quantum: 'credit_atoms',
      approvedCap: 50n,
    });
  }
  for (const contractId of [meterContractId, longContextMeterContractId]) {
    qualifiedMeterContracts.set(contractId, new Set(['uncached_input:', 'cache_read:', 'cache_write:30m', 'output:']));
  }
  const tokenUnit = 'token';
  const rate = (
    contractId: string,
    dimension: 'uncached_input' | 'cache_read' | 'cache_write' | 'output',
    // oxlint-disable-next-line typescript/no-restricted-types -- financial meter tiers use explicit null
    tier: string | null,
  ) => ({
    rateId: `${dimension}-${tier ?? 'none'}-${contractId}-${suffix}`,
    meterContractId: contractId,
    dimension,
    tier,
    unit: tokenUnit,
    referenceNumeratorPicoUsd: '1',
    denominatorUnits: '1',
    retailOverride: {
      // The premium sibling is dearer only where a test needs the two tiers to be distinguishable.
      numeratorCreditAtoms:
        options.longContextPremium === true && contractId === longContextMeterContractId ? '2' : '1',
      denominatorUnits: '1',
    },
  });
  const tariff = (contractId: string) => [
    rate(contractId, 'uncached_input', null),
    rate(contractId, 'cache_read', null),
    rate(contractId, 'cache_write', '30m'),
    rate(contractId, 'output', null),
  ];
  const rates = [...tariff(meterContractId), ...tariff(longContextMeterContractId)];
  const validated = validateCommercialPolicy({
    schemaVersion: 1,
    environment,
    policyVersion: suffix,
    markupBps: 0,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId, longContextMeterContractId] },
    rates,
    routes: [
      {
        routeId: `route-${suffix}`,
        sku,
        meterContractId,
        rateIds: tariff(meterContractId).map(({ rateId }) => rateId),
        enabled: true,
      },
      {
        routeId: `route-long-context-${suffix}`,
        sku: longContextSku,
        meterContractId: longContextMeterContractId,
        rateIds: tariff(longContextMeterContractId).map(({ rateId }) => rateId),
        enabled: true,
      },
    ],
    offers: [
      {
        offerId: `pro-${suffix}`,
        kind: 'pro_monthly',
        currency: 'usd',
        principalMinor: '1',
        grantCreditAtoms: '1',
        ceilingCreditAtoms: '1',
      },
      {
        offerId: `top-${suffix}`,
        kind: 'top_up',
        currency: 'usd',
        minimumPrincipalMinor: '1',
        maximumPrincipalMinor: '1',
        creditAtomsPerPrincipalMinor: '1',
      },
    ],
    promotionalIssuance: options.promotion
      ? {
          enabled: true,
          budgetCreditAtoms: '50',
          offer: {
            promotionProgramId,
            period: 'month',
            eligibility: 'verified_account',
            grantCreditAtoms: '50',
            accountCeilingCreditAtoms: '50',
            budgetId: promotionBudgetId,
          },
        }
      : { enabled: false, budgetCreditAtoms: '0', offer: null },
  });
  await seedBillingFixturePolicy({
    database,
    policy: validated.canonicalContent,
    activationId: `activation-${suffix}`,
  });
  const accountId = await ledger.ensureAccountBinding({ environment, authUserId });
  await database.update(creditAccount).set({ purchasedAtoms: 10_000_000n }).where(eq(creditAccount.id, accountId));
  return {
    authUserId,
    accountId,
    promotionProgramId,
    promotionPeriodStart,
    promotionPeriodEnd,
  };
};

// oxlint-disable-next-line eslint/max-params -- compact test factory varies three independent failure controls.
const createOwner = (
  providerUrl: string,
  executionTimeout = 60_000,
  inputCounters?: ReadonlyMap<string, InputCountCapability | undefined>,
  metrics?: MetricsService,
): BillableModelInvocationService => {
  const adapters = createBillableModelProviderAdapters(
    { get: (key: string): unknown => (key === 'OPENAI_API_KEY' ? 'fixture-key' : undefined) },
    async (_url, init) => fetch(providerUrl, init),
  );
  return new BillableModelInvocationService(
    ledger,
    new CodeOwnedBillableModelQualificationResolver({
      adapters,
      credentialAccounts: new Map([['openai', 'fixture-openai-account']]),
      executionTimeout,
      ...(inputCounters === undefined ? {} : { inputCounters }),
    }),
    new ConfigService({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      BILLING_ENVIRONMENT: 'development',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      BILLING_REQUEST_DIGEST_SECRET: 'c04-foundation-request-digest-secret',
    }),
    metrics,
  );
};

/** The SQLSTATE a driver error carries beneath the query builder's own error. */
const databaseCode = (error: unknown): unknown =>
  error instanceof Error && typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause
    ? error.cause.code
    : undefined;

/** The gateway code a refusal carries, or undefined for anything else. */
const gatewayCode = (error: unknown): string | undefined =>
  error instanceof LlmGatewayError ? (error.getResponse() as { error?: { type?: string } }).error?.type : undefined;

/* What the owner-identity `pause-route` command writes: one unresumed row per route. Fixtures share the
 * real route's sku, so every pause a test takes is resumed before the test ends. */
const pauseRoute = async (reason: string): Promise<string> => {
  const [row] = await database
    .insert(schema.billingRoutePause)
    .values({ environment: 'development', sku: 'model:openai-gpt-5.6-luna', actor: 'foundation-operator', reason })
    .returning({ id: schema.billingRoutePause.id });
  return row!.id;
};
const resumeRoute = async (id: string): Promise<void> => {
  await database
    .update(schema.billingRoutePause)
    .set({ resumedAt: sql`clock_timestamp()`, resumedBy: 'foundation-operator', resumeReason: 'test complete' })
    .where(and(eq(schema.billingRoutePause.id, id), sql`${schema.billingRoutePause.resumedAt} is null`));
};

const invoke = async (input: {
  owner: BillableModelInvocationService;
  authUserId: string;
  attemptKey: string;
  body?: string;
  signal?: AbortSignal;
  onAdmitted?: (operationId: string) => void;
}) =>
  input.owner.invoke({
    environment: 'development',
    authUserId: input.authUserId,
    surface: 'gateway',
    attempt: { version: 1, key: input.attemptKey },
    providerWire: 'openai-responses',
    body: {
      model: 'openai-gpt-5.6-luna',
      stream: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses wire field
      max_output_tokens: 1,
      input: input.body ?? 'fixture',
    },
    priceHeaders: {},
    activity: 'agent',
    signal: input.signal ?? new AbortController().signal,
    ...(input.onAdmitted === undefined ? {} : { onAdmitted: input.onAdmitted }),
  });

describe('BillableModelInvocationService process recovery', () => {
  it('admits only funded qualified owners and replays pending and terminal attempts without provider duplication', async () => {
    let requests = 0;
    let rejectProvider = false;
    let delayProvider = false;
    let holdTail = false;
    let releaseTail: (() => void) | undefined;
    const server = createServer((_request, response) => {
      requests += 1;
      if (delayProvider) {
        setTimeout(() => {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.end();
        }, 500);
        return;
      }
      if (rejectProvider) {
        response.writeHead(503);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const tail =
        'data: {"type":"response.completed","response":{"id":"provider-request","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0}}}}\n\ndata: [DONE]\n\n';
      if (holdTail) {
        // The answer is on the wire; the usage frame waits for the test to end the generation.
        response.write('data: {"type":"response.output_text.delta","delta":"answer"}\n\n');
        releaseTail = () => {
          releaseTail = undefined;
          response.end(tail);
        };
        return;
      }
      response.end(tail);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Counted provider address unavailable');
      }
      const owner = createOwner(`http://127.0.0.1:${address.port}`);

      const unfunded = await createFixture();
      await database.update(creditAccount).set({ purchasedAtoms: 0n }).where(eq(creditAccount.id, unfunded.accountId));
      await expect(
        invoke({ owner, authUserId: unfunded.authUserId, attemptKey: `unfunded-${randomUUID()}` }),
      ).rejects.toThrow();
      expect(requests).toBe(0);

      const closed = await createFixture();
      await database.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, closed.accountId));
      await expect(
        invoke({ owner, authUserId: closed.authUserId, attemptKey: `closed-${randomUUID()}` }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof LlmGatewayError &&
          error.getStatus() === 403 &&
          (error.getResponse() as { error?: { type?: string } }).error?.type === 'BILLING_ACCOUNT_CLOSED',
      );
      expect(requests).toBe(0);

      const indebted = await createFixture();
      await database.update(creditAccount).set({ debtAtoms: 1n }).where(eq(creditAccount.id, indebted.accountId));
      await expect(
        invoke({ owner, authUserId: indebted.authUserId, attemptKey: `debt-${randomUUID()}` }),
      ).rejects.toThrow();
      expect(requests).toBe(0);

      const funded = await createFixture();
      await expect(
        owner.invoke({
          environment: 'development',
          authUserId: funded.authUserId,
          surface: 'gateway',
          attempt: { version: 1, key: `unqualified-${randomUUID()}` },
          providerWire: 'openai-responses',
          body: { model: 'not-qualified', stream: true },
          priceHeaders: {},
          activity: 'agent',
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow();
      expect(requests).toBe(0);

      const attemptKey = `funded-${randomUUID()}`;
      holdTail = true;
      const first = await invoke({ owner, authUserId: funded.authUserId, attemptKey });
      expect(first.state).toBe('streaming');
      expect(requests).toBe(1);
      // The supplier is still generating: the attempt replays as pending.
      await expect(invoke({ owner, authUserId: funded.authUserId, attemptKey })).resolves.toEqual({
        state: 'pending',
        operationId: first.operationId,
      });
      expect(requests).toBe(1);
      if (first.state !== 'streaming') {
        throw new Error('Funded invocation did not stream');
      }
      /* The supplier finishes while the client has read nothing. Settlement follows the
       * supplier, so the turn is terminal before a byte of it is consumed. */
      releaseTail!();
      holdTail = false;
      await first.completion;
      await expect(invoke({ owner, authUserId: funded.authUserId, attemptKey })).resolves.toEqual({
        state: 'terminal',
        operationId: first.operationId,
      });
      await first.response.arrayBuffer();
      await expect(invoke({ owner, authUserId: funded.authUserId, attemptKey, body: 'altered' })).rejects.toThrow(
        'Attempt key replayed with a different request digest',
      );
      expect(requests).toBe(1);

      const cancelled = new AbortController();
      cancelled.abort();
      await expect(
        invoke({
          owner,
          authUserId: funded.authUserId,
          attemptKey: `cancelled-${randomUUID()}`,
          signal: cancelled.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(requests).toBe(1);

      rejectProvider = true;
      let rejectedOperationId: string | undefined;
      await expect(
        invoke({
          owner,
          authUserId: funded.authUserId,
          attemptKey: `rejected-${randomUUID()}`,
          onAdmitted: (operationId) => {
            rejectedOperationId = operationId;
          },
        }),
      ).rejects.toThrow();
      expect(rejectedOperationId).toBeTypeOf('string');
      expect(requests).toBe(2);

      rejectProvider = false;
      delayProvider = true;
      const deadlineOwner = createOwner(`http://127.0.0.1:${address.port}`, 100);
      await expect(
        invoke({ owner: deadlineOwner, authUserId: funded.authUserId, attemptKey: `deadline-${randomUUID()}` }),
      ).rejects.toThrow();
      expect(requests).toBe(3);
    } finally {
      const closed = once(server, 'close');
      server.close();
      await closed;
    }
  }, 60_000);

  it('spends retained plan funds and issues a current promotion once through the actual owner', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(
        'data: {"type":"response.completed","response":{"id":"provider-request","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0}}}}\n\ndata: [DONE]\n\n',
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Counted provider address unavailable');
      }
      const owner = createOwner(`http://127.0.0.1:${address.port}`);
      const plan = await createFixture();
      await database
        .update(creditAccount)
        .set({ purchasedAtoms: 0n, planAtoms: 10_000_000n })
        .where(eq(creditAccount.id, plan.accountId));
      const planResult = await invoke({
        owner,
        authUserId: plan.authUserId,
        attemptKey: `plan-${randomUUID()}`,
      });
      if (planResult.state !== 'streaming') {
        throw new Error('Plan-funded invocation did not stream');
      }
      await planResult.response.arrayBuffer();
      await planResult.completion;
      const [planAccount] = await database.select().from(creditAccount).where(eq(creditAccount.id, plan.accountId));
      expect(planAccount).toMatchObject({ promoAtoms: 0n, planAtoms: 9_999_998n, purchasedAtoms: 0n });

      const promotion = await createFixture({ promotion: true });
      const promotionAttempt = `promotion-${randomUUID()}`;
      const promotionResult = await invoke({
        owner,
        authUserId: promotion.authUserId,
        attemptKey: promotionAttempt,
      });
      if (promotionResult.state !== 'streaming') {
        throw new Error('Promotion-funded invocation did not stream');
      }
      await promotionResult.response.arrayBuffer();
      await promotionResult.completion;
      await expect(
        invoke({ owner, authUserId: promotion.authUserId, attemptKey: promotionAttempt }),
      ).resolves.toMatchObject({ state: 'terminal', operationId: promotionResult.operationId });
      const issuances = await database
        .select()
        .from(billingPromotionIssuance)
        .where(eq(billingPromotionIssuance.accountId, promotion.accountId));
      expect(issuances).toHaveLength(1);
      expect(issuances[0]).toMatchObject({
        promotionProgramId: promotion.promotionProgramId,
        atoms: 50n,
        periodStart: promotion.promotionPeriodStart,
        periodEnd: promotion.promotionPeriodEnd,
      });
      const [promotionAccount] = await database
        .select()
        .from(creditAccount)
        .where(eq(creditAccount.id, promotion.accountId));
      expect(promotionAccount).toMatchObject({ promoAtoms: 48n, purchasedAtoms: 10_000_000n });
      expect(requests).toBe(2);
    } finally {
      const closed = once(server, 'close');
      server.close();
      await closed;
    }
  }, 60_000);

  it.each([false, true])(
    'never repeats provider I/O across process death; exact count $0',
    async (exactCount) => {
      const fixture = await createFixture();
      let requests = 0;
      let counts = 0;
      const server = createServer((request, response) => {
        if (request.url === '/v1/responses/input_tokens') {
          counts++;
          request.resume();
          response.end('{"object":"response.input_tokens","input_tokens":1}');
          return;
        }
        requests += 1;
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(
          'data: {"type":"response.completed","response":{"id":"provider-request","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0}}}}\n\ndata: [DONE]\n\n',
        );
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Counted provider address unavailable');
        }
        const providerUrl = `http://127.0.0.1:${address.port}`;
        const digestSecret = 'c04-foundation-request-digest-secret';

        const preIntentKey = `pre-intent-${randomUUID()}`;
        const preIntent = await startChild({
          providerUrl,
          authUserId: fixture.authUserId,
          attemptKey: preIntentKey,
          digestSecret,
          exactCount,
        });
        await kill(preIntent);
        expect(requests).toBe(0);
        await expect(
          database
            .select({ id: creditOperation.id })
            .from(creditOperation)
            .where(eq(creditOperation.attemptKey, preIntentKey)),
        ).resolves.toEqual([]);

        const suspendedAttemptKey = `suspended-${randomUUID()}`;
        const before = await startChild({
          providerUrl,
          authUserId: fixture.authUserId,
          attemptKey: suspendedAttemptKey,
          digestSecret,
          exactCount,
        });
        await nextMessage(before, 'intent_recorded');
        expect(before.kill('SIGSTOP')).toBe(true);
        expect(requests).toBe(0);
        const [beforeOperation] = await database
          .select()
          .from(creditOperation)
          .where(eq(creditOperation.accountId, fixture.accountId))
          .orderBy(sql`${creditOperation.admittedAt} desc`)
          .limit(1);
        if (!beforeOperation) {
          throw new Error('Pre-request operation missing');
        }
        await database
          .update(creditOperation)
          .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
          .where(eq(creditOperation.id, beforeOperation.id));
        await ledger.recoverDueLlmOperations({ environment: 'development', limit: 100 });
        expect(requests).toBe(0);
        expect(before.kill('SIGCONT')).toBe(true);
        before.send('continue');
        await nextMessage(before, 'complete');
        expect(requests).toBe(0);

        const after = await startChild({
          providerUrl,
          authUserId: fixture.authUserId,
          attemptKey: `after-${randomUUID()}`,
          digestSecret,
          exactCount,
        });
        await nextMessage(after, 'intent_recorded');
        after.send('continue');
        await nextMessage(after, 'evidence_recorded');
        await kill(after);
        expect(requests).toBe(1);
        const [afterOperation] = await database
          .select()
          .from(creditOperation)
          .where(eq(creditOperation.accountId, fixture.accountId))
          .orderBy(sql`${creditOperation.admittedAt} desc`)
          .limit(1);
        if (!afterOperation) {
          throw new Error('Post-evidence operation missing');
        }
        await database
          .update(creditOperation)
          .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
          .where(eq(creditOperation.id, afterOperation.id));
        await ledger.recoverDueLlmOperations({ environment: 'development', limit: 100 });
        expect(requests).toBe(1);
        const [resolved] = await database
          .select()
          .from(creditOperation)
          .where(eq(creditOperation.id, afterOperation.id));
        expect(resolved?.customerState).toBe('settled');
        expect(resolved?.invocation?.inputCount?.inputTokens).toBe(exactCount ? '1' : undefined);

        const terminalAttemptKey = `terminal-${randomUUID()}`;
        const terminal = await startChild({
          providerUrl,
          authUserId: fixture.authUserId,
          attemptKey: terminalAttemptKey,
          digestSecret,
          exactCount,
        });
        await nextMessage(terminal, 'intent_recorded');
        terminal.send('continue');
        await nextMessage(terminal, 'evidence_recorded');
        terminal.send('continue');
        await nextMessage(terminal, 'complete');
        expect(requests).toBe(2);

        const terminalReplay = await startChild({
          providerUrl,
          authUserId: fixture.authUserId,
          attemptKey: terminalAttemptKey,
          digestSecret,
          exactCount,
        });
        await nextMessage(terminalReplay, 'complete');
        expect(requests).toBe(2);
        expect(counts).toBe(exactCount ? 3 : 0);
      } finally {
        await Promise.all([...children].map(async (child) => kill(child)));
        const closed = once(server, 'close');
        server.close();
        await closed;
      }
    },
    60_000,
  );
});

describe('funded invocation HTTP boundary', () => {
  it.each([false, true])(
    'connects all exposed controllers and owner-scoped recovery; exact count $0',
    async (exactCount) => {
      const firstOwner = await createFixture();
      const secondOwner = await createFixture();
      let requests = 0;
      const countBodies: unknown[] = [];
      let rejectProvider = false;
      let delayBody = false;
      let malformedBody = false;
      const pendingProviderTimers = new Set<ReturnType<typeof setTimeout>>();
      const providerBodies: string[] = [];
      const provider = createServer((request, response) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
          body += chunk;
        });
        if (request.url === '/v1/responses/input_tokens') {
          request.on('end', () => {
            countBodies.push(JSON.parse(body));
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end('{"object":"response.input_tokens","input_tokens":1}');
          });
          return;
        }
        request.on('end', () => providerBodies.push(body));
        requests++;
        if (rejectProvider) {
          response.writeHead(503);
          response.end();
          return;
        }
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.flushHeaders();
        /* eslint-disable @typescript-eslint/naming-convention -- exact native Responses fixture */
        const events = [
          { type: 'response.created', response: { id: 'response-fixture', model: 'gpt-5.6-luna', created_at: 1 } },
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { type: 'message', id: 'message-fixture', role: 'assistant', content: [], status: 'in_progress' },
          },
          {
            type: 'response.output_text.delta',
            item_id: 'message-fixture',
            output_index: 0,
            content_index: 0,
            delta: 'Named part',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: 'message-fixture',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Named part', annotations: [] }],
              status: 'completed',
            },
          },
          {
            type: 'response.completed',
            response: {
              id: 'response-fixture',
              model: 'gpt-5.6-luna',
              created_at: 1,
              status: 'completed',
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
              },
            },
          },
        ].map((event) => `data: ${JSON.stringify(event)}\n\n`);
        /* eslint-enable @typescript-eslint/naming-convention -- remaining fixture uses local names */
        const complete = (): void => {
          response.end(malformedBody ? 'data: {invalid JSON\n\n' : (delayBody ? events.slice(4) : events).join(''));
        };
        if (delayBody) {
          response.write(events.slice(0, 4).join(''));
          const timer = setTimeout(() => {
            pendingProviderTimers.delete(timer);
            complete();
          }, 250);
          pendingProviderTimers.add(timer);
          response.once('close', () => {
            clearTimeout(timer);
            pendingProviderTimers.delete(timer);
          });
        } else {
          complete();
        }
      });
      provider.listen(0, '127.0.0.1');
      await once(provider, 'listening');
      let app: NestFastifyApplication | undefined;
      try {
        const address = provider.address();
        if (!address || typeof address === 'string') {
          throw new Error('Counted provider address unavailable');
        }
        const providerUrl = `http://127.0.0.1:${address.port}`;
        const owner = createOwner(
          providerUrl,
          60_000,
          exactCount
            ? new Map([
                [
                  'openai-gpt-5.6-luna',
                  {
                    qualification: 'controlled-local-zero',
                    environment: 'development',
                    credentialAccount: 'fixture-openai-account',
                    sourceRevision: 'c05-controlled-http',
                    url: `${providerUrl}/v1/responses/input_tokens`,
                  },
                ],
              ])
            : undefined,
        );
        const config = {
          get(key: string): unknown {
            if (key === 'BILLING_ENVIRONMENT') {
              return 'development';
            }
            if (key === 'BILLING_USAGE_CURSOR_SECRET') {
              return 'c04-foundation-cursor-secret'.repeat(2);
            }
            if (key === 'TAU_FRONTEND_URL') {
              return 'https://tau.new';
            }
            if (key === 'ADDITIONAL_CORS_ORIGINS') {
              return [];
            }
            if (key === 'NODE_ENV') {
              return 'test';
            }
            return undefined;
          },
        };
        const auth = mockDeep<Auth>();
        const sessionFor = (id: string) => {
          const now = new Date('2026-09-05T00:00:00.000Z');
          return {
            user: {
              id,
              name: 'HTTP fixture owner',
              email: `${id}@test.invalid`,
              emailVerified: true,
              createdAt: now,
              updatedAt: now,
              image: null,
            },
            session: {
              id: `session-${id}`,
              userId: id,
              token: `token-${id}`,
              expiresAt: new Date('2027-01-01T00:00:00.000Z'),
              createdAt: now,
              updatedAt: now,
              ipAddress: null,
              userAgent: null,
            },
          };
        };
        auth.api.getSession.mockResolvedValue(sessionFor(firstOwner.authUserId));
        const databaseService = { database };
        const usage = new BillingUsageService(databaseService, config, ledger);
        const module = await Test.createTestingModule({
          controllers: [
            BillingController,
            BillingAttemptController,
            ChatController,
            CodeCompletionController,
            LlmGatewayController,
          ],
          providers: [
            Reflector,
            AuthGuard,
            LlmGatewayAuthGuard,
            { provide: authInstanceKey, useValue: auth },
            { provide: HostsService, useValue: { authenticateDevice: async () => undefined } },
            { provide: ConfigService, useValue: config },
            { provide: DatabaseService, useValue: databaseService },
            { provide: BillableModelInvocationService, useValue: owner },
            {
              provide: modelInvocationServiceKey,
              useValue: {
                invoke: async (intent: Omit<Parameters<typeof owner.invoke>[0], 'environment'>) =>
                  owner.invoke({ ...intent, environment: 'development' }),
              },
            },
            { provide: BillingUsageService, useValue: usage },
            { provide: BillingService, useValue: {} },
            { provide: BillingEstimatesService, useValue: mockDeep<BillingEstimatesService>() },
            { provide: BillingPaymentsService, useValue: mockDeep<BillingPaymentsService>() },
            { provide: BillingAccountClosureService, useValue: mockDeep<BillingAccountClosureService>() },
            LlmGatewayService,
            ChatService,
            CodeCompletionService,
          ],
        }).compile();
        app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
        app.enableVersioning({ type: VersioningType.URI });
        await app.init();
        await app.listen(0, '127.0.0.1');
        const appAddress = app.getHttpServer().address() as { port: number };
        const base = `http://127.0.0.1:${appAddress.port}`;
        const headers = { 'content-type': 'application/json', 'x-test-owner': firstOwner.authUserId };
        /* eslint-disable @typescript-eslint/naming-convention -- exact native count and generation payload */
        const countedFields = {
          instructions: 'Inspect the local fixture.',
          reasoning: { effort: 'none' },
          tools: [{ type: 'function', name: 'inspect', parameters: { type: 'object' } }],
          tool_choice: 'auto',
          input: [
            { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'opaque-fixture' },
            { type: 'function_call', call_id: 'call_fixture', name: 'inspect', arguments: '{}' },
            {
              type: 'function_call_output',
              call_id: 'call_fixture',
              output: [
                { type: 'input_text', text: 'fixture' },
                {
                  type: 'input_image',
                  image_url:
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                  detail: 'auto',
                },
              ],
            },
          ],
        };
        const gatewayBody = {
          model: 'openai-gpt-5.6-luna',
          stream: true,
          max_output_tokens: 1,
          input: 'fixture',
          ...(exactCount ? countedFields : {}),
        };
        /* eslint-enable @typescript-eslint/naming-convention -- remaining fixture uses local names */

        const invalidAttempt = `query-${randomUUID()}`;
        const invalid = await fetch(`${base}/v1/llm/openai/v1/responses?extra=1`, {
          method: 'POST',
          headers: { ...headers, 'x-tau-attempt-id': invalidAttempt },
          body: JSON.stringify(gatewayBody),
        });
        expect(invalid.status).toBe(400);
        expect(requests).toBe(0);
        await expect(
          ledger.getOperationForAttempt({
            environment: 'development',
            authUserId: firstOwner.authUserId,
            surface: 'gateway',
            attemptKey: invalidAttempt,
          }),
        ).resolves.toBeUndefined();
        const malformed = await fetch(`${base}/v1/llm/openai/v1/responses`, {
          method: 'POST',
          headers: { ...headers, 'x-tau-attempt-id': `malformed-${randomUUID()}` },
          body: JSON.stringify({ model: 'openai-gpt-5.6-luna', stream: true, input: 'missing bounded output' }),
        });
        expect(malformed.status).toBe(400);
        expect(requests).toBe(0);

        delayBody = true;
        const gatewayAttempt = `gateway-${randomUUID()}`;
        const gateway = await fetch(`${base}/v1/llm/openai/v1/responses`, {
          method: 'POST',
          headers: { ...headers, 'x-tau-attempt-id': gatewayAttempt },
          body: JSON.stringify(gatewayBody),
        });
        const operationId = gateway.headers.get('x-tau-operation-id');
        expect(operationId).toBeTypeOf('string');
        expect(requests).toBe(1);
        await gateway.text();
        delayBody = false;
        const countedOperation = await ledger.getOperationForAttempt({
          environment: 'development',
          authUserId: firstOwner.authUserId,
          surface: 'gateway',
          attemptKey: gatewayAttempt,
        });
        expect(countedOperation?.invocation?.inputCount?.inputTokens).toBe(exactCount ? '1' : undefined);
        if (exactCount) {
          expect(countBodies).toEqual([{ model: 'gpt-5.6-luna', ...countedFields }]);
          expect(JSON.parse(providerBodies[0]!)).toEqual({ ...gatewayBody, model: 'gpt-5.6-luna' });
          expect(countedOperation?.authorizedAtoms).toBe(2n);
        }

        const replay = await fetch(`${base}/v1/llm/openai/v1/responses`, {
          method: 'POST',
          headers: { ...headers, 'x-tau-attempt-id': gatewayAttempt },
          body: JSON.stringify(gatewayBody),
        });
        expect(replay.status).toBe(202);
        expect(replay.headers.get('x-tau-operation-id')).toBe(operationId);
        expect(requests).toBe(1);
        const conflict = await fetch(`${base}/v1/llm/openai/v1/responses`, {
          method: 'POST',
          headers: { ...headers, 'x-tau-attempt-id': gatewayAttempt },
          body: JSON.stringify({ ...gatewayBody, input: 'changed' }),
        });
        expect(conflict.status).toBe(409);
        expect(requests).toBe(1);

        const invokeNameGenerator = async (profile: 'project_name' | 'commit_name'): Promise<void> => {
          const attempt = `${profile}-${randomUUID()}`;
          const body = JSON.stringify({
            id: `chat-${profile}`,
            projectId: 'project-fixture',
            admission: { version: 1, idempotencyKey: attempt },
            messages: [
              {
                id: `message-${profile}`,
                role: 'user',
                parts: [
                  { type: 'text', text: 'name it' },
                  {
                    type: 'file',
                    mediaType: 'image/png',
                    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                  },
                ],
              },
            ],
            agent: { profile },
          });
          const response = await fetch(`${base}/v1/chat`, { method: 'POST', headers, body });
          expect(response.status).toBe(200);
          const nameOperation = response.headers.get('x-tau-operation-id');
          expect(nameOperation).toBeTypeOf('string');
          const transport = new DefaultChatTransport({ fetch: async () => response });
          const stream = await transport.sendMessages({
            abortSignal: undefined,
            chatId: 'fixture',
            messages: [],
            trigger: 'submit-message',
            messageId: undefined,
          });
          let name = '';
          for await (const message of readUIMessageStream({ stream })) {
            name = message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('');
          }
          expect(name).toBe('Named part');
          expect(providerBodies.at(-1)).toContain('data:image/png;base64,');
          const count = requests;
          const replayName = await fetch(`${base}/v1/chat`, { method: 'POST', headers, body });
          expect(replayName.status).toBe(202);
          expect(replayName.headers.get('x-tau-operation-id')).toBe(nameOperation);
          expect(requests).toBe(count);
        };
        await invokeNameGenerator('project_name');
        await invokeNameGenerator('commit_name');
        const completion = await fetch(`${base}/v1/code-completion`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            admission: { version: 1, idempotencyKey: `completion-${randomUUID()}` },
            completionMetadata: { textBeforeCursor: 'const value = ', textAfterCursor: ';' },
          }),
        });
        expect(completion.status).toBe(200);
        expect(completion.headers.get('x-tau-operation-id')).toBeTypeOf('string');
        await completion.text();
        expect(requests).toBe(4);

        delayBody = true;
        const disconnectedAttempt = `disconnected-${randomUUID()}`;
        const downstream = new AbortController();
        const disconnected = await fetch(`${base}/v1/chat`, {
          method: 'POST',
          headers: { ...headers, 'x-tau-attempt-id': disconnectedAttempt },
          body: JSON.stringify({
            id: 'cancel-chat',
            projectId: 'project-fixture',
            admission: { version: 1, idempotencyKey: disconnectedAttempt },
            messages: [{ id: 'cancel-message', role: 'user', parts: [{ type: 'text', text: 'name it' }] }],
            agent: { profile: 'project_name' },
          }),
          signal: downstream.signal,
        });
        expect(disconnected.headers.get('x-tau-operation-id')).toBeTypeOf('string');
        downstream.abort();
        await expect(disconnected.text()).rejects.toThrow();
        await expect
          .poll(async () => {
            const operation = await ledger.getOperationForAttempt({
              environment: 'development',
              authUserId: firstOwner.authUserId,
              surface: 'project_name',
              attemptKey: disconnectedAttempt,
            });
            return operation !== undefined && operation.cancellationRequestedAt !== null;
          })
          .toBe(true);
        expect(requests).toBe(5);
        delayBody = false;

        rejectProvider = true;
        const rejected = await fetch(`${base}/v1/chat`, {
          method: 'POST',
          headers: { ...headers, 'x-tau-attempt-id': `rejected-http-${randomUUID()}` },
          body: JSON.stringify({
            id: 'reject-chat',
            projectId: 'project-fixture',
            admission: { version: 1, idempotencyKey: `rejected-name-${randomUUID()}` },
            messages: [{ id: 'reject-message', role: 'user', parts: [{ type: 'text', text: 'name it' }] }],
            agent: { profile: 'project_name' },
          }),
        });
        expect(rejected.status).toBe(503);
        expect(rejected.headers.get('x-tau-operation-id')).toBeTypeOf('string');
        expect(requests).toBe(6);

        rejectProvider = false;
        delayBody = true;
        malformedBody = true;
        const malformedName = await fetch(`${base}/v1/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: 'malformed-chat',
            projectId: 'project-fixture',
            admission: { version: 1, idempotencyKey: `malformed-name-${randomUUID()}` },
            messages: [{ id: 'malformed-message', role: 'user', parts: [{ type: 'text', text: 'name it' }] }],
            agent: { profile: 'project_name' },
          }),
        });
        expect(malformedName.status).toBe(200);
        expect(malformedName.headers.get('x-tau-operation-id')).toBeTypeOf('string');
        const [malformedRead] = await Promise.allSettled([malformedName.text()]);
        if (malformedRead.status === 'fulfilled') {
          expect(malformedRead.value).toContain('"type":"error"');
        } else {
          expect(malformedRead.reason).toBeInstanceOf(Error);
        }
        expect(requests).toBe(7);
        expect(countBodies).toHaveLength(exactCount ? 7 : 0);

        const ownLookup = await fetch(`${base}/v1/billing/attempts/gateway/${gatewayAttempt}`, { headers });
        expect(ownLookup.status).toBe(200);
        expect((await ownLookup.json()) as { operationId?: string }).toMatchObject({ operationId });
        auth.api.getSession.mockResolvedValue(sessionFor(secondOwner.authUserId));
        const otherLookup = await fetch(`${base}/v1/billing/attempts/gateway/${gatewayAttempt}`, {
          headers: { 'x-test-owner': secondOwner.authUserId },
        });
        // GI-R3: another owner's lookup finds no row it owns, so it voids the key in its own account, not the first owner's.
        expect(await otherLookup.json()).toEqual({ state: 'not_found', voided: true });
      } finally {
        await app?.close();
        for (const timer of pendingProviderTimers) {
          clearTimeout(timer);
        }
        pendingProviderTimers.clear();
        const closed = once(provider, 'close');
        provider.close();
        await closed;
      }
    },
    60_000,
  );
});

/* The pinned tariff follows the request's own proved input bound: only a body that can reach the
 * premium threshold is held, valued and charged at it, so each sample carries the body its tier needs. */
it.each([
  // One input at $0.2/million plus one output at $1.2/million.
  { input: 1, cacheKnown: true, supplierCostPicoUsd: 1_400_000n, longContextMinimum: null },
  {
    // 272,001 input at the premium $0.4/million plus one output at $1.8/million.
    input: 272_001,
    cacheKnown: true,
    supplierCostPicoUsd: 108_802_200_000n,
    longContextMinimum: '272001',
    body: 'a'.repeat(268_000),
  },
  { input: 1, cacheKnown: false, supplierCostPicoUsd: null, longContextMinimum: null },
])(
  'should meter supplier cost of owner usage at the pinned context tariff: $input / cache known $cacheKnown',
  async (sample) => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      /* eslint-disable @typescript-eslint/naming-convention -- controlled endpoint emits native OpenAI usage keys */
      const usage = {
        input_tokens: sample.input,
        output_tokens: 1,
        input_tokens_details: { cached_tokens: 0, ...(sample.cacheKnown ? { cache_write_tokens: 0 } : {}) },
      };
      /* eslint-enable @typescript-eslint/naming-convention -- remaining fixture code uses local names */
      response.end(
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'valuation-request',
            status: 'completed',
            usage,
          },
        })}\n\ndata: [DONE]\n\n`,
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Missing local provider address');
      }
      const owner = createOwner(`http://127.0.0.1:${address.port}`);
      const fixture = await createFixture();
      const attemptKey = `valuation-${randomUUID()}`;
      if (sample.input === 1 && sample.cacheKnown) {
        for (const extra of [
          // eslint-disable-next-line @typescript-eslint/naming-convention -- rejected native provider economic option
          { service_tier: 'priority' },
          { messages: [{ role: 'user', content: 'foreign envelope' }] },
        ]) {
          // oxlint-disable-next-line no-await-in-loop -- prove each refusal independently before the funded invocation
          await expect(
            owner.invoke({
              environment: 'development',
              authUserId: fixture.authUserId,
              surface: 'gateway',
              attempt: { version: 1, key: `unqualified-${randomUUID()}` },
              providerWire: 'openai-responses',
              // eslint-disable-next-line @typescript-eslint/naming-convention -- native OpenAI ceiling field
              body: { model: 'openai-gpt-5.6-luna', stream: true, max_output_tokens: 1, input: 'fixture', ...extra },
              priceHeaders: {},
              activity: 'agent',
              signal: new AbortController().signal,
            }),
          ).rejects.toThrow('funded request contract');
        }
        expect(requests).toBe(0);
      }
      const result = await invoke({
        owner,
        authUserId: fixture.authUserId,
        attemptKey,
        ...(sample.body === undefined ? {} : { body: sample.body }),
      });
      if (result.state !== 'streaming') {
        throw new Error('Expected stream');
      }
      await result.response.arrayBuffer();
      await result.completion;
      const [operation] = await database
        .select()
        .from(creditOperation)
        .where(eq(creditOperation.id, result.operationId));
      // A base pin proves the premium tier unreachable, so its valuation carries the base schedule alone.
      expect(operation?.invocation?.supplierValuation?.longContextMinimumInputTokens).toBe(sample.longContextMinimum);
      expect(operation?.sku).toBe(
        sample.longContextMinimum === null ? 'model:openai-gpt-5.6-luna' : 'model:openai-gpt-5.6-luna:long-context',
      );
      if (sample.cacheKnown) {
        expect(operation).toMatchObject({
          chargedAtoms: BigInt(sample.input + 1),
          supplierCostPicoUsd: sample.supplierCostPicoUsd,
          supplierCostUnpricedReason: null,
        });
      } else {
        expect(operation).toMatchObject({
          chargedAtoms: null,
          customerState: 'pending',
          supplierCostPicoUsd: null,
          supplierCostUnpricedReason: null,
        });
        await database
          .update(creditOperation)
          .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
          .where(eq(creditOperation.id, result.operationId));
        const recovery = await ledger.recoverDueLlmOperations({ environment: 'development', limit: 100 });
        expect(recovery.failedOperationIds).not.toContain(result.operationId);
        const [recovered] = await database
          .select()
          .from(creditOperation)
          .where(eq(creditOperation.id, result.operationId));
        expect(recovered).toMatchObject({
          chargedAtoms: 0n,
          customerState: 'absorbed',
          supplierCostPicoUsd: null,
          supplierCostUnpricedReason: 'absorbed',
        });
      }
      const [settled] = await database.select().from(creditOperation).where(eq(creditOperation.id, result.operationId));
      const replay = await invoke({
        owner,
        authUserId: fixture.authUserId,
        attemptKey,
        ...(sample.body === undefined ? {} : { body: sample.body }),
      });
      expect(replay.state).toBe('terminal');
      expect(requests).toBe(1);
      // A replayed attempt reads the receipt; it never writes the supplier cost twice.
      const [replayed] = await database
        .select()
        .from(creditOperation)
        .where(eq(creditOperation.id, result.operationId));
      expect(replayed).toMatchObject({
        supplierCostPicoUsd: settled?.supplierCostPicoUsd,
        supplierCostUnpricedReason: settled?.supplierCostUnpricedReason,
        terminalRevision: settled?.terminalRevision,
      });
      // No supplier hold, finality state or supplier evidence is written on the way.
      expect(settled).toMatchObject({ spendBudgetHoldId: null, riskBudgetHoldId: null, supplierState: null });
    } finally {
      const closed = once(server, 'close');
      server.close();
      await closed;
    }
  },
);

/* The premium pin is taken on an upper bound. When the observed input lands below the threshold the
 * premium tier was provably never reached, so the settlement prices the base sku's retail rates. */
it('settles a long-context pin at the base tariff when the observed input never reached it', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    /* eslint-disable @typescript-eslint/naming-convention -- controlled endpoint emits native OpenAI usage keys */
    const usage = {
      input_tokens: 70_000,
      output_tokens: 1,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    };
    /* eslint-enable @typescript-eslint/naming-convention -- remaining fixture code uses local names */
    response.end(
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: { id: 'tier-request', status: 'completed', usage },
      })}\n\ndata: [DONE]\n\n`,
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing local provider address');
    }
    const owner = createOwner(`http://127.0.0.1:${address.port}`);
    const fixture = await createFixture({ longContextPremium: true });
    const result = await invoke({
      owner,
      authUserId: fixture.authUserId,
      attemptKey: `tier-${randomUUID()}`,
      body: 'a'.repeat(300_000),
    });
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }
    await result.response.arrayBuffer();
    await result.completion;

    const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, result.operationId));
    // The hold stays where the proof put it: the bound could have reached the premium threshold.
    expect(operation?.sku).toBe('model:openai-gpt-5.6-luna:long-context');
    expect(operation?.invocation?.supplierValuation?.longContextMinimumInputTokens).toBe('272001');
    // 70,000 input + 1 output at the base schedule, not 140,002 at the premium one.
    expect(operation?.chargedAtoms).toBe(70_001n);
    expect(operation?.chargedAtoms).toBeLessThanOrEqual(operation!.authorizedAtoms);
    expect(operation).toMatchObject({ customerState: 'settled', meteringStatus: 'complete' });
    // The persisted meter items carry the rate the items were actually charged at.
    expect(
      operation?.meterItems?.map(({ dimension, numeratorCreditAtoms }) => [dimension, numeratorCreditAtoms]),
    ).toEqual(
      expect.arrayContaining([
        ['uncached_input', '1'],
        ['output', '1'],
      ]),
    );
    expect(
      await database
        .select()
        .from(schema.billingRoutePause)
        .where(eq(schema.billingRoutePause.operationId, result.operationId)),
    ).toHaveLength(0);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

/* An overrun settles at the authorization and records the customer-bound exception for the operator;
 * it pauses nothing, so the route keeps serving every account, this one included. */
it('should settle a retail overrun at the authorization, record customer_bound and pause no route', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    /* eslint-disable @typescript-eslint/naming-convention -- controlled endpoint emits native OpenAI usage keys */
    const usage = {
      input_tokens: 400_000,
      output_tokens: 1,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    };
    /* eslint-enable @typescript-eslint/naming-convention -- remaining fixture code uses local names */
    response.end(
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: { id: 'overrun-request', status: 'completed', usage },
      })}\n\ndata: [DONE]\n\n`,
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing local provider address');
    }
    const owner = createOwner(`http://127.0.0.1:${address.port}`);
    const fixture = await createFixture({ longContextPremium: true });
    const result = await invoke({
      owner,
      authUserId: fixture.authUserId,
      attemptKey: `overrun-${randomUUID()}`,
      body: 'a'.repeat(300_000),
    });
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }
    await result.response.arrayBuffer();
    await result.completion;

    const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, result.operationId));
    expect(operation?.sku).toBe('model:openai-gpt-5.6-luna:long-context');
    expect(operation).toMatchObject({ customerState: 'settled', chargedAtoms: operation?.authorizedAtoms });
    const exceptions = await database
      .select()
      .from(schema.billingOperationException)
      .where(eq(schema.billingOperationException.operationId, result.operationId));
    // The reported input also passed the proved input bound, so both overrun signals are kept for the operator.
    expect(exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'customer_bound',
          quantum: 'credit_atoms',
          maximum: operation?.authorizedAtoms,
        }),
        expect.objectContaining({ kind: 'input_bound', quantum: 'input_tokens', observedNumerator: '400000' }),
      ]),
    );
    expect(exceptions).toHaveLength(2);
    expect(
      await database
        .select()
        .from(schema.billingRoutePause)
        .where(eq(schema.billingRoutePause.operationId, result.operationId)),
    ).toEqual([]);
    // Both tiers keep serving: the next base-tier call admits and settles.
    const after = await invoke({ owner, authUserId: fixture.authUserId, attemptKey: `after-overrun-${randomUUID()}` });
    expect(after.state).toBe('streaming');
    if (after.state === 'streaming') {
      await after.response.arrayBuffer();
      await after.completion;
    }
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

/* oxlint-disable no-await-in-loop -- fixture modes mutate one account and endpoint sequentially */
it('bounds selected count I/O, denies ineligible owners, fences contention and retains overflow', async () => {
  let counts = 0;
  let activeCounts = 0;
  let generations = 0;
  let countBody = '{"object":"response.input_tokens","input_tokens":1}';
  let countDelay = 0;
  let generationDelay = 0;
  let holdTail = false;
  let releaseTail: (() => void) | undefined;
  let actualInput = 1;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const server = createServer((request, response) => {
    request.resume();
    const counting = request.url === '/v1/responses/input_tokens';
    if (counting) {
      counts++;
      activeCounts++;
      response.once('close', () => {
        activeCounts--;
      });
    } else {
      generations++;
    }
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        if (counting) {
          response.end(countBody);
          return;
        }
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        const tail = `data: {"type":"response.completed","response":{"id":"c05-request","status":"completed","usage":{"input_tokens":${actualInput},"output_tokens":1,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0}}}}\n\ndata: [DONE]\n\n`;
        if (holdTail) {
          // The answer is on the wire; the usage frame waits for the test to end the generation.
          response.write('data: {"type":"response.output_text.delta","delta":"answer"}\n\n');
          releaseTail = () => {
            releaseTail = undefined;
            response.end(tail);
          };
          return;
        }
        response.end(tail);
      },
      counting ? countDelay : generationDelay,
    );
    timers.add(timer);
    response.once('close', () => {
      clearTimeout(timer);
      timers.delete(timer);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing local count address');
    }
    const url = `http://127.0.0.1:${address.port}`;
    const counters = new Map<string, InputCountCapability | undefined>([
      [
        'openai-gpt-5.6-luna',
        {
          qualification: 'controlled-local-zero',
          environment: 'development',
          credentialAccount: 'fixture-openai-account',
          sourceRevision: 'c05-controlled-limits',
          url: `${url}/v1/responses/input_tokens`,
        },
      ],
    ]);
    const owner = createOwner(url, 60_000, counters);
    const fixture = await createFixture();
    const call = async (attemptKey = randomUUID(), signal?: AbortSignal) =>
      invoke({ owner, authUserId: fixture.authUserId, attemptKey, ...(signal ? { signal } : {}) });
    const lookup = async (attemptKey: string) =>
      ledger.getOperationForAttempt({
        environment: 'development',
        authUserId: fixture.authUserId,
        surface: 'gateway',
        attemptKey,
      });
    for (const state of [
      { status: 'closed', purchasedAtoms: 100n, debtAtoms: 0n },
      { status: 'open', purchasedAtoms: 100n, debtAtoms: 1n },
      { status: 'open', purchasedAtoms: 0n, debtAtoms: 0n },
    ]) {
      await database.update(creditAccount).set(state).where(eq(creditAccount.id, fixture.accountId));
      await expect(call()).rejects.toThrow();
    }
    expect(counts).toBe(0);
    await database
      .update(creditAccount)
      .set({ status: 'open', purchasedAtoms: 100n, debtAtoms: 0n })
      .where(eq(creditAccount.id, fixture.accountId));
    await database.update(creditAccount).set({ purchasedAtoms: 1n }).where(eq(creditAccount.id, fixture.accountId));
    await expect(
      owner.invoke({
        environment: 'development',
        authUserId: fixture.authUserId,
        surface: 'gateway',
        attempt: { version: 1, key: randomUUID() },
        providerWire: 'openai-responses',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- exact native Responses field
        body: { model: 'openai-gpt-5.6-luna', input: 'fixture', max_output_tokens: 2, stream: true },
        priceHeaders: {},
        activity: 'agent',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    await database.update(creditAccount).set({ purchasedAtoms: 100n }).where(eq(creditAccount.id, fixture.accountId));
    // An operator pause refuses before a supplier count call is spent.
    const pause = await pauseRoute('count eligibility');
    try {
      await expect(call()).rejects.toSatisfy((error: unknown) => gatewayCode(error) === 'MODEL_ROUTE_PAUSED');
    } finally {
      await resumeRoute(pause);
    }
    expect(counts).toBe(0);
    const unavailableOwner = createOwner(url, 60_000, new Map([['openai-gpt-5.6-luna', undefined]]));
    await expect(
      invoke({ owner: unavailableOwner, authUserId: fixture.authUserId, attemptKey: randomUUID() }),
    ).rejects.toThrow();
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(call(randomUUID(), cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(counts).toBe(0);
    for (const malformed of [
      '{}',
      '{"object":"response.input_tokens","input_tokens":-1}',
      '{"object":"response.input_tokens","input_tokens":1050000}',
      'x'.repeat(1025),
    ]) {
      countBody = malformed;
      const attempt = randomUUID();
      await expect(call(attempt)).rejects.toThrow();
      expect(await lookup(attempt)).toBeUndefined();
    }
    expect(generations).toBe(0);
    countBody = '{"object":"response.input_tokens","input_tokens":1}';
    countDelay = 150;
    holdTail = true;
    const attempt = randomUUID();
    const countBefore = counts;
    const first = call(attempt);
    await expect.poll(() => counts).toBe(countBefore + 1);
    const second = call(attempt);
    await expect.poll(() => counts).toBe(countBefore + 2);
    const concurrent = await Promise.all([first, second]);
    const result = concurrent.find((candidate) => candidate.state === 'streaming');
    if (!result) {
      throw new Error('Counted invocation did not stream');
    }
    expect(concurrent.find((candidate) => candidate !== result)).toMatchObject({ operationId: result.operationId });
    // The supplier is still generating: the attempt replays as pending.
    expect(await call(attempt)).toEqual({ state: 'pending', operationId: result.operationId });
    /* The supplier finishes while the client has read nothing. Settlement follows the
     * supplier, so the turn is terminal and charged before a byte of it is consumed. */
    releaseTail!();
    holdTail = false;
    await result.completion;
    expect(await call(attempt)).toEqual({ state: 'terminal', operationId: result.operationId });
    await result.response.text();
    expect(counts).toBe(countBefore + 2);
    expect(generations).toBe(1);
    const operation = await lookup(attempt);
    expect(operation?.customerState).toBe('settled');
    expect(operation?.chargedAtoms).toBeGreaterThan(0n);
    expect(operation?.authorizedAtoms).toBe(2n);
    expect(operation?.dueAt.getTime()).toBeLessThan(operation!.admittedAt!.getTime() + 59_950);
    // Count-selected failure has no full-context fallback.
    const timedOwner = createOwner(url, 50, counters);
    const timedAttempt = randomUUID();
    await expect(
      invoke({ owner: timedOwner, authUserId: fixture.authUserId, attemptKey: timedAttempt }),
    ).rejects.toThrow();
    expect(await lookup(timedAttempt)).toBeUndefined();
    expect(generations).toBe(1);
    await expect.poll(() => activeCounts).toBe(0);
    const duringCount = new AbortController();
    const cancelledAttempt = randomUUID();
    const beforeCancel = counts;
    const cancelling = call(cancelledAttempt, duringCount.signal);
    await expect.poll(() => counts).toBe(beforeCancel + 1);
    duringCount.abort();
    await expect(cancelling).rejects.toMatchObject({ name: 'AbortError' });
    expect(await lookup(cancelledAttempt)).toBeUndefined();
    await expect.poll(() => activeCounts).toBe(0);
    expect(generations).toBe(1);
    countDelay = 80;
    generationDelay = 600;
    const sharedOwner = createOwner(url, 500, counters);
    const deadlineAttempt = randomUUID();
    await expect(
      invoke({ owner: sharedOwner, authUserId: fixture.authUserId, attemptKey: deadlineAttempt }),
    ).rejects.toThrow();
    const deadlineOperation = await lookup(deadlineAttempt);
    expect(deadlineOperation?.invocation?.inputCount?.inputTokens).toBe('1');
    expect(deadlineOperation!.dueAt.getTime() - deadlineOperation!.admittedAt!.getTime()).toBeLessThan(450);
    countDelay = 0;
    generationDelay = 0;
    actualInput = 0;
    countBody = '{"object":"response.input_tokens","input_tokens":0}';
    const zeroAttempt = randomUUID();
    const zero = await call(zeroAttempt);
    if (zero.state !== 'streaming') {
      throw new Error('Zero-count invocation did not stream');
    }
    await zero.response.text();
    await zero.completion;
    const zeroOperation = await lookup(zeroAttempt);
    expect(zeroOperation?.invocation?.inputCount?.inputTokens).toBe('0');
    expect(zeroOperation?.authorizedAtoms).toBe(1n);
    countBody = '{"object":"response.input_tokens","input_tokens":1}';
    actualInput = 2;
    const overflowAttempt = randomUUID();
    const overflow = await call(overflowAttempt);
    if (overflow.state !== 'streaming') {
      throw new Error('Overflow invocation did not stream');
    }
    await overflow.response.text();
    await overflow.completion;
    const overflowOperation = await lookup(overflowAttempt);
    expect(overflowOperation?.chargedAtoms).toBeLessThanOrEqual(2n);
    expect(overflowOperation?.invocation?.jointInputMaximum?.quantity).toBe('1');
    const exceptions = await database
      .select()
      .from(schema.billingOperationException)
      .where(eq(schema.billingOperationException.operationId, overflow.operationId));
    expect(exceptions.some((exception) => exception.kind === 'input_bound')).toBe(true);
    // The input overflow is recorded for the operator; it pauses nothing.
    expect(
      await database
        .select()
        .from(schema.billingRoutePause)
        .where(eq(schema.billingRoutePause.operationId, overflow.operationId)),
    ).toEqual([]);
    const beforePaused = counts;
    const firstPause = await pauseRoute('c05-fixture');
    try {
      await expect(call()).rejects.toSatisfy((error: unknown) => gatewayCode(error) === 'MODEL_ROUTE_PAUSED');
      expect(counts).toBe(beforePaused);
    } finally {
      await resumeRoute(firstPause);
    }
    // A pause after a resume appends its own row; the resumed one stays as the audit trail.
    const secondPause = await pauseRoute('c05-fixture again');
    await resumeRoute(secondPause);
    const pauses = await database
      .select()
      .from(schema.billingRoutePause)
      .where(inArray(schema.billingRoutePause.id, [firstPause, secondPause]));
    expect(pauses).toHaveLength(2);
    expect(pauses.every((row) => row.resumedAt !== null && row.actor === 'foundation-operator')).toBe(true);
    const busy = await createFixture();
    await database
      .update(creditAccount)
      .set({ purchasedAtoms: 1_000_000_000n })
      .where(eq(creditAccount.id, busy.accountId));
    const uncountedOwner = createOwner(url);
    for (let index = 0; index < 64; index++) {
      // The caller leaves once admitted, so the hold stays open for the recovery sweep.
      const leaving = new AbortController();
      await invoke({
        owner: uncountedOwner,
        authUserId: busy.authUserId,
        attemptKey: `busy-${index}-${randomUUID()}`,
        signal: leaving.signal,
        onAdmitted: () => {
          leaving.abort();
        },
      });
    }
    await expect(invoke({ owner, authUserId: busy.authUserId, attemptKey: randomUUID() })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError &&
        error.getStatus() === 429 &&
        (error.getResponse() as { error?: { type?: string } }).error?.type === 'FUNDED_OPERATION_LIMIT',
    );
    expect(counts).toBe(beforePaused);
  } finally {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    server.closeAllConnections();
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
}, 60_000);

/* oxlint-enable no-await-in-loop -- sequential endpoint fixture complete */

/* B7 I3 / R8: the in-stream ceiling stops the supplier spend. It proves nothing was delivered, so
 * the customer is charged what the stream proved and an operator owns the mis-sized ceiling. */
it('should charge nothing when a stream passes its ceiling, leave its supplier cost unpriced and the route open', async () => {
  let exhaust = true;
  const server = createServer((_request, response) => {
    response.on('error', () => {
      /* The gateway cancels this response mid-flight; a reset socket is the expected end. */
    });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    if (!exhaust) {
      response.end(
        'data: {"type":"response.completed","response":{"id":"after-ceiling","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0}}}}\n\ndata: [DONE]\n\n',
      );
      return;
    }
    // The qualified ceiling is 64 bytes per authorized output token plus 1 MiB; this asks for one token.
    response.end(`data: ${'x'.repeat(1_100_000)}\n\n`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing local provider address');
    }
    const owner = createOwner(`http://127.0.0.1:${address.port}`);
    const fixture = await createFixture();
    const result = await invoke({ owner, authUserId: fixture.authUserId, attemptKey: `ceiling-${randomUUID()}` });
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }
    await expect(result.response.arrayBuffer()).rejects.toThrow('authorized ceiling');
    await result.completion;

    const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, result.operationId));
    expect(operation).toMatchObject({ customerState: 'settled', executionStatus: 'cancelled' });
    expect(operation?.normalizationEvidence?.terminalReason).toBe('authorized_exhausted');
    /* The cut is not a delivery receipt: no usage reached us, so nothing is charged. Charging the
     * authorization here would bill the maximum for a truncated answer on every wire that reports
     * usage only in its final event. */
    expect(operation?.chargedAtoms).toBe(0n);
    expect(operation?.authorizedAtoms).toBeGreaterThan(0n);
    const [evidence] = await database
      .select()
      .from(schema.billingInvocationEvidence)
      .where(eq(schema.billingInvocationEvidence.operationId, result.operationId));
    expect(evidence?.evidence.kind).toBe('authorized_exhausted');
    // The cut stream reported no usage, so its supplier cost is unpriced rather than guessed.
    expect(operation).toMatchObject({ supplierCostPicoUsd: null, supplierCostUnpricedReason: 'absorbed' });
    // The bytes that measure the ceiling's bytes-per-output-token constant stay on the operation.
    expect(Number(operation?.normalizationEvidence?.fields['responseBytes'])).toBeGreaterThan(1_000_000);
    expect(
      await database
        .select()
        .from(schema.billingOperationException)
        .where(eq(schema.billingOperationException.operationId, result.operationId)),
    ).toHaveLength(0);
    // A truncated answer is operator telemetry, never a case.
    expect(
      await database.select().from(billingFinancialCase).where(eq(billingFinancialCase.sourceId, result.operationId)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(schema.billingRoutePause)
        .where(eq(schema.billingRoutePause.operationId, result.operationId)),
    ).toHaveLength(0);

    exhaust = false;
    const next = await invoke({ owner, authUserId: fixture.authUserId, attemptKey: `after-ceiling-${randomUUID()}` });
    if (next.state !== 'streaming') {
      throw new Error('The ceiling paused its route');
    }
    await next.response.arrayBuffer();
    await next.completion;
  } finally {
    server.closeAllConnections();
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

it('persists the provider incomplete reason as the operation terminal reason', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(
      'data: {"type":"response.incomplete","response":{"id":"incomplete-request","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":1,"output_tokens":1,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0}}}}\n\ndata: [DONE]\n\n',
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing local provider address');
    }
    const owner = createOwner(`http://127.0.0.1:${address.port}`);
    const fixture = await createFixture();
    const result = await invoke({ owner, authUserId: fixture.authUserId, attemptKey: `incomplete-${randomUUID()}` });
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }
    await result.response.arrayBuffer();
    await result.completion;

    const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, result.operationId));
    expect(operation).toMatchObject({ customerState: 'settled', executionStatus: 'succeeded' });
    expect(operation?.normalizationEvidence?.terminalReason).toBe('max_output_tokens');
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

/** A provider endpoint that settles every call with one input and one output token. */
const settlingProvider = async () => {
  let requests = 0;
  let refuse = false;
  let hang = false;
  const server = createServer((_request, response) => {
    requests += 1;
    if (hang) {
      // The answer starts and the usage frame never comes; the client leaves mid-stream.
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"type":"response.output_text.delta","delta":"answer"}\n\n');
      return;
    }
    if (refuse) {
      // A status-coded refusal: the supplier ran nothing.
      response.writeHead(402, { 'content-type': 'application/json' });
      response.end('{"error":{"message":"refused"}}');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(
      'data: {"type":"response.completed","response":{"id":"admission","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0}}}}\n\ndata: [DONE]\n\n',
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing local provider address');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests: () => requests,
    refuse: (value: boolean) => {
      refuse = value;
    },
    hang: (value: boolean) => {
      hang = value;
    },
    close: async () => {
      server.closeAllConnections();
      const closed = once(server, 'close');
      server.close();
      await closed;
    },
  };
};

const settle = async (owner: BillableModelInvocationService, authUserId: string, attemptKey = randomUUID()) => {
  const result = await invoke({ owner, authUserId, attemptKey });
  if (result.state !== 'streaming') {
    throw new Error('Expected stream');
  }
  await result.response.arrayBuffer();
  await result.completion;
  return result.operationId;
};

/** Financial cases are undeletable evidence; every case a test opens is resolved before it ends. */
const openedCases: string[] = [];
const openCase = async (input: { kind: string; sourceType: string; sourceId: string; accountId?: string }) => {
  const id = `admission-case-${randomUUID()}`;
  openedCases.push(id);
  await database.insert(billingFinancialCase).values({
    id,
    environment: 'development',
    stripeAccountId: 'acct_admission',
    livemode: false,
    kind: input.kind,
    dedupeKey: id,
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    evidence: { version: 'admission-foundation-v1' },
    owner: 'billing-operations',
    nextStep: 'operator_review',
    firstEffectiveAt: new Date(),
  });
  return id;
};
const resolveCases = async (ids: readonly string[] = openedCases): Promise<void> => {
  if (ids.length === 0) {
    return;
  }
  await database
    .update(billingFinancialCase)
    .set({ state: 'resolved', resolvedAt: new Date(), resolutionEvidence: { version: 'admission-foundation-v1' } })
    .where(and(inArray(billingFinancialCase.id, [...ids]), ne(billingFinancialCase.state, 'resolved')));
};
afterAll(async () => resolveCases());

describe('funded admission reads no supplier state', () => {
  it('should admit with no supplier budget, write no hold, and admit under an operator pause only once resumed', async () => {
    const provider = await settlingProvider();
    const metrics = mockDeep<MetricsService>();
    const owner = createOwner(provider.url, 60_000, undefined, metrics);
    const fixture = await createFixture();
    try {
      const admitted = await settle(owner, fixture.authUserId);
      const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, admitted));
      expect(operation).toMatchObject({
        customerState: 'settled',
        spendBudgetHoldId: null,
        riskBudgetHoldId: null,
        supplierState: null,
      });
      expect(
        await database
          .select()
          .from(schema.billingBudgetHold)
          .where(eq(schema.billingBudgetHold.operationId, admitted)),
      ).toEqual([]);
      expect(
        await database.select().from(supplierCostEvidence).where(eq(supplierCostEvidence.operationId, admitted)),
      ).toEqual([]);

      const pause = await pauseRoute('operator review');
      const deniedKey = `paused-${randomUUID()}`;
      try {
        const refusal = await invoke({ owner, authUserId: fixture.authUserId, attemptKey: deniedKey }).catch(
          (error: unknown) => error,
        );
        if (!(refusal instanceof LlmGatewayError)) {
          throw new TypeError('Expected a typed gateway refusal');
        }
        expect(refusal.getStatus()).toBe(503);
        expect(refusal.getResponse()).toEqual({
          type: 'error',
          error: {
            type: 'MODEL_ROUTE_PAUSED',
            message: "This model route is paused by Tau's operators.",
            details: { routeId: 'openai-gpt-5.6-luna' },
          },
        });
        expect(metrics.billingFundedOperationDenials.add).toHaveBeenCalledWith(1, {
          'deployment.environment': 'development',
          'tau.billing.capacity_pool': 'primary',
          'tau.billing.denial.reason': 'operator_route_paused',
        });
        expect(provider.requests()).toBe(1);
        expect(await database.select().from(creditOperation).where(eq(creditOperation.attemptKey, deniedKey))).toEqual(
          [],
        );
        // Another route is unaffected by this pause: it reaches its own admission (unfunded in this policy).
        await expect(
          owner.invoke({
            environment: 'development',
            authUserId: fixture.authUserId,
            surface: 'gateway',
            attempt: { version: 1, key: `other-route-${randomUUID()}` },
            providerWire: 'openai-responses',
            // eslint-disable-next-line @typescript-eslint/naming-convention -- native OpenAI ceiling field
            body: { model: 'openai-gpt-5.5', stream: true, max_output_tokens: 1, input: 'fixture' },
            priceHeaders: {},
            activity: 'agent',
            signal: new AbortController().signal,
          }),
        ).rejects.toSatisfy((error: unknown) => gatewayCode(error) === 'PROVIDER_UNAVAILABLE');
      } finally {
        await resumeRoute(pause);
      }
      await settle(owner, fixture.authUserId);
      expect(provider.requests()).toBe(2);
    } finally {
      await provider.close();
    }
  });

  it('should refuse a pause row from the runtime role', async () => {
    await expect(
      database.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE tau_billing_runtime`);
        await tx.insert(schema.billingRoutePause).values({
          environment: 'development',
          sku: `model:runtime-${randomUUID()}`,
          actor: 'runtime',
          reason: 'runtime may not pause',
        });
      }),
    ).rejects.toSatisfy((error: unknown) => databaseCode(error) === '42501');
  });

  it('should admit while any supplier case names an operation of this route, or a cash case names another account', async () => {
    const provider = await settlingProvider();
    const owner = createOwner(provider.url);
    const fixture = await createFixture();
    const other = await createFixture();
    const cases: string[] = [];
    try {
      const operationId = await settle(owner, fixture.authUserId);
      cases.push(
        ...(await Promise.all(
          [
            'supplier_evidence_missing',
            'supplier_evidence_mismatched',
            'supplier_state_unresolved',
            'supplier_charge_unmatched',
          ].map(async (kind) => openCase({ kind, sourceType: 'credit_operation', sourceId: operationId })),
        )),
      );
      cases.push(
        await openCase({
          kind: 'dispute_unresolved',
          sourceType: 'stripe_dispute',
          sourceId: `dp_${randomUUID()}`,
          accountId: other.accountId,
        }),
      );
      const admitted = await settle(owner, fixture.authUserId);
      const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, admitted));
      expect(operation?.customerState).toBe('settled');
      expect(provider.requests()).toBe(2);
    } finally {
      await resolveCases(cases);
      await provider.close();
    }
  });

  /* The originating defect in both shapes: a turn that stopped, or that the supplier refused, used to pause its
   * route for every account a day later. Neither can change admission for anyone now. */
  it.each(['client_abort', 'provider_refusal'] as const)(
    'should keep admitting other accounts on the route after a %s is recovered and aged',
    async (shape) => {
      const provider = await settlingProvider();
      const owner = createOwner(provider.url);
      const stopped = await createFixture();
      const bystander = await createFixture();
      try {
        let operationId: string | undefined;
        if (shape === 'client_abort') {
          provider.hang(true);
          const result = await invoke({ owner, authUserId: stopped.authUserId, attemptKey: `stopped-${randomUUID()}` });
          if (result.state !== 'streaming') {
            throw new Error('Expected stream');
          }
          operationId = result.operationId;
          const reader = result.response.body!.getReader();
          await reader.read();
          await reader.cancel();
          await result.completion;
          provider.hang(false);
        } else {
          provider.refuse(true);
          await expect(
            invoke({
              owner,
              authUserId: stopped.authUserId,
              attemptKey: `refused-${randomUUID()}`,
              onAdmitted: (id) => {
                operationId = id;
              },
            }),
          ).rejects.toBeInstanceOf(LlmGatewayError);
          provider.refuse(false);
        }
        if (operationId === undefined) {
          throw new Error('The stopped turn was never admitted');
        }
        // Recovery claims whatever is still pending, then the turn ages past a day and a second pass runs.
        await database
          .update(creditOperation)
          .set({ dueAt: sql`clock_timestamp() - interval '10 minutes'` })
          .where(and(eq(creditOperation.id, operationId), eq(creditOperation.customerState, 'pending')));
        await ledger.recoverDueLlmOperations({ environment: 'development', limit: 100 });
        const [recovered] = await database.select().from(creditOperation).where(eq(creditOperation.id, operationId));
        expect(recovered).toMatchObject(
          shape === 'client_abort'
            ? {
                customerState: 'absorbed',
                chargedAtoms: 0n,
                supplierCostPicoUsd: null,
                supplierCostUnpricedReason: 'absorbed',
              }
            : {
                customerState: 'released',
                chargedAtoms: 0n,
                supplierCostPicoUsd: 0n,
                supplierCostUnpricedReason: null,
              },
        );
        expect(recovered?.supplierState).toBeNull();
        // Nothing reads a terminal turn's age at admission any more; a later pass finds nothing to do for it.
        await ledger.recoverDueLlmOperations({ environment: 'development', limit: 100 });
        // What the retired supplier sweep opened a day later for such a turn no longer stops anyone.
        const opened = await openCase({
          kind: 'supplier_state_unresolved',
          sourceType: 'credit_operation',
          sourceId: operationId,
        });
        try {
          await settle(owner, bystander.authUserId);
          await settle(owner, stopped.authUserId);
        } finally {
          await resolveCases([opened]);
        }
        expect(
          await database
            .select()
            .from(schema.billingRoutePause)
            .where(eq(schema.billingRoutePause.operationId, operationId)),
        ).toEqual([]);
        expect(
          await database
            .select()
            .from(billingFinancialCase)
            .where(and(eq(billingFinancialCase.sourceId, operationId), ne(billingFinancialCase.id, opened))),
        ).toEqual([]);
      } finally {
        await provider.close();
      }
    },
  );
});

describe('account-scoped spend gate', () => {
  it.each([
    'missing_local_payment',
    'paid_unfulfilled_recovery',
    'unfulfilled_purchase_obligation',
    'gross_fee_net_mismatch',
    'refund_unresolved',
  ])('should admit an account an open %s case names: money Tau owes it never stops it spending', async (kind) => {
    const provider = await settlingProvider();
    const owner = createOwner(provider.url);
    const fixture = await createFixture();
    const opened = await openCase({
      kind,
      sourceType: 'fixture',
      sourceId: randomUUID(),
      accountId: fixture.accountId,
    });
    try {
      const operationId = await settle(owner, fixture.authUserId);
      const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, operationId));
      expect(operation?.customerState).toBe('settled');
    } finally {
      await resolveCases([opened]);
      await provider.close();
    }
  });

  it('should answer 409 cash_scope_attention at new collection for an unattributed missing_local_payment and admit every account', async () => {
    const provider = await settlingProvider();
    const owner = createOwner(provider.url);
    const fixture = await createFixture();
    const bystander = await createFixture();
    const opened = await openCase({
      kind: 'missing_local_payment',
      sourceType: 'stripe_payment_intent',
      sourceId: `pi_${randomUUID()}`,
    });
    try {
      const refusal = await assertNewCollectionCashScope(
        { database },
        { environment: 'development', stripeAccountId: 'acct_admission', livemode: false },
        fixture.accountId,
      ).catch((error: unknown) => error);
      if (!(refusal instanceof ConflictException)) {
        throw new TypeError('Expected the purchase-time cash scope refusal');
      }
      expect(refusal.getStatus()).toBe(409);
      expect(refusal.message).toBe('cash_scope_attention');
      for (const account of [fixture, bystander]) {
        // oxlint-disable-next-line no-await-in-loop -- one settled turn per account against the same open case
        const operationId = await settle(owner, account.authUserId);
        // oxlint-disable-next-line no-await-in-loop -- as above
        const [operation] = await database.select().from(creditOperation).where(eq(creditOperation.id, operationId));
        expect(operation?.customerState).toBe('settled');
      }
    } finally {
      await resolveCases([opened]);
      await provider.close();
    }
  });

  it.each(['dispute_unresolved', 'orphan_local_receipt', 'journal_balance_drift', 'restricted_status'])(
    'should deny %s with 403 BILLING_ACCOUNT_RESTRICTED and create no operation',
    async (cause) => {
      const provider = await settlingProvider();
      const owner = createOwner(provider.url);
      const fixture = await createFixture();
      const opened =
        cause === 'restricted_status'
          ? undefined
          : await openCase({
              kind: cause,
              sourceType: 'fixture',
              sourceId: randomUUID(),
              accountId: fixture.accountId,
            });
      if (cause === 'restricted_status') {
        await database
          .update(creditAccount)
          .set({ status: 'restricted' })
          .where(eq(creditAccount.id, fixture.accountId));
      }
      const attemptKey = `restricted-${randomUUID()}`;
      try {
        const refusal = await invoke({ owner, authUserId: fixture.authUserId, attemptKey }).catch(
          (error: unknown) => error,
        );
        if (!(refusal instanceof LlmGatewayError)) {
          throw new TypeError('Expected a typed gateway refusal');
        }
        expect(refusal.getStatus()).toBe(403);
        expect(gatewayCode(refusal)).toBe('BILLING_ACCOUNT_RESTRICTED');
        expect(await database.select().from(creditOperation).where(eq(creditOperation.attemptKey, attemptKey))).toEqual(
          [],
        );
        expect(provider.requests()).toBe(0);
      } finally {
        await resolveCases(opened === undefined ? [] : [opened]);
        await provider.close();
      }
    },
  );
});
