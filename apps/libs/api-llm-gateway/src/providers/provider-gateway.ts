import { sign } from 'node:crypto';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { isModelListEntryEnabled, modelList } from '#models/model.constants.js';
import type { ModelProviderWire } from '#model-invocation.types.js';
import type { Model } from '@taucad/chat/model-catalog';

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
/**
 * A provider only the self-host helper reaches: keyless, local, never funded and
 * never a catalog route, so the gateway surface cannot address it.
 */
export type LocalProviderId = 'ollama';
/** Every provider target the transport can call: the catalog's gateway providers and the local ones. */
export type ProviderTargetId = GatewayProviderId | LocalProviderId;

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
  // Keyless: `key` names the switch that enables it, not a credential.
  ollama: {
    key: 'OLLAMA_ENABLED',
    url: 'http://localhost:11434/v1/chat/completions',
    wire: 'openai-completions',
  },
} as const satisfies Record<ProviderTargetId, { key: string; url: string; wire: ModelProviderWire }>;

const localProviderIds = new Set<string>(['ollama'] satisfies LocalProviderId[]);

export type GatewayModelRoute = {
  readonly routeId: string;
  readonly modelId: string;
  readonly providerId: GatewayProviderId;
  readonly wire: ModelProviderWire;
};

const gatewayProviderIds = new Set<string>(Object.keys(providerTargets).filter((id) => !localProviderIds.has(id)));
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
export type VertexCredentials = {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  /** Names the signing key so Google need not try each of the account's keys. */
  privateKeyId?: string;
};

const vertexCredentials = (value: unknown): VertexCredentials | undefined => {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record['client_email'] === 'string' &&
    typeof record['private_key'] === 'string' &&
    typeof record['project_id'] === 'string'
    ? {
        clientEmail: record['client_email'],
        privateKey: record['private_key'],
        projectId: record['project_id'],
        ...(typeof record['private_key_id'] === 'string' && record['private_key_id'].length > 0
          ? { privateKeyId: record['private_key_id'] }
          : {}),
      }
    : undefined;
};

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/* Google accepts a JWT signed with the service account's own key as the bearer token, so no
 * token exchange stands between a request and Vertex. An hour is the longest lifetime Google
 * accepts; a fresh one is signed for every request. */
const vertexAccessTokenLifetimeSeconds = 3600;

/**
 * A self-signed Vertex bearer token for one request.
 *
 * Signing locally costs about a millisecond and a half. The OAuth exchange it replaces cost a
 * round trip to Google before every uncached request, and the cache that hid it needed refresh,
 * single-flight and eviction logic. A signed token has none of those to get wrong.
 *
 * @param credentials - The service account.
 * @param now - The clock in epoch milliseconds, injectable for tests.
 * @returns The bearer token.
 */
