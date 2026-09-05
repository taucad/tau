import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Model,
  ModelCostRates,
  ProviderStreams,
} from '@earendil-works/pi-ai';
import { util as zodUtility } from 'zod';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { MessageIdentities, providerMessageToPi } from '#harness/session-record.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { JsonObject, ModelProviderKind, ModelSystemPromptBlock } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';

const openAiGatewayPath = 'v1/llm/openai/v1';
const anthropicGatewayPath = 'v1/llm/anthropic';
// Pi validates provider auth before invoking custom fetch; this sentinel is
// stripped at the wire boundary so cookie-authenticated requests emit no key header.
const piCookieAuthValidationHeaders = { authorization: 'cookie-authenticated' } as const;

/** Stable gateway failures surfaced across the W3 transport boundary. @public */
export const gatewayModelErrorCodes = [
  'INSUFFICIENT_CREDIT',
  'MODEL_NOT_IN_CATALOG',
  'MODEL_PROVIDER_UNSUPPORTED',
  'ORIGIN_NOT_ALLOWED',
  'RATE_LIMITED',
  'UNAUTHENTICATED',
  'INVALID_REQUEST',
  'PROVIDER_UNAVAILABLE',
  'UPSTREAM_REJECTED',
  'MALFORMED_RESPONSE',
  'NETWORK_ERROR',
  'UNKNOWN_GATEWAY_ERROR',
] as const;

/** Stable gateway failure code. @public */
export type GatewayModelErrorCode = (typeof gatewayModelErrorCodes)[number];

/** Typed failure returned by Tau's model gateway. @public */
export class GatewayModelTransportError extends Error {
  public readonly code: GatewayModelErrorCode;
  public readonly status?: number | undefined;
  public readonly rawType?: string | undefined;

