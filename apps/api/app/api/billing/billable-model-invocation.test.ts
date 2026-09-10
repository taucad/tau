import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import {
  billableModelRouteIds,
  CodeOwnedBillableModelQualificationResolver,
} from '#api/billing/billable-model-qualification.js';
import { createBillableModelProviderAdapters } from '#api/billing/billable-model-provider.js';
import type {
  BillableInvocationIntent,
  BillableProviderWire,
  BillableModelQualificationResolver,
  QualifiedBillableInvocation,
} from '#api/billing/billable-model-invocation.types.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { MetricsService } from '#telemetry/metrics.js';

const qualification = (): QualifiedBillableInvocation => ({
  surface: 'gateway',
  routeId: 'route',
  providerWire: 'openai-responses',
  modelId: 'model',
  modelDisplayName: 'Model',
  providerId: 'openai',
  sku: 'model:route',
  meterContractId: 'meter',
  maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: 10n }],
  supplierMaximumPicoUsd: 10n,
  maximumResponseBytes: 128,
  replica: { schemaVersion: 1, meterContractIds: ['meter'] },
  invocation: {
    contractVersion: 'v1',
    credentialAccount: 'account',
    supplierRatesValidUntil: null,
    supplierRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
    executionTimeout: 30_000,
  },
  normalizedRequest: { body: { model: 'model' }, headers: {} },
  adapter: {
    createEvidenceCollector: () => ({
      accept: vi.fn(),
      complete: () => ({
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 1n }],
      }),
      failed: () => ({ kind: 'absorbed_unknown' }),
    }),
    executeOnce: vi.fn(async () => new Response('ok')),
    classifyFinality: () => ({ state: 'unknown' }),
  },
});

const intent = (signal = new AbortController().signal): BillableInvocationIntent => ({
  environment: 'development',
  authUserId: 'user',
  surface: 'gateway',
  attempt: { version: 1, key: 'attempt_0000000001' },
  providerWire: 'openai-responses',
  body: { model: 'model' },
  priceHeaders: {},
  activity: 'agent',
  signal,
});

const gatewayErrorType = (error: unknown): string | undefined => {
  if (!(error instanceof LlmGatewayError)) {
    return undefined;
  }
  return (error.getResponse() as { error?: { type?: string } }).error?.type;
};

