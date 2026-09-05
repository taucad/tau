/**
 * Live end-to-end admission proof for the browser host's real model transport.
 *
 * Every other gateway test stubs one side: the UI e2e spec intercepts the route
 * so pi-ai's real headers and body never reach admission, and the service unit
 * tests hand-write bodies that drift from what the codecs emit. This test drives
 * the actual `@taucad/agent-host` gateway transport — the same `piModelFor`
 * model, the same pi-ai anthropic/openai codecs, the same header stripping the
 * browser worker uses — into the real `LlmGatewayService`, and on to the real
 * provider. It is the only coverage that fails when pi-ai starts sending a
 * header or body field the gateway allow-list rejects.
 */

// oxlint-disable unicorn/prefer-event-target -- The gateway writes to a Node ServerResponse; this fixture must speak the same emitter contract.
// oxlint-disable tau-lint/no-time-unit-suffix -- Field names are LlmGatewayOptions', not this fixture's to rename.
import { EventEmitter } from 'node:events';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { describe, expect, it } from 'vitest';
// The whole point of this file is to exercise the REAL browser-host transport
// against the REAL gateway. @taucad/agent-host is a browser package and must not
// become an API dependency, so the env-gated test reaches its source directly.
// oxlint-disable-next-line no-restricted-imports, import/extensions -- See the comment above: reaching agent-host source is this file's purpose.
// eslint-disable-next-line no-restricted-imports, import-x/extensions, import-x/no-relative-packages -- See the comment above: reaching agent-host source is this file's purpose.
import { createGatewayModelTransport } from '../../../../../packages/agent-host/src/transport/gateway-model-transport.js';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Same reason: this file speaks the real host transport's types.
// eslint-disable-next-line no-restricted-imports, import-x/extensions, import-x/no-relative-packages -- Same reason: this file speaks the real host transport's types.
import type { ModelStreamRequest } from '../../../../../packages/agent-host/src/waist/ports.js';
import type { Environment } from '#config/environment.config.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import type { LlmGatewayLimiter } from '#api/llm/llm-gateway-limiter.service.js';
import type { LlmGatewayOptions } from '#api/llm/llm-gateway.options.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { readSingleHeader, validateAnthropicHeaders } from '#api/llm/llm-gateway.headers.js';
import { corsBaseConfiguration } from '#constants/cors.constant.js';

const liveEnabled =
  process.env['TAU_LLM_GATEWAY_LIVE_TESTS'] === 'true' &&
  Boolean(process.env.ANTHROPIC_API_KEY) &&
  Boolean(process.env.OPENAI_API_KEY);

/*
 * `accept`/`accept-language`/`content-language` are CORS-safelisted and
 * `user-agent` is browser-managed (the SDK's value is dropped, never
 * preflighted); everything else pi's SDKs emit must be on the gateway's own
 * allow-list, because credentialed CORS ignores an `*` wildcard.
 */
const browserManagedHeaderNames = new Set(['accept', 'accept-language', 'content-language', 'user-agent']);

const corsAllowedHeaderNames = (route: string, names: readonly string[]): void => {
  const refused = names.filter(
    (name) =>
      !browserManagedHeaderNames.has(name) && !corsBaseConfiguration.allowedHeaders.some((allowed) => allowed === name),
  );
  if (refused.length > 0) {
    throw new Error(`The ${route} route sends headers the gateway CORS allow-list rejects: ${refused.join(', ')}`);
  }
};

const gatewayOptions: LlmGatewayOptions = {
  requestsPerMinute: 60,
  maxConcurrentRequests: 4,
  maxProviderConcurrentRequests: 100,
  upstreamIdleTimeoutMs: 30_000,
  postAbortSettlementTimeoutMs: 120_000,
  concurrencyLeaseMs: 300_000,
  concurrencyHeartbeatMs: 60_000,
  maxSseEventBytes: 256 * 1024,
};

