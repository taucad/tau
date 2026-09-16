import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import type {
  Api,
  AnthropicOptions,
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Model,
  ModelCostRates,
  OpenAICompletionsOptions,
  OpenAIResponsesOptions,
} from '@earendil-works/pi-ai';
import { util as zodUtility } from 'zod';
import { MessageIdentities, providerMessageToPi } from '#harness/session-record.js';
import { createVertexResponseShim, echoThoughtSignatures } from '#transport/vertex-completions-shim.js';
import type { JsonObject, ModelProviderKind, ModelSystemPromptBlock } from '#log/event-types.js';
import type { ModelInvocationBinding, ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';

const openAiGatewayPath = 'v1/llm/openai/v1';
const anthropicGatewayPath = 'v1/llm/anthropic';
// Pi validates provider auth before invoking custom fetch; this sentinel is
// stripped at the wire boundary so cookie-authenticated requests emit no key header.
const piCookieAuthValidationHeaders = {
  authorization: 'cookie-authenticated',
} as const;

/** Stable gateway failures surfaced across the W3 transport boundary. @public */
export const gatewayModelErrorCodes = [
  'BILLING_RECOVERY_UNAVAILABLE',
  'FUNDED_HELPER_LIMIT',
  'FUNDED_OPERATION_LIMIT',
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
  /**
   * Structured refusal fields the gateway attached to the coded error, such as
   * an `INSUFFICIENT_CREDIT` denial's required and available credit atoms. The
   * shape belongs to the code, so it is carried opaquely to the surface that
   * renders it.
   */
  public readonly details?: Record<string, unknown> | undefined;

  public constructor(options: {
    readonly code: GatewayModelErrorCode;
    readonly message: string;
    readonly status?: number | undefined;
    readonly rawType?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    readonly cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'GatewayModelTransportError';
    this.code = options.code;
    this.status = options.status;
    this.rawType = options.rawType;
    this.details = options.details;
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
  providerKind === 'openai' || providerKind === 'xai';

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
  /**
   * Catalog limits for a host that configures one default model. Optional: a
   * host that has none — every turn names its own row — supplies these through
   * {@link ModelStreamRequest} instead, which is what the harness always does.
   */
  readonly model?:
    | {
        readonly contextWindow: number;
        readonly maxTokens?: number | undefined;
        readonly cost?: ModelCostRates | undefined;
      }
    | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  /** Optional funded-operation protocol supplied only by a managed Cloud composition. */
  readonly fundedOperations?: GatewayFundedOperationProtocol | undefined;
};

/** Managed Cloud operation binding kept outside the provider transport's self-host graph. @public */
export type GatewayFundedOperationProtocol = {
  /** Whether the selected provider uses Tau-funded operation accounting. */
  usesBillingAttempt(providerKind: ModelProviderKind | undefined): boolean;
  /** Recover an ambiguous attempt without dispatching it again. */
  lookupAttempt(attemptId: string, signal: AbortSignal): Promise<ModelInvocationBinding | undefined>;
  /** Require and validate the operation identity on an accepted gateway response. */
  bindResponse(response: Response): ModelInvocationBinding;
};

type WireRecord = Record<string, unknown>;
type GatewayFetchState = {
  failure?: GatewayModelTransportError | undefined;
  binding?: ModelInvocationBinding | undefined;
};
type PiGatewayModel = Model<'anthropic-messages'> | Model<'openai-completions'> | Model<'openai-responses'>;
type PiTool = NonNullable<Context['tools']>[number];

const readString = (value: WireRecord, key: string): string | undefined =>
  typeof value[key] === 'string' ? value[key] : undefined;

const readDetails = (value: WireRecord): Record<string, unknown> | undefined =>
  zodUtility.isObject(value['details']) ? value['details'] : undefined;

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
  const details = readDetails(envelope);
  return new GatewayModelTransportError({
    code,
    message: readString(envelope, 'message') ?? fallback,
    status,
    ...(rawType && code === 'UNKNOWN_GATEWAY_ERROR' ? { rawType } : {}),
    ...(details === undefined ? {} : { details }),
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
  const details = readDetails(payload);
  return new GatewayModelTransportError({
    code: code as GatewayModelErrorCode,
    message: readString(payload, 'message') ?? readString(payload, 'error') ?? code,
    status,
    ...(details === undefined ? {} : { details }),
  });
};

export const gatewayResponseError = async (response: Response): Promise<GatewayModelTransportError> => {
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
    readonly attemptId: string;
    readonly fundedOperations?: GatewayFundedOperationProtocol | undefined;
    readonly onInvocationBound?: ModelStreamRequest['onInvocationBound'];
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
      headers.set('x-tau-attempt-id', options.attemptId);
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
      const response = await options.fetch(input, {
        ...init,
        body,
        credentials: 'include',
        headers,
      });
      if (!response.ok) {
        const failure = await gatewayResponseError(response);
        options.state.failure = failure;
        throw failure;
      }
      if (options.fundedOperations) {
        options.state.binding = options.fundedOperations.bindResponse(response);
        await options.onInvocationBound?.(options.state.binding);
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
      return guardedResponse({
        response,
        state: options.state,
        signal: options.signal,
      });
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
  const maxTokens = options.request.maxTokens ?? options.transport.model?.maxTokens ?? 8192;
  const contextWindow = options.request.contextWindow ?? options.transport.model?.contextWindow;
  if (contextWindow === undefined) {
    throw new GatewayModelTransportError({
      code: 'INVALID_REQUEST',
      message: 'Tau model gateway request named no context window and this transport configures no default model.',
    });
  }
  const common = {
    id: options.request.modelId,
    name: options.request.modelId,
    provider: options.request.providerKind!,
    reasoning: true,
    input: ['text', 'image'] as Array<'text' | 'image'>,
    cost: options.request.modelCost ??
      options.transport.model?.cost ?? {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    contextWindow,
    maxTokens,
  };
  return options.request.providerKind === 'anthropic'
    ? {
        ...common,
        api: 'anthropic-messages',
        baseUrl: baseUrlFor(options.transport.baseUrl, anthropicGatewayPath),
        ...(options.request.reasoning?.budgetTokens === undefined && options.request.reasoning !== undefined
          ? { compat: { forceAdaptiveThinking: true } }
          : {}),
      }
    : {
        ...common,
        // Both OpenAI codecs share this base: the bundled SDK appends
        // `/chat/completions` or `/responses` to it.
        api: isOpenAiResponsesProviderKind(options.request.providerKind) ? 'openai-responses' : 'openai-completions',
        baseUrl: baseUrlFor(options.transport.baseUrl, openAiGatewayPath),
        ...(options.request.providerKind === 'vertexai' ? { compat: { supportsDeveloperRole: false } } : {}),
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
    return [{ type: 'thinking-signature', contentIndex: index, signature: block.thinkingSignature }];
  });

const streamedToolCall = (
  event: Extract<AssistantMessageEvent, { readonly type: 'toolcall_start' | 'toolcall_delta' }>,
) => {
  const block = event.partial.content[event.contentIndex];
  if (block?.type !== 'toolCall') {
    throw new GatewayModelTransportError({
      code: 'MALFORMED_RESPONSE',
      message: `pi-ai emitted ${event.type} without a tool call at content index ${event.contentIndex}.`,
    });
  }
  return block;
};

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
  /** Gemini thought signatures captured off the wire by the Vertex shim. */
  readonly thoughtSignatures: ReadonlyMap<string, string>;
}): AsyncGenerator<ModelStreamEvent> {
  const emittedSignatures = new Map<number, string>();
  let terminal = false;
  for await (const event of options.events) {
    if (event.type === 'text_start') {
      yield { type: 'text-start', contentIndex: event.contentIndex };
      continue;
    }
    if (event.type === 'text_delta') {
      yield { type: 'text-delta', contentIndex: event.contentIndex, text: event.delta };
      continue;
    }
    if (event.type === 'text_end') {
      yield { type: 'text-end', contentIndex: event.contentIndex, content: event.content };
      continue;
    }
    if (event.type === 'thinking_start') {
      yield { type: 'thinking-start', contentIndex: event.contentIndex };
      continue;
    }
    if (event.type === 'thinking_delta') {
      yield { type: 'thinking-delta', contentIndex: event.contentIndex, text: event.delta };
      continue;
    }
    if (event.type === 'thinking_end') {
      yield { type: 'thinking-end', contentIndex: event.contentIndex, content: event.content };
      yield* signatureEvents(event.partial, emittedSignatures);
      continue;
    }
    if (event.type === 'toolcall_start') {
      const toolCall = streamedToolCall(event);
      yield {
        type: 'tool-input-start',
        contentIndex: event.contentIndex,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      };
      continue;
    }
    if (event.type === 'toolcall_delta') {
      const toolCall = streamedToolCall(event);
      yield {
        type: 'tool-input-delta',
        contentIndex: event.contentIndex,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        delta: event.delta,
      };
      continue;
    }
    if (event.type === 'toolcall_end') {
      const thoughtSignature = options.thoughtSignatures.get(event.toolCall.id);
      yield {
        type: 'tool-input',
        contentIndex: event.contentIndex,
        toolCallId: event.toolCall.id,
        toolName: event.toolCall.name,
        input: event.toolCall.arguments,
        ...(thoughtSignature === undefined ? {} : { thoughtSignature }),
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
  ...(options.fundedOperations
    ? {
        usesBillingAttempt: options.fundedOperations.usesBillingAttempt,
        lookupAttempt: options.fundedOperations.lookupAttempt,
      }
    : {}),
  async *stream(request) {
    if (!request.attemptId || request.attemptId.length > 128 || !/^[\u0021-\u007E]+$/u.test(request.attemptId)) {
      throw new GatewayModelTransportError({
        code: 'INVALID_REQUEST',
        message: 'Invalid Tau invocation attempt identity.',
      });
    }
    if (!isGatewayProviderKind(request.providerKind)) {
      throw new GatewayModelTransportError({
        code: 'MODEL_PROVIDER_UNSUPPORTED',
        message: `The browser gateway transport does not speak the ${request.providerKind ?? 'unknown'} provider wire.`,
      });
    }
    if (
      request.providerKind === 'vertexai' &&
      request.reasoning?.effort !== undefined &&
      !['low', 'medium', 'high'].includes(request.reasoning.effort)
    ) {
      throw new GatewayModelTransportError({
        code: 'INVALID_REQUEST',
        message: `Vertex does not support ${request.reasoning.effort} reasoning effort.`,
      });
    }
    const model = piModelFor({ request, transport: options });
    const state: GatewayFetchState = {};
    const context = piContextFor(request, model);
    const thoughtSignatures = new Map<string, string>();
    const gatewayFetch = authenticatedFetch({
      ...(options.auth === undefined ? {} : { auth: options.auth }),
      // Bound: a bare globalThis.fetch reference invoked as options.fetch(...)
      // carries the wrong `this` and throws Illegal invocation in a WorkerGlobalScope.
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      signal: request.signal,
      state,
      providerKind: request.providerKind!,
      attemptId: request.attemptId,
      fundedOperations: options.fundedOperations,
      ...(options.fundedOperations && request.onInvocationBound
        ? { onInvocationBound: request.onInvocationBound }
        : {}),
      systemPromptBlocks: request.systemPromptBlocks,
    });
    const commonOptions = {
      headers: piCookieAuthValidationHeaders,
      cacheRetention: 'short',
      // Gemini's thought markers and tool-call thought signatures are rewritten
      // into the OpenAI-compatible shape before pi's codec reads a byte. Every
      // other provider keeps the gateway response untouched.
      fetch:
        request.providerKind === 'vertexai'
          ? ((async (input, init) => {
              const response = await gatewayFetch(input, init);
              // `authenticatedFetch` has already refused a body-less response.
              return new Response(response.body!.pipeThrough(createVertexResponseShim(thoughtSignatures)), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              });
            }) satisfies typeof globalThis.fetch)
          : gatewayFetch,
      maxRetries: 0,
      ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
      signal: request.signal,
    } as const;
    const { reasoning } = request;
    const events =
      request.providerKind === 'anthropic'
        ? anthropicMessagesApi().stream(model as Model<'anthropic-messages'>, context, {
            ...commonOptions,
            ...(reasoning === undefined
              ? {}
              : {
                  thinkingEnabled: true,
                  ...(reasoning.budgetTokens === undefined ? {} : { thinkingBudgetTokens: reasoning.budgetTokens }),
                  ...(reasoning.display === undefined ? {} : { thinkingDisplay: reasoning.display }),
                  ...(reasoning.effort === undefined
                    ? {}
                    : { effort: reasoning.effort === 'minimal' ? 'low' : reasoning.effort }),
                }),
          } satisfies AnthropicOptions)
        : isOpenAiResponsesProviderKind(request.providerKind)
          ? openAIResponsesApi().stream(model as Model<'openai-responses'>, context, {
              ...commonOptions,
              ...(reasoning?.effort === undefined ? {} : { reasoningEffort: reasoning.effort }),
              ...(reasoning?.summary === undefined ? {} : { reasoningSummary: reasoning.summary }),
            } satisfies OpenAIResponsesOptions)
          : openAICompletionsApi().stream(model as Model<'openai-completions'>, context, {
              ...commonOptions,
              ...(request.providerKind === 'vertexai' ? { onPayload: echoThoughtSignatures(context) } : {}),
              ...(request.providerKind === 'vertexai' && reasoning?.effort !== undefined
                ? {
                    /* eslint-disable @typescript-eslint/naming-convention -- Upstream Gemini wire keys use snake_case. */
                    samplingParams: {
                      extra_body: {
                        google: {
                          thinking_config: {
                            include_thoughts: true,
                            thinking_level: reasoning.effort.toUpperCase(),
                          },
                          thought_tag_marker: 'think',
                          stream_function_call_arguments: true,
                        },
                      },
                    },
                    /* eslint-enable @typescript-eslint/naming-convention -- End upstream Gemini payload. */
                  }
                : {}),
            } satisfies OpenAICompletionsOptions);
    yield* streamPiEvents({ events, state, signal: request.signal, thoughtSignatures });
  },
});
