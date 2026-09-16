import { withBillableEvidenceCollector } from '#api/billing/billable-model-qualification.js';
import { calculatePreliminarySupplierCost } from '#api/billing/billable-model-cost.js';
import { invocationEvidenceDigest, serializeInvocationEvidence } from '#api/billing/credit-ledger.service.js';
import type { BillableModelProviderAdapter } from '#api/billing/billable-model-invocation.types.js';
import type { InputCountCapability } from '#api/billing/billable-model-input-count.js';
import type { BillingEnvironment } from '#api/billing/credit-ledger.types.js';
import {
  executeGatewayProviderRequest,
  gatewayModelRoutes,
  isFundedGatewayProviderId,
  isGatewayProviderConfigured,
} from '#api/providers/provider-gateway.js';

const routeProvider = new Map(
  gatewayModelRoutes()
    .filter((route) => isFundedGatewayProviderId(route.providerId))
    .map((route) => [route.routeId, route.providerId]),
);

/* Pinned with the endpoint contract this counter was qualified against; it is recorded on every
 * counted operation's evidence, so it changes only when the supplier's counter contract does. */
const inputCountRevision = 'openai-input-tokens-v1:2026-09-12';

/**
 * Route-keyed exact input counters, empty unless an operator enables them.
 * Every OpenAI route is covered in every environment; the byte bound stays the ceiling the
 * count is compared against, so a counter can only shrink an operation's hold.
 */
export const createBillableModelInputCounters = (input: {
  enabled: boolean;
  environment: BillingEnvironment;
  apiKey: unknown;
  credentialAccount: string | undefined;
}): ReadonlyMap<string, InputCountCapability> => {
  const { apiKey, credentialAccount } = input;
  if (!input.enabled || typeof apiKey !== 'string' || apiKey.length === 0 || credentialAccount === undefined) {
    return new Map();
  }
  return new Map(
    [...routeProvider]
      .filter(([, provider]) => provider === 'openai')
      .map(([routeId]) => [
        routeId,
        {
          qualification: 'openai-input-tokens-v1',
          environment: input.environment,
          credentialAccount,
          sourceRevision: inputCountRevision,
          url: 'https://api.openai.com/v1/responses/input_tokens',
          apiKey,
        } satisfies InputCountCapability,
      ]),
  );
};

/** Creates the route-keyed, single-attempt production transport adapters. */
export const createBillableModelProviderAdapters = (
  config: { get(key: string): unknown },
  fetchOnce: typeof fetch = fetch,
): ReadonlyMap<string, BillableModelProviderAdapter> =>
  new Map(
    [...routeProvider].flatMap(([routeId, provider]) => {
      if (!isGatewayProviderConfigured(config, provider)) {
        return [];
      }
      const adapter = withBillableEvidenceCollector(
        provider === 'anthropic'
          ? 'anthropic'
          : provider === 'openai' || provider === 'xai'
            ? 'openai-responses'
            : 'openai-completions',
        {
          executeOnce: async ({ qualification, signal }) => {
            const request = qualification.normalizedRequest;
            return executeGatewayProviderRequest({
              config,
              providerId: provider,
              body: request.body,
              headers: request.headers,
              signal,
              fetch: fetchOnce,
            });
          },
          classifyFinality: ({ qualification, evidence }) => {
            const payloadDigest = invocationEvidenceDigest(serializeInvocationEvidence(evidence));
            const supplierEvidence = calculatePreliminarySupplierCost({
              invocation: qualification.invocation,
              evidence,
              payloadDigest,
            });
            return {
              state: supplierEvidence ? 'preliminary' : 'unknown',
              providerRequestId: evidence.normalizationEvidence?.providerRequestId,
              supplierEvidence,
            };
          },
        },
      );
      return [[routeId, adapter] as const];
    }),
  );
