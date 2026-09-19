/* eslint-disable @typescript-eslint/naming-convention -- validated provider wire keys use native snake_case. */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  assertTieredRoutesAreFunded,
  billableModelRouteIds,
  billableModelRouteMeters,
  CodeOwnedBillableModelQualificationResolver,
  supplierIdentityForRoute,
} from '#api/billing/billable-model-qualification.js';
import type {
  BillableInvocationIntent,
  BillableModelProviderAdapter,
  BillableProviderWire,
  QualifiedBillableInvocation,
} from '#api/billing/billable-model-invocation.types.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { isModelListEntryEnabled, modelList } from '#api/models/model.constants.js';

const adapter = mock<BillableModelProviderAdapter>();
const resolver = new CodeOwnedBillableModelQualificationResolver({
  adapters: new Map([
    ['openai-gpt-5.6-luna', adapter],
    ['openai-gpt-5.6-sol', adapter],
    ['openai-gpt-5.5', adapter],
    ['anthropic-claude-opus-5', adapter],
    ['together-glm-5.2', adapter],
    ['morph-minimax-m2.7', adapter],
    ['google-gemini-3.5-flash', adapter],
    ['xai-grok-4.6', adapter],
  ]),
  credentialAccounts: new Map([
    ['openai', 'openai-primary'],
    ['anthropic', 'anthropic-primary'],
    ['together', 'together-primary'],
    ['morph', 'morph-primary'],
    ['vertexai', 'vertex-primary'],
    ['xai', 'xai-primary'],
  ]),
  executionTimeout: 30_000,
});

const intent = (body: unknown): Omit<BillableInvocationIntent, 'authUserId' | 'signal'> => ({
  environment: 'staging',
  surface: 'gateway',
  attempt: { version: 1, key: 'attempt-1' },
  providerWire: 'openai-responses',
  body,
  priceHeaders: {},
  activity: 'agent',
});