export const signVertexAccessToken = (credentials: VertexCredentials, now: number = Date.now()): string => {
  const issuedAt = Math.floor(now / 1000);
  const unsigned = `${base64Url({
    alg: 'RS256',
    typ: 'JWT',
    ...(credentials.privateKeyId === undefined ? {} : { kid: credentials.privateKeyId }),
  })}.${base64Url({
    iss: credentials.clientEmail,
    sub: credentials.clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    iat: issuedAt,
    exp: issuedAt + vertexAccessTokenLifetimeSeconds,
  })}`;
  try {
    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), credentials.privateKey).toString('base64url')}`;
  } catch {
    // The key is configuration, not request input, and its parse error must not reach a log line.
    throw new ServiceUnavailableException('Vertex credentials cannot sign');
  }
};

export const gatewayModelRoutes = (): readonly GatewayModelRoute[] => [...routes.values()];

/** Where a self-host helper sends one listed model: a catalog route, or the local Ollama target. */
export type HelperModelRoute = {
  readonly modelId: string;
  readonly providerId: ProviderTargetId;
  readonly wire: ModelProviderWire;
};

/**
 * The route a self-host helper takes for one listed model.
 *
 * @param model - A model `ModelService.getModels` listed.
 * @returns Its catalog route, the local Ollama target for a discovered Ollama
 * model, or `undefined` when the model has neither.
 */
export const helperModelRoute = (model: Pick<Model, 'id' | 'model' | 'provider'>): HelperModelRoute | undefined => {
  if (model.provider.id === 'ollama') {
    return { modelId: model.model, providerId: 'ollama', wire: providerTargets.ollama.wire };
  }
  const route = routes.get(model.id);
  return route === undefined ? undefined : { modelId: route.modelId, providerId: route.providerId, wire: route.wire };
};

/**
 * The model id the provider itself expects: Vertex's OpenAI-compatible endpoint
 * names a Google model `google/<id>`.
 *
 * @param route - The resolved route.
 * @returns The provider's model id.
 */
export const upstreamModelId = (route: Pick<HelperModelRoute, 'modelId' | 'providerId'>): string =>
  route.providerId === 'vertexai' ? `google/${route.modelId}` : route.modelId;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pdfDataUrlPrefix = 'data:application/pdf;base64,';

/**
 * A Vertex `image_url` part for one completions PDF, when the part is one.
 *
 * @param part - One completions content element.
 * @returns The Vertex part, or `undefined` when `part` is not an inline PDF.
 */
const vertexPdfPart = (
  part: unknown,
): { readonly type: 'image_url'; readonly image_url: { readonly url: string } } | undefined => {
  if (!isRecord(part) || part['type'] !== 'file' || !isRecord(part['file'])) {
    return undefined;
  }
  const fileData = part['file']['file_data'];
  if (typeof fileData !== 'string' || !fileData.startsWith(pdfDataUrlPrefix)) {
    return undefined;
  }
  // Vertex's documented user part. The key is the provider's, not ours.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- provider wire key
  return { type: 'image_url', image_url: { url: fileData } };
};

/**
 * The Vertex chat body, with each PDF `file` part rewritten to an `image_url` data URI.
 *
 * Vertex's OpenAI-compatible user message accepts `text` and `image_url`. Blob
 * `image_url` data carries any GenerateContent MIME type, including
 * `application/pdf`. A completions `file` part is not one of those types, so it
 * is rewritten only on this hop, after billing has counted the original `file`
 * part as a document. The caller's body is left unchanged.
 *
 * @param body - The admitted completions request.
 * @returns The body Vertex should receive.
 */
export const vertexUpstreamBody = (body: unknown): unknown => {
  if (!isRecord(body) || !Array.isArray(body['messages'])) {
    return body;
  }
  const messages: readonly unknown[] = body['messages'];
  const rewritten: unknown[] = [];
  let changed = false;
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message['content'])) {
      rewritten.push(message);
      continue;
    }
    const content: readonly unknown[] = message['content'];
    const parts: unknown[] = [];
    let messageChanged = false;
    for (const part of content) {
      const pdfPart = vertexPdfPart(part);
      if (pdfPart === undefined) {
        parts.push(part);
      } else {
        messageChanged = true;
        parts.push(pdfPart);
      }
    }
    if (messageChanged) {
      changed = true;
      rewritten.push({ ...message, content: parts });
    } else {
      rewritten.push(message);
    }
  }
  if (!changed) {
    return body;
  }
  return { ...body, messages: rewritten };
};

export const executeGatewayProviderRequest = async (input: {
  readonly config: GatewayConfig;
  readonly providerId: ProviderTargetId;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly fetch?: typeof fetch;
}): Promise<Response> => {
  const fetchOnce = input.fetch ?? globalThis.fetch.bind(globalThis);
  const target = providerTargets[input.providerId];
  const configured = input.config.get(target.key);
  if (localProviderIds.has(input.providerId)) {
    if (configured !== true) {
      throw new ServiceUnavailableException(`Configured provider ${input.providerId} is unavailable`);
    }
    // A local server on the operator's own machine: no credential to send.
    return fetchOnce(target.url, {
      method: 'POST',
      redirect: 'error',
      signal: input.signal,
      body: JSON.stringify(input.body),
      headers: { 'content-type': 'application/json' },
    });
  }
  const credentials = input.providerId === 'vertexai' ? vertexCredentials(configured) : undefined;
  const key = typeof configured === 'string' && configured.length > 0 ? configured : undefined;
  const accessToken = credentials ? signVertexAccessToken(credentials) : key;
  if (!accessToken) {
    throw new ServiceUnavailableException(`Configured provider ${input.providerId} is unavailable`);
  }
  const url = credentials
    ? `${target.url}/v1/projects/${encodeURIComponent(credentials.projectId)}/locations/global/endpoints/openapi/chat/completions`
    : target.url;
  const response = await fetchOnce(url, {
    method: 'POST',
    redirect: 'error',
    signal: input.signal,
    body: JSON.stringify(input.providerId === 'vertexai' ? vertexUpstreamBody(input.body) : input.body),
    headers:
      input.providerId === 'anthropic'
        ? { 'content-type': 'application/json', 'x-api-key': accessToken, ...input.headers }
        : { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
  });
  return response;
};
