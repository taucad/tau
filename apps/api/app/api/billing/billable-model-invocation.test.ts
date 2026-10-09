import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { TerminalEvidence, TerminalReceipt } from '#api/billing/credit-ledger.types.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';

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
  },
});

/** The gen_ai instruments the funded terminal records on every invocation. */
const genAiMetrics = () => ({
  genAiTokenUsage: { record: vi.fn() },
  genAiOperationDuration: { record: vi.fn() },
  genAiTimeToFirstToken: { record: vi.fn() },
  genAiCost: { add: vi.fn() },
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

/** One admitted operation whose supplier answer each test sets (a refusal, a stream or a success). */
const exhaustionHarness = (qualified: QualifiedBillableInvocation) => {
  const metrics = {
    ...genAiMetrics(),
    billingFundedOperationTerminals: { add: vi.fn() },
    billingProviderAccountRefusals: { add: vi.fn() },
    billingSupplierCostPicoUsd: { add: vi.fn() },
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
    terminalizeOperation: vi.fn(
      async (): Promise<Pick<TerminalReceipt, 'chargedAtoms' | 'supplierCostPicoUsd'>> => ({
        chargedAtoms: 0n,
        supplierCostPicoUsd: 0n,
      }),
    ),
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
        ['anthropic-claude-opus-5.5', 'claude-opus-5-5', 'anthropic', 'max_tokens'],
        ['anthropic-claude-opus-5', 'claude-opus-5', 'anthropic', 'max_tokens'],
        ['anthropic-claude-opus-4.8', 'claude-opus-4-8', 'anthropic', 'max_tokens'],
        ['anthropic-claude-sonnet-5.5', 'claude-sonnet-5-5', 'anthropic', 'max_tokens'],
        ['anthropic-claude-sonnet-5', 'claude-sonnet-5', 'anthropic', 'max_tokens'],
        ['anthropic-claude-sonnet-4.6', 'claude-sonnet-4-6', 'anthropic', 'max_tokens'],
        ['anthropic-claude-haiku-4.5', 'claude-haiku-4-5-20251001', 'anthropic', 'max_tokens'],
        ['openai-gpt-6-astra', 'gpt-6-astra', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-6-sol', 'gpt-6-sol', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-6-luna', 'gpt-6-luna', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.6-sol', 'gpt-5.6-sol', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.6-terra', 'gpt-5.6-terra', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.6-luna', 'gpt-5.6-luna', 'openai-responses', 'max_output_tokens'],
        ['openai-gpt-5.5', 'gpt-5.5', 'openai-responses', 'max_output_tokens'],
        ['google-gemini-3.1-pro', 'gemini-3.1-pro-preview-customtools', 'openai-completions', 'max_completion_tokens'],
        ['google-gemini-3.8-flash', 'gemini-3.8-flash', 'openai-completions', 'max_completion_tokens'],
        ['google-gemini-3.8-flash', 'gemini-3.8-flash', 'openai-completions', 'max_completion_tokens'],
        ['google-gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'openai-completions', 'max_completion_tokens'],
        ['google-gemini-3.5-flash', 'gemini-3.5-flash', 'openai-completions', 'max_completion_tokens'],
        ['together-kimi-k3', 'moonshotai/Kimi-K3', 'openai-completions', 'max_completion_tokens'],
        ['together-glm-5.2', 'zai-org/GLM-5.2', 'openai-completions', 'max_completion_tokens'],
        ['morph-minimax-m2.7', 'morph-minimax27-230b', 'openai-completions', 'max_tokens'],
        ['xai-grok-4.7', 'grok-4.7', 'openai-responses', 'max_output_tokens'],
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
        model: 'google-gemini-3.8-flash',
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
    expect(vertexBody).toContain('"model":"google/gemini-3.8-flash"');
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

  describe('request bound', () => {
    /** A Responses body whose one tool output carries `bytes` of base64 capture. */
    const captureBody = (bytes: number) => ({
      model: 'model',
      input: [
        {
          type: 'function_call_output',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Responses wire key
          call_id: 'call',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Responses wire key
          output: [{ type: 'input_image', image_url: `data:image/webp;base64,${'A'.repeat(bytes)}`, detail: 'auto' }],
        },
      ],
    });
    const bounded = () => {
      const qualified = new Error('reached qualification');
      const ledger = { getOperationForAttempt: vi.fn(async () => undefined), issueCurrentPromotion: vi.fn() };
      const resolver = {
        resolve: vi.fn((): QualifiedBillableInvocation => {
          throw qualified;
        }),
      };
      const service = new BillableModelInvocationService(
        ledger as unknown as CreditLedgerService,
        resolver,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
        new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
      );
      return { ledger, qualified, resolver, service };
    };

    it('should hand a body past 4 MB but inside the 32 MB contract to qualification', async () => {
      const { qualified, resolver, service } = bounded();

      // Six 1600² captures re-sent in one chat's history are this size.
      await expect(service.invoke({ ...intent(), body: captureBody(5_000_000) })).rejects.toBe(qualified);
      expect(resolver.resolve).toHaveBeenCalledOnce();
    });

    it('should refuse a body over the 32 MB contract as a typed 413 before reading the ledger', async () => {
      const { ledger, resolver, service } = bounded();

      const refusal = await service
        .invoke({ ...intent(), body: captureBody(32_000_000) })
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(LlmGatewayError);
      expect((refusal as LlmGatewayError).getStatus()).toBe(413);
      expect(gatewayErrorType(refusal)).toBe('REQUEST_TOO_LARGE');
      expect(ledger.getOperationForAttempt).not.toHaveBeenCalled();
      expect(resolver.resolve).not.toHaveBeenCalled();
    });

    it('should measure the bound in UTF-8 bytes, not UTF-16 code units', async () => {
      const { resolver, service } = bounded();
      // 10.7 M characters of a three-byte code point: 32.1 MB on the wire.
      const text = '€'.repeat(10_700_000);

      const refusal = await service
        .invoke({ ...intent(), body: { model: 'model', input: [{ role: 'user', content: text }] } })
        .catch((error: unknown) => error);

      expect(gatewayErrorType(refusal)).toBe('REQUEST_TOO_LARGE');
      expect(resolver.resolve).not.toHaveBeenCalled();
    });

    it('should refuse a body with more nodes than the digest walks as a typed 413', async () => {
      const { resolver, service } = bounded();
      const input = Array.from({ length: 100_001 }, () => ({ role: 'user', content: 'x' }));

      const refusal = await service
        .invoke({ ...intent(), body: { model: 'model', input } })
        .catch((error: unknown) => error);

      expect(gatewayErrorType(refusal)).toBe('REQUEST_TOO_LARGE');
      expect(resolver.resolve).not.toHaveBeenCalled();
    });
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
    const metrics = {
      ...genAiMetrics(),
      billingFundedOperationTerminals: { add: vi.fn() },
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
      recordInvocationEvidence: vi.fn(),
      terminalizeOperation: vi.fn(async () => ({ chargedAtoms: 0n })),
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

  it('settles a turn the supplier finished at its final usage when the client leaves before reading it', async () => {
    const qualified = { ...qualification(), maximumResponseBytes: 64 * 1024 };
    qualified.adapter.createEvidenceCollector = () =>
      createBillableModelEvidenceCollector('openai-responses', new Set(['uncached_input']), 'openai');
    const encoder = new TextEncoder();
    qualified.adapter.executeOnce = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
              // The whole generation is on the wire before the client reads a byte of it.
              controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"answer"}\n\n'));
              controller.enqueue(
                encoder.encode(
                  'data: {"type":"response.completed","response":{"id":"provider-request","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"input_tokens_details":{"cached_tokens":0}}}}\n\ndata: [DONE]\n\n',
                ),
              );
              controller.close();
            },
          }),
        ),
    );
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
      recordCancellation: vi.fn(),
      terminalizeOperation: vi.fn(async () => ({ chargedAtoms: 0n })),
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

    const result = await service.invoke(intent());
    if (result.state !== 'streaming') {
      throw new Error('Finished invocation did not stream');
    }
    const reader = result.response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('response.output_text.delta');
    // The client has the answer; it leaves without pulling the usage frame behind it.
    await reader.cancel();
    await result.completion;

    const recorded = ledger.recordInvocationEvidence.mock.calls.at(-1)?.[0];
    expect(recorded).toMatchObject({ operationId: 'operation', evidence: { kind: 'final_usage' } });
    expect(recorded?.evidence).toHaveProperty(
      'meterItems',
      expect.arrayContaining([expect.objectContaining({ dimension: 'output', quantity: 1n })]),
    );
    expect(ledger.terminalizeOperation).toHaveBeenCalledOnce();
    // A turn the supplier finished has settled; the late cancel neither absorbs nor flags it.
    expect(ledger.recordCancellation).not.toHaveBeenCalled();
  });

  describe('a stream cut while the process stops', () => {
    /** One admitted step whose supplier has started streaming and has not finished. */
    const midStream = (shutdown: ShutdownService) => {
      const qualified = { ...qualification(), maximumResponseBytes: 64 * 1024 };
      qualified.adapter.createEvidenceCollector = () =>
        createBillableModelEvidenceCollector('openai-responses', new Set(['uncached_input']), 'openai');
      const encoder = new TextEncoder();
      qualified.adapter.executeOnce = vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array<ArrayBuffer>>({
              start(controller) {
                controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'));
              },
            }),
          ),
      );
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
        recordCancellation: vi.fn(),
        terminalizeOperation: vi.fn(async () => ({ chargedAtoms: 0n })),
      };
      const service = new BillableModelInvocationService(
        ledger as unknown as CreditLedgerService,
        { resolve: () => qualified },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
        new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
        undefined,
        shutdown,
      );
      row.requestDigest = (
        service as unknown as {
          requestDigest(value: ReturnType<typeof intent>, pins: QualifiedBillableInvocation): string;
        }
      ).requestDigest(intent(), qualified);
      return { ledger, service };
    };

    const cut = async (service: BillableModelInvocationService): Promise<void> => {
      const result = await service.invoke(intent());
      if (result.state !== 'streaming') {
        throw new Error('Invocation did not stream');
      }
      const reader = result.response.body!.getReader();
      await reader.read();
      // The drain's cut closes the connection, which cancels the relayed body.
      await reader.cancel();
      await result.completion;
    };

    it('should settle the step at once as absorbed, labelled service_restart', async () => {
      const shutdown = new ShutdownService();
      const { ledger, service } = midStream(shutdown);
      shutdown.stop();

      await cut(service);

      const recorded = ledger.recordInvocationEvidence.mock.calls.at(-1)?.[0];
      expect(recorded?.evidence).toMatchObject({
        kind: 'absorbed_unknown',
        executionStatus: 'cancelled',
        normalizationEvidence: { terminalReason: 'service_restart' },
      });
      expect(ledger.terminalizeOperation).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ evidence: recorded?.evidence }),
      );
    });

    it('should leave a step the client left while the process runs to recovery, as before', async () => {
      const { ledger, service } = midStream(new ShutdownService());

      await cut(service);

      expect(ledger.recordInvocationEvidence.mock.calls.at(-1)?.[0].evidence).toMatchObject({
        kind: 'absorbed_unknown',
      });
      expect(ledger.terminalizeOperation).not.toHaveBeenCalled();
    });
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
    const metrics = {
      ...genAiMetrics(),
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
      terminalizeOperation: vi.fn(async () => ({ chargedAtoms: 0n })),
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

  it('should record an exact-count credit denial and refuse with its shortfall, not fall back to the byte bound', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // Test-local logger sink.
    });
    const counted: Record<string, string> = { qualification: 'controlled-local-zero' };
    const qualified: QualifiedBillableInvocation = {
      ...qualification(),
      inputCount: { capability: counted as unknown as InputCountCapability },
      maximumQuantities: [
        { dimension: 'uncached_input', tier: null, quantity: 10n },
        { dimension: 'output', tier: null, quantity: 4n },
      ],
      invocation: {
        ...qualification().invocation,
        jointInputMaximum: { version: 'joint-input-v1', quantity: '10' },
      },
    };
    // The real denial recorder, over an owner lookup that finds no binding: it checks the digest, then stops.
    const ownerLookup = vi.fn(async () => []);
    const owners = new CreditLedgerService(
      { database: { select: () => ({ from: () => ({ where: ownerLookup }) }) } } as unknown as Pick<
        DatabaseService,
        'database'
      >,
      {} as BillingPolicyService,
    );
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      inputCountEligibility: vi.fn(async () => ({
        status: 'denied',
        reason: 'insufficient_credit',
        requiredCreditAtoms: 8n,
        availableCreditAtoms: 1n,
      })),
      recordFundedWorkDenial: vi.fn(async (input: Parameters<CreditLedgerService['recordFundedWorkDenial']>[0]) =>
        owners.recordFundedWorkDenial(input),
      ),
      // What the byte bound would answer: the same refusal, with a larger requirement.
      admitOperation: vi.fn(async () => ({
        status: 'denied',
        reason: 'insufficient_credit',
        requiredCreditAtoms: 48n,
        availableCreditAtoms: 1n,
      })),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
      genAiMetrics() as unknown as MetricsService,
    );

    try {
      const refusal: unknown = await service.invoke(intent()).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(LlmGatewayError);
      expect((refusal as LlmGatewayError).getStatus()).toBe(402);
      expect((refusal as LlmGatewayError).getResponse()).toMatchObject({
        error: {
          type: 'INSUFFICIENT_CREDIT',
          details: { requiredCreditAtoms: '8', availableCreditAtoms: '1', routeId: 'route' },
        },
      });
      expect(ledger.recordFundedWorkDenial).toHaveBeenCalledExactlyOnceWith({
        environment: 'development',
        authUserId: 'user',
        attemptKey: 'attempt_0000000001',
        requestDigest: expect.stringMatching(/^hmac-sha256:[a-f0-9]{64}$/u) as unknown,
      });
      expect(ownerLookup).toHaveBeenCalledOnce();
      expect(ledger.admitOperation).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('recovers an expired owner pool and retries the same admission once before dispatch', async () => {
    const qualified = qualification();
    const metrics = {
      ...genAiMetrics(),
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
      terminalizeOperation: vi.fn(async () => ({ chargedAtoms: 0n })),
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
      ...genAiMetrics(),
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

  it('should answer a voided attempt key with 409 ATTEMPT_VOIDED and never dispatch it', async () => {
    const qualified = qualification();
    const metrics = {
      ...genAiMetrics(),
      billingVoidedAdmissions: { add: vi.fn() },
    };
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'denied', reason: 'attempt_voided' })),
      recoverDueLlmOperationsForOwner: vi.fn(),
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
        error instanceof LlmGatewayError && error.getStatus() === 409 && gatewayErrorType(error) === 'ATTEMPT_VOIDED',
    );
    expect(ledger.recoverDueLlmOperationsForOwner).not.toHaveBeenCalled();
    expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
    expect(metrics.billingVoidedAdmissions.add).toHaveBeenCalledWith(1, { 'deployment.environment': 'development' });
  });

  it('should answer an operator-paused route with 503 MODEL_ROUTE_PAUSED naming the route', async () => {
    const qualified = qualification();
    const metrics = { ...genAiMetrics(), billingFundedOperationDenials: { add: vi.fn() } };
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'denied', reason: 'route_paused' })),
      recoverDueLlmOperationsForOwner: vi.fn(),
    };
    const service = new BillableModelInvocationService(
      ledger as unknown as CreditLedgerService,
      { resolve: () => qualified },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_REQUEST_DIGEST_SECRET: 'x'.repeat(32) }),
      metrics as unknown as MetricsService,
    );

    const refusal = await service.invoke(intent()).catch((error: unknown) => error);

    if (!(refusal instanceof LlmGatewayError)) {
      throw new TypeError('Expected a typed gateway refusal');
    }
    expect(refusal.getStatus()).toBe(503);
    expect(refusal.getResponse()).toEqual({
      type: 'error',
      error: {
        type: 'MODEL_ROUTE_PAUSED',
        message: "This model route is paused by Tau's operators.",
        details: { routeId: qualified.routeId },
      },
    });
    expect(metrics.billingFundedOperationDenials.add).toHaveBeenCalledExactlyOnceWith(1, {
      'deployment.environment': 'development',
      'tau.billing.capacity_pool': 'primary',
      'tau.billing.denial.reason': 'operator_route_paused',
    });
    expect(ledger.recoverDueLlmOperationsForOwner).not.toHaveBeenCalled();
    expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
  });

  it('should answer a restricted account with 403 BILLING_ACCOUNT_RESTRICTED, never a provider outage', async () => {
    const qualified = qualification();
    const ledger = {
      getOperationForAttempt: vi.fn(async () => undefined),
      issueCurrentPromotion: vi.fn(),
      admitOperation: vi.fn(async () => ({ status: 'denied', reason: 'account_restricted' })),
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
    expect(refusal.getStatus()).toBe(403);
    expect(refusal.getResponse()).toEqual({
      type: 'error',
      error: { type: 'BILLING_ACCOUNT_RESTRICTED', message: 'This Tau billing account is restricted.' },
    });
    expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
  });

  it('should keep the retired supplier-pause and provider-outage restriction sentences out of the API', () => {
    // Assembled here so this guard does not match itself.
    const retired = [
      ['This model route is paused while Tau reconciles', 'its supplier evidence'].join(' '),
      ['Model admission failed:', 'account_restricted'].join(' '),
    ];
    const root = resolve(import.meta.dirname, '../..');
    const sources = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.ts'));
    const offenders = sources.filter((path) => {
      const content = readFileSync(join(root, path), 'utf8');
      return retired.some((sentence) => content.includes(sentence));
    });

    expect(sources.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it('returns recovery-unavailable while another claimant owns an expired operation', async () => {
    const qualified = qualification();
    const metrics = {
      ...genAiMetrics(),
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
    const rejected = { kind: 'provider_rejected', executionStatus: 'rejected' } as const;
    const failed = vi.fn(() => rejected);
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
    expect(ledger.recordInvocationEvidence).toHaveBeenCalledWith(expect.objectContaining({ evidence: rejected }));
    // A refusal is settled now, not left to recovery: nothing can price a call that never ran.
    expect(ledger.terminalizeOperation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ evidence: rejected }),
    );
    // W7: the refusal is counted by provider, never by customer or sentence.
    expect(metrics.billingProviderAccountRefusals.add).toHaveBeenCalledWith(1, {
      'deployment.environment': 'development',
      providerId: 'openai',
      reason: 'credit_exhausted',
    });
  });

  /* F-11: through the funded gateway the upstream key is Tau's, so a 401 is a supplier-account
   * failure that pages, while the caller sees the same opaque supplier-account answer as an
   * exhausted account: resuming cannot change it, so the host never offers to. */
  it.each([401, 403])(
    'should count an upstream %i as a credential_rejected supplier refusal and answer PROVIDER_ACCOUNT_EXHAUSTED',
    async (status) => {
      const qualified = qualification();
      qualified.adapter.executeOnce = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
      );
      const { metrics, service } = exhaustionHarness(qualified);

      const error: unknown = await service.invoke(intent()).catch((error: unknown) => error);

      expect(error).toBeInstanceOf(LlmGatewayError);
      expect((error as LlmGatewayError).getStatus()).toBe(503);
      expect((error as LlmGatewayError).getResponse()).toEqual({
        type: 'error',
        error: {
          type: 'PROVIDER_ACCOUNT_EXHAUSTED',
          // The supplier's own sentence never leaves the API.
          message: "The model provider's account is unavailable.",
          details: { providerId: 'openai', providerCode: 'credential_rejected', accountOwner: 'tau' },
        },
      });
      expect(metrics.billingProviderAccountRefusals.add).toHaveBeenCalledOnce();
      expect(metrics.billingProviderAccountRefusals.add).toHaveBeenCalledWith(1, {
        'deployment.environment': 'development',
        providerId: 'openai',
        reason: 'credential_rejected',
      });
    },
  );

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

  /* Issue 201: an Anthropic 400 "prompt is too long" reached the host as the generic
   * rejection sentence, so the host's overflow lane never compacted and retried. */
  it('should name a context-window refusal without quoting the supplier on the funded path', async () => {
    const supplierSentence = 'prompt is too long: 217210 tokens > 200000 maximum';
    const qualified = qualification();
    qualified.adapter.executeOnce = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: supplierSentence } }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    );
    const { service } = exhaustionHarness(qualified);

    await expect(service.invoke(intent())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError &&
        gatewayErrorType(error) === 'UPSTREAM_REJECTED' &&
        error.message === 'The request exceeds the context window of the selected model.' &&
        !error.message.includes(supplierSentence),
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

  /* R6: the filter replaces a classified failure's bytes, so the funded path — the one
   * where Tau pays for the tokens — keeps no sight of why the turn ended unless it
   * observes the filter. The operator leg has always passed both observers. */
  it('should log a classified mid-stream provider failure with the supplier sentence', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // Test-local logger sink.
    });
    const supplierSentence = 'Resource exhausted. Please try again later.';
    const cut =
      `data: {"choices":[{"delta":{"content":"partial"}}]}\n\n` +
      `data: {"error":{"code":429,"message":"${supplierSentence}","status":"RESOURCE_EXHAUSTED"}}\n\n`;
    const qualified = { ...qualification(), maximumResponseBytes: 64 * 1024 };
    qualified.adapter.createEvidenceCollector = () =>
      createBillableModelEvidenceCollector('openai-responses', new Set(['uncached_input']), 'openai');
    qualified.adapter.executeOnce = vi.fn(
      async () => new Response(cut, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const { service } = exhaustionHarness(qualified);

    try {
      const result = await service.invoke(intent());
      if (result.state !== 'streaming') {
        throw new Error('The supplier answered 200; the relay did not stream');
      }
      const relayed = await result.response.text();
      await result.completion;

      // The customer reads Tau's sentence; the operator's log keeps the supplier's.
      expect(relayed).toContain('"code":"RATE_LIMITED"');
      expect(relayed).not.toContain(supplierSentence);
      const logged = warn.mock.calls.map((call) => String(call[0]));
      expect(logged).toContainEqual(expect.stringContaining('Provider stream failed on openai'));
      expect(logged).toContainEqual(expect.stringContaining('(429)'));
      expect(logged).toContainEqual(expect.stringContaining(supplierSentence));
    } finally {
      warn.mockRestore();
    }
  });

  describe('gen_ai telemetry at the funded terminal', () => {
    const labels = { 'gen_ai.request.model': 'model', 'gen_ai.provider.name': 'openai', 'tau.surface': 'gateway' };

    const settle = async (
      meterItems: Extract<TerminalEvidence, { kind: 'final_usage' }>['meterItems'],
      stream?: boolean,
      // oxlint-disable-next-line typescript/no-restricted-types -- null is an unpriced receipt
      supplierCostPicoUsd: bigint | null = 0n,
    ) => {
      const qualified = qualification();
      qualified.normalizedRequest = {
        body: { model: 'model', ...(stream === undefined ? {} : { stream }) },
        headers: {},
      };
      // Two supplier chunks, so a second chunk must not record time to first token again.
      qualified.adapter.executeOnce = vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array<ArrayBuffer>>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('first'));
                controller.enqueue(new TextEncoder().encode('second'));
                controller.close();
              },
            }),
          ),
      );
      qualified.adapter.createEvidenceCollector = () => ({
        accept: vi.fn(),
        complete: () => ({ kind: 'final_usage', usageOccurredAt: new Date(), meterItems }),
        failed: () => ({ kind: 'absorbed_unknown' }),
      });
      const harness = exhaustionHarness(qualified);
      harness.ledger.terminalizeOperation.mockResolvedValue({ chargedAtoms: 2500n, supplierCostPicoUsd });
      const result = await harness.service.invoke(intent());
      if (result.state !== 'streaming') {
        throw new Error('Invocation did not stream');
      }
      await result.response.text();
      await result.completion;
      return harness.metrics;
    };

    it('should count the receipt supplier cost with the charge labels plus the environment', async () => {
      const metrics = await settle(
        [
          { dimension: 'uncached_input', tier: null, quantity: 7n },
          { dimension: 'output', tier: null, quantity: 5n },
        ],
        undefined,
        1_750_000n,
      );

      expect(metrics.billingSupplierCostPicoUsd.add).toHaveBeenCalledExactlyOnceWith(1_750_000, {
        'gen_ai.request.model': 'model',
        'gen_ai.provider.name': 'openai',
        'deployment.environment': 'development',
      });
    });

    it.each([
      ['a known zero', 0n],
      ['an unpriced receipt', null],
    ])('should not count supplier cost for %s', async (_label, supplierCostPicoUsd) => {
      const metrics = await settle(
        [{ dimension: 'uncached_input', tier: null, quantity: 7n }],
        undefined,
        supplierCostPicoUsd,
      );

      expect(metrics.genAiCost.add).toHaveBeenCalledOnce();
      expect(metrics.billingSupplierCostPicoUsd.add).not.toHaveBeenCalled();
    });

    it('records tokens, the charged USD and a successful duration', async () => {
      const metrics = await settle([
        { dimension: 'uncached_input', tier: null, quantity: 7n },
        { dimension: 'output', tier: null, quantity: 5n },
      ]);

      expect(metrics.genAiTokenUsage.record).toHaveBeenCalledWith(7, {
        ...labels,
        'gen_ai.token.type': 'input',
        'tau.activity': 'agent',
      });
      expect(metrics.genAiTokenUsage.record).toHaveBeenCalledWith(5, {
        ...labels,
        'gen_ai.token.type': 'output',
        'tau.activity': 'agent',
      });
      expect(metrics.genAiCost.add).toHaveBeenCalledExactlyOnceWith(0.0025, { ...labels, 'tau.activity': 'agent' });
      expect(metrics.genAiOperationDuration.record).toHaveBeenCalledExactlyOnceWith(expect.any(Number), {
        ...labels,
        'error.type': '',
      });
    });

    it('records time to first token once for a streaming request and never for a non-streaming one', async () => {
      const usage = [{ dimension: 'uncached_input', tier: null, quantity: 1n }];
      const streamed = await settle(usage, true);
      const buffered = await settle(usage);

      expect(streamed.genAiTimeToFirstToken.record).toHaveBeenCalledExactlyOnceWith(expect.any(Number), labels);
      expect(buffered.genAiTimeToFirstToken.record).not.toHaveBeenCalled();
    });

    it('records neither tokens nor cost for an operation left pending for recovery', async () => {
      const qualified = qualification();
      qualified.adapter.createEvidenceCollector = () => ({
        accept: vi.fn(),
        complete: () => ({
          kind: 'absorbed_unknown',
          meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 9n }],
        }),
        failed: () => ({ kind: 'absorbed_unknown' }),
      });
      const { ledger, metrics, service } = exhaustionHarness(qualified);
      const result = await service.invoke(intent());
      if (result.state !== 'streaming') {
        throw new Error('Invocation did not stream');
      }
      await result.response.text();
      await result.completion;

      expect(ledger.terminalizeOperation).not.toHaveBeenCalled();
      expect(metrics.genAiTokenUsage.record).not.toHaveBeenCalled();
      expect(metrics.genAiCost.add).not.toHaveBeenCalled();
    });

    it('records cache reads and writes as their own token types', async () => {
      const metrics = await settle([
        { dimension: 'uncached_input', tier: null, quantity: 1n },
        { dimension: 'cache_read', tier: null, quantity: 900n },
        { dimension: 'cache_write', tier: '5m', quantity: 40n },
        { dimension: 'output', tier: null, quantity: 2n },
      ]);

      expect(metrics.genAiTokenUsage.record).toHaveBeenCalledWith(
        900,
        expect.objectContaining({ 'gen_ai.token.type': 'cache_read' }),
      );
      expect(metrics.genAiTokenUsage.record).toHaveBeenCalledWith(
        40,
        expect.objectContaining({ 'gen_ai.token.type': 'cache_write' }),
      );
    });

    it('records a refused admission as one errored duration with no tokens or cost', async () => {
      const qualified = qualification();
      const { ledger, metrics, service } = exhaustionHarness(qualified);
      ledger.admitOperation.mockResolvedValue({ status: 'denied', reason: 'policy_unavailable' } as unknown as Awaited<
        ReturnType<typeof ledger.admitOperation>
      >);

      await expect(service.invoke(intent())).rejects.toBeInstanceOf(LlmGatewayError);

      expect(metrics.genAiOperationDuration.record).toHaveBeenCalledExactlyOnceWith(expect.any(Number), {
        ...labels,
        'error.type': 'policy_unavailable',
      });
      expect(metrics.genAiTokenUsage.record).not.toHaveBeenCalled();
      expect(metrics.genAiCost.add).not.toHaveBeenCalled();
      expect(qualified.adapter.executeOnce).not.toHaveBeenCalled();
    });

    it.each([
      [401, 'upstream_auth'],
      [403, 'upstream_auth'],
      [429, 'upstream_429'],
      [400, 'upstream_4xx'],
      [502, 'upstream_5xx'],
    ])('records a supplier %i refusal as error.type %s', async (status, errorType) => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
        // Test-local logger sink.
      });
      const qualified = qualification();
      qualified.adapter.executeOnce = vi.fn(
        async () => new Response(JSON.stringify({ error: { type: 'refused' } }), { status }),
      );
      const { metrics, service } = exhaustionHarness(qualified);

      await expect(service.invoke(intent())).rejects.toBeInstanceOf(LlmGatewayError);

      expect(metrics.genAiOperationDuration.record).toHaveBeenCalledExactlyOnceWith(expect.any(Number), {
        ...labels,
        'error.type': errorType,
      });
    });
  });
});
