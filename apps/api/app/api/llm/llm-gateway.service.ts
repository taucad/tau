import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { FastifyReply } from 'fastify';
import { sign } from 'node:crypto';
import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { isRecord } from '@taucad/utils/schema';
import type { Environment } from '#config/environment.config.js';
import type { Model } from '#api/models/model.schema.js';
import { isModelListEntryEnabled, modelList, modelListEntryToModel } from '#api/models/model.constants.js';
import type { ProviderId } from '#api/providers/provider.schema.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { ReserveResult } from '#api/billing/credit-ledger.service.js';
import {
  computeUserChargedCostMicro,
  estimateInputComponentMicro,
  estimateWorstCaseCostMicro,
} from '#api/billing/credit-estimator.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { validateAnthropicHeaders } from '#api/llm/llm-gateway.headers.js';
import { LlmGatewayLimiter } from '#api/llm/llm-gateway-limiter.service.js';
import { llmGatewayOptionsKey } from '#api/llm/llm-gateway.options.js';
import type { LlmGatewayOptions } from '#api/llm/llm-gateway.options.js';
import { consumeSseBody, GatewayAbortScope, GatewayDownstreamLifecycle } from '#api/llm/llm-gateway.stream.js';
import type { SseEvent } from '#api/llm/llm-gateway.stream.js';

export { consumeSseBody } from '#api/llm/llm-gateway.stream.js';
export type { SseEvent } from '#api/llm/llm-gateway.stream.js';

type JsonRecord = Record<string, unknown>;
/**
 * `openai-responses` is OpenAI's own Responses API, not a second provider:
 * `gpt-5.6-luna` answers HTTP 400 to any `/v1/chat/completions` request
 * carrying function tools, and the browser host always sends tools. Only
 * direct-OpenAI catalog rows speak it; every OpenAI-compatible provider stays
 * on `openai`.
 */
type ProviderWire = 'anthropic' | 'openai' | 'openai-responses';
type OutputTokenField = 'max_completion_tokens' | 'max_output_tokens' | 'max_tokens';
type BudgetTools = NonNullable<Parameters<TokenBudgetService['evaluateModelRequest']>[0]['request']['tools']>;
type DirectOpenAiProviderId = Exclude<ProviderId, 'anthropic' | 'ollama' | 'vertexai'>;
type ProviderApiKey =
  | 'CEREBRAS_API_KEY'
  | 'MOONSHOT_API_KEY'
  | 'MORPH_API_KEY'
  | 'OPENAI_API_KEY'
  | 'TOGETHER_API_KEY'
  | 'XAI_API_KEY';

export type LlmGatewayRelayInput = {
  readonly provider: ProviderWire;
  readonly body: unknown;
  readonly principalId: string;
  readonly reply: FastifyReply;
  readonly anthropicVersion?: string;
  readonly anthropicBeta?: string;
};

type ValidatedRequest = {
  readonly model: Model;
  readonly body: JsonRecord;
  readonly requestedOutputTokens?: number;
  readonly outputTokenField: OutputTokenField;
};

type CanonicalUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
};

type PreparedRequest = ValidatedRequest & {
  readonly body: JsonRecord;
  readonly estimatedInputTokens: number;
  readonly worstCaseMicro: bigint;
  readonly inputFloorMicro: bigint;
};

type UpstreamRequest = {
  readonly url: string;
  readonly headers: Record<string, string>;
};

type VertexAccessToken = {
  readonly value: string;
  readonly expiresAt: number;
};

const enabledCatalogEntries = Object.values(modelList).flatMap((models) =>
  Object.values(models).filter((model) => isModelListEntryEnabled(model)),
);