  public constructor(options: {
    readonly code: GatewayModelErrorCode;
    readonly message: string;
    readonly status?: number | undefined;
    readonly rawType?: string | undefined;
    readonly cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'GatewayModelTransportError';
    this.code = options.code;
    this.status = options.status;
    this.rawType = options.rawType;
  }
}

const openAiGatewayProviderKinds = new Set<ModelProviderKind>([
  'openai',
  'vertexai',
  'cerebras',
  'together',
  'morph',
  'xai',
  'moonshot',
]);

/**
 * Whether Tau's OpenAI gateway route speaks the catalog provider's wire.
 *
 * @param providerKind - Catalog provider discriminator.
 * @returns Whether the provider uses Tau's OpenAI-compatible route.
 * @public
 */
export const isOpenAiGatewayProviderKind = (providerKind: ModelProviderKind | undefined): boolean =>
  providerKind !== undefined && openAiGatewayProviderKinds.has(providerKind);

/**
 * Whether Tau exposes a browser-safe gateway wire for the catalog provider.
 *
 * @param providerKind - Catalog provider discriminator.
 * @returns Whether the browser host can route the provider through Tau's gateway.
 * @public
 */
export const isGatewayProviderKind = (providerKind: string | undefined): boolean =>
  providerKind === 'anthropic' || isOpenAiGatewayProviderKind(providerKind as ModelProviderKind | undefined);

/**
 * Whether the catalog provider is OpenAI itself rather than an
 * OpenAI-compatible provider.
 *
 * Direct-OpenAI rows speak the Responses wire: `gpt-5.6-luna` answers HTTP 400
 * (`Function tools with reasoning_effort are not supported ... in
 * /v1/chat/completions`) to any completions request carrying function tools,
 * and the browser host always sends tools. Every OpenAI-compatible provider
 * exposes only /chat/completions and stays on that codec.
 *
 * @param providerKind - Catalog provider discriminator (`provider.id`).
 * @returns Whether the request must use pi's `openai-responses` codec.
 * @public
 */
export const isOpenAiResponsesProviderKind = (providerKind: ModelProviderKind | undefined): boolean =>
  providerKind === 'openai';

/** Input matching Tau API's static/workspace/dynamic cache layout. @public */
export type CachedSystemPromptOptions = {
  readonly staticPrompt: string;
  readonly dynamicPrompt: string;
  readonly workspacePrompt?: string | undefined;
};

/**
 * Preserve the ordered system-prompt structure beside pi's canonical string prompt.
 *
 * @param options - Static, optional workspace, and dynamic prompt content.
 * @returns Ordered provider-neutral cache blocks.
 * @public
 */
export const createCachedSystemPromptBlocks = (
  options: CachedSystemPromptOptions,
): readonly ModelSystemPromptBlock[] => [
  {
    type: 'text',
    text: options.staticPrompt,
    cacheControl: { type: 'ephemeral' },
  },
  ...(options.workspacePrompt === undefined
    ? []
    : ([
        {
          type: 'text',
          text: options.workspacePrompt,
          cacheControl: { type: 'ephemeral' },
        },
      ] as const)),
  { type: 'text', text: options.dynamicPrompt },
];

/** Browser-safe Tau gateway transport configuration. @public */
export type GatewayModelTransportOptions = {
  /**
   * Bearer token provider for hosts with no cookie jar (an Electron utility
   * process, a daemon). Configured, its token becomes the `Authorization`
   * header; omitted or resolving to `undefined`, the header is stripped and the
   * request stays cookie-authenticated.
   */
  readonly auth?: (() => string | undefined | Promise<string | undefined>) | undefined;
  readonly baseUrl: string;
  readonly model: {
    readonly contextWindow: number;
    readonly maxTokens?: number | undefined;
    readonly cost?: ModelCostRates | undefined;
  };
  readonly fetch?: typeof globalThis.fetch | undefined;
};

type WireRecord = Record<string, unknown>;
type GatewayFetchState = { failure?: GatewayModelTransportError | undefined };
type PiGatewayModel = Model<'anthropic-messages'> | Model<'openai-completions'> | Model<'openai-responses'>;
type PiTool = NonNullable<Context['tools']>[number];

const readString = (value: WireRecord, key: string): string | undefined =>
  typeof value[key] === 'string' ? value[key] : undefined;

const gatewayErrorCode = (value: unknown, status: number): GatewayModelErrorCode => {
  if (typeof value === 'string' && gatewayModelErrorCodes.some((code) => code === value)) {
    return value as GatewayModelErrorCode;
  }
  if (typeof value === 'string') {
    return 'UNKNOWN_GATEWAY_ERROR';
  }
  if (status === 401) {
    return 'UNAUTHENTICATED';
  }
  if (status === 403) {
    return 'UNKNOWN_GATEWAY_ERROR';
  }
  if (status === 429) {
    return 'RATE_LIMITED';
  }
  if (status >= 500) {
    return 'PROVIDER_UNAVAILABLE';
  }
  return 'INVALID_REQUEST';
};

const gatewayEnvelopeError = (
  payload: WireRecord,
  status: number,
  fallback: string,
): GatewayModelTransportError | undefined => {
  const envelope = zodUtility.isObject(payload['error'])
    ? payload['error']
    : payload['type'] === 'error'
      ? payload
      : undefined;
  if (!envelope) {
    return undefined;
  }
  const rawType = readString(envelope, 'type');
  const code = gatewayErrorCode(rawType, status);
  return new GatewayModelTransportError({
    code,
    message: readString(envelope, 'message') ?? fallback,
    status,
    ...(rawType && code === 'UNKNOWN_GATEWAY_ERROR' ? { rawType } : {}),
  });
};

/**
 * Read a typed code out of the API's flattened `HttpErrorResponse` shape.
 *
 * Belt and braces for an API build whose exception filter still collapses the
 * gateway envelope: the flattened body keeps `code`, and a known gateway code
 * there is worth more than a status-derived guess.
 */
const flattenedGatewayError = (payload: WireRecord, status: number): GatewayModelTransportError | undefined => {
  const code = readString(payload, 'code');
  if (code === undefined || !gatewayModelErrorCodes.some((known) => known === code)) {
    return undefined;
  }
  return new GatewayModelTransportError({
    code: code as GatewayModelErrorCode,
    message: readString(payload, 'message') ?? readString(payload, 'error') ?? code,
    status,
  });
};

const responseError = async (response: Response): Promise<GatewayModelTransportError> => {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const fallback = `Tau model gateway returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`;
  if (zodUtility.isObject(payload)) {
    const parsed =
      gatewayEnvelopeError(payload, response.status, fallback) ?? flattenedGatewayError(payload, response.status);
    if (parsed) {
      return parsed;
    }
  }
  return new GatewayModelTransportError({
    code: gatewayErrorCode(undefined, response.status),
    message: fallback,
    status: response.status,
  });
};

const networkError = (message: string, cause: unknown, status?: number): GatewayModelTransportError =>
  new GatewayModelTransportError({
    code: 'NETWORK_ERROR',
    message,
    ...(status === undefined ? {} : { status }),
    cause,
  });

const guardedResponse = (options: {
  readonly response: Response;
  readonly state: GatewayFetchState;
  readonly signal: AbortSignal;
}): Response => {
  const reader = options.response.body!.getReader();
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      } catch (error) {
        if (options.signal.aborted) {
          controller.error(error);
          return;
        }
        const failure = networkError('Tau model gateway response stream failed.', error, options.response.status);
        options.state.failure = failure;
        controller.error(failure);
      }
    },
    cancel: async (reason) => reader.cancel(reason),
  });
  return new Response(body, {
    status: options.response.status,
    statusText: options.response.statusText,
    headers: options.response.headers,
  });
};

