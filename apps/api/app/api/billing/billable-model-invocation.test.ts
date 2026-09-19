import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import {
  billableModelRouteIds,
  CodeOwnedBillableModelQualificationResolver,
} from '#api/billing/billable-model-qualification.js';
import { createBillableModelProviderAdapters } from '#api/billing/billable-model-provider.js';
import { createBillableModelEvidenceCollector } from '#api/billing/billable-model-evidence.js';
import type {
  BillableInvocationIntent,
  BillableProviderWire,
  BillableModelQualificationResolver,
  QualifiedBillableInvocation,
} from '#api/billing/billable-model-invocation.types.js';
import type { InputCountCapability } from '#api/billing/billable-model-input-count.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { TerminalEvidence } from '#api/billing/credit-ledger.types.js';
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

const exhaustedProviderBody = {
  error: {
    type: 'insufficient_quota',
    code: 'credit_balance_exhausted',
    message:
      'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
    param: null,
  },
};
/* The real 200 stream OpenAI sent on 2026-09-19 with an exhausted organisation balance. */
const exhaustedCapture = readFileSync(new URL('../llm/provider-account-stream.fixture.sse', import.meta.url), 'utf8');

/** One admitted operation whose supplier answers a provider-account refusal. */
const exhaustionHarness = (qualified: QualifiedBillableInvocation) => {
  const metrics = {
    billingFundedOperationTerminals: { add: vi.fn() },
    billingProviderAccountRefusals: { add: vi.fn() },
  };
  const row = {
    ...qualified,
    id: 'operation',
    accountId: 'account',
    environment: 'development',
    activity: 'agent',
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
    markDispatchAccepted: vi.fn(async () => true),
    getDispatchTimeRemaining: vi.fn(async () => 30_000),
    recordInvocationEvidence: vi.fn<(input: { readonly evidence: TerminalEvidence }) => Promise<void>>(),
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
  return { ledger, metrics, row, service };
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
        ['xai-grok-4.6', 'grok-4.6', 'openai-responses', 'max_output_tokens'],
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

  it('dispatches the xAI route to the Responses endpoint with its supplier model id', async () => {
    const fetchOnce = vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture'));
    const adapters = createBillableModelProviderAdapters(
      { get: (key) => (key === 'XAI_API_KEY' ? 'xai-key' : undefined) },
      fetchOnce,
    );
    const resolver = new CodeOwnedBillableModelQualificationResolver({
      adapters,
      credentialAccounts: new Map([['xai', 'xai-fixture-account']]),
      executionTimeout: 30_000,
    });
    const qualified = resolver.resolve({
      environment: 'development',
      surface: 'gateway',
      attempt: { version: 1, key: 'attempt-xai-responses' },
      providerWire: 'openai-responses',
      body: {
        model: 'xai-grok-4.6',
        input: 'fixture',
        stream: true,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact OpenAI Responses wire key.
        max_output_tokens: 64,
        reasoning: { effort: 'high', summary: 'auto' },
        include: ['reasoning.encrypted_content'],
      },
      priceHeaders: {},
      activity: 'agent',
    });

    await qualified.adapter.executeOnce({ qualification: qualified, signal: new AbortController().signal });

    expect(fetchOnce.mock.lastCall?.[0]).toBe('https://api.x.ai/v1/responses');
    const xaiBody = fetchOnce.mock.lastCall?.[1]?.body;
    expect(typeof xaiBody).toBe('string');
    expect(xaiBody).toContain('"model":"grok-4.6"');
  });

  it('prefixes the Vertex supplier model id for the OpenAI-compatible endpoint', async () => {
    const privateKey = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const fetchOnce = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact Google OAuth response key.
        new Response(JSON.stringify({ access_token: 'vertex-token' }), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('fixture'));
    const adapters = createBillableModelProviderAdapters(
      {
        get: (key) =>
          key === 'GOOGLE_VERTEX_AI_CREDENTIALS'
            ? {
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact Google service-account key.
                client_email: 'fixture@test.invalid',
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact Google service-account key.
                private_key: privateKey,
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact Google service-account key.
                project_id: 'fixture-project',
              }
            : undefined,
      },
      fetchOnce,
    );
    const resolver = new CodeOwnedBillableModelQualificationResolver({
      adapters,
      credentialAccounts: new Map([['vertexai', 'vertex-fixture-account']]),
      executionTimeout: 30_000,
    });
    const qualified = resolver.resolve({
      environment: 'development',
      surface: 'gateway',
      attempt: { version: 1, key: 'attempt-vertex-completions' },
      providerWire: 'openai-completions',
      body: {
        model: 'google-gemini-3.7-flash',
        messages: [{ role: 'user', content: 'fixture' }],
        stream: true,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact OpenAI Completions wire key.
        max_completion_tokens: 64,
      },
      priceHeaders: {},
      activity: 'agent',
    });

    await qualified.adapter.executeOnce({ qualification: qualified, signal: new AbortController().signal });

    expect(fetchOnce.mock.lastCall?.[0]).toBe(
      'https://aiplatform.googleapis.com/v1/projects/fixture-project/locations/global/endpoints/openapi/chat/completions',
    );
    const vertexBody = fetchOnce.mock.lastCall?.[1]?.body;
    expect(typeof vertexBody).toBe('string');
    expect(vertexBody).toContain('"model":"google/gemini-3.7-flash"');
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

  it('places no hold when the caller left before admission', async () => {
    const abort = new AbortController();
    abort.abort();
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: qualification } satisfies BillableModelQualificationResolver,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
    );

    await expect(service.invoke(intent(abort.signal))).rejects.toThrow();
    expect(ledger.admitOperation).not.toHaveBeenCalled();
  });

  it('does not record dispatch intent when the caller cancels during admission', async () => {
    const abort = new AbortController();
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
      admitOperation: vi.fn(async () => {
        abort.abort();
        return { status: 'admitted', operationId: 'operation', generation: 0n };
      }),
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

  /* B7 I3 / R8: the in-stream ceiling cuts the supplier off and keeps the turn settleable. */
  it('cancels upstream and retains authorized_exhausted evidence when the stream passes its ceiling', async () => {
    const qualified = qualification();
    let cancelledWith: unknown;
    qualified.adapter.createEvidenceCollector = () =>
      createBillableModelEvidenceCollector('openai-responses', new Set(['uncached_input']), 'openai');
    qualified.adapter.executeOnce = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('x'.repeat(qualified.maximumResponseBytes + 1)));
            },
            cancel(reason) {
              cancelledWith = reason;
            },
          }),
        ),
    );
    const metrics = { billingFundedOperationTerminals: { add: vi.fn() } };
    const row = {
      ...qualified,
      id: 'operation',
      accountId: 'account',
      environment: 'development',
      activity: 'agent',
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
      markDispatchAccepted: vi.fn(async () => true),
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
      throw new Error('Ceiling invocation did not stream');
    }
    await expect(result.response.text()).rejects.toThrow('authorized ceiling');
    await result.completion;

    expect(cancelledWith).toBe('authorized_exhausted');
    expect(ledger.recordInvocationEvidence).toHaveBeenCalledWith({
      operationId: 'operation',
      accountId: 'account',
      requestDigest: row.requestDigest,
      evidence: {
        kind: 'authorized_exhausted',
        executionStatus: 'cancelled',
        normalizationEvidence: {
          version: 'provider-usage-v1',
          terminalReason: 'authorized_exhausted',
          // The observed bytes are what makes the ceiling's bytes-per-token constant measurable.
          fields: { responseBytes: '129' },
        },
      },
    });
    // Settled through the one terminalizer: an absorbed kind would return before it.
    expect(ledger.terminalizeOperation).toHaveBeenCalledOnce();
    expect(metrics.billingFundedOperationTerminals.add).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ 'tau.billing.terminal.kind': 'authorized_exhausted' }),
    );
  });

  it('admits at the byte bound when the input counter fails instead of refusing the call', async () => {
    // A capability no qualification admits: the same shape a schema drift, a revoked
    // credential or a counter outage presents at the boundary.
    const drifted: Record<string, string> = { qualification: 'drifted' };
    const qualified: QualifiedBillableInvocation = {
      ...qualification(),
      inputCount: { capability: drifted as unknown as InputCountCapability },
      maximumQuantities: [
        { dimension: 'uncached_input', tier: null, quantity: 10n },
        { dimension: 'output', tier: null, quantity: 4n },
      ],
      invocation: {
        ...qualification().invocation,
        supplierRates: [
          { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
          { dimension: 'output', tier: null, numeratorPicoUsd: '2', denominatorUnits: '1' },
        ],
        jointInputMaximum: { version: 'joint-input-v1', quantity: '10' },
      },
    };
    const metrics = { billingFundedOperationTerminals: { add: vi.fn() } };
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
      inputCountEligibility: vi.fn(async () => ({
        status: 'eligible',
        executionDeadline: new Date(Date.now() + 30_000),
        remaining: 30_000,
      })),
      admitOperation: vi.fn(async () => ({ status: 'admitted', operationId: 'operation', generation: 0n })),
      markDispatchIntent: vi.fn(async () => true),
      markDispatchAccepted: vi.fn(async () => true),
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
      throw new Error('Uncounted invocation did not stream');
    }
    await result.response.text();
    await result.completion;

    const [admitted] = ledger.admitOperation.mock.calls as unknown as Array<
      [
        {
          executionDeadline?: Date;
          maximumQuantities: unknown;
          invocation: { inputCount?: unknown; jointInputMaximum?: { quantity: string } };
        },
      ]
    >;
    if (!admitted) {
      throw new Error('The uncounted invocation was never admitted');
    }
    // No count evidence, no counted deadline, and the hold still stands on the proved byte bound.
    expect(admitted[0].invocation.inputCount).toBeUndefined();
    expect(admitted[0].executionDeadline).toBeUndefined();
    expect(admitted[0].invocation.jointInputMaximum?.quantity).toBe('10');
    expect(admitted[0].maximumQuantities).toStrictEqual(qualified.maximumQuantities);
    expect(qualified.adapter.executeOnce).toHaveBeenCalledOnce();
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
      markDispatchAccepted: vi.fn(async () => true),
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

  it.each([
    ['insufficient_credit', '4244000', '300000'],
    ['debt', '4244000', '-1200'],
  ] as const)('answers a %s refusal with the 402 shortfall the client renders', async (reason, required, available) => {
    const qualified = qualification();
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({
        status: 'denied',
        reason,
        requiredCreditAtoms: BigInt(required),
        availableCreditAtoms: BigInt(available),
      })),
      recoverDueLlmOperationsForOwner: vi.fn(),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
    );

    const refusal = await service.invoke(intent()).catch((error: unknown) => error);

    if (!(refusal instanceof LlmGatewayError)) {
      throw new TypeError('Expected a typed gateway refusal');
    }
    expect(refusal.getStatus()).toBe(402);
    expect(refusal.getResponse()).toEqual({
      type: 'error',
      error: {
        type: 'INSUFFICIENT_CREDIT',
        message: 'Insufficient Tau credit for this model request.',
        details: {
          requiredCreditAtoms: required,
          availableCreditAtoms: available,
          routeId: qualified.routeId,
        },
      },
    });
    expect(ledger.recoverDueLlmOperationsForOwner).not.toHaveBeenCalled();
    expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
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
  /* R1 pre-stream (Cloud): the supplier's refusal becomes Tau's code, and the operation
   * settles as provider_rejected, so the customer is charged nothing for it. */
  it('should refuse with the opaque provider-account code when the supplier account is exhausted before the stream', async () => {
    const qualified = qualification();
    const failed = vi.fn(() => ({ kind: 'absorbed_unknown' }) as const);
    qualified.adapter.createEvidenceCollector = () => ({
      accept: vi.fn(),
      complete: () => ({ kind: 'absorbed_unknown' }),
      failed,
    });
    qualified.adapter.executeOnce = vi.fn(
      async () =>
        new Response(JSON.stringify(exhaustedProviderBody), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const { ledger, metrics, service } = exhaustionHarness(qualified);

    try {
      await service.invoke(intent());
      expect.fail('The exhausted supplier account should refuse the invocation');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmGatewayError);
      expect((error as LlmGatewayError).getStatus()).toBe(503);
      expect((error as LlmGatewayError).getResponse()).toEqual({
        type: 'error',
        error: {
          type: 'PROVIDER_ACCOUNT_EXHAUSTED',
          // The supplier's own sentence never leaves the API.
          message: "The model provider's account is unavailable.",
          details: { providerId: 'openai', providerCode: 'credit_balance_exhausted', accountOwner: 'tau' },
        },
      });
    }
    expect(failed).toHaveBeenCalledWith('provider_rejected');
    expect(ledger.recordInvocationEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ evidence: { kind: 'absorbed_unknown' } }),
    );
    // W7: the refusal is counted by provider, never by customer or sentence.
    expect(metrics.billingProviderAccountRefusals.add).toHaveBeenCalledWith(1, {
      'deployment.environment': 'development',
      providerId: 'openai',
    });
  });

  /* W3: the funded refusal branch logs what the operator needs and classifies the status
   * through the same function the self-host path uses, so the two cannot drift. */
  it('should log the refused upstream body, bounded and redacted, and answer 429 as RATE_LIMITED', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // Test-local logger sink.
    });
    const refusedBody = {
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit reached.',
        metadata: { authorization: 'Bearer ya29.a0AfH6SMBx-secret-token' },
      },
    };
    const qualified = qualification();
    qualified.adapter.executeOnce = vi.fn(
      async () =>
        new Response(JSON.stringify(refusedBody), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '7' },
        }),
    );
    const { service } = exhaustionHarness(qualified);

    try {
      await service.invoke(intent());
      expect.fail('The rate-limited supplier should refuse the invocation');
    } catch (error) {
      expect((error as LlmGatewayError).getStatus()).toBe(429);
      expect(gatewayErrorType(error)).toBe('RATE_LIMITED');
      expect((error as LlmGatewayError).getResponse()).toMatchObject({
        error: { details: { retryAfterSeconds: 7 } },
      });
      // The supplier's own sentence never leaves the API on a funded turn.
      expect((error as LlmGatewayError).message).not.toContain('Rate limit reached.');
    }

    expect(warn).toHaveBeenCalledWith(
      {
        providerId: 'openai',
        routeId: 'route',
        modelId: 'model',
        upstreamStatus: 429,
        upstreamBody: JSON.stringify({
          error: { ...refusedBody.error, metadata: { authorization: '[redacted]' } },
        }),
        operationId: 'operation',
      },
      'Upstream model provider refused the request',
    );
  });

  it('should answer the Vertex 499 CANCELLED as a provider outage on the funded path', async () => {
    const qualified = qualification();
    qualified.adapter.executeOnce = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 499, message: 'The operation was cancelled.' } }), {
          status: 499,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const { service } = exhaustionHarness(qualified);

    await expect(service.invoke(intent())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError &&
        error.getStatus() === 503 &&
        gatewayErrorType(error) === 'PROVIDER_UNAVAILABLE',
    );
  });

  /* R1 in-stream + V4 (Cloud): the relayed frame carries Tau's code, and the turn that
   * carried no usage settles absorbed — no meter item, no customer charge. */
  it('should rewrite the captured in-stream supplier refusal and settle the turn at zero charge', async () => {
    const qualified = { ...qualification(), maximumResponseBytes: 64 * 1024 };
    qualified.adapter.createEvidenceCollector = () =>
      createBillableModelEvidenceCollector('openai-responses', new Set(['uncached_input']), 'openai');
    qualified.adapter.executeOnce = vi.fn(
      async () => new Response(exhaustedCapture, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const { ledger, metrics, service } = exhaustionHarness(qualified);

    const result = await service.invoke(intent());
    if (result.state !== 'streaming') {
      throw new Error('The supplier answered 200; the relay did not stream');
    }
    const relayed = await result.response.text();
    await result.completion;

    expect(relayed).toContain(
      `event: error\ndata: {"type":"error","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"The model provider's account is unavailable.","error":{"type":"tau_gateway","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"The model provider's account is unavailable.","details":{"providerId":"openai","providerCode":"credit_balance_exhausted","accountOwner":"tau"}}}\n\n`,
    );
    expect(relayed).not.toContain('You have no credits remaining');
    // No usage was reported, so nothing is metered onto the customer and nothing terminalizes.
    const recorded = ledger.recordInvocationEvidence.mock.calls.at(-1)?.[0];
    expect(recorded?.evidence).toMatchObject({ kind: 'absorbed_unknown', executionStatus: 'unknown' });
    expect(Object.keys(recorded?.evidence ?? {})).not.toContain('meterItems');
    expect(ledger.terminalizeOperation).not.toHaveBeenCalled();
    expect(metrics.billingFundedOperationTerminals.add).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ 'tau.billing.terminal.kind': 'absorbed_unknown' }),
    );
  });
});
