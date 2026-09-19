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
import { fitAttachmentBudget, rewriteDocuments } from '#transport/document-payload.js';
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
  'PROVIDER_ACCOUNT_EXHAUSTED',
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
    const retryAfterSeconds = Number(response.headers.get('retry-after') ?? Number.NaN);
    if (parsed && Number.isInteger(retryAfterSeconds) && retryAfterSeconds >= 0) {
      // The card tells the customer when to try again instead of guessing.
      return new GatewayModelTransportError({
        code: parsed.code,
        message: parsed.message,
        status: parsed.status,
        rawType: parsed.rawType,
        details: { ...parsed.details, retryAfterSeconds },
      });
    }
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

/**
 * Tau's own in-stream failure envelope. The gateway rewrites a classified
 * provider failure — an exhausted account, a mid-stream rate limit — into a
 * single SSE `error` frame carrying this marker; relayed provider bytes escape
 * their own quotes, so nothing else on the wire can produce it.
 */
const tauGatewayFrameMarker = '"type":"tau_gateway"';
const sseEventBoundary = /\r\n\r\n|\n\n|\r\r/gu;

/**
 * Drop the relayed text pi-ai has already been handed, bounding the scan buffer.
 *
 * @param text - Relayed SSE text scanned so far.
 * @returns The text after the last complete event boundary.
 */
const sinceLastEventBoundary = (text: string): string => {
  let start = 0;
  for (const match of text.matchAll(sseEventBoundary)) {
    start = match.index + match[0].length;
  }
  return text.slice(start);
};

/**
 * Whether the frame carrying the Tau marker has been terminated by an event boundary.
 *
 * @param relayed - Relayed text since the last delivered event boundary.
 * @returns True once a boundary follows the marker-bearing frame.
 */
const markerFrameComplete = (relayed: string): boolean => {
  const frames = relayed.split(sseEventBoundary);
  const index = frames.findIndex((event) => event.includes(tauGatewayFrameMarker));
  return index !== -1 && index < frames.length - 1;
};

/**
 * Read Tau's coded failure out of relayed gateway bytes.
 *
 * Only the frame carrying the marker is decoded, and an incomplete one answers
 * undefined so the caller reads on until the event boundary or EOF completes
 * it. The frame's code is mapped exactly as an error body's is on the HTTP
 * path, so a code this build has never heard of still ends the turn — as
 * `UNKNOWN_GATEWAY_ERROR`, carrying the wire code — rather than reaching pi's
 * codec to be reported under a guessed one.
 *
 * @param relayed - Relayed SSE text since the last delivered event boundary.
 * @param status - HTTP status of the relayed gateway response.
 * @returns The coded failure, or undefined when no complete Tau frame is present.
 */
const gatewayFailureFrame = (relayed: string, status: number): GatewayModelTransportError | undefined => {
  const frame = relayed.split(sseEventBoundary).find((event) => event.includes(tauGatewayFrameMarker));
  if (frame === undefined) {
    return undefined;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      frame
        .split('\n')
        .flatMap((line) => (line.startsWith('data:') ? [line.slice('data:'.length).trim()] : []))
        .join('\n'),
    );
  } catch {
    return undefined;
  }
  const envelope = zodUtility.isObject(payload) && zodUtility.isObject(payload['error']) ? payload['error'] : undefined;
  if (envelope?.['type'] !== 'tau_gateway') {
    return undefined;
  }
  // A marker-bearing envelope carrying no code is not Tau's failure frame; it
  // stays the SDK's bytes rather than ending the turn under a status-derived guess.
  const rawCode = readString(envelope, 'code');
  if (rawCode === undefined) {
    return undefined;
  }
  const code = gatewayErrorCode(rawCode, status);
  const details = readDetails(envelope);
  return new GatewayModelTransportError({
    code,
    message: readString(envelope, 'message') ?? 'The model gateway ended this stream.',
    status,
    ...(code === 'UNKNOWN_GATEWAY_ERROR' ? { rawType: rawCode } : {}),
    ...(details === undefined ? {} : { details }),
  });
};