/**
 * Project provider-neutral prompt blocks onto Anthropic's `system` array.
 *
 * Anthropic validates this array strictly and the Tau gateway sanitizes every
 * upstream 4xx, so an invalid block reaches the browser as an opaque failure.
 * Two shapes it rejects are reachable from Tau's own callers, and both are
 * dropped here rather than in each caller:
 *
 * - an empty text block (`system: text content blocks must be non-empty`, and
 *   `system.N: cache_control cannot be set for empty text blocks`) — the chat
 *   client emits one for the workspace slot when a project has no workspace
 *   prompt;
 * - `cache_control.scope` (`Extra inputs are not permitted`) — Tau's neutral
 *   `PromptCacheControl` carries a scope that no Anthropic beta accepts.
 */
const anthropicSystemBlocks = (blocks: readonly ModelSystemPromptBlock[]): readonly JsonObject[] =>
  blocks.flatMap((block) => {
    const text = block.text.toWellFormed();
    if (text === '') {
      return [];
    }
    return [
      {
        type: 'text',
        text,
        ...(block.cacheControl
          ? {
              // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic's wire uses snake_case.
              cache_control: { type: block.cacheControl.type },
            }
          : {}),
      },
    ];
  });

const authenticatedFetch =
  (options: {
    readonly auth?: GatewayModelTransportOptions['auth'];
    readonly fetch: typeof globalThis.fetch;
    readonly signal: AbortSignal;
    readonly state: GatewayFetchState;
    readonly providerKind: ModelProviderKind;
    readonly systemPromptBlocks?: readonly ModelSystemPromptBlock[] | undefined;
  }): typeof globalThis.fetch =>
  async (input, init) => {
    try {
      // Credentialed CORS ignores an `Access-Control-Allow-Headers: *` wildcard,
      // so the gateway's allow-list stays tight and the bundled SDK's Stainless
      // telemetry is dropped here instead of failing preflight in the browser.
      const headers = new Headers(
        [...new Headers(init?.headers)].filter(([name]) => !name.toLowerCase().startsWith('x-stainless-')),
      );
      const token = await options.auth?.();
      if (token === undefined) {
        headers.delete('authorization');
      } else {
        headers.set('authorization', `Bearer ${token}`);
      }
      headers.delete('x-api-key');
      // Same allow-list problem: pi's Anthropic client stamps this browser
      // escape hatch, which Tau's gateway never reads (it proxies server-side).
      headers.delete('anthropic-dangerous-direct-browser-access');
      let body = init?.body;
      // Anthropic can preserve SP-8's three cache breakpoints. OpenAI has no
      // per-system-block cache-control wire shape and uses pi's blanket retention.
      if (options.providerKind === 'anthropic' && typeof body === 'string' && options.systemPromptBlocks) {
        const payload: unknown = JSON.parse(body);
        if (!zodUtility.isObject(payload)) {
          throw new TypeError('pi-ai produced a non-object Anthropic request body.');
        }
        const system = anthropicSystemBlocks(options.systemPromptBlocks);
        // An all-empty block set leaves pi's own string prompt in place rather
        // than posting `system: []`.
        if (system.length > 0) {
          body = JSON.stringify({ ...payload, system });
        }
      }
      const response = await options.fetch(input, { ...init, body, credentials: 'include', headers });
      if (!response.ok) {
        const failure = await responseError(response);
        options.state.failure = failure;
        throw failure;
      }
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (contentType !== 'text/event-stream' || !response.body) {
        const failure = new GatewayModelTransportError({
          code: 'MALFORMED_RESPONSE',
          message: `Tau model gateway returned ${contentType ?? 'no content type'} instead of text/event-stream.`,
          status: response.status,
        });
        options.state.failure = failure;
        throw failure;
      }
      return guardedResponse({ response, state: options.state, signal: options.signal });
    } catch (error) {
      if (error instanceof GatewayModelTransportError || options.signal.aborted) {
        throw error;
      }
      const failure = networkError('Tau model gateway request failed.', error);
      options.state.failure = failure;
      throw failure;
    }
  };

