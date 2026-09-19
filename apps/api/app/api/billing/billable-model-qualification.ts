import type { InputCountCapability } from '#api/billing/billable-model-input-count.js';
import { HttpStatus } from '@nestjs/common';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { validateAnthropicHeaders } from '#api/llm/llm-gateway.headers.js';
import { qualifiedMeterContracts } from '#api/billing/billing-policy.js';
import { maximumMeterCharge } from '#api/billing/billable-model-bound.js';
import { createBillableModelEvidenceCollector } from '#api/billing/billable-model-evidence.js';
import {
  billableModelInputBound,
  billableModelOutputMaximum,
  billableModelRequestContainsImage,
  safeParseBillableModelRequest,
} from '#api/billing/billable-model-request.js';
import { modelList } from '#api/models/model.constants.js';
import type {
  BillableInvocationIntent,
  BillableModelProviderAdapter,
  BillableModelQualificationResolver,
  BillableProviderWire,
  QualifiedBillableInvocation,
} from '#api/billing/billable-model-invocation.types.js';
import type { JointInputMaximum, MeterQuantity, SupplierValuation } from '#api/billing/credit-ledger.types.js';

type Rate = {
  dimension: MeterQuantity['dimension'];
  tier: MeterQuantity['tier'];
  numeratorPicoUsd: bigint;
};
type Route = {
  routeId: string;
  providerId: string;
  modelId: string;
  modelDisplayName: string;
  wire: BillableProviderWire;
  contextMaximum: bigint;
  outputMaximum: bigint;
  combinedMaximum?: bigint;
  allowsImage?: boolean;
  outputParameter: 'max_output_tokens' | 'max_completion_tokens' | 'max_tokens';
  /** The date this route's tariff was read off the supplier's published pricing, when later than the table's sweep. */
  pricingRevision?: string;
  validThrough?: string;
  rates?: readonly Rate[];
  temporaryUnavailableReason?: string;
};

const million = 1_000_000n;
const picoUsd = (usd: string): bigint => {
  const [whole = '0', fraction = ''] = usd.split('.');
  return BigInt(whole) * 1_000_000_000_000n + BigInt(`${fraction.padEnd(12, '0') || '0'}`);
};
// oxlint-disable-next-line max-params -- mirrors the supplier tariff dimensions in the static table.
const rates = (
  input: string,
  read: string,
  write: string | undefined,
  output: string,
  writeTier = 'default',
): readonly Rate[] => [
  { dimension: 'uncached_input', tier: null, numeratorPicoUsd: picoUsd(input) },
  { dimension: 'cache_read', tier: null, numeratorPicoUsd: picoUsd(read) },
  ...(write === undefined
    ? []
    : [
        {
          dimension: 'cache_write',
          tier: writeTier,
          numeratorPicoUsd: picoUsd(write),
        } as const,
      ]),
  { dimension: 'output', tier: null, numeratorPicoUsd: picoUsd(output) },
];
const inputOutputRates = (input: string, output: string): readonly Rate[] => [
  { dimension: 'uncached_input', tier: null, numeratorPicoUsd: picoUsd(input) },
  { dimension: 'output', tier: null, numeratorPicoUsd: picoUsd(output) },
];
const catalogRowsById = new Map(
  Object.values(modelList)
    .flatMap((provider) => Object.values(provider))
    .map((row) => [row.id, row] as const),
);

/**
 * The upstream model one funded route bills against.
 *
 * Funding a route and pricing it are decisions this file owns and a reviewer
 * reads here; *which* upstream model a catalog row names is the catalog's own
 * fact, and repeating it here is how qualification silently drifted from the
 * catalog once already. A funded route with no catalog row is a fault at import,
 * not a route that quietly bills an invented model id.
 *
 * @param routeId - The catalog `/v1/models` row id the funded route serves.
 * @returns The route's provider id and the supplier's own model id.
 */
export const supplierIdentityForRoute = (routeId: string): { modelId: string; providerId: string } => {
  const row = catalogRowsById.get(routeId);
  if (!row) {
    throw new Error(`Funded route ${routeId} has no catalog row`);
  }
  return { modelId: row.model, providerId: row.provider.id };
};