const directOpenAiProviders = {
  openai: { key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/chat/completions' },
  together: { key: 'TOGETHER_API_KEY', url: 'https://api.together.ai/v1/chat/completions' },
  morph: { key: 'MORPH_API_KEY', url: 'https://api.morphllm.com/v1/chat/completions' },
  xai: { key: 'XAI_API_KEY', url: 'https://api.x.ai/v1/chat/completions' },
  moonshot: { key: 'MOONSHOT_API_KEY', url: 'https://api.moonshot.ai/v1/chat/completions' },
  cerebras: { key: 'CEREBRAS_API_KEY', url: 'https://api.cerebras.ai/v1/chat/completions' },
} as const satisfies Record<DirectOpenAiProviderId, { readonly key: ProviderApiKey; readonly url: string }>;

const openAiResponsesUrl = 'https://api.openai.com/v1/responses';

/** Whether the route's wire is the one this catalog row's provider speaks. */
const matchesGatewayWire = (provider: ProviderWire, providerId: ProviderId): boolean => {
  if (provider === 'anthropic') return providerId === 'anthropic';
  // Only OpenAI's own rows speak Responses; the compatible providers expose
  // /chat/completions and nothing else.
  if (provider === 'openai-responses') return providerId === 'openai';
  return providerId === 'vertexai' || isDirectOpenAiProvider(providerId);
};

const isDirectOpenAiProvider = (providerId: ProviderId): providerId is DirectOpenAiProviderId =>
  Object.hasOwn(directOpenAiProviders, providerId);

const gatewayRoutableProviders = new Set<ProviderId>([
  'anthropic',
  'vertexai',
  ...(Object.keys(directOpenAiProviders) as DirectOpenAiProviderId[]),
]);
const unroutableEnabledCatalogEntries = enabledCatalogEntries.filter(
  (entry) => !gatewayRoutableProviders.has(entry.provider.id),
);
if (unroutableEnabledCatalogEntries.length > 0) {
  throw new Error(
    `Enabled model catalog rows are not gateway-routable: ${unroutableEnabledCatalogEntries
      .map((entry) => `${entry.id} (${entry.provider.id})`)
      .join(', ')}`,
  );
}

const googleTokenUrl = 'https://oauth2.googleapis.com/token';
const googleCloudScope = 'https://www.googleapis.com/auth/cloud-platform';

const base64UrlJson = (value: JsonRecord): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const preGenerationRejectionStatuses = new Set([400, 401, 403, 404, 413, 422]);
const settlementTimedOut = new Error('Gateway settlement deadline elapsed');
const settlementAttempts = 2;
const usageHeaderNames = [
  'x-tau-usage-input-tokens',
  'x-tau-usage-output-tokens',
  'x-tau-usage-cache-read-tokens',
  'x-tau-usage-cache-write-tokens',
  'x-tau-usage-microdollars',
] as const;

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;

const nonnegativeInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

const messageContent = (message: unknown): BaseMessage['content'] => {
  if (!isRecord(message)) return JSON.stringify(message) ?? '';
  const content = message['content'];
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    // The provider wires use the same JSON content-block envelope that BaseMessage accepts.
    return content as BaseMessage['content'];
  }
  return content === undefined || content === null ? '' : JSON.stringify(content);
};

const budgetMessages = (message: unknown): HumanMessage[] => {
  const messages = [new HumanMessage({ content: messageContent(message) })];
  if (!isRecord(message)) return messages;
  const metadata = Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'content' && key !== 'role'));
  if (Object.keys(metadata).length > 0) messages.push(new HumanMessage(JSON.stringify(metadata)));
  return messages;
};

const budgetTools = (provider: ProviderWire, tools: unknown): BudgetTools | undefined => {
  if (!Array.isArray(tools)) return undefined;
  const normalized = tools.map((tool) => {
    if (!isRecord(tool)) return tool;
    if (provider === 'anthropic') {
      return { name: tool['name'], description: tool['description'], inputSchema: tool['input_schema'] };
    }
    // Chat Completions nests the declaration under `function`; the Responses
    // wire is flat. Both carry the schema as `parameters`.
    const fn = isRecord(tool['function']) ? tool['function'] : tool;
    return { name: fn['name'], description: fn['description'], schema: fn['parameters'] };
  });
  // The real evaluator accepts provider-neutral client tool records; the gateway normalizes both wire shapes above.
  return normalized as BudgetTools;
};

const catalogOutputCap = (model: Model): number => {
  const configuration = model.configuration as JsonRecord;
  return Math.min(
    ...[
      model.details.maxTokens,
      model.configuration.maxTokens,
      model.configuration.maxOutputTokens,
      positiveInteger(configuration['max_tokens']),
    ].filter((value): value is number => value !== undefined && value > 0),
  );
};