describe('CodeOwnedBillableModelQualificationResolver', () => {
  it('should preserve every intended static funded route identity', () => {
    expect(billableModelRouteIds).toHaveLength(21);
    expect(new Set(billableModelRouteIds).size).toBe(21);
    expect(billableModelRouteIds).toContain('google-gemini-3.1-pro');
    expect(billableModelRouteIds).toContain('morph-minimax-m2.7');
  });

  it('should answer a route without a billing account as a 503 provider outage, not a client fault', () => {
    const unaccounted = new CodeOwnedBillableModelQualificationResolver({
      adapters: new Map([['openai-gpt-5.6-luna', adapter]]),
      credentialAccounts: new Map(),
      executionTimeout: 30_000,
    });
    let caught: unknown;
    try {
      unaccounted.resolve(
        intent({ model: 'openai-gpt-5.6-luna', input: 'hello', max_output_tokens: 16, stream: true }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LlmGatewayError);
    expect((caught as LlmGatewayError).getStatus()).toBe(503);
    expect((caught as LlmGatewayError).getResponse()).toMatchObject({ error: { type: 'PROVIDER_UNAVAILABLE' } });
  });

  it('should emit the exact Vertex OpenAI compatibility model name', () => {
    const result = resolver.resolve({
      ...intent({
        model: 'google-gemini-3.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        max_completion_tokens: 16,
        stream: true,
      }),
      providerWire: 'openai-completions',
    });

    expect(result.normalizedRequest.body).toMatchObject({
      model: 'google/gemini-3.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      max_completion_tokens: 16,
    });
    expect(result.invocation.jointInputMaximum).toBeUndefined();
  });

  it('should bound the input by the request itself and ceil the aggregate supplier rational once', () => {
    const result = resolver.resolve(
      intent({ model: 'openai-gpt-5.6-luna', input: 'hello', max_output_tokens: 100, stream: true }),
    );

    /* 85 serialized bytes, one conversation element and the per-route overhead. */
    expect(result.maximumQuantities).toEqual([
      { dimension: 'uncached_input', tier: null, quantity: 4245n },
      { dimension: 'cache_read', tier: null, quantity: 4245n },
      { dimension: 'cache_write', tier: '30m', quantity: 4245n },
      { dimension: 'output', tier: null, quantity: 100n },
    ]);
    expect(result.supplierMaximumPicoUsd).toBe(1_181_250_000n);
    expect(result.invocation.jointInputMaximum).toEqual({ version: 'joint-input-v1', quantity: '4245' });
    expect(result.invocation.supplierRatesValidUntil).toBeNull();
    expect(result.normalizedRequest).not.toHaveProperty('billing');
  });

  it('should fall closed onto the provider context partition when the bound exceeds it', () => {
    const result = resolver.resolve(
      intent({
        model: 'openai-gpt-5.6-luna',
        input: 'x'.repeat(1_100_000),
        max_output_tokens: 100,
        stream: true,
      }),
    );

    expect(result.maximumQuantities[0]).toEqual({ dimension: 'uncached_input', tier: null, quantity: 1_049_900n });
    expect(result.sku).toBe('model:openai-gpt-5.6-luna:long-context');
  });

  it('should reject uncontracted provider options before returning admission data', () => {
    expect(() =>
      resolver.resolve(
        intent({
          model: 'openai-gpt-5.6-luna',
          input: 'hello',
          max_output_tokens: 100,
          stream: true,
          service_tier: 'priority',
        }),
      ),
    ).toThrow('outside the funded request contract');
  });

  it('should qualify GPT-5.5 without a separately billed cache-write meter', () => {
    const result = resolver.resolve(
      intent({ model: 'openai-gpt-5.5', input: 'hello', max_output_tokens: 100, stream: true }),
    );
    expect(result.maximumQuantities.map(({ dimension }) => dimension)).toEqual([
      'uncached_input',
      'cache_read',
      'output',
    ]);
    expect(vi.mocked(adapter.executeOnce)).not.toHaveBeenCalled();
  });

  it('should accept the host Responses tool-turn shape without admitting provider-paid options', () => {
    const result = resolver.resolve(
      intent({
        model: 'openai-gpt-5.6-luna',
        input: [
          { role: 'developer', content: 'static\n\nworkspace\n\ndynamic' },
          { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
        ],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
        reasoning: { effort: 'none' },
        max_output_tokens: 8192,
        tools: [
          {
            type: 'function',
            name: 'read_file',
            description: 'Read a file.',
            parameters: { type: 'object', properties: { targetFile: { type: 'string' } } },
          },
        ],
      }),
    );

    expect(result.routeId).toBe('openai-gpt-5.6-luna');
    expect(result.normalizedRequest).toMatchObject({ body: { store: false, tools: [{ name: 'read_file' }] } });
  });

  it('should accept the host Anthropic cache, thinking, tool-use and tool-result shape', () => {
    const result = resolver.resolve({
      ...intent({
        model: 'anthropic-claude-opus-5',
        system: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'prior', signature: 'sig-1' },
              { type: 'tool_use', id: 'call-1', name: 'read_file', input: { targetFile: 'main.ts' } },
            ],
          },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'source' }] },
        ],
        stream: true,
        thinking: { type: 'adaptive' },
        max_tokens: 8192,
        tools: [
          {
            name: 'read_file',
            eager_input_streaming: true,
            input_schema: { type: 'object' },
            cache_control: { type: 'ephemeral' },
          },
        ],
      }),
      providerWire: 'anthropic',
      priceHeaders: { 'anthropic-version': '2023-06-01' },
    });

    expect(result.routeId).toBe('anthropic-claude-opus-5');
    expect(result.normalizedRequest).toMatchObject({ headers: { 'anthropic-version': '2023-06-01' } });
  });

  it('should admit the gateway-allowlisted anthropic-beta features and refuse any other beta', () => {
    const body = {
      model: 'anthropic-claude-opus-5',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 16,
      stream: true,
    };
    const admitted = resolver.resolve({
      ...intent(body),
      providerWire: 'anthropic',
      priceHeaders: {
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14, interleaved-thinking-2025-05-14',
      },
    });
    /* Forwarded normalized, exactly as the gateway allowlist rewrites it. */
    expect(admitted.normalizedRequest).toMatchObject({
      headers: {
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
      },
    });
    expect(() =>
      resolver.resolve({
        ...intent(body),
        providerWire: 'anthropic',
        priceHeaders: { 'anthropic-version': '2023-06-01', 'anthropic-beta': 'computer-use-2024-10-22' },
      }),
    ).toThrow('Provider header is outside the funded request contract');
  });

  it('should accept the authoritative OpenAI-compatible host stream options and strict function shape', () => {
    const result = resolver.resolve({
      ...intent({
        model: 'together-glm-5.2',
        messages: [
          { role: 'developer', content: 'static\n\nworkspace\n\ndynamic' },
          { role: 'user', content: 'hello' },
        ],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
        max_completion_tokens: 8192,
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read a file.',
              parameters: { type: 'object', properties: { targetFile: { type: 'string' } } },
              strict: false,
            },
          },
        ],
      }),
      providerWire: 'openai-completions',
    });

    expect(result.routeId).toBe('together-glm-5.2');
    expect(result.invocation.jointInputMaximum).toBeUndefined();
  });

  it('should pin dated supplier evidence without using the process clock as authority', () => {
    const result = resolver.resolve(
      intent({ model: 'openai-gpt-5.6-sol', input: 'hello', max_output_tokens: 100, stream: true }),
    );
    expect(result.invocation.supplierRatesValidUntil).toBe('2026-11-21T23:59:59.999Z');
    /* The bound proves the premium threshold unreachable, so the base tariff is the
     * pinned maximum and the valuation may carry no schedule above it. */
    expect(result.sku).toBe('model:openai-gpt-5.6-sol');
    expect(result.invocation.supplierRates).toEqual([
      { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '4000000000000', denominatorUnits: '1000000' },
      { dimension: 'cache_read', tier: null, numeratorPicoUsd: '400000000000', denominatorUnits: '1000000' },
      { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '5000000000000', denominatorUnits: '1000000' },
      { dimension: 'output', tier: null, numeratorPicoUsd: '20000000000000', denominatorUnits: '1000000' },
    ]);
    expect(result.invocation.supplierValuation).toMatchObject({
      version: 'supplier-valuation-v1',
      sourceRevision: 'official-pricing:2026-09-06:openai-gpt-5.6-sol',
      longContextMinimumInputTokens: null,
      longContextRates: null,
      baseRates: [
        { dimension: 'uncached_input', numeratorPicoUsd: '4000000000000' },
        { dimension: 'cache_read', numeratorPicoUsd: '400000000000' },
        { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '5000000000000' },
        { dimension: 'output', numeratorPicoUsd: '20000000000000' },
      ],
    });
  });

  it('should pin the premium tariff and both valuation tables once the bound reaches the threshold', () => {
    const result = resolver.resolve(
      intent({
        model: 'openai-gpt-5.6-sol',
        input: 'x'.repeat(280_000),
        max_output_tokens: 100,
        stream: true,
      }),
    );

    expect(result.sku).toBe('model:openai-gpt-5.6-sol:long-context');
    expect(result.meterContractId).toBe('model-meter-v1:openai-gpt-5.6-sol:long-context');
    expect(result.invocation.supplierRates[0]).toEqual({
      dimension: 'uncached_input',
      tier: null,
      numeratorPicoUsd: '8000000000000',
      denominatorUnits: '1000000',
    });
    expect(result.invocation.supplierValuation).toMatchObject({
      longContextMinimumInputTokens: '272001',
      baseRates: [
        { dimension: 'uncached_input', numeratorPicoUsd: '4000000000000' },
        { dimension: 'cache_read', numeratorPicoUsd: '400000000000' },
        { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '5000000000000' },
        { dimension: 'output', numeratorPicoUsd: '20000000000000' },
      ],
      longContextRates: [
        { dimension: 'uncached_input', numeratorPicoUsd: '8000000000000' },
        { dimension: 'cache_read', numeratorPicoUsd: '800000000000' },
        { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '10000000000000' },
        { dimension: 'output', numeratorPicoUsd: '30000000000000' },
      ],
    });
  });

  it('should retain xAI pricing-source discrepancy as the inclusive 200,000-token boundary', () => {
    const result = resolver.resolve({
      ...intent({
        model: 'xai-grok-4.6',
        input: 'x'.repeat(210_000),
        max_output_tokens: 16,
        stream: true,
      }),
      providerWire: 'openai-responses',
    });
    expect(result.invocation.supplierValuation).toMatchObject({
      longContextMinimumInputTokens: '200000',
      baseRates: [
        { dimension: 'uncached_input', numeratorPicoUsd: '2000000000000' },
        { dimension: 'cache_read', numeratorPicoUsd: '500000000000' },
        { dimension: 'output', numeratorPicoUsd: '6000000000000' },
      ],
    });
  });

  it('should carry a supplier valuation for Vertex operations so Gemini spend can settle', () => {
    const result = resolver.resolve({
      ...intent({
        model: 'google-gemini-3.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        max_completion_tokens: 16,
        stream: true,
      }),
      providerWire: 'openai-completions',
    });

    expect(result.invocation.supplierValuation).toEqual({
      version: 'supplier-valuation-v1',
      sourceRevision: 'official-pricing:2026-09-06:google-gemini-3.5-flash',
      longContextMinimumInputTokens: null,
      longContextRates: null,
      baseRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1500000000000', denominatorUnits: '1000000' },
        { dimension: 'cache_read', tier: null, numeratorPicoUsd: '150000000000', denominatorUnits: '1000000' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '9000000000000', denominatorUnits: '1000000' },
      ],
    });
  });

  it('should qualify Morph as uncached input plus output within its combined context', () => {
    const result = resolver.resolve({
      ...intent({
        model: 'morph-minimax-m2.7',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
        max_tokens: 512,
      }),
      providerWire: 'openai-completions',
    });

    expect(result.maximumQuantities).toEqual([
      { dimension: 'uncached_input', tier: null, quantity: 4268n },
      { dimension: 'output', tier: null, quantity: 512n },
    ]);
    expect(result.supplierMaximumPicoUsd).toBe(1_805_172_000n);
  });
});