// oxlint-disable-next-line max-params -- keeps the audited static route table compact.
const route = (
  routeId: string,
  modelDisplayName: string,
  wire: BillableProviderWire,
  contextMaximum: number,
  outputMaximum: number,
  supplierRates?: readonly Rate[],
  extra?: Partial<
    Pick<
      Route,
      | 'allowsImage'
      | 'combinedMaximum'
      | 'outputParameter'
      | 'pricingRevision'
      | 'temporaryUnavailableReason'
      | 'validThrough'
    >
  >,
): Route => ({
  routeId,
  ...supplierIdentityForRoute(routeId),
  modelDisplayName,
  wire,
  contextMaximum: BigInt(contextMaximum),
  outputMaximum: BigInt(outputMaximum),
  outputParameter:
    extra?.outputParameter ??
    (wire === 'anthropic' ? 'max_tokens' : wire === 'openai-responses' ? 'max_output_tokens' : 'max_completion_tokens'),
  ...(supplierRates === undefined ? {} : { rates: supplierRates }),
  ...extra,
});

const routes = [
  route(
    'anthropic-claude-fable-5.1',
    'Fable 5.1',
    'anthropic',
    1_000_000,
    128_000,
    rates('10', '.25', '12.5', '50', '5m'),
  ),
  route('anthropic-claude-fable-5', 'Fable 5', 'anthropic', 1_000_000, 128_000, rates('10', '1', '12.5', '50', '5m')),
  route('anthropic-claude-opus-5', 'Opus 5', 'anthropic', 1_000_000, 128_000, rates('5', '.5', '6.25', '25', '5m')),
  route('anthropic-claude-opus-4.8', 'Opus 4.8', 'anthropic', 1_000_000, 128_000, rates('5', '.5', '6.25', '25', '5m')),
  route('anthropic-claude-sonnet-5', 'Sonnet 5', 'anthropic', 1_000_000, 128_000, rates('2', '.2', '2.5', '10', '5m')),
  route(
    'anthropic-claude-sonnet-4.6',
    'Sonnet 4.6',
    'anthropic',
    1_000_000,
    64_000,
    rates('3', '.3', '3.75', '15', '5m'),
  ),
  route('anthropic-claude-haiku-4.5', 'Haiku 4.5', 'anthropic', 200_000, 64_000, rates('1', '.1', '1.25', '5', '5m')),
  route(
    'openai-gpt-6-astra',
    'GPT-6 Astra',
    'openai-responses',
    1_050_000,
    128_000,
    rates('20', '2', '25', '75', '30m'),
  ),
  route(
    'openai-gpt-5.6-sol',
    'GPT-5.6 Sol',
    'openai-responses',
    1_050_000,
    128_000,
    rates('8', '.8', '10', '30', '30m'),
    { validThrough: '2026-11-21T23:59:59.999Z' },
  ),
  route(
    'openai-gpt-5.6-terra',
    'GPT-5.6 Terra',
    'openai-responses',
    1_050_000,
    128_000,
    rates('4', '.4', '5', '18', '30m'),
  ),
  route(
    'openai-gpt-5.6-luna',
    'GPT-5.6 Luna',
    'openai-responses',
    1_050_000,
    128_000,
    rates('.4', '.04', '.5', '1.8', '30m'),
  ),
  route('openai-gpt-5.5', 'GPT-5.5', 'openai-responses', 1_050_000, 128_000, rates('10', '1', undefined, '45')),
  route(
    'google-gemini-3.1-pro',
    'Gemini 3.1 Pro',
    'openai-completions',
    1_000_000,
    65_536,
    rates('4', '.4', undefined, '18'),
  ),
  route(
    'google-gemini-3.8-flash',
    'Gemini 3.8 Flash',
    'openai-completions',
    1_048_576,
    65_536,
    rates('.75', '.075', undefined, '3.75'),
    { pricingRevision: '2026-09-19', validThrough: '2026-12-31T23:59:59.999Z' },
  ),
  route(
    'google-gemini-3.5-flash-lite',
    'Gemini 3.5 Flash Lite',
    'openai-completions',
    1_048_576,
    65_536,
    rates('.3', '.03', undefined, '2.5'),
  ),
  route(
    'google-gemini-3.5-flash',
    'Gemini 3.5 Flash',
    'openai-completions',
    1_048_576,
    65_536,
    rates('1.5', '.15', undefined, '9'),
  ),
  route('together-kimi-k3', 'Kimi K3', 'openai-completions', 1_000_000, 200_000, rates('3', '.3', undefined, '15')),
  route(
    'together-glm-5.2',
    'GLM 5.2',
    'openai-completions',
    1_000_000,
    131_072,
    rates('1.4', '.26', undefined, '4.4'),
    { allowsImage: false },
  ),
  route('morph-minimax-m2.7', 'MiniMax M2.7', 'openai-completions', 196_608, 196_608, inputOutputRates('.279', '1.2'), {
    allowsImage: false,
    combinedMaximum: 196_608n,
    outputParameter: 'max_tokens',
  }),
  route('xai-grok-4.6', 'Grok 4.6', 'openai-responses', 500_000, 64_000, rates('4', '1', undefined, '12')),
] as const;