const baseUrlFor = (baseUrl: string, path: string): string => {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, root).href.replace(/\/$/u, '');
};

const piModelFor = (options: {
  readonly request: ModelStreamRequest;
  readonly transport: GatewayModelTransportOptions;
}): PiGatewayModel => {
  const maxTokens = options.request.maxTokens ?? options.transport.model.maxTokens ?? 8192;
  const common = {
    id: options.request.modelId,
    name: options.request.modelId,
    provider: options.request.providerKind!,
    reasoning: true,
    input: ['text', 'image'] as Array<'text' | 'image'>,
    cost: options.request.modelCost ??
      options.transport.model.cost ?? {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    contextWindow: options.transport.model.contextWindow,
    maxTokens,
  };
  return options.request.providerKind === 'anthropic'
    ? {
        ...common,
        api: 'anthropic-messages',
        baseUrl: baseUrlFor(options.transport.baseUrl, anthropicGatewayPath),
      }
    : {
        ...common,
        // Both OpenAI codecs share this base: the bundled SDK appends
        // `/chat/completions` or `/responses` to it.
        api: isOpenAiResponsesProviderKind(options.request.providerKind) ? 'openai-responses' : 'openai-completions',
        baseUrl: baseUrlFor(options.transport.baseUrl, openAiGatewayPath),
      };
};

const piContextFor = (request: ModelStreamRequest, model: PiGatewayModel): Context => {
  const identities = new MessageIdentities(() => 'transport-message');
  const messages = request.messages.flatMap((message) => {
    const hydrated = providerMessageToPi(message, model as Model<Api>, identities);
    return hydrated ? [hydrated as Context['messages'][number]] : [];
  });
  const tools: PiTool[] = request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as PiTool['parameters'],
  }));
  return { systemPrompt: request.systemPrompt, messages, tools };
};

const piApiFor = (providerKind: ModelProviderKind | undefined): ProviderStreams =>
  providerKind === 'anthropic'
    ? anthropicMessagesApi()
    : isOpenAiResponsesProviderKind(providerKind)
      ? openAIResponsesApi()
      : openAICompletionsApi();