/* Enabled `/v1/models` rows deliberately left outside the funded route table,
 * each with the reason it cannot be invoked. Adding a row here is a decision,
 * not a silent hole. */
const unfundedCatalogRows: Readonly<Record<string, string>> = {};

const catalogRows = Object.values(modelList)
  .flatMap((provider) => Object.values(provider))
  .filter((row) => isModelListEntryEnabled(row));

const catalogResolver = new CodeOwnedBillableModelQualificationResolver({
  adapters: new Map(billableModelRouteIds.map((routeId) => [routeId, adapter])),
  credentialAccounts: new Map(
    ['anthropic', 'openai', 'vertexai', 'together', 'morph', 'xai'].map((provider) => [
      provider,
      `${provider}-primary`,
    ]),
  ),
  executionTimeout: 30_000,
});

/* The wire and output parameter belong to the route table, so the contract test
 * probes the funded shapes instead of restating them. */
const wireProbes = [
  { providerWire: 'openai-responses', body: { input: 'hello', max_output_tokens: 1 }, priceHeaders: {} },
  {
    providerWire: 'anthropic',
    body: { messages: [{ role: 'user', content: 'hello' }], max_tokens: 1 },
    priceHeaders: { 'anthropic-version': '2023-06-01' },
  },
  {
    providerWire: 'openai-completions',
    body: { messages: [{ role: 'user', content: 'hello' }], max_completion_tokens: 1 },
    priceHeaders: {},
  },
  {
    providerWire: 'openai-completions',
    body: { messages: [{ role: 'user', content: 'hello' }], max_tokens: 1 },
    priceHeaders: {},
  },
] as const satisfies ReadonlyArray<{
  providerWire: BillableProviderWire;
  body: Record<string, unknown>;
  priceHeaders: Readonly<Record<string, string>>;
}>;