const guardedResponse = (options: {
  readonly response: Response;
  readonly state: GatewayFetchState;
  readonly signal: AbortSignal;
}): Response => {
  const reader = options.response.body!.getReader();
  const decoder = new TextDecoder();
  // Relayed text since the last delivered event boundary, so a failure frame
  // split across chunks is still recognised. Trimming stops once the marker
  // appears: from there the whole frame is needed to read its code.
  let relayed = '';
  let failing = false;
  // Chunks held back while a marker-bearing frame is still incomplete; they
  // are replayed in order if that frame turns out not to be a failure.
  let withheld: Array<Uint8Array<ArrayBuffer>> = [];
  /**
   * Holds one more chunk of a marker-bearing frame; releases them all once the frame proves harmless.
   *
   * @param chunk - The chunk just read, not yet delivered.
   * @param controller - The guarded stream the released chunks are delivered on.
   * @returns True once the held bytes have been delivered, false while the frame is still open.
   */
  const hold = (
    chunk: Uint8Array<ArrayBuffer>,
    controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>,
  ): boolean => {
    withheld.push(chunk);
    if (!markerFrameComplete(relayed)) {
      return false;
    }
    // A complete Tau frame carrying no failure code belongs to the SDK after all.
    failing = false;
    for (const held of withheld) {
      controller.enqueue(held);
    }
    withheld = [];
    relayed = sinceLastEventBoundary(relayed);
    return true;
  };
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      /* One pull must enqueue, close or error before it resolves: a pull that
       * only withholds bytes schedules no further pull of its own, so a
       * marker-bearing frame spanning several chunks would strand the
       * consumer's pending read. Read on until this call has delivered. */
      for (;;) {
        let next: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>;
        // Only the read is a gateway failure. Guarding this stream's own `close`
        // and `enqueue` too would record the SDK's cancel-then-close race as
        // `NETWORK_ERROR` and mask the provider's terminal frame behind it.
        try {
          // oxlint-disable-next-line no-await-in-loop -- the upstream body is read serially.
          next = await reader.read();
        } catch (error) {
          // An abort is the consumer's own: Tau's signal, the person pressing
          // Stop, or the bundled SDK leaving the stream on a terminal frame.
          if (options.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
            controller.error(error);
            return;
          }
          const failure = networkError('Tau model gateway response stream failed.', error, options.response.status);
          options.state.failure = failure;
          controller.error(failure);
          return;
        }
        if (next.done) {
          const trailing = failing ? gatewayFailureFrame(relayed, options.response.status) : undefined;
          if (trailing) {
            options.state.failure = trailing;
            controller.error(trailing);
            return;
          }
          // A marker frame the body never terminated was never a failure, so it
          // and the healthy frames that shared its chunks are the SDK's after
          // all. Closing on them instead loses the turn's terminal frame and
          // reports `Stream ended without finish_reason` in its place.
          for (const held of withheld) {
            controller.enqueue(held);
          }
          withheld = [];
          controller.close();
          return;
        }
        relayed += decoder.decode(next.value, { stream: true });
        failing ||= relayed.includes(tauGatewayFrameMarker);
        if (failing) {
          // The failure frame never reaches pi-ai's codec: Tau raises the coded
          // failure itself rather than letting the SDK report an opaque stream
          // error. An incomplete frame just withholds its bytes and reads on.
          // ponytail: bytes sharing the failure frame's chunk are dropped with it
          // rather than re-encoded; the turn is terminal either way.
          const failure = gatewayFailureFrame(relayed, options.response.status);
          if (failure) {
            options.state.failure = failure;
            controller.error(failure);
            // oxlint-disable-next-line no-await-in-loop -- the cancel ends this read loop.
            await reader.cancel(failure);
            return;
          }
          if (hold(next.value, controller)) {
            return;
          }
          continue;
        }
        relayed = sinceLastEventBoundary(relayed);
        controller.enqueue(next.value);
        return;
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

/**
 * The request's pi context, holding no more attachment bytes than one request may carry (R1).
 *
 * @param request - The model stream request.
 * @param model - The pi model the context is built for.
 * @returns The fitted context.
 */
const budgetedContextFor = (request: ModelStreamRequest, model: PiGatewayModel): Context => {
  const fitted = fitAttachmentBudget(piContextFor(request, model), request.documents);
  if (fitted.omitted > 0) {
    // Ponytail: warned per request, since the transport keeps no session state.
    console.warn(
      `Tau model gateway: ${fitted.omitted} older attachment(s) exceed this request's budget and were omitted.`,
    );
  }
  return fitted.context;
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

/**
 * A provider refusal naming the context window is the request's own fault: it
 * will be refused identically until the request changes, so it must not read as
 * a transient outage the person is invited to resume into (R6).
 */
const contextWindowRefusal = /context_length_exceeded|exceeds? the context|maximum context length/iu;

const piStreamError = (message: string): GatewayModelTransportError => {
  if (contextWindowRefusal.test(message)) {
    return new GatewayModelTransportError({ code: 'INVALID_REQUEST', message });
  }
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
    const context = budgetedContextFor(request, model);
    const thoughtSignatures = new Map<string, string>();
    const rewrite = rewriteDocuments(request.documents, model.api);
    const echo = request.providerKind === 'vertexai' ? echoThoughtSignatures(context) : undefined;
    // Every adapter shares one request-construction step: Vertex signature echo,
    // then the document rewrite (D21, D25). A refusal here is the caller's
    // request, so it surfaces as INVALID_REQUEST and nothing is fetched.
    const onPayload = (payload: unknown): unknown => {
      try {
        const echoed = echo?.(payload);
        return rewrite(echoed ?? payload) ?? echoed;
      } catch (error) {
        state.failure = new GatewayModelTransportError({
          code: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : 'Tau could not build the model request.',
          cause: error,
        });
        throw state.failure;
      }
    };
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
      onPayload,
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
                  ...(reasoning.effort === undefined ? {} : { effort: reasoning.effort }),
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
              ...(request.providerKind === 'vertexai'
                ? {
                    /* eslint-disable @typescript-eslint/naming-convention -- Upstream Gemini wire keys use snake_case. */
                    samplingParams: {
                      extra_body: {
                        google: {
                          /* Four argument deltas per tool call instead of one, so
                           * the tool card fills as Gemini writes it. Round one
                           * pulled this flag after 14/14 function calls answered
                           * 499 CANCELLED; the powered A/B then measured 0/240
                           * on Tau's real 35 kB body, 120 of them flag-on, and
                           * found every one of those 499s inside one 13-minute
                           * window of shared-quota pressure. The flag is not
                           * refused, it is shed: it buys a longer-lived server
                           * shape that a stressed pool cancels first. A 499 never
                           * reaches this transport as itself — the relay maps it
                           * to 503 — so the gateway re-dispatches that request
                           * once without the flag (blueprint Finding 1, ruling
                           * Q1; L1 follow-up). */
                          stream_function_call_arguments: true,
                          ...(reasoning?.effort === undefined
                            ? {}
                            : {
                                thinking_config: {
                                  include_thoughts: true,
                                  thinking_level: reasoning.effort.toUpperCase(),
                                },
                                thought_tag_marker: 'think',
                              }),
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