const metadataFor = (message: AssistantMessage): JsonObject | undefined => {
  const metadata: JsonObject = {
    ...(message.responseId ? { responseId: message.responseId } : {}),
    ...(message.responseModel ? { responseModel: message.responseModel } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const signatureEvents = (message: AssistantMessage, emitted: Map<number, string>): ModelStreamEvent[] =>
  message.content.flatMap((block, index) => {
    if (block.type !== 'thinking' || !block.thinkingSignature || emitted.get(index) === block.thinkingSignature) {
      return [];
    }
    emitted.set(index, block.thinkingSignature);
    return [{ type: 'thinking-delta', text: '', signature: block.thinkingSignature }];
  });

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');

const piStreamError = (message: string): GatewayModelTransportError => {
  const malformed = /(?:parse|malformed|SSE|stream ended|finish_reason|message_stop|content block)/iu.test(message);
  return new GatewayModelTransportError({
    code: malformed ? 'MALFORMED_RESPONSE' : 'PROVIDER_UNAVAILABLE',
    message,
  });
};

const streamPiEvents = async function* (options: {
  readonly events: AsyncIterable<AssistantMessageEvent>;
  readonly state: GatewayFetchState;
  readonly signal: AbortSignal;
}): AsyncGenerator<ModelStreamEvent> {
  const emittedSignatures = new Map<number, string>();
  let terminal = false;
  for await (const event of options.events) {
    if (event.type === 'text_delta') {
      yield { type: 'text-delta', text: event.delta };
      continue;
    }
    if (event.type === 'thinking_delta') {
      yield { type: 'thinking-delta', text: event.delta };
      continue;
    }
    if (event.type === 'thinking_end') {
      yield* signatureEvents(event.partial, emittedSignatures);
      continue;
    }
    if (event.type === 'toolcall_end') {
      yield {
        type: 'tool-input',
        toolCallId: event.toolCall.id,
        toolName: event.toolCall.name,
        input: event.toolCall.arguments,
      };
      continue;
    }
    if (event.type === 'done') {
      terminal = true;
      yield* signatureEvents(event.message, emittedSignatures);
      const metadata = metadataFor(event.message);
      if (metadata) {
        yield { type: 'message-metadata', metadata };
      }
      yield { type: 'usage', usage: event.message.usage };
      yield { type: 'completed', stopReason: event.reason };
      continue;
    }
    if (event.type === 'error') {
      terminal = true;
      yield* signatureEvents(event.error, emittedSignatures);
      const metadata = metadataFor(event.error);
      if (metadata) {
        yield { type: 'message-metadata', metadata };
      }
      yield { type: 'usage', usage: event.error.usage };
      if (options.signal.aborted || event.reason === 'aborted') {
        throw abortError(options.signal);
      }
      throw options.state.failure ?? piStreamError(event.error.errorMessage ?? 'Tau model gateway stream failed.');
    }
  }
  if (!terminal) {
    throw new GatewayModelTransportError({
      code: 'MALFORMED_RESPONSE',
      message: 'Tau model gateway stream ended without a terminal pi-ai event.',
    });
  }
};

/**
 * Create the browser-safe Tau gateway transport — cookie-authenticated by
 * default, bearer-authenticated when `auth` is supplied.
 *
 * @param options - Gateway base URL, catalog model limits, optional bearer provider, and optional fetch seam.
 * @returns A W3 model transport delegated to pi-ai provider implementations.
 * @public
 */
export const createGatewayModelTransport = (options: GatewayModelTransportOptions): ModelTransport => ({
  async *stream(request) {
    if (!isGatewayProviderKind(request.providerKind)) {
      throw new GatewayModelTransportError({
        code: 'MODEL_PROVIDER_UNSUPPORTED',
        message: `The browser gateway transport does not speak the ${request.providerKind ?? 'unknown'} provider wire.`,
      });
    }
    const model = piModelFor({ request, transport: options });
    const state: GatewayFetchState = {};
    const events = piApiFor(request.providerKind).stream(model as Model<Api>, piContextFor(request, model), {
      headers: piCookieAuthValidationHeaders,
      cacheRetention: 'short',
      fetch: authenticatedFetch({
        ...(options.auth === undefined ? {} : { auth: options.auth }),
        // Bound: a bare globalThis.fetch reference invoked as options.fetch(...)
        // carries the wrong `this` and throws Illegal invocation in a WorkerGlobalScope.
        fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
        signal: request.signal,
        state,
        providerKind: request.providerKind!,
        systemPromptBlocks: request.systemPromptBlocks,
      }),
      maxRetries: 0,
      ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
      signal: request.signal,
    });
    yield* streamPiEvents({ events, state, signal: request.signal });
  },
});