const qualifyRoute = (routeId: string): QualifiedBillableInvocation => {
  let lastRefusal: unknown;
  for (const probe of wireProbes) {
    try {
      return catalogResolver.resolve({
        ...intent({ ...probe.body, model: routeId, stream: true }),
        providerWire: probe.providerWire,
        priceHeaders: probe.priceHeaders,
      });
    } catch (error) {
      // A probe for another wire is expected to be refused; the last refusal is surfaced when no wire qualifies.
      lastRefusal = error;
    }
  }
  throw new Error(`No funded wire qualifies the catalog route ${routeId}`, { cause: lastRefusal });
};

describe('catalog route vocabulary', () => {
  it('should resolve every funded route id and forward the supplier model id', () => {
    for (const routeId of billableModelRouteIds) {
      const resolved = qualifyRoute(routeId);
      expect(resolved.routeId).toBe(routeId);
      expect(resolved.normalizedRequest.body).toMatchObject({
        model: resolved.providerId === 'vertexai' ? `google/${resolved.modelId}` : resolved.modelId,
      });
      expect(resolved.modelId).not.toBe(routeId);
    }
  });

  it('should fund every enabled catalog row except the named unfunded rows', () => {
    const funded = new Set(billableModelRouteIds);
    expect(catalogRows.filter((row) => !funded.has(row.id)).map((row) => row.id)).toEqual(
      Object.keys(unfundedCatalogRows),
    );
    for (const row of catalogRows.filter((row) => funded.has(row.id))) {
      expect(qualifyRoute(row.id).normalizedRequest.body).toMatchObject({
        model: row.provider.id === 'vertexai' ? `google/${row.model}` : row.model,
      });
    }
  });

  /* The model selector shows the catalog price and billing charges the route
   * tariff. A route whose tariff expires is a supplier promotion, and the catalog
   * deliberately keeps the standard price; every other route must agree. */
  it('should show the billed base price in the catalog for every route without a promotion', () => {
    const mismatches = billableModelRouteMeters
      .filter((meter) => meter.validThrough === undefined)
      .flatMap((meter) => {
        const row = catalogRows.find((entry) => entry.id === meter.routeId);
        if (!row) {
          return [];
        }
        const billed = (dimension: string): number | undefined => {
          const rate = meter.rates.find((entry) => entry.dimension === dimension);
          return rate === undefined ? undefined : Number(rate.numeratorPicoUsd) / 1e12;
        };
        const { cost } = row.details;
        return [
          ['uncached_input', cost.inputTokens],
          ['cache_read', cost.cacheReadTokens],
          ['cache_write', cost.cacheWriteTokens],
          ['output', cost.outputTokens],
        ].flatMap(([dimension, shown]) => {
          const charged = billed(String(dimension));
          return charged === undefined || charged === shown
            ? []
            : [`${meter.routeId} ${String(dimension)}: shows ${String(shown)}, bills ${String(charged)}`];
        });
      });
    expect(mismatches).toEqual([]);
  });

  it('should refuse to fund a route no catalog row names', () => {
    expect(() => supplierIdentityForRoute('openai-not-a-catalog-row')).toThrow(
      'Funded route openai-not-a-catalog-row has no catalog row',
    );
  });

  it('should refuse a premium tariff that no funded route can pin', () => {
    expect(() => {
      assertTieredRoutesAreFunded(['openai-gpt-5.6-terrra']);
    }).toThrow('Tiered tariff openai-gpt-5.6-terrra has no funded route');
  });

  it('should refuse a supplier model id that is not a catalog route id', () => {
    expect(() =>
      catalogResolver.resolve(intent({ model: 'gpt-5.6-luna', input: 'hello', max_output_tokens: 1, stream: true })),
    ).toThrow('Model route is not qualified');
  });
});
