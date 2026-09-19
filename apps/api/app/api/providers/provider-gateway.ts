import { sign } from 'node:crypto';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { isModelListEntryEnabled, modelList } from '#api/models/model.constants.js';
import type { ModelProviderWire } from '#api/llm/model-invocation.types.js';

export type GatewayProviderId =
  | 'anthropic'
  | 'cerebras'
  | 'moonshot'
  | 'morph'
  | 'openai'
  | 'together'
  | 'vertexai'
  | 'xai';
export type FundedGatewayProviderId = Exclude<GatewayProviderId, 'cerebras' | 'moonshot'>;

const providerTargets = {
  anthropic: { key: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/messages', wire: 'anthropic' },
  cerebras: {
    key: 'CEREBRAS_API_KEY',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    wire: 'openai-completions',
  },
  moonshot: {
    key: 'MOONSHOT_API_KEY',
    url: 'https://api.moonshot.ai/v1/chat/completions',
    wire: 'openai-completions',
  },
  openai: { key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/responses', wire: 'openai-responses' },
  together: {
    key: 'TOGETHER_API_KEY',
    url: 'https://api.together.ai/v1/chat/completions',
    wire: 'openai-completions',
  },
  morph: {
    key: 'MORPH_API_KEY',
    url: 'https://api.morphllm.com/v1/chat/completions',
    wire: 'openai-completions',
  },
  xai: { key: 'XAI_API_KEY', url: 'https://api.x.ai/v1/responses', wire: 'openai-responses' },
  vertexai: {
    key: 'GOOGLE_VERTEX_AI_CREDENTIALS',
    url: 'https://aiplatform.googleapis.com',
    wire: 'openai-completions',
  },
} as const satisfies Record<GatewayProviderId, { key: string; url: string; wire: ModelProviderWire }>;

export type GatewayModelRoute = {
  readonly routeId: string;
  readonly modelId: string;
  readonly providerId: GatewayProviderId;
  readonly wire: ModelProviderWire;
};

const gatewayProviderIds = new Set<string>(Object.keys(providerTargets));
export const fundedGatewayProviderIds: readonly FundedGatewayProviderId[] = [
  'anthropic',
  'morph',
  'openai',
  'together',
  'vertexai',
  'xai',
];
const fundedGatewayProviderIdSet = new Set<string>(fundedGatewayProviderIds);
export const isGatewayProviderId = (value: string): value is GatewayProviderId => gatewayProviderIds.has(value);
export const isFundedGatewayProviderId = (value: string): value is FundedGatewayProviderId =>
  fundedGatewayProviderIdSet.has(value);
const routes = new Map<string, GatewayModelRoute>(
  Object.values(modelList)
    .flatMap((modelsBySlug) => Object.values(modelsBySlug))
    .flatMap((entry) => {
      if (!isModelListEntryEnabled(entry) || !isGatewayProviderId(entry.provider.id)) {
        return [];
      }
      const providerId = entry.provider.id;
      return [
        [
          entry.id,
          { routeId: entry.id, modelId: entry.model, providerId, wire: providerTargets[providerId].wire },
        ] as const,
      ];
    }),
);

type GatewayConfig = { get(key: string): unknown };
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
  const unsigned = `${base64Url({ alg: 'RS256', typ: 'JWT' })}.${base64Url({
    iss: credentials.clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
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
    throw new ServiceUnavailableException('Vertex credential exchange failed');
  }
  const payload = (await response.json()) as unknown;
  if (
    payload === null ||
    typeof payload !== 'object' ||
    !('access_token' in payload) ||
    typeof payload.access_token !== 'string'
  ) {
    throw new ServiceUnavailableException('Vertex credential exchange returned invalid data');
  }
  return payload.access_token;
};

export const gatewayModelRoutes = (): readonly GatewayModelRoute[] => [...routes.values()];

export const resolveGatewayModelRoute = (routeId: string, wire: ModelProviderWire): GatewayModelRoute => {
  const route = routes.get(routeId);
  if (!route || route.wire !== wire) {
    throw new BadRequestException('Model route is unavailable for this provider wire');
  }
  return route;
};

export const isGatewayProviderConfigured = (config: GatewayConfig, providerId: GatewayProviderId): boolean => {
  const value = config.get(providerTargets[providerId].key);
  return providerId === 'vertexai'
    ? vertexCredentials(value) !== undefined
    : typeof value === 'string' && value.length > 0;
};

export const executeGatewayProviderRequest = async (input: {
  readonly config: GatewayConfig;
  readonly providerId: GatewayProviderId;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly fetch?: typeof fetch;
}): Promise<Response> => {
  const fetchOnce = input.fetch ?? globalThis.fetch.bind(globalThis);
  const target = providerTargets[input.providerId];
  const configured = input.config.get(target.key);
  const credentials = input.providerId === 'vertexai' ? vertexCredentials(configured) : undefined;
  const key = typeof configured === 'string' && configured.length > 0 ? configured : undefined;
  const accessToken = credentials ? await vertexToken(credentials, fetchOnce, input.signal) : key;
  if (!accessToken) {
    throw new ServiceUnavailableException(`Configured provider ${input.providerId} is unavailable`);
  }
  const url = credentials
    ? `${target.url}/v1/projects/${encodeURIComponent(credentials.projectId)}/locations/global/endpoints/openapi/chat/completions`
    : target.url;
  return fetchOnce(url, {
    method: 'POST',
    redirect: 'error',
    signal: input.signal,
    body: JSON.stringify(input.body),
    headers:
      input.providerId === 'anthropic'
        ? { 'content-type': 'application/json', 'x-api-key': accessToken, ...input.headers }
        : { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
  });
};
