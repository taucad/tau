import { sign } from 'node:crypto';
import { withBillableEvidenceCollector } from '#api/billing/billable-model-qualification.js';
import { calculatePreliminarySupplierCost } from '#api/billing/billable-model-cost.js';
import { invocationEvidenceDigest, serializeInvocationEvidence } from '#api/billing/credit-ledger.service.js';
import type { BillableModelProviderAdapter } from '#api/billing/billable-model-invocation.types.js';
import type { InputCountCapability } from '#api/billing/billable-model-input-count.js';
import type { BillingEnvironment } from '#api/billing/credit-ledger.types.js';

const providerTargets = {
  anthropic: { key: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/messages' },
  openai: { key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/responses' },
  together: { key: 'TOGETHER_API_KEY', url: 'https://api.together.ai/v1/chat/completions' },
  morph: { key: 'MORPH_API_KEY', url: 'https://api.morphllm.com/v1/chat/completions' },
  xai: { key: 'XAI_API_KEY', url: 'https://api.x.ai/v1/responses' },
  vertexai: { key: 'GOOGLE_VERTEX_AI_CREDENTIALS', url: 'https://aiplatform.googleapis.com' },
} as const;

const routeProvider = new Map<string, keyof typeof providerTargets>([
  ['anthropic-claude-fable-5.1', 'anthropic'],
  ['anthropic-claude-fable-5', 'anthropic'],
  ['anthropic-claude-opus-5', 'anthropic'],
  ['anthropic-claude-opus-4.8', 'anthropic'],
  ['anthropic-claude-sonnet-5', 'anthropic'],
  ['anthropic-claude-sonnet-4.6', 'anthropic'],
  ['anthropic-claude-haiku-4.5', 'anthropic'],
  ['openai-gpt-6-astra', 'openai'],
  ['openai-gpt-5.6-sol', 'openai'],
  ['openai-gpt-5.6-terra', 'openai'],
  ['openai-gpt-5.6-luna', 'openai'],
  ['openai-gpt-5.5', 'openai'],
  ['together-kimi-k3', 'together'],
  ['together-glm-5.2', 'together'],
  ['morph-minimax-m2.7', 'morph'],
  ['xai-grok-4.6', 'xai'],
  ['google-gemini-3.1-pro', 'vertexai'],
  ['google-gemini-3.7-flash', 'vertexai'],
  ['google-gemini-3.5-flash-lite', 'vertexai'],
  ['google-gemini-3.5-flash', 'vertexai'],
]);

type VertexCredentials = { clientEmail: string; privateKey: string; projectId: string };
const vertexCredentials = (value: unknown): VertexCredentials | undefined => {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record['client_email'] === 'string' &&
    typeof record['private_key'] === 'string' &&
    typeof record['project_id'] === 'string'
    ? { clientEmail: record['client_email'], privateKey: record['private_key'], projectId: record['project_id'] }
    : undefined;
};
const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const vertexToken = async (
  credentials: VertexCredentials,
  fetchOnce: typeof fetch,
  signal: AbortSignal,
): Promise<string> => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url({ alg: 'RS256', typ: 'JWT' })}.${base64Url({ iss: credentials.clientEmail, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: issuedAt, exp: issuedAt + 3600 })}`;
  const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), credentials.privateKey).toString('base64url')}`;
  const response = await fetchOnce('https://oauth2.googleapis.com/token', {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams([
      ['grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer'],
      ['assertion', assertion],
    ]),
  });
  if (!response.ok) {
    throw new Error('Vertex credential exchange failed');
  }
  const payload = (await response.json()) as unknown;
  if (
    payload === null ||
    typeof payload !== 'object' ||
    !('access_token' in payload) ||
    typeof payload.access_token !== 'string'
  ) {
    throw new Error('Vertex credential exchange was invalid');
  }
  return payload.access_token;
};

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
      const target = providerTargets[provider];
      const configured = config.get(target.key);
      const key = typeof configured === 'string' && configured.length > 0 ? configured : undefined;
      const credentials = provider === 'vertexai' ? vertexCredentials(configured) : undefined;
      if (!key && !credentials) {
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
            const accessToken = credentials ? await vertexToken(credentials, fetchOnce, signal) : key;
            if (!accessToken) {
              throw new Error(`Qualified provider transport ${provider} is unavailable`);
            }
            const url = credentials
              ? `${target.url}/v1/projects/${encodeURIComponent(credentials.projectId)}/locations/global/endpoints/openapi/chat/completions`
              : target.url;
            let { body } = request;
            if (credentials && body !== null && typeof body === 'object' && !Array.isArray(body)) {
              const vertexRequest = body as Record<string, unknown>;
              if (typeof vertexRequest['model'] === 'string' && !vertexRequest['model'].startsWith('google/')) {
                body = { ...vertexRequest, model: `google/${vertexRequest['model']}` };
              }
            }
            return fetchOnce(url, {
              method: 'POST',
              redirect: 'error',
              signal,
              body: JSON.stringify(body),
              headers:
                provider === 'anthropic'
                  ? { 'content-type': 'application/json', 'x-api-key': accessToken, ...request.headers }
                  : { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
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