/** Minimal `ServerResponse` surface the gateway stream writer touches. */
class RelayRawResponse extends EventEmitter {
  public destroyed = false;
  public writableEnded = false;
  public statusCode = 0;
  public headers: Record<string, unknown> = {};
  public readonly trailers: Record<string, string> = {};
  private controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined;
  private queued: Array<Uint8Array<ArrayBuffer>> = [];
  private closed = false;

  public constructor(private readonly onHead: (response: RelayRawResponse) => void) {
    super();
  }

  public attach(controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>): void {
    this.controller = controller;
    for (const chunk of this.queued) {
      controller.enqueue(chunk);
    }
    this.queued = [];
    if (this.closed) {
      controller.close();
    }
  }

  public writeHead(status: number, headers: Record<string, unknown>): this {
    this.statusCode = status;
    this.headers = headers;
    this.onHead(this);
    return this;
  }

  public write(chunk: Uint8Array<ArrayBuffer>): boolean {
    if (this.controller) {
      this.controller.enqueue(chunk);
    } else {
      this.queued.push(chunk);
    }
    return true;
  }

  public addTrailers(trailers: Record<string, string>): void {
    Object.assign(this.trailers, trailers);
  }

  public end(): this {
    this.writableEnded = true;
    this.closed = true;
    if (this.controller && !this.destroyed) {
      try {
        this.controller.close();
      } catch {
        // Already closed by an earlier terminal chunk.
      }
    }
    this.emit('finish');
    return this;
  }

  public destroy(error?: Error): this {
    this.destroyed = true;
    this.closed = true;
    this.controller?.error(error ?? new Error('Gateway destroyed the relay response.'));
    this.emit('close');
    return this;
  }
}

/**
 * Turn `LlmGatewayService.relay` into a `fetch` the host transport can call.
 *
 * The controller's own header reads and the global filter's typed-envelope
 * passthrough are reproduced here so the transport sees the production wire.
 */
const gatewayFetch = (service: LlmGatewayService): typeof globalThis.fetch =>
  (async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    const { pathname } = new URL(url);
    // The controller's three routes, selected the way Nest selects them.
    const provider = pathname.includes('/llm/anthropic/')
      ? 'anthropic'
      : pathname.endsWith('/responses')
        ? 'openai-responses'
        : 'openai';
    // Every surviving header must sit in apps/api's CORS allow-list
    // (apps/api/app/constants/http-header.constant.ts) or be CORS-safelisted,
    // or the browser's preflight refuses the route before the gateway sees it.
    corsAllowedHeaderNames(provider, [...headers.keys()]);
    // Mirror the controller's per-request header read against real duplicate detection.
    const asFastify = {
      headers: Object.fromEntries(headers),
      raw: { rawHeaders: [...headers].flat() },
    } as unknown as Parameters<typeof readSingleHeader>[0];
    const requestBody: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');

    let resolveResponse!: (response: Response) => void;
    let rejectResponse!: (error: Error) => void;
    const responded = new Promise<Response>((resolve, reject) => {
      resolveResponse = resolve;
      rejectResponse = reject;
    });
    const state = { settled: false };
    const raw = new RelayRawResponse((response) => {
      state.settled = true;
      const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start: (controller) => {
          response.attach(controller);
        },
      });
      resolveResponse(
        new Response(body, {
          status: response.statusCode,
          headers: Object.fromEntries(
            Object.entries(response.headers).flatMap(([name, value]) =>
              typeof value === 'string' || typeof value === 'number' ? [[name, String(value)] as const] : [],
            ),
          ),
        }),
      );
    });

    const relayed = (async () => {
      try {
        await service.relay({
          provider,
          principalId: 'live-transport-principal',
          reply: { raw, hijack: () => undefined, getHeaders: () => ({}) } as unknown as FastifyReply,
          body: requestBody,
          ...(provider === 'anthropic'
            ? {
                anthropicVersion: readSingleHeader(asFastify, 'anthropic-version'),
                anthropicBeta: readSingleHeader(asFastify, 'anthropic-beta'),
              }
            : {}),
        });
        if (!state.settled) {
          resolveResponse(new Response('{}', { status: 204 }));
        }
      } catch (error) {
        if (state.settled) {
          return;
        }
        if (error instanceof LlmGatewayError) {
          // The production filter chain forwards the typed gateway envelope verbatim.
          resolveResponse(
            new Response(JSON.stringify(error.getResponse()), {
              status: error.getStatus(),
              headers: { 'content-type': 'application/json' },
            }),
          );
          return;
        }
        rejectResponse(error instanceof Error ? error : new Error(JSON.stringify(error)));
      }
    })();

    // The relay keeps writing the SSE body long after the head resolves, and the
    // transport consumes it through the returned Response — so only the head is
    // awaited. Every relay outcome settles `responded`.
    void relayed;
    return responded;
  }) as typeof globalThis.fetch;