const tieredValuations = new Map<string, { minimum: bigint; baseRates: readonly Rate[] }>([
  ['openai-gpt-6-astra', { minimum: 272_001n, baseRates: rates('10', '1', '12.5', '50', '30m') }],
  ['openai-gpt-5.6-sol', { minimum: 272_001n, baseRates: rates('4', '.4', '5', '20', '30m') }],
  ['openai-gpt-5.6-terra', { minimum: 272_001n, baseRates: rates('2', '.2', '2.5', '12', '30m') }],
  ['openai-gpt-5.6-luna', { minimum: 272_001n, baseRates: rates('.2', '.02', '.25', '1.2', '30m') }],
  ['openai-gpt-5.5', { minimum: 272_001n, baseRates: rates('5', '.5', undefined, '30') }],
  ['google-gemini-3.1-pro', { minimum: 200_001n, baseRates: rates('2', '.2', undefined, '12') }],
  ['xai-grok-4.6', { minimum: 200_000n, baseRates: rates('2', '.5', undefined, '6') }],
]);
const jointInputProviders = new Set(['anthropic', 'openai', 'morph', 'xai']);
const observedValuationProviders = new Set(['anthropic', 'openai', 'morph', 'vertexai', 'xai']);

/* A tiered route funds two meter contracts: its own id carries the base tariff every
 * request that provably cannot reach the threshold is held and charged at, and the
 * `:long-context` sibling carries the premium tariff. One contract per pinned tariff
 * keeps the pinned retail rate, the supplier pin and the terminal meter items in the
 * single-tariff shape the ledger settles. */
const longContextSuffix = ':long-context';
const contractRouteId = (routeId: string, longContext: boolean): string =>
  longContext ? `${routeId}${longContextSuffix}` : routeId;

/**
 * Every sku one route serves, base tier first.
 *
 * A route-level control — a pause, a supplier-bound breach, a settlement tier —
 * covers the whole route. Keying one on a single sku would leave the route's
 * other tier serving traffic, which is half a safety control.
 *
 * @param sku - Any sku the route publishes.
 * @returns The route's base sku and its long-context sibling.
 */
export const routeSkuFamily = (sku: string): readonly [string, string] => {
  const base = sku.endsWith(longContextSuffix) ? sku.slice(0, -longContextSuffix.length) : sku;
  return [base, `${base}${longContextSuffix}`];
};

/* When Tau last swept every route's tariff off the suppliers' published pricing.
 * A route added since pins its own reading date rather than claiming the sweep's. */
const pricingSweep = '2026-09-06';
const sourceRevision = (selected: Pick<Route, 'pricingRevision' | 'routeId'>): string =>
  `official-pricing:${selected.pricingRevision ?? pricingSweep}:${selected.routeId}`;