describe('BillableModelInvocationService', () => {
  it('maps every catalog route through the production adapter factory and actual resolver', () => {
    const routeCases = (
      [
        ['anthropic-claude-fable-5.1', 'claude-fable-5-1', 'anthropic', 'max_tokens'],
        ['anthropic-claude-fable-5', 'claude-fable-5', 'anthropic', 'max_tokens'],
        ['anthropic-claude-opus-5', 'claude-opus-5', 'anthropic', 'max_tokens'],
        ['anthropic-claude-opus-4.8', 'claude-opus-4-8', 'anthropic', 'max_tokens'],
        ['anthropic-claude-sonnet-5', 'claude-sonnet-5', 'anthropic', 'max_tokens'],
        ['anthropic-claude-sonnet-4.6', 'claude-sonnet-4-6', 'anthropic', 'max_tokens'],
        ['anthropic-claude-haiku-4.5', 'claude-haiku-4-5-20251001', 'anthropic', 'max_tokens'],
        ['openai-gpt-6-astra', 'gpt-6-astra', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.6-sol', 'gpt-5.6-sol', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.6-terra', 'gpt-5.6-terra', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.6-luna', 'gpt-5.6-luna', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.5', 'gpt-5.5', 'openai-responses', 'max_output_tokens'],
        ['google-gemini-3.1-pro', 'gemini-3.1-pro-preview', 'openai-completions', 'max_completion_tokens'],
        ['google-gemini-3.7-flash', 'gemini-3.7-flash', 'openai-completions', 'max_completion_tokens'],
        ['google-gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'openai-completions', 'max_completion_tokens'],
        ['google-gemini-3.5-flash', 'gemini-3.5-flash', 'openai-completions', 'max_completion_tokens'],
        ['together-kimi-k3', 'moonshotai/Kimi-K3', 'openai-completions', 'max_completion_tokens'],
        ['together-glm-5.2', 'zai-org/GLM-5.2', 'openai-completions', 'max_completion_tokens'],
        ['morph-minimax-m2.7', 'morph-minimax27-230b', 'openai-completions', 'max_tokens'],
        ['xai-grok-4.6', 'grok-4.6', 'openai-completions', 'max_completion_tokens'],
      ] satisfies ReadonlyArray<
        readonly [
          routeId: string,
          model: string,
          wire: BillableProviderWire,
          outputField: 'max_tokens' | 'max_output_tokens' | 'max_completion_tokens',
        ]
      >
    ).map(([routeId, model, wire, outputField]) => ({ routeId, model, wire, outputField }));
    const configured = new Map<string, unknown>([
      ['ANTHROPIC_API_KEY', 'anthropic-key'],
      ['OPENAI_API_KEY', 'openai-key'],
      ['TOGETHER_API_KEY', 'together-key'],
      ['MORPH_API_KEY', 'morph-key'],
      ['XAI_API_KEY', 'xai-key'],
      [
        'GOOGLE_VERTEX_AI_CREDENTIALS',
        Object.fromEntries([
          ['client_email', 'fixture@test.invalid'],
          ['private_key', 'offline-fixture-key'],
          ['project_id', 'fixture-project'],
        ]),
      ],
    ]);
    const adapters = createBillableModelProviderAdapters({ get: (key) => configured.get(key) });
    expect([...adapters.keys()].sort()).toEqual([...billableModelRouteIds].sort());
    const resolver = new CodeOwnedBillableModelQualificationResolver({
      adapters,
      credentialAccounts: new Map(
        ['anthropic', 'openai', 'vertexai', 'together', 'morph', 'xai'].map((provider) => [
          provider,
          `${provider}-fixture-account`,
        ]),
      ),
      executionTimeout: 30_000,
    });
    for (const routeCase of routeCases) {
      const resolved = resolver.resolve({
        environment: 'development',
        surface: 'gateway',
        attempt: { version: 1, key: `attempt-${routeCase.routeId}` },
        providerWire: routeCase.wire,
        body: {
          model: routeCase.routeId,
          stream: true,
          [routeCase.outputField]: 1,
          ...(routeCase.wire === 'openai-responses'
            ? { input: 'fixture' }
            : { messages: [{ role: 'user', content: 'fixture' }] }),
        },
        priceHeaders: routeCase.wire === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {},
        activity: 'agent',
      });
      expect(resolved.routeId).toBe(routeCase.routeId);
      expect(resolved.modelId).toBe(routeCase.model);
      expect(resolved.inputCount).toBeUndefined();
      expect(resolved.adapter).toBe(adapters.get(routeCase.routeId));
    }
  });

  it('returns an existing attempt without issuing a promotion or calling a provider', async () => {
    const ledger = {
      getOperationForAttempt: vi.fn(async () => ({ id: 'operation', requestDigest: '', customerState: 'pending' })),
      issueCurrentPromotion: vi.fn(),
    };
    const resolver = { resolve: vi.fn(qualification) };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      resolver,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
    );
    const digest = (
      service as unknown as {
        requestDigest(value: ReturnType<typeof intent>, pins: QualifiedBillableInvocation): string;
      }
    ).requestDigest(intent(), qualification());
    ledger.getOperationForAttempt.mockResolvedValue({
      ...qualification(),
      id: 'operation',
      requestDigest: digest,
      customerState: 'pending',
    });

    await expect(service.invoke(intent())).resolves.toEqual({ state: 'pending', operationId: 'operation' });
    await expect(service.invoke({ ...intent(), body: { model: 'changed' } })).rejects.toMatchObject({ status: 409 });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(ledger.issueCurrentPromotion).not.toHaveBeenCalled();
  });

  it('does not record dispatch intent when the caller is already cancelled', async () => {
    const abort = new AbortController();
    abort.abort();
    const row = {
      id: 'operation',
      accountId: 'account',
      environment: 'development',
      requestDigest: '',
      customerState: 'pending',
      dueAt: new Date(Date.now() + 30_000),
    };
    const ledger = {
      getOperationForAttempt: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementation(async () => row),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'admitted', operationId: 'operation', generation: 0n })),
      recordCancellation: vi.fn(),
      markDispatchIntent: vi.fn(),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: qualification } satisfies BillableModelQualificationResolver,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
    );
    row.requestDigest = (
      service as unknown as {
        requestDigest(value: ReturnType<typeof intent>, pins: QualifiedBillableInvocation): string;
      }
    ).requestDigest(intent(abort.signal), qualification());

    await expect(service.invoke(intent(abort.signal))).resolves.toEqual({ state: 'pending', operationId: 'operation' });
    expect(ledger.recordCancellation).toHaveBeenCalledOnce();
    expect(ledger.markDispatchIntent).not.toHaveBeenCalled();
  });

  it('uses database-clock remaining time despite an apparently expired process clock', async () => {
    const qualified = qualification();
    qualified.adapter.executeOnce = vi.fn(async () => {
      throw new Error('provider failed');
    });
    const row = {
      ...qualified,
      id: 'operation',
      accountId: 'account',
      environment: 'development',
      requestDigest: '',
      customerState: 'pending',
      dueAt: new Date(0),
    };
    const ledger = {
      getOperationForAttempt: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementation(async () => row),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'admitted', operationId: 'operation', generation: 0n })),
      markDispatchIntent: vi.fn(async () => true),
      getDispatchTimeRemaining: vi.fn(async () => qualified.invocation.executionTimeout),
      recordInvocationEvidence: vi.fn(),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
    );
    row.requestDigest = (
      service as unknown as {
        requestDigest(value: ReturnType<typeof intent>, pins: QualifiedBillableInvocation): string;
      }
    ).requestDigest(intent(), qualified);
    const invocationTimeout = vi.spyOn(AbortSignal, 'timeout');

    await expect(service.invoke(intent())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError &&
        error.getStatus() === 503 &&
        gatewayErrorType(error) === 'PROVIDER_UNAVAILABLE',
    );
    expect(invocationTimeout).toHaveBeenCalledWith(qualified.invocation.executionTimeout);
  });

  it('recovers an expired owner pool and retries the same admission once before dispatch', async () => {
    const qualified = qualification();
    const metrics = {
      billingFundedOperationRecoveries: { add: vi.fn() },
      billingFundedOperationTerminals: { add: vi.fn() },
    };
    const row = {
      ...qualified,
      id: 'operation',
      accountId: 'account',
      environment: 'development',
      requestDigest: '',
      customerState: 'pending',
      dueAt: new Date(Date.now() + 30_000),
    };
    const ledger = {
      getOperationForAttempt: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementation(async () => row),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi
        .fn()
        .mockResolvedValueOnce({ status: 'denied', reason: 'concurrency_unavailable' })
        .mockResolvedValueOnce({ status: 'admitted', operationId: 'operation', generation: 0n }),
      recoverDueLlmOperationsForOwner: vi.fn(async () => ({
        pool: 'primary',
        claimed: 1,
        resolved: 1,
        pending: 0,
        remainingDue: 0,
        leasedDue: 0,
        failedOperationIds: [],
      })),
      markDispatchIntent: vi.fn(async () => true),
      getDispatchTimeRemaining: vi.fn(async () => 30_000),
      recordInvocationEvidence: vi.fn(),
      terminalizeOperation: vi.fn(),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
      metrics as unknown as MetricsService,
    );
    row.requestDigest = (
      service as unknown as {
        requestDigest(value: ReturnType<typeof intent>, pins: QualifiedBillableInvocation): string;
      }
    ).requestDigest(intent(), qualified);

    const result = await service.invoke(intent());
    if (result.state !== 'streaming') {
      throw new Error('Recovered invocation did not stream');
    }
    await result.response.text();
    await result.completion;

    expect(ledger.recoverDueLlmOperationsForOwner).toHaveBeenCalledOnce();
    expect(ledger.admitOperation).toHaveBeenCalledTimes(2);
    expect(qualified.adapter.executeOnce).toHaveBeenCalledOnce();
    expect(metrics.billingFundedOperationRecoveries.add.mock.calls).toEqual([
      [1, expect.objectContaining({ 'tau.billing.recovery.outcome': 'attempted' })],
      [1, expect.objectContaining({ 'tau.billing.recovery.outcome': 'claimed' })],
      [1, expect.objectContaining({ 'tau.billing.recovery.outcome': 'resolved' })],
    ]);
    expect(metrics.billingFundedOperationTerminals.add).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        'tau.billing.capacity_pool': 'primary',
        'tau.billing.terminal.kind': 'final_usage',
      }),
    );
  });

  it.each([
    ['agent', 'FUNDED_OPERATION_LIMIT'],
    ['title', 'FUNDED_HELPER_LIMIT'],
  ] as const)('returns the trusted %s pool failsafe only after recovery and one retry', async (activity, code) => {
    const qualified = qualification();
    const metrics = {
      billingFundedOperationRecoveries: { add: vi.fn() },
      billingFundedOperationDenials: { add: vi.fn() },
    };
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'denied', reason: 'concurrency_unavailable' })),
      recoverDueLlmOperationsForOwner: vi.fn(async () => ({
        pool: activity === 'title' ? 'helper' : 'primary',
        claimed: 0,
        resolved: 0,
        pending: 64,
        remainingDue: 0,
        leasedDue: 0,
        failedOperationIds: [],
      })),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
      metrics as unknown as MetricsService,
    );

    await expect(service.invoke({ ...intent(), activity })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError && error.getStatus() === 429 && gatewayErrorType(error) === code,
    );
    expect(ledger.recoverDueLlmOperationsForOwner).toHaveBeenCalledOnce();
    expect(ledger.admitOperation).toHaveBeenCalledTimes(2);
    expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
    expect(metrics.billingFundedOperationDenials.add).toHaveBeenCalledWith(1, {
      'deployment.environment': 'development',
      'tau.billing.capacity_pool': activity === 'title' ? 'helper' : 'primary',
      'tau.billing.denial.reason': 'genuine_saturation',
    });
  });

  it('returns recovery-unavailable while another claimant owns an expired operation', async () => {
    const qualified = qualification();
    const metrics = {
      billingFundedOperationRecoveries: { add: vi.fn() },
      billingFundedOperationDenials: { add: vi.fn() },
    };
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'denied', reason: 'concurrency_unavailable' })),
      recoverDueLlmOperationsForOwner: vi.fn(async () => ({
        pool: 'primary',
        claimed: 0,
        resolved: 0,
        pending: 64,
        remainingDue: 1,
        leasedDue: 1,
        failedOperationIds: [],
      })),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
      metrics as unknown as MetricsService,
    );

    await expect(service.invoke(intent())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError &&
        error.getStatus() === 503 &&
        gatewayErrorType(error) === 'BILLING_RECOVERY_UNAVAILABLE',
    );
    expect(ledger.admitOperation).toHaveBeenCalledOnce();
    expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
    expect(metrics.billingFundedOperationDenials.add).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ 'tau.billing.denial.reason': 'recovery_in_progress' }),
    );
  });

  it('does not call the provider when the database-clock dispatch fence has expired', async () => {
    const qualified = qualification();
    const row = {
      ...qualified,
      id: 'operation',
      accountId: 'account',
      environment: 'development',
      requestDigest: '',
      customerState: 'pending',
      dueAt: new Date(Date.now() + 30_000),
    };
    const ledger = {
      getOperationForAttempt: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementation(async () => row),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'admitted', operationId: 'operation', generation: 0n })),
      markDispatchIntent: vi.fn(async () => true),
      getDispatchTimeRemaining: vi.fn(async () => 0),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
    );
    row.requestDigest = (
      service as unknown as {
        requestDigest(value: ReturnType<typeof intent>, pins: QualifiedBillableInvocation): string;
      }
    ).requestDigest(intent(), qualified);

    await expect(service.invoke(intent())).resolves.toEqual({ state: 'pending', operationId: 'operation' });
    expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
  });
});
