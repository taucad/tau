/* eslint-disable @typescript-eslint/naming-convention -- OpenAI Responses wire fields use snake_case. */
import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeParseBillableModelRequest } from '#billable-model-request.js';
import { LlmGatewayError } from '#llm-gateway.error.js';
import { validateAnthropicHeaders } from '#llm-gateway.headers.js';
import {
  providerBillingUrls,
  providerErrorMessage,
  recognizeProviderAccountRefusal,
} from '#provider-account-refusal.js';
import type { ProviderAccountRefusal } from '#provider-account-refusal.js';
import {
  classifyUpstreamRefusal,
  readUpstreamRefusal,
  redactCredentials,
  upstreamRetryAfterSeconds,
} from '#upstream-refusal.js';
import { createProviderAccountFrameFilter } from '#provider-account-stream.js';
import type { ProviderTerminalFailure } from '#provider-account-stream.js';
import { errorDiagnostic, providerDiagnostic, textMarker } from '#provider-diagnostic.js';
import type { ModelInvocationIntent, ModelInvocationResult, ModelInvocationService } from '#model-invocation.types.js';
import {
  executeGatewayProviderRequest,
  helperModelRoute,
  isGatewayProviderId,
  resolveGatewayModelRoute,
  upstreamModelId,
} from '#providers/provider-gateway.js';
import type { GatewayProviderId, HelperModelRoute } from '#providers/provider-gateway.js';
import { HelperStreamFailure, helperRequestBody, readHelperStream } from '#providers/helper-wire.js';
import type { HelperStreamEvent, HelperUsage } from '#providers/helper-wire.js';
import { ModelService } from '#models/model.service.js';
import type { Environment } from '@taucad/api-core';
import { startGenAiChatSpan } from '@taucad/api-observability';
import type { GenAiChatSpan } from '@taucad/api-observability';

const encoder = new TextEncoder();

const sse = (event: unknown): Uint8Array<ArrayBuffer> =>
  encoder.encode(`data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`);

/** One helper call: the invocation, the route it took and its `gen_ai` span. */
type HelperCall = {
  readonly intent: ModelInvocationIntent;
  readonly route: HelperModelRoute;
  readonly span: GenAiChatSpan;
};

/** A helper's provider failure that is not a recognised account refusal. */
const helperUnavailable = (): LlmGatewayError =>
  new LlmGatewayError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'PROVIDER_UNAVAILABLE',
    'The configured model provider is unavailable.',
  );