const valuationRates = (entries: readonly Rate[]) =>
  entries.map((entry) => ({
    dimension: entry.dimension,
    tier: entry.tier,
    numeratorPicoUsd: entry.numeratorPicoUsd.toString(),
    denominatorUnits: million.toString(),
  }));

/**
 * Pins the tariff a request's own input bound can reach.
 *
 * A base pin is a proof, not a preference: the bound has ruled the threshold out,
 * so the base schedule is the maximum tariff and the valuation may carry no
 * schedule above it, which is what the ledger's pinned-tariff check requires.
 *
 * @param selected - The qualified route.
 * @param routeRates - The route's premium tariff, which is also its only tariff when untiered.
 * @param maximumInput - The pinned input bound in tokens.
 * @returns The pinned tariff, whether it is the premium tier, and the observed valuation.
 */
const pinTariff = (
  selected: Pick<Route, 'pricingRevision' | 'providerId' | 'routeId'>,
  routeRates: readonly Rate[],
  maximumInput: bigint,
): { longContext: boolean; rates: readonly Rate[]; valuation?: SupplierValuation } => {
  const tiered = tieredValuations.get(selected.routeId);
  const longContext = tiered !== undefined && maximumInput >= tiered.minimum;
  const rates = longContext ? routeRates : (tiered?.baseRates ?? routeRates);
  return {
    longContext,
    rates,
    ...(observedValuationProviders.has(selected.providerId)
      ? {
          valuation: {
            version: 'supplier-valuation-v1',
            sourceRevision: sourceRevision(selected),
            longContextMinimumInputTokens: longContext ? tiered.minimum.toString() : null,
            baseRates: valuationRates(longContext ? tiered.baseRates : rates),
            longContextRates: longContext ? valuationRates(routeRates) : null,
          } satisfies SupplierValuation,
        }
      : {}),
  };
};

/** Every static cloud catalog route retained by the funded qualification boundary. */
export const billableModelRouteIds = routes.map((entry) => entry.routeId);

/* Clients speak the catalog `/v1/models` row id; provider model ids are never
 * accepted on the wire, so this table is keyed by route id alone. */
const routeById = new Map(routes.map((entry) => [entry.routeId, entry]));

/**
 * Refuse a premium tariff that no funded route can ever pin.
 *
 * A tiered key that matches no route is not inert. `routes` carries the premium
 * tariff and `tieredValuations` carries the base one, so a key that never
 * matches leaves the route pinning its premium rate on every request and never
 * registers the `:long-context` contract the ledger settles the premium against.
 *
 * @param tierRouteIds - The route ids the tiered valuation table is keyed by.
 */
export const assertTieredRoutesAreFunded = (tierRouteIds: Iterable<string>): void => {
  for (const routeId of tierRouteIds) {
    if (!routeById.has(routeId)) {
      throw new Error(`Tiered tariff ${routeId} has no funded route`);
    }
  }
};
assertTieredRoutesAreFunded(tieredValuations.keys());

export type BillableModelQualificationDependencies = {
  adapters: ReadonlyMap<string, BillableModelProviderAdapter>;
  credentialAccounts: ReadonlyMap<string, string>;
  /** Explicit route selection; production supplies none until count liability is qualified. */
  inputCounters?: ReadonlyMap<string, InputCountCapability | undefined>;
  /** Milliseconds. */
  executionTimeout: number;
};

/**
 * Read-only projection of every funded route's meter contract and supplier tariff.
 * The development policy generator reads it; it owns no behaviour of its own.
 */
export const billableModelRouteMeters = routes.flatMap((entry) => {
  if (entry.rates === undefined) {
    return [];
  }
  const tiered = tieredValuations.get(entry.routeId);
  const meter = (routeId: string, rates: readonly Rate[]) => ({
    routeId,
    meterContractId: `model-meter-v1:${routeId}`,
    rates,
    // A tariff that expires is a supplier promotion; the catalog keeps showing the standard price.
    ...(entry.validThrough === undefined ? {} : { validThrough: entry.validThrough }),
  });
  return tiered === undefined
    ? [meter(entry.routeId, entry.rates)]
    : [meter(entry.routeId, tiered.baseRates), meter(contractRouteId(entry.routeId, true), entry.rates)];
});