const createService = (): LlmGatewayService => {
  const ledger = {
    reserve: async () => ({ ok: true, reservationId: 'live-transport-reservation' }) as const,
    commit: async () => ({ committed: true, balanceMicro: 0n }),
    release: async () => undefined,
  } as unknown as CreditLedgerService;
  const config = {
    get(key: string) {
      if (key === 'TAU_CREDIT_MARKUP_FRACTION') {
        return 0.3;
      }
      return process.env[key];
    },
  } as unknown as ConfigService<Environment, true>;
  const limiter = {
    acquire: async () => ({ release: async () => undefined }),
  } as unknown as LlmGatewayLimiter;
  return new LlmGatewayService(ledger, new TokenBudgetService(), config, limiter, gatewayOptions);
};

const readFileTool = {
  name: 'read_file',
  description: 'Read one workspace file.',
  inputSchema: {
    type: 'object',
    properties: { targetFile: { type: 'string' } },
    required: ['targetFile'],
    additionalProperties: false,
  },
} as const;

type GatewayToolCall = { readonly toolCallId: string; readonly toolName: string; readonly input: unknown };

/** Drive the real transport end to end and report what the gateway answered. */
const streamThroughGateway = async (input: {
  readonly modelId: string;
  readonly providerKind: ModelStreamRequest['providerKind'];
  readonly withTools: boolean;
  readonly maxTokens?: number;
  readonly messages?: ModelStreamRequest['messages'];
}): Promise<{
  text: string;
  toolCalls: GatewayToolCall[];
  usageTotal?: number | undefined;
  stopReason?: string | undefined;
}> => {
  const maxTokens = input.maxTokens ?? 16;
  const transport = createGatewayModelTransport({
    baseUrl: 'https://gateway.invalid/',
    model: { contextWindow: 200_000, maxTokens },
    fetch: gatewayFetch(createService()),
  });

  let text = '';
  const toolCalls: GatewayToolCall[] = [];
  let usageTotal: number | undefined;
  let stopReason: string | undefined;
  for await (const event of transport.stream({
    modelId: input.modelId,
    providerKind: input.providerKind,
    maxTokens,
    systemPrompt: 'You are a terse test fixture.',
    // The exact block set the browser chat client builds, empty workspace slot
    // included — the shape that made Anthropic answer 400 and the gateway 503.
    systemPromptBlocks: [
      { type: 'text', text: 'You are a terse test fixture.', cacheControl: { type: 'ephemeral', scope: 'global' } },
      { type: 'text', text: '', cacheControl: { type: 'ephemeral' } },
      { type: 'text', text: 'Answer in one word.' },
    ],
    messages: input.messages ?? [{ id: 'live-1', role: 'user', content: 'Reply with exactly OK.' }],
    tools: input.withTools ? [readFileTool] : [],
    signal: new AbortController().signal,
  })) {
    if (event.type === 'text-delta') {
      text += event.text;
    }
    if (event.type === 'tool-input') {
      toolCalls.push({ toolCallId: event.toolCallId, toolName: event.toolName, input: event.input });
    }
    if (event.type === 'usage') {
      usageTotal = event.usage.totalTokens;
    }
    if (event.type === 'completed') {
      stopReason = event.stopReason;
    }
  }
  return { text, toolCalls, usageTotal, stopReason };
};

