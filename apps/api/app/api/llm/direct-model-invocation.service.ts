/* eslint-disable @typescript-eslint/naming-convention -- OpenAI Responses wire fields use snake_case. */
import { randomUUID } from 'node:crypto';
import { convertModelMessages } from '@ai-sdk/langchain';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeParseBillableModelRequest } from '#api/billing/billable-model-request.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { validateAnthropicHeaders } from '#api/llm/llm-gateway.headers.js';
import type {
  ModelInvocationIntent,
  ModelInvocationResult,
  ModelInvocationService,
} from '#api/llm/model-invocation.types.js';
import { executeGatewayProviderRequest, resolveGatewayModelRoute } from '#api/providers/provider-gateway.js';
import { ModelService } from '#api/models/model.service.js';
import type { Environment } from '#config/environment.config.js';

const encoder = new TextEncoder();

const sse = (event: unknown): Uint8Array<ArrayBuffer> =>
  encoder.encode(`data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`);

/** Self-host provider execution with request validation and no financial side effects. */
@Injectable()
export class DirectModelInvocationService implements ModelInvocationService {
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
      await response.body?.cancel();
      throw new LlmGatewayError(
        response.status >= 500 ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
        response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'UPSTREAM_REJECTED',
        `Configured provider returned HTTP ${response.status}.`,
      );
    }
    if (!response.body) {
      throw new LlmGatewayError(
        HttpStatus.BAD_GATEWAY,
        'PROVIDER_UNAVAILABLE',
        'Configured provider returned no response stream.',
      );
    }
    return { state: 'streaming', response, completion: Promise.resolve() };
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
          for await (const chunk of providerStream) {
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