/* The replica declares this process's whole fleet, matching the publisher and payment
 * paths. Declaring only the requested route rejects any policy that enables another. */

/** Registers the closed meter contracts exported by the qualification resolver. */
export const registerBillableModelMeterContracts = (): void => {
  for (const entry of billableModelRouteMeters) {
    qualifiedMeterContracts.set(
      entry.meterContractId,
      new Set(entry.rates.map((rateEntry) => `${rateEntry.dimension}:${rateEntry.tier ?? ''}`)),
    );
  }
};

const admittedAnthropicBeta = (value: string): string | undefined => {
  try {
    return validateAnthropicHeaders({ beta: value }).beta;
  } catch {
    return undefined;
  }
};

/** A client-fault refusal in the gateway's typed envelope. */
const invalidRequest = (message: string): LlmGatewayError =>
  new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', message);

/**
 * Admit the provider headers the funded contract forwards.
 *
 * Exactly the Anthropic headers the gateway's own allowlist admits: one
 * version, and the beta features `validateAnthropicHeaders` normalizes; every
 * other header, on every wire, is refused.
 *
 * @param intent - The invocation whose price headers are being admitted.
 * @returns The lower-cased, normalized transport headers.
 */
const admitPriceHeaders = (
  intent: Pick<BillableInvocationIntent, 'priceHeaders' | 'providerWire'>,
): Record<string, string> => {
  const transportHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(intent.priceHeaders)) {
    const normalizedName = name.toLowerCase();
    let admitted: string | undefined;
    if (intent.providerWire === 'anthropic' && normalizedName === 'anthropic-version' && value === '2023-06-01') {
      admitted = value;
    } else if (intent.providerWire === 'anthropic' && normalizedName === 'anthropic-beta') {
      admitted = admittedAnthropicBeta(value);
    }
    if (admitted === undefined) {
      throw invalidRequest('Provider header is outside the funded request contract');
    }
    transportHeaders[normalizedName] = admitted;
  }
  return transportHeaders;
};

/** Resolves a provider request into code-owned financial maxima and supplier economics. */
export class CodeOwnedBillableModelQualificationResolver implements BillableModelQualificationResolver {
  public constructor(private readonly dependencies: BillableModelQualificationDependencies) {}

