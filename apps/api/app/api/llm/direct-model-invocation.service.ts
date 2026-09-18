/* eslint-disable @typescript-eslint/naming-convention -- OpenAI Responses wire fields use snake_case. */
import { randomUUID } from 'node:crypto';
import { convertModelMessages } from '@ai-sdk/langchain';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeParseBillableModelRequest } from '#api/billing/billable-model-request.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { validateAnthropicHeaders } from '#api/llm/llm-gateway.headers.js';
import {
  providerBillingUrls,
  providerErrorMessage,
  readBoundedProviderBody,
  recognizeProviderAccountRefusal,
} from '#api/llm/provider-account-refusal.js';
import type { ProviderAccountRefusal } from '#api/llm/provider-account-refusal.js';
import { createProviderAccountFrameFilter } from '#api/llm/provider-account-stream.js';
import type {
  ModelInvocationIntent,
  ModelInvocationResult,
  ModelInvocationService,
} from '#api/llm/model-invocation.types.js';
import {
  executeGatewayProviderRequest,
  isGatewayProviderId,
  resolveGatewayModelRoute,
} from '#api/providers/provider-gateway.js';
import type { GatewayProviderId } from '#api/providers/provider-gateway.js';
import { ModelService } from '#api/models/model.service.js';
import type { Environment } from '#config/environment.config.js';

const encoder = new TextEncoder();

const sse = (event: unknown): Uint8Array<ArrayBuffer> =>
  encoder.encode(`data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`);