describe.skipIf(!liveEnabled)('live gateway admission of the real host transport (NOT EVIDENCE when skipped)', () => {
  it('streams assistant text and terminal usage over the anthropic wire, tools included', async () => {
    const result = await streamThroughGateway({
      modelId: 'anthropic-claude-fable-5.1',
      providerKind: 'anthropic',
      withTools: true,
    });

    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.usageTotal).toBeTypeOf('number');
    expect(result.stopReason).toBeDefined();
  }, 120_000);

  /*
   * The reason the Responses wire exists: gpt-5.6-luna answers 400 on
   * /v1/chat/completions for ANY request carrying function tools, and the
   * browser host always sends tools. Tools defined, prompt that needs none.
   */
  it('streams assistant text and terminal usage over the openai responses wire, tools included', async () => {
    const result = await streamThroughGateway({
      modelId: 'openai-gpt-5.6-luna',
      providerKind: 'openai',
      withTools: true,
      maxTokens: 64,
    });

    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.usageTotal).toBeTypeOf('number');
    expect(result.usageTotal).toBeGreaterThan(0);
    expect(result.stopReason).toBeDefined();
  }, 120_000);

  it('round-trips a tool call and its result over the openai responses wire', async () => {
    const called = await streamThroughGateway({
      modelId: 'openai-gpt-5.6-luna',
      providerKind: 'openai',
      withTools: true,
      maxTokens: 256,
      messages: [
        {
          id: 'live-tool-1',
          role: 'user',
          content: 'Call read_file for answer.ts, then tell me the number it exports. Use the tool first.',
        },
      ],
    });

    expect(called.toolCalls).toHaveLength(1);
    const call = called.toolCalls[0]!;
    expect(call.toolName).toBe('read_file');

    const answered = await streamThroughGateway({
      modelId: 'openai-gpt-5.6-luna',
      providerKind: 'openai',
      withTools: true,
      maxTokens: 256,
      messages: [
        {
          id: 'live-tool-1',
          role: 'user',
          content: 'Call read_file for answer.ts, then tell me the number it exports. Use the tool first.',
        },
        {
          id: 'live-tool-2',
          role: 'assistant',
          content: [{ type: 'toolCall', id: call.toolCallId, name: call.toolName, arguments: call.input as never }],
          // Matches piModelFor's model exactly, so the Responses codec replays
          // the provider's own item ids instead of foreign-call fallbacks.
          metadata: {
            api: 'openai-responses',
            provider: 'openai',
            model: 'openai-gpt-5.6-luna',
            stopReason: 'toolUse',
          },
        },
        {
          id: 'live-tool-3',
          role: 'tool-output',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          isError: false,
          content: 'export const answer = 42;',
        },
      ],
    });

    expect(answered.text).toContain('42');
    expect(answered.usageTotal).toBeGreaterThan(0);
  }, 180_000);

  // OpenAI-COMPATIBLE providers stay on /chat/completions; only OpenAI's own
  // rows moved. Gated separately so the suite still runs without a Together key.
  it.skipIf(!process.env.TOGETHER_API_KEY)(
    'streams assistant text and terminal usage over the openai completions wire',
    async () => {
      const result = await streamThroughGateway({
        modelId: 'together-kimi-k3',
        providerKind: 'together',
        withTools: true,
        maxTokens: 64,
      });

      expect(result.text.trim().length).toBeGreaterThan(0);
      expect(result.usageTotal).toBeTypeOf('number');
      expect(result.stopReason).toBeDefined();
    },
    120_000,
  );

  it('rejects an anthropic-beta the gateway does not allow-list', () => {
    expect(() => validateAnthropicHeaders({ beta: 'not-a-real-beta-2099-01-01' })).toThrow(LlmGatewayError);
  });
});