  public resolve(intent: Omit<BillableInvocationIntent, 'authUserId' | 'signal'>): QualifiedBillableInvocation {
    const transportHeaders = admitPriceHeaders(intent);
    const parsed = safeParseBillableModelRequest(intent.body, intent.providerWire);
    if (!parsed.success) {
      throw invalidRequest('Model request is outside the funded request contract');
    }
    const selected = routeById.get(parsed.data.model);
    if (!selected || selected.wire !== intent.providerWire) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'MODEL_NOT_IN_CATALOG', 'Model route is not qualified');
    }
    if (!selected.rates) {
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        `Model route is temporarily unavailable: ${selected.temporaryUnavailableReason}`,
      );
    }
    if (selected.allowsImage === false && billableModelRequestContainsImage(parsed.data)) {
      throw invalidRequest('Images are not qualified for this model route');
    }
    const maximumOutput = billableModelOutputMaximum(parsed.data);
    if (
      maximumOutput === undefined ||
      parsed.data[selected.outputParameter] === undefined ||
      maximumOutput > selected.outputMaximum
    ) {
      throw invalidRequest('Exactly one bounded output-token maximum is required');
    }
    const contextBound = (selected.combinedMaximum ?? selected.contextMaximum) - maximumOutput;
    if (contextBound < 0n) {
      throw invalidRequest('Output maximum exceeds the provider context');
    }
    /* The request's own bound, falling closed onto the provider context whenever an
     * element carries no documented token bound. */
    const requestBound = billableModelInputBound(parsed.data);
    const maximumInput = requestBound === undefined || requestBound > contextBound ? contextBound : requestBound;
    /* The threshold is priced against the bound, not the body, so the whole-context
     * fallback still pins the premium tariff. */
    const pinned = pinTariff(selected, selected.rates, maximumInput);
    const quantities = pinned.rates.map(
      (rateEntry): MeterQuantity => ({
        dimension: rateEntry.dimension,
        tier: rateEntry.tier,
        quantity: rateEntry.dimension === 'output' ? maximumOutput : maximumInput,
      }),
    );
    const jointInputMaximum: JointInputMaximum | undefined = jointInputProviders.has(selected.providerId)
      ? { version: 'joint-input-v1', quantity: maximumInput.toString() }
      : undefined;
    const supplierMaximumPicoUsd = maximumMeterCharge(
      pinned.rates.map((rateEntry) => ({
        dimension: rateEntry.dimension,
        quantity: rateEntry.dimension === 'output' ? maximumOutput : maximumInput,
        numerator: rateEntry.numeratorPicoUsd,
        denominator: million,
      })),
      jointInputMaximum,
    );
    const adapter = this.dependencies.adapters.get(selected.routeId);
    const credentialAccount = this.dependencies.credentialAccounts.get(selected.providerId);
    if (!adapter || !credentialAccount) {
      // Deployment fault, not a client one: the caller may retry once the provider is configured.
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'The model provider is unavailable.',
      );
    }
    const selectedCount = this.dependencies.inputCounters?.has(selected.routeId) ?? false;
    if (selectedCount && selected.providerId !== 'openai') {
      throw invalidRequest('Exact input counting is not qualified for this route');
    }
    const contractId = contractRouteId(selected.routeId, pinned.longContext);
    const meterContractId = `model-meter-v1:${contractId}`;
    return {
      ...(selectedCount
        ? {
            inputCount: {
              capability: this.dependencies.inputCounters?.get(selected.routeId),
            },
          }
        : {}),
      routeId: selected.routeId,
      surface: intent.surface,
      providerWire: selected.wire,
      modelId: selected.modelId,
      modelDisplayName: selected.modelDisplayName,
      providerId: selected.providerId,
      sku: `model:${contractId}`,
      meterContractId,
      maximumQuantities: quantities,
      supplierMaximumPicoUsd,
      // Streamed SSE costs 110-200 bytes per output token; 256 keeps a legitimate full-length answer
      // under the authorized_exhausted ceiling (W9) while the provider's own max-output cap bounds tokens.
      maximumResponseBytes: Number(maximumOutput) * 256 + 1_048_576,
      replica: {
        schemaVersion: 1,
        meterContractIds: [...qualifiedMeterContracts.keys()],
      },
      invocation: {
        contractVersion:
          selected.validThrough === undefined ? 'model-route-v1' : `model-route-v1:through:${selected.validThrough}`,
        supplierRatesValidUntil: selected.validThrough ?? null,
        credentialAccount,
        supplierRates: pinned.rates.map((rateEntry) => ({
          dimension: rateEntry.dimension,
          tier: rateEntry.tier,
          numeratorPicoUsd: rateEntry.numeratorPicoUsd.toString(),
          denominatorUnits: million.toString(),
        })),
        ...(pinned.valuation === undefined ? {} : { supplierValuation: pinned.valuation }),
        ...(jointInputMaximum === undefined ? {} : { jointInputMaximum }),
        executionTimeout: this.dependencies.executionTimeout,
      },
      normalizedRequest: {
        // The catalog route id is translated back to the supplier's own model id here; nothing downstream re-translates.
        body: {
          ...parsed.data,
          model: selected.providerId === 'vertexai' ? `google/${selected.modelId}` : selected.modelId,
        },
        headers: transportHeaders,
      },
      adapter,
    };
  }
}

/** Adapter helper for transports that already own byte-exact execution. */
export const withBillableEvidenceCollector = (
  wire: BillableProviderWire,
  adapter: Omit<BillableModelProviderAdapter, 'createEvidenceCollector'>,
): BillableModelProviderAdapter => ({
  ...adapter,
  createEvidenceCollector: (qualification) =>
    createBillableModelEvidenceCollector(
      wire,
      new Set(qualification.invocation.supplierRates.map((rateEntry) => rateEntry.dimension)),
      qualification.providerId,
    ),
});