/** The provider body carried by a thrown SDK error, in the shape recognition reads. */
const thrownProviderBody = (error: unknown): unknown => {
  if (error === null || typeof error !== 'object') {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  const nested = record['error'];
  if (nested !== null && typeof nested === 'object') {
    return 'error' in nested ? nested : { error: nested };
  }
  return typeof record['message'] === 'string' ? { error: { message: record['message'] } } : undefined;
};

/** Self-host provider execution with request validation and no financial side effects. */
@Injectable()
export class DirectModelInvocationService implements ModelInvocationService {
  private readonly logger = new Logger(DirectModelInvocationService.name);

  public constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly models: ModelService,
  ) {}

  public async invoke(intent: ModelInvocationIntent): Promise<ModelInvocationResult> {
    if (intent.surface !== 'gateway') {
      return this.invokeHelper(intent);
    }
    const parsed = safeParseBillableModelRequest(intent.body, intent.providerWire);
    if (!parsed.success) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Model request is invalid.');
    }
    const route = resolveGatewayModelRoute(parsed.data.model, intent.providerWire);
    const anthropicHeaders =
      route.providerId === 'anthropic'
        ? validateAnthropicHeaders({
            version: intent.priceHeaders['anthropic-version'],
            beta: intent.priceHeaders['anthropic-beta'],
          })
        : undefined;
    if (route.providerId !== 'anthropic' && Object.keys(intent.priceHeaders).length > 0) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Provider headers are not supported.');
    }
    const response = await executeGatewayProviderRequest({
      config: this.config,
      providerId: route.providerId,
      body: {
        ...parsed.data,
        model: route.providerId === 'vertexai' ? `google/${route.modelId}` : route.modelId,
      },
      headers: {
        ...(anthropicHeaders ? { 'anthropic-version': anthropicHeaders.version } : {}),
        ...(anthropicHeaders?.beta ? { 'anthropic-beta': anthropicHeaders.beta } : {}),
      },
      signal: intent.signal,
    });
    if (!response.ok) {
      const body = await readBoundedProviderBody(response);
      const refusal = recognizeProviderAccountRefusal({
        providerId: route.providerId,
        status: response.status,
        body,
      });
      if (refusal) {
        throw this.providerAccountExhausted(route.providerId, refusal);
      }
      if (response.status >= 500) {
        throw new LlmGatewayError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'PROVIDER_UNAVAILABLE',
          `Configured provider returned HTTP ${response.status}.`,
        );
      }
      // The operator owns this key, so the provider's own reason stays in the message.
      // Clamped: the provider's sentence is persisted into the chat's error row.
      const reason = providerErrorMessage(body)?.slice(0, 500);
      throw new LlmGatewayError(
        HttpStatus.BAD_GATEWAY,
        'UPSTREAM_REJECTED',
        `Configured provider returned HTTP ${response.status}.${reason === undefined ? '' : ` ${reason}`}`,
      );
    }
    if (!response.body) {
      throw new LlmGatewayError(
        HttpStatus.BAD_GATEWAY,
        'PROVIDER_UNAVAILABLE',
        'Configured provider returned no response stream.',
      );
    }
    const relayed = response.body.pipeThrough(
      createProviderAccountFrameFilter({
        providerId: route.providerId,
        accountOwner: 'operator',
        onRefusal: (refusal) => {
          this.warnProviderAccount(route.providerId, refusal);
        },
      }),
    );
    return {
      state: 'streaming',
      response: new Response(relayed, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      completion: Promise.resolve(),
    };
  }

  /** WARN with what the operator needs to act: the provider, its code, its sentence and where to pay. */
  private warnProviderAccount(providerId: GatewayProviderId, refusal: ProviderAccountRefusal): void {
    const billingUrl = providerBillingUrls[providerId];
    this.logger.warn(
      `Provider account exhausted for ${providerId} (${refusal.providerCode ?? 'no code'}): ${refusal.message}${
        billingUrl === undefined ? '' : ` Add credit at ${billingUrl}`
      }`,
    );
  }

  /**
   * Classifies a helper's first-chunk failure: a recognised provider-account
   * refusal answers the typed 503, anything else stays an unknown outage.
   *
   * @param providerId - Provider of the selected helper model, when it has one.
   * @param error - What the provider stream threw.
   * @returns The gateway error to throw before the response is committed.
   */
  private helperProviderFailure(providerId: string | undefined, error: unknown): LlmGatewayError {
    if (providerId !== undefined && isGatewayProviderId(providerId)) {
      const refusal = recognizeProviderAccountRefusal({ providerId, body: thrownProviderBody(error) });
      if (refusal) {
        return this.providerAccountExhausted(providerId, refusal);
      }
    }
    this.logger.error(
      'The configured model provider failed before the first helper chunk',
      error instanceof Error ? error.stack : String(error),
    );
    return new LlmGatewayError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PROVIDER_UNAVAILABLE',
      'The configured model provider is unavailable.',
    );
  }

  private providerAccountExhausted(providerId: GatewayProviderId, refusal: ProviderAccountRefusal): LlmGatewayError {
    this.warnProviderAccount(providerId, refusal);
    return new LlmGatewayError(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_ACCOUNT_EXHAUSTED', refusal.message, {
      providerId,
      ...(refusal.providerCode === undefined ? {} : { providerCode: refusal.providerCode }),
      accountOwner: 'operator',
    });
  }

  private async invokeHelper(intent: ModelInvocationIntent): Promise<ModelInvocationResult> {
    const prompt = intent.directPrompt;
    if (!prompt) {
      throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Direct helper prompt is unavailable.');
    }
    const available = await this.models.getModels();
    const selected =
      available.find((model) => model.id === 'openai-gpt-5.6-luna') ??
      available.find((model) => model.recommended) ??
      available[0];
    if (!selected) {
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'No configured model provider is available.',
      );
    }
    const { model } = this.models.buildModel(selected.id, { maximumOutputTokens: prompt.maximumOutputTokens });
    const providerStream = await model.stream(
      convertModelMessages([{ role: 'system', content: prompt.system }, ...prompt.messages]),
      { signal: intent.signal },
    );
    /* The provider only refuses once the stream is pulled. Pull its first chunk here, before
     * the caller gets `streaming` and the controller sends 200, so a refusal is still a typed
     * JSON status rather than a destroyed socket. */
    const iterator = providerStream[Symbol.asyncIterator]();
    let first;
    try {
      first = await iterator.next();
    } catch (error) {
      if (intent.signal.aborted) {
        // The caller left; that is not a provider outage.
        throw error;
      }
      throw this.helperProviderFailure(selected.provider.id, error);
    }
    const completion = Promise.withResolvers<void>();
    const responseId = `resp_${randomUUID()}`;
    const messageId = `msg_${randomUUID()}`;
    let output = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        controller.enqueue(
          sse({ type: 'response.created', response: { id: responseId, model: selected.id, created_at: Date.now() } }),
        );
        controller.enqueue(
          sse({
            type: 'response.output_item.added',
            output_index: 0,
            item: { type: 'message', id: messageId, role: 'assistant', content: [], status: 'in_progress' },
          }),
        );
        try {
          // oxlint-disable-next-line no-await-in-loop -- the provider stream is consumed serially.
          for (let part = first; part.done !== true; part = await iterator.next()) {
            const chunk = part.value;
            inputTokens = chunk.usage_metadata?.input_tokens ?? inputTokens;
            outputTokens = chunk.usage_metadata?.output_tokens ?? outputTokens;
            if (!chunk.text) {
              continue;
            }
            output += chunk.text;
            controller.enqueue(
              sse({
                type: 'response.output_text.delta',
                item_id: messageId,
                output_index: 0,
                content_index: 0,
                delta: chunk.text,
              }),
            );
          }
          const item = {
            type: 'message',
            id: messageId,
            role: 'assistant',
            content: [{ type: 'output_text', text: output, annotations: [] }],
            status: 'completed',
          };
          controller.enqueue(sse({ type: 'response.output_item.done', output_index: 0, item }));
          controller.enqueue(
            sse({
              type: 'response.completed',
              response: {
                id: responseId,
                model: selected.id,
                created_at: Date.now(),
                status: 'completed',
                output: [item],
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                  input_tokens_details: { cached_tokens: 0 },
                  output_tokens_details: { reasoning_tokens: 0 },
                  total_tokens: inputTokens + outputTokens,
                },
              },
            }),
          );
          controller.enqueue(sse('[DONE]'));
          controller.close();
          completion.resolve();
        } catch (error) {
          controller.error(error);
          completion.reject(error);
        }
      },
    });
    return {
      state: 'streaming',
      response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
      completion: completion.promise,
    };
  }
}