/** Anthropic's Messages API version; the helper names it as the provider's SDK does. */
const anthropicVersion = '2023-06-01';

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
        model: upstreamModelId(route),
      },
      headers: {
        ...(anthropicHeaders ? { 'anthropic-version': anthropicHeaders.version } : {}),
        ...(anthropicHeaders?.beta ? { 'anthropic-beta': anthropicHeaders.beta } : {}),
      },
      signal: intent.signal,
    });
    if (!response.ok) {
      const { body, loggedBody } = await readUpstreamRefusal(response);
      // The refusal is undiagnosable without the provider's own body, and the body can
      // name the account behind the key, so its content-free projection stays here and
      // never joins the envelope.
      this.logger.warn(
        {
          providerId: route.providerId,
          routeId: parsed.data.model,
          modelId: route.modelId,
          upstreamStatus: response.status,
          upstreamBody: loggedBody,
        },
        'Upstream model provider refused the request',
      );
      const refusal = recognizeProviderAccountRefusal({
        providerId: route.providerId,
        status: response.status,
        body,
      });
      if (refusal) {
        throw this.providerAccountExhausted(route.providerId, refusal);
      }
      const retryAfterSeconds = upstreamRetryAfterSeconds(response.headers, body);
      const classification = classifyUpstreamRefusal({
        status: response.status,
        accountOwner: 'operator',
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      });
      // The operator owns this key, so the provider's own reason stays in the message.
      // Clamped: the provider's sentence is persisted into the chat's error row.
      // Redacted first, as the logged copy is: a provider may quote a key or token back.
      const providerReason = response.status >= 500 ? undefined : providerErrorMessage(body);
      const reason = providerReason === undefined ? undefined : redactCredentials(providerReason).slice(0, 500);
      throw new LlmGatewayError(
        classification.status,
        classification.type,
        `Configured provider returned HTTP ${response.status}.${reason === undefined ? '' : ` ${reason}`}`,
        classification.details,
      );
    }
    if (!response.body) {
      throw new LlmGatewayError(
        HttpStatus.BAD_GATEWAY,
        'PROVIDER_UNAVAILABLE',
        'Configured provider returned no response stream.',
      );
    }
    // The provider's own identifier for this call, for its request log.
    const requestId = response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? undefined;
    const relayed = response.body.pipeThrough(
      createProviderAccountFrameFilter({
        providerId: route.providerId,
        accountOwner: 'operator',
        onRefusal: (refusal) => {
          this.warnProviderAccount(route.providerId, refusal);
        },
        onTerminalFailure: (failure) => {
          this.logTerminalFailure({ providerId: route.providerId, modelId: route.modelId, requestId, failure });
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

  /**
   * ERROR with the only evidence this path keeps of a terminal failure frame:
   * unlike the funded path it writes no ledger row, so a 200 that ends in
   * `response.failed` or an `error` event leaves nothing behind (R8).
   *
   * Logged: the route, the provider's request id, the frame's code or type, and
   * the length and digest of the provider's sentence. The sentence itself can
   * quote a fragment of the request it rejected, so it never reaches the log;
   * the request id finds it in the provider's own console.
   *
   * @param input - The route the request took, the provider's own identifier
   * for the call when it sent one, and what the terminal frame said about itself.
   */
  private logTerminalFailure(input: {
    readonly providerId: GatewayProviderId;
    readonly modelId: string;
    readonly requestId: string | undefined;
    readonly failure: ProviderTerminalFailure;
  }): void {
    const { failure } = input;
    this.logger.error(
      `Provider stream failed for ${input.providerId} ${input.modelId} (${failure.code ?? failure.type ?? 'no code'})` +
        `${input.requestId === undefined ? '' : ` request ${input.requestId}`}: ` +
        `${failure.message === undefined ? 'no message' : textMarker(failure.message)}`,
    );
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

  private providerAccountExhausted(providerId: GatewayProviderId, refusal: ProviderAccountRefusal): LlmGatewayError {
    this.warnProviderAccount(providerId, refusal);
    return new LlmGatewayError(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_ACCOUNT_EXHAUSTED', refusal.message, {
      providerId,
      ...(refusal.providerCode === undefined ? {} : { providerCode: refusal.providerCode }),
      accountOwner: 'operator',
    });
  }

  /**
   * The typed 503 for a recognised provider-account refusal on a helper route.
   *
   * @param route - The helper's route.
   * @param refusal - The provider's status, when it answered one, and error body.
   * @returns The `PROVIDER_ACCOUNT_EXHAUSTED` error, or `undefined` when the body is not one.
   */
  private helperAccountRefusal(
    route: HelperModelRoute,
    refusal: { readonly status?: number; readonly body: unknown },
  ): LlmGatewayError | undefined {
    if (!isGatewayProviderId(route.providerId)) {
      return undefined;
    }
    const recognized = recognizeProviderAccountRefusal({
      providerId: route.providerId,
      ...(refusal.status === undefined ? {} : { status: refusal.status }),
      body: refusal.body,
    });
    return recognized ? this.providerAccountExhausted(route.providerId, recognized) : undefined;
  }

  /**
   * Runs a self-host helper prompt (`project_name`, `commit_name`) on the first
   * listed model through the shared provider transport, and answers it as an
   * OpenAI Responses stream.
   *
   * @param intent - The helper invocation; its `directPrompt` is the request.
   * @returns The Responses stream, committed only after the provider's first event.
   */
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
    const route = selected === undefined ? undefined : helperModelRoute(selected);
    if (!selected || !route) {
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'No configured model provider is available.',
      );
    }
    const span = startGenAiChatSpan({
      providerName: this.models.getOtelProviderName(selected.id) ?? route.providerId,
      requestModel: route.modelId,
      maxTokens: prompt.maximumOutputTokens,
    });
    const call: HelperCall = { intent, route, span };
    const events = await this.openHelperStream(call, helperRequestBody(route, selected, prompt));
    /* Pull the first event before the caller gets `streaming` and the controller sends 200: a
     * provider that refuses inside its stream is then still a typed JSON status rather than a
     * destroyed socket. */
    let first: IteratorResult<HelperStreamEvent>;
    try {
      first = await events.next();
    } catch (error) {
      throw this.helperStreamFailure(call, error);
    }
    const completion = Promise.withResolvers<void>();
    const responseId = `resp_${randomUUID()}`;
    const messageId = `msg_${randomUUID()}`;
    const { logger } = this;
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
        let output = '';
        let usage: HelperUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
        try {
          // oxlint-disable-next-line no-await-in-loop -- the provider stream is consumed serially.
          for (let part = first; part.done !== true; part = await events.next()) {
            const event = part.value;
            if (event.type === 'usage') {
              ({ usage } = event);
              continue;
            }
            output += event.text;
            controller.enqueue(
              sse({
                type: 'response.output_text.delta',
                item_id: messageId,
                output_index: 0,
                content_index: 0,
                delta: event.text,
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
                  input_tokens: usage.input,
                  output_tokens: usage.output,
                  input_tokens_details: { cached_tokens: usage.cacheRead },
                  output_tokens_details: { reasoning_tokens: usage.reasoning },
                  total_tokens: usage.input + usage.output,
                },
              },
            }),
          );
          controller.enqueue(sse('[DONE]'));
          controller.close();
          span.succeed({
            inputTokens: usage.input,
            outputTokens: usage.output,
            cacheReadTokens: usage.cacheRead,
            cacheWriteTokens: usage.cacheWrite,
            reasoningTokens: usage.reasoning,
          });
          completion.resolve();
        } catch (error) {
          span.fail(
            intent.signal.aborted ? 'aborted' : error instanceof HelperStreamFailure ? 'provider_stream' : 'stream',
          );
          if (error instanceof HelperStreamFailure) {
            logger.error(`Helper provider stream failed for ${route.providerId} ${route.modelId}: ${error.message}`);
          }
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

  /**
   * Sends the helper request and answers the provider's refusal before any stream exists.
   *
   * @param call - The helper invocation, its route and its `gen_ai` span, failed here when the call never streams.
   * @param body - The native request body.
   * @returns The provider's text and usage events.
   */
  private async openHelperStream(call: HelperCall, body: unknown): Promise<AsyncGenerator<HelperStreamEvent>> {
    const { intent, route, span } = call;
    let response: Response;
    try {
      response = await executeGatewayProviderRequest({
        config: this.config,
        providerId: route.providerId,
        body,
        headers: route.wire === 'anthropic' ? { 'anthropic-version': anthropicVersion } : {},
        signal: intent.signal,
      });
    } catch (error) {
      if (intent.signal.aborted) {
        span.fail('aborted');
        // The caller left; that is not a provider outage.
        throw error;
      }
      span.fail('unavailable');
      this.logger.error(
        `The configured model provider failed before the helper stream (${route.providerId}, ${errorDiagnostic(error)})`,
      );
      throw helperUnavailable();
    }
    if (!response.ok) {
      const { body: refusal, loggedBody } = await readUpstreamRefusal(response);
      // Content-free projection only: the provider's body can name the account behind the key.
      this.logger.warn(
        {
          providerId: route.providerId,
          modelId: route.modelId,
          upstreamStatus: response.status,
          upstreamBody: loggedBody,
        },
        'Upstream model provider refused the helper request',
      );
      span.fail(String(response.status));
      throw this.helperAccountRefusal(route, { status: response.status, body: refusal }) ?? helperUnavailable();
    }
    if (!response.body) {
      span.fail('no_body');
      throw helperUnavailable();
    }
    return readHelperStream(route.wire, response.body);
  }

  /**
   * Classifies a failure on the helper stream's first event.
   *
   * @param call - The helper invocation, its route and its `gen_ai` span.
   * @param error - What the first read threw.
   * @returns The error to throw: the caller's own abort untouched, otherwise a typed 503.
   */
  private helperStreamFailure(call: HelperCall, error: unknown): unknown {
    const { intent, route, span } = call;
    if (intent.signal.aborted) {
      span.fail('aborted');
      return error;
    }
    span.fail(error instanceof HelperStreamFailure ? 'provider_stream' : 'stream');
    const accountRefusal =
      error instanceof HelperStreamFailure ? this.helperAccountRefusal(route, { body: error.body }) : undefined;
    if (accountRefusal) {
      return accountRefusal;
    }
    this.logger.error(
      `The configured model provider failed before the first helper chunk (${route.providerId}, ${
        error instanceof HelperStreamFailure
          ? `${error.message}: ${redactCredentials(providerDiagnostic(error.body))}`
          : errorDiagnostic(error)
      })`,
    );
    return helperUnavailable();
  }
}