const waitForDrainOrClose = async (response: ServerResponse, signal: AbortSignal): Promise<void> => {
  if (response.destroyed || response.writableEnded || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      response.removeListener('drain', done);
      response.removeListener('close', done);
      signal.removeEventListener('abort', done);
      resolve();
    };
    response.once('drain', done);
    response.once('close', done);
    signal.addEventListener('abort', done, { once: true });
    if (response.destroyed || response.writableEnded || signal.aborted) done();
  });
};

const waitForSettlement = async <T>(promise: Promise<T>, deadline: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            reject(settlementTimedOut);
          },
          Math.max(deadline - Date.now(), 0),
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/** Read the Responses wire's terminal `response.usage` block. */
const responsesUsage = (data: JsonRecord): CanonicalUsage | undefined => {
  const raw = isRecord(data['response']) ? data['response']['usage'] : undefined;
  if (!isRecord(raw)) return undefined;
  const inputTokens = nonnegativeInteger(raw['input_tokens']);
  const outputTokens = nonnegativeInteger(raw['output_tokens']);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  const details = isRecord(raw['input_tokens_details']) ? raw['input_tokens_details'] : {};
  // OpenAI counts cached and cache-write tokens inside input_tokens.
  const cacheReadTokens = Math.min(nonnegativeInteger(details['cached_tokens']) ?? 0, inputTokens);
  const cacheWriteTokens = Math.min(
    nonnegativeInteger(details['cache_write_tokens']) ?? 0,
    inputTokens - cacheReadTokens,
  );
  return {
    inputTokens: inputTokens - cacheReadTokens - cacheWriteTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
};

const createUsageAccumulator = (provider: ProviderWire) => {
  let usage: CanonicalUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let hasUsage = false;
  let terminal = false;
  const mergeAnthropic = (raw: JsonRecord): void => {
    const inputTokens = nonnegativeInteger(raw['input_tokens']);
    const outputTokens = nonnegativeInteger(raw['output_tokens']);
    const cacheReadTokens = nonnegativeInteger(raw['cache_read_input_tokens']);
    const cacheWriteTokens = nonnegativeInteger(raw['cache_creation_input_tokens']);
    hasUsage ||= [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens].some((value) => value !== undefined);
    usage = {
      inputTokens: Math.max(usage.inputTokens, inputTokens ?? 0),
      outputTokens: Math.max(usage.outputTokens, outputTokens ?? 0),
      cacheReadTokens: Math.max(usage.cacheReadTokens, cacheReadTokens ?? 0),
      cacheWriteTokens: Math.max(usage.cacheWriteTokens, cacheWriteTokens ?? 0),
    };
  };
  return {
    observe(event: SseEvent): void {
      if (!isRecord(event.data)) return;
      const eventName = event.event ?? (typeof event.data['type'] === 'string' ? event.data['type'] : undefined);
      if (provider === 'anthropic') {
        if (isRecord(event.data['usage'])) mergeAnthropic(event.data['usage']);
        if (isRecord(event.data['message']) && isRecord(event.data['message']['usage'])) {
          mergeAnthropic(event.data['message']['usage']);
        }
        terminal ||= eventName === 'message_stop';
        return;
      }
      if (provider === 'openai-responses') {
        // The Responses wire reports usage once, on its terminal frame.
        // `response.incomplete` is the ordinary max_output_tokens truncation and
        // is just as billable as `response.completed`.
        if (eventName !== 'response.completed' && eventName !== 'response.incomplete') return;
        const terminalUsage = responsesUsage(event.data);
        if (terminalUsage === undefined) return;
        usage = terminalUsage;
        hasUsage = true;
        terminal = true;
        return;
      }
      if (!isRecord(event.data['usage'])) return;
      const raw = event.data['usage'];
      const promptTokens = nonnegativeInteger(raw['prompt_tokens']);
      const outputTokens = nonnegativeInteger(raw['completion_tokens']);
      const cachedTokens = isRecord(raw['prompt_tokens_details'])
        ? nonnegativeInteger(raw['prompt_tokens_details']['cached_tokens'])
        : undefined;
      if (promptTokens === undefined || outputTokens === undefined) return;
      const cacheReadTokens = Math.min(cachedTokens ?? 0, promptTokens);
      usage = {
        inputTokens: promptTokens - cacheReadTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens: 0,
      };
      hasUsage = true;
      terminal = true;
    },
    result(): CanonicalUsage | undefined {
      return terminal && hasUsage ? usage : undefined;
    },
  };
};

@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private vertexAccessToken: VertexAccessToken | undefined;

  public constructor(
    @Inject(CreditLedgerService) private readonly ledger: CreditLedgerService,
    @Inject(TokenBudgetService) private readonly budgets: TokenBudgetService,
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(LlmGatewayLimiter) private readonly limiter: LlmGatewayLimiter,
    @Inject(llmGatewayOptionsKey) private readonly options: LlmGatewayOptions,
  ) {}

  public async relay(input: LlmGatewayRelayInput): Promise<void> {
    const scope = new GatewayAbortScope(this.options.upstreamIdleTimeoutMs, this.options.postAbortSettlementTimeoutMs);
    let providerStarted = false;
    const downstream = new GatewayDownstreamLifecycle(input.reply.raw, () => {
      if (providerStarted) scope.startPostAbortDrain();
      else scope.cancel(new Error('Gateway client closed before provider start'));
    });
    let admission: Awaited<ReturnType<LlmGatewayLimiter['acquire']>> | undefined;
    try {
      // Both OpenAI wires hit the same upstream account, so they share one
      // provider concurrency bucket.
      admission = await this.limiter.acquire(
        input.principalId,
        input.provider === 'anthropic' ? 'anthropic' : 'openai',
      );
      if (downstream.isTerminated()) return;
      if (input.provider === 'anthropic') {
        validateAnthropicHeaders({
          ...(input.anthropicVersion === undefined ? {} : { version: input.anthropicVersion }),
          ...(input.anthropicBeta === undefined ? {} : { beta: input.anthropicBeta }),
        });
      }
      const validated = this.validateRequest(input.provider, input.body);
      const prepared = this.prepareRequest(input.provider, validated);
      const reservation = await this.reserve(input.principalId, prepared);
      if (!reservation.ok) {
        throw new LlmGatewayError(
          HttpStatus.PAYMENT_REQUIRED,
          'INSUFFICIENT_CREDIT',
          'Insufficient Tau credit for this model request.',
        );
      }
      await this.relayReserved({
        input,
        prepared,
        reservation,
        scope,
        downstream,
        onProviderStart: () => {
          providerStarted = true;
        },
      });
    } finally {
      scope.complete();
      downstream.dispose();
      await admission?.release();
    }
  }

  private validateRequest(provider: ProviderWire, body: unknown): ValidatedRequest {
    if (!isRecord(body) || typeof body['model'] !== 'string') {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'A string model id is required.');
    }
    const responses = provider === 'openai-responses';
    const entry = enabledCatalogEntries.find((model) => model.id === body['model']);
    const matchesWire =
      entry !== undefined &&
      gatewayRoutableProviders.has(entry.provider.id) &&
      matchesGatewayWire(provider, entry.provider.id);
    if (!matchesWire) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'MODEL_NOT_IN_CATALOG', 'The selected model is not available.');
    }
    const conversationField = responses ? 'input' : 'messages';
    if (!Array.isArray(body[conversationField])) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', `${conversationField} must be an array.`);
    }
    if (body['stream'] !== true) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'stream must be true.');
    }
    if (provider === 'openai' && body['stream_options'] !== undefined && !isRecord(body['stream_options'])) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'stream_options must be an object.');
    }
    const hasLegacyCap = body['max_tokens'] !== undefined;
    const hasCompletionCap = body['max_completion_tokens'] !== undefined;
    if (provider === 'openai' && hasLegacyCap && hasCompletionCap) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Specify only one output-token limit.');
    }
    const suppliedOutputTokens = responses
      ? body['max_output_tokens']
      : hasLegacyCap
        ? body['max_tokens']
        : body['max_completion_tokens'];
    const requestedOutputTokens = positiveInteger(suppliedOutputTokens);
    if ((provider === 'anthropic' || suppliedOutputTokens !== undefined) && requestedOutputTokens === undefined) {
      throw new LlmGatewayError(
        HttpStatus.BAD_REQUEST,
        'INVALID_REQUEST',
        'The output-token limit must be a positive integer.',
      );
    }
    // Direct OpenAI models always take max_completion_tokens: GPT-5.x answers 400
    // for the legacy cap, which the gateway would otherwise sanitize into an
    // unactionable failure for a client that only sent the older field name.
    const outputTokenField: OutputTokenField = responses
      ? 'max_output_tokens'
      : provider === 'anthropic' || entry.provider.id !== 'openai'
        ? 'max_tokens'
        : 'max_completion_tokens';
    const normalizedBody: JsonRecord = {
      ...body,
      model: entry.provider.id === 'vertexai' ? `google/${entry.model}` : entry.model,
    };
    delete normalizedBody['max_tokens'];
    delete normalizedBody['max_completion_tokens'];
    delete normalizedBody['max_output_tokens'];
    if (requestedOutputTokens !== undefined) normalizedBody[outputTokenField] = requestedOutputTokens;
    return {
      model: modelListEntryToModel(entry),
      body: normalizedBody,
      ...(requestedOutputTokens === undefined ? {} : { requestedOutputTokens }),
      outputTokenField,
    };
  }

  private prepareRequest(provider: ProviderWire, request: ValidatedRequest): PreparedRequest {
    const responses = provider === 'openai-responses';
    // The Responses wire renames both budget inputs: `system` -> `instructions`
    // (pi also inlines the prompt as a leading developer item) and `messages` ->
    // `input`.
    const system = responses ? request.body['instructions'] : request.body['system'];
    const modelMessages = (request.body[responses ? 'input' : 'messages'] as unknown[]).flatMap(budgetMessages);
    if (request.body['response_format'] !== undefined) {
      modelMessages.push(new HumanMessage(JSON.stringify({ ['response_format']: request.body['response_format'] })));
    }
    const tools = budgetTools(provider, request.body['tools']);
    const decision = this.budgets.evaluateModelRequest({
      modelId: request.model.id,
      providerId: request.model.provider.id,
      contextWindow: request.model.details.contextWindow,
      maxOutputTokens: request.requestedOutputTokens ?? catalogOutputCap(request.model),
      request: {
        messages: modelMessages,
        systemMessage: new SystemMessage(
          system === undefined ? '' : typeof system === 'string' ? system : JSON.stringify(system),
        ),
        tools: tools ?? [],
      },
    });
    const remainingContext = Math.max(request.model.details.contextWindow - decision.estimatedInputTokens, 0);
    const boundedOutputTokens = Math.min(
      request.requestedOutputTokens ?? catalogOutputCap(request.model),
      catalogOutputCap(request.model),
      remainingContext,
    );
    if (boundedOutputTokens <= 0) {
      throw new LlmGatewayError(
        HttpStatus.BAD_REQUEST,
        'INVALID_REQUEST',
        'The request exceeds the model context window.',
      );
    }
    const pricedModel: Model = {
      ...request.model,
      details: { ...request.model.details, maxTokens: boundedOutputTokens },
    };
    const markupFraction = this.config.get('TAU_CREDIT_MARKUP_FRACTION', { infer: true });
    const body: JsonRecord = { ...request.body, [request.outputTokenField]: boundedOutputTokens };
    if (provider === 'openai') {
      body['stream_options'] = {
        ...(isRecord(request.body['stream_options']) ? request.body['stream_options'] : {}),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI wire field.
        include_usage: true,
      };
    }
    return {
      ...request,
      body,
      estimatedInputTokens: decision.estimatedInputTokens,
      worstCaseMicro: estimateWorstCaseCostMicro({
        model: pricedModel,
        inputTokenEstimate: decision.estimatedInputTokens,
        markupFraction,
      }),
      inputFloorMicro: estimateInputComponentMicro({
        model: pricedModel,
        inputTokenEstimate: decision.estimatedInputTokens,
        markupFraction,
      }),
    };
  }

  private async reserve(principalId: string, request: PreparedRequest): Promise<ReserveResult> {
    try {
      return await this.ledger.reserve({
        userId: principalId,
        amountMicro: request.worstCaseMicro,
        inputFloorMicro: request.inputFloorMicro,
        turnId: generatePrefixedId(idPrefix.turn),
        modelId: request.model.id,
        category: 'llm',
      });
    } catch (error) {
      this.logger.error(`Gateway credit reservation failed: ${String(error)}`);
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'The model gateway is unavailable.',
      );
    }
  }

  private async relayReserved(context: {
    readonly input: LlmGatewayRelayInput;
    readonly prepared: PreparedRequest;
    readonly reservation: Extract<ReserveResult, { ok: true }>;
    readonly scope: GatewayAbortScope;
    readonly downstream: GatewayDownstreamLifecycle;
    readonly onProviderStart: () => void;
  }): Promise<void> {
    const { input, prepared, reservation, scope, downstream } = context;
    let providerStarted = false;
    let hijacked = false;
    let settlementInFlight: Promise<unknown> | undefined;
    let recoveryTransition: Promise<void> | undefined;
    let durablySettled = false;
    let recoveryHandedOff = false;

    const observeRecoveryTransition = async <T>(label: string, pending: Promise<T>): Promise<void> => {
      try {
        await pending;
        durablySettled = true;
      } catch (error) {
        this.logger.error(
          `Gateway credit ${label} failed after recovery handoff for ${reservation.reservationId}: ${String(error)}`,
        );
      }
    };
    const handToRecovery = <T>(label: string, pending?: Promise<T>): undefined => {
      recoveryHandedOff = true;
      this.logger.error(
        `Gateway credit ${label} was not durably acknowledged for ${reservation.reservationId}; leaving it for reservation recovery.`,
      );
      if (pending !== undefined) {
        recoveryTransition = observeRecoveryTransition(label, pending);
      }
      return undefined;
    };
    const settle = async <T>(label: string, transition: () => Promise<T>): Promise<T | undefined> => {
      if (durablySettled || recoveryHandedOff || recoveryTransition !== undefined) return undefined;
      if (settlementInFlight !== undefined) return (await settlementInFlight) as T | undefined;
      const run = async (): Promise<T | undefined> => {
        const deadline = scope.settlementDeadline();
        for (let attempt = 1; attempt <= settlementAttempts; attempt += 1) {
          if (Date.now() >= deadline) {
            let pending: Promise<T>;
            try {
              pending = transition();
            } catch (error) {
              this.logger.error(
                `Gateway credit ${label} failed at recovery handoff for ${reservation.reservationId}: ${String(error)}`,
              );
              return handToRecovery(label);
            }
            return handToRecovery(label, pending);
          }
          try {
            const outcome = await waitForSettlement(transition(), deadline);
            durablySettled = true;
            return outcome;
          } catch (error) {
            if (error === settlementTimedOut) return handToRecovery(label);
            this.logger.error(
              `Gateway credit ${label} attempt ${String(attempt)} failed for ${reservation.reservationId}: ${String(error)}`,
            );
          }
        }
        return handToRecovery(label);
      };
      const running = run();
      settlementInFlight = running;
      try {
        return await running;
      } finally {
        if (settlementInFlight === running) settlementInFlight = undefined;
      }
    };
    const commit = (actualMicro: bigint, note: string) =>
      settle('commit', () =>
        this.ledger.commit({
          reservationId: reservation.reservationId,
          userId: input.principalId,
          actualMicro,
          modelId: prepared.model.id,
          category: 'llm',
          note,
        }),
      );
    const release = () =>
      settle('release', () =>
        this.ledger.release({
          reservationId: reservation.reservationId,
          userId: input.principalId,
          reason: 'provider-rejected',
        }),
      );
    const commitUsage = async (usage: CanonicalUsage) => {
      this.budgets.recordObservedUsage({
        modelId: prepared.model.id,
        providerId: prepared.model.provider.id,
        actualInputTokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
        estimatedInputTokens: prepared.estimatedInputTokens,
      });
      const actualMicro = computeUserChargedCostMicro({
        model: prepared.model,
        usage: { ...usage, reasoningTokens: 0 },
        markupFraction: this.config.get('TAU_CREDIT_MARKUP_FRACTION', { infer: true }),
      });
      return { actualMicro, outcome: await commit(actualMicro, 'gateway-terminal-usage') };
    };

    try {
      if (downstream.isTerminated() || scope.controller.signal.aborted) {
        await release();
        return;
      }
      scope.touch();
      const target = await this.upstreamRequest(input, prepared.model, scope.controller.signal);
      scope.touch();
      if (downstream.isTerminated() || scope.controller.signal.aborted) {
        await release();
        return;
      }
      providerStarted = true;
      context.onProviderStart();
      let upstream: Response;
      try {
        upstream = await fetch(target.url, {
          method: 'POST',
          headers: target.headers,
          body: JSON.stringify(prepared.body),
          signal: scope.controller.signal,
        });
      } catch {
        throw new LlmGatewayError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'PROVIDER_UNAVAILABLE',
          'The model provider is unavailable.',
        );
      }
      scope.touch();
      if (!upstream.ok) {
        await upstream.body?.cancel().catch(() => undefined);
        scope.finishUpstream();
        if (preGenerationRejectionStatuses.has(upstream.status)) await release();
        else await commit(prepared.inputFloorMicro, 'gateway-provider-rejection-floor');
        throw this.sanitizedUpstreamError(upstream.status);
      }
      if (upstream.body === null) {
        scope.finishUpstream();
        await commit(prepared.inputFloorMicro, 'gateway-provider-error-floor');
        throw new LlmGatewayError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'PROVIDER_UNAVAILABLE',
          'The model provider is unavailable.',
        );
      }

      const usage = createUsageAccumulator(input.provider);
      const replyHeaders: OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(input.reply.getHeaders())) {
        if (value !== undefined) replyHeaders[name] = value;
      }
      Object.assign(replyHeaders, this.responseHeaders(upstream));
      void input.reply.hijack();
      hijacked = true;
      if (!downstream.isTerminated()) {
        input.reply.raw.writeHead(upstream.status, replyHeaders);
      }
      try {
        await consumeSseBody({
          body: upstream.body,
          signal: scope.controller.signal,
          maxEventBytes: this.options.maxSseEventBytes,
          onEvent: (event) => usage.observe(event),
          onChunk: async (chunk) => {
            scope.touch();
            if (downstream.isTerminated()) return;
            if (input.reply.raw.write(chunk)) return;
            scope.startDownstreamDrain();
            await waitForDrainOrClose(input.reply.raw, scope.controller.signal);
            scope.finishDownstreamDrain();
          },
        });
        scope.finishUpstream();
      } catch (error) {
        scope.cancel(error);
        if (!downstream.isTerminated()) {
          downstream.markGatewayDestroy();
          input.reply.raw.destroy(error instanceof Error ? error : new Error(String(error)));
        }
        const finalUsage = usage.result();
        if (finalUsage === undefined) {
          const note =
            scope.abortReason === undefined
              ? 'gateway-stream-error-floor'
              : `gateway-${scope.abortReason.replaceAll('_', '-')}-floor`;
          await commit(prepared.inputFloorMicro, note);
        } else {
          await commitUsage(finalUsage);
        }
        return;
      }

      const finalUsage = usage.result();
      if (finalUsage === undefined) {
        await commit(prepared.inputFloorMicro, 'gateway-usage-missing-floor');
      } else {
        const { actualMicro, outcome } = await commitUsage(finalUsage);
        if (outcome?.committed && !downstream.isTerminated()) {
          input.reply.raw.addTrailers({
            'x-tau-usage-input-tokens': String(finalUsage.inputTokens),
            'x-tau-usage-output-tokens': String(finalUsage.outputTokens),
            'x-tau-usage-cache-read-tokens': String(finalUsage.cacheReadTokens),
            'x-tau-usage-cache-write-tokens': String(finalUsage.cacheWriteTokens),
            'x-tau-usage-microdollars': String(actualMicro),
          });
        }
      }
      if (!downstream.isTerminated()) {
        input.reply.raw.end();
      }
    } catch (error) {
      scope.cancel(error);
      if (!durablySettled && !recoveryHandedOff) {
        if (providerStarted) await commit(prepared.inputFloorMicro, 'gateway-provider-error-floor');
        else await release();
      }
      if (hijacked) {
        if (!downstream.isTerminated()) {
          downstream.markGatewayDestroy();
          input.reply.raw.destroy(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      if (downstream.isTerminated()) return;
      if (error instanceof LlmGatewayError) throw error;
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'The model provider is unavailable.',
      );
    }
  }

  private async upstreamRequest(
    input: LlmGatewayRelayInput,
    model: Model,
    signal: AbortSignal,
  ): Promise<UpstreamRequest> {
    if (input.provider === 'anthropic') {
      const key = this.config.get('ANTHROPIC_API_KEY', { infer: true });
      if (!key) throw this.providerUnavailable();
      const anthropic = validateAnthropicHeaders({
        ...(input.anthropicVersion === undefined ? {} : { version: input.anthropicVersion }),
        ...(input.anthropicBeta === undefined ? {} : { beta: input.anthropicBeta }),
      });
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': key,
          'anthropic-version': anthropic.version,
          ...(anthropic.beta === undefined ? {} : { 'anthropic-beta': anthropic.beta }),
          'content-type': 'application/json',
        },
      };
    }

    if (input.provider === 'openai-responses') {
      const key = this.config.get('OPENAI_API_KEY', { infer: true });
      if (!key) throw this.providerUnavailable();
      return {
        url: openAiResponsesUrl,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      };
    }

    if (model.provider.id === 'vertexai') {
      const credentials = this.config.get('GOOGLE_VERTEX_AI_CREDENTIALS', { infer: true });
      if (!credentials) throw this.providerUnavailable();
      const accessToken = await this.getVertexAccessToken(credentials, signal);
      return {
        url: `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(credentials.project_id)}/locations/global/endpoints/openapi/chat/completions`,
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      };
    }

    if (!isDirectOpenAiProvider(model.provider.id)) throw this.providerUnavailable();
    const provider = directOpenAiProviders[model.provider.id];
    // MORPH_API_KEY must be restored to Environment outside this lane's path budget; ConfigService resolves it at runtime.
    const key = (this.config as unknown as { get(name: string): unknown }).get(provider.key);
    if (typeof key !== 'string' || key === '') throw this.providerUnavailable();
    return {
      url: provider.url,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    };
  }

  private async getVertexAccessToken(
    credentials: Environment['GOOGLE_VERTEX_AI_CREDENTIALS'],
    signal: AbortSignal,
  ): Promise<string> {
    if (this.vertexAccessToken !== undefined && this.vertexAccessToken.expiresAt > Date.now()) {
      return this.vertexAccessToken.value;
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const unsigned = `${base64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlJson({
      iss: credentials.client_email,
      scope: googleCloudScope,
      aud: googleTokenUrl,
      iat: issuedAt,
      exp: issuedAt + 3600,
    })}`;
    const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url')}`;
    const response = await fetch(googleTokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OAuth wire field.
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw this.providerUnavailable();
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || typeof payload['access_token'] !== 'string') throw this.providerUnavailable();
    const expiresIn = positiveInteger(payload['expires_in']) ?? 3600;
    this.vertexAccessToken = {
      value: payload['access_token'],
      expiresAt: Date.now() + Math.max(expiresIn * 1000 - 60_000, 1000),
    };
    return this.vertexAccessToken.value;
  }

  private providerUnavailable(): LlmGatewayError {
    return new LlmGatewayError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PROVIDER_UNAVAILABLE',
      'The model provider is unavailable.',
    );
  }

  private responseHeaders(upstream: Response): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': upstream.headers.get('cache-control') ?? 'no-cache, no-store',
      'x-accel-buffering': 'no',
      trailer: usageHeaderNames.join(', '),
      'access-control-expose-headers': usageHeaderNames.join(', '),
    };
    for (const name of ['request-id', 'x-request-id']) {
      const value = upstream.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    return headers;
  }

  private sanitizedUpstreamError(status: number): LlmGatewayError {
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return new LlmGatewayError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'The model provider is rate limited.');
    }
    // A provider 4xx means Tau relayed something the provider refused, which is a
    // different operator action from an outage. 401/403 stay an outage: they are
    // Tau's own credential, and nothing about the caller's request changes them.
    // The upstream body can echo the prompt, so only the status travels.
    if (status >= 400 && status < 500 && status !== HttpStatus.UNAUTHORIZED && status !== HttpStatus.FORBIDDEN) {
      return new LlmGatewayError(
        HttpStatus.BAD_GATEWAY,
        'UPSTREAM_REJECTED',
        `The model provider rejected the request (HTTP ${String(status)}).`,
      );
    }
    return new LlmGatewayError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PROVIDER_UNAVAILABLE',
      'The model provider is unavailable.',
    );
  }
}
