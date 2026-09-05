import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import type { Usage } from '@earendil-works/pi-ai';
import type { ModelStreamEvent, ModelStreamRequest } from '#waist/ports.js';
import { createAgentSession } from '#harness/session.js';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { reduceEventLog } from '#log/reducer.js';
import {
  createCachedSystemPromptBlocks,
  createGatewayModelTransport as createGatewayModelTransportWithModel,
} from '#transport/gateway-model-transport.js';
import type { GatewayModelTransportOptions } from '#transport/gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';

const request = (overrides: Partial<ModelStreamRequest> = {}): ModelStreamRequest => ({
  modelId: 'fixture-model',
  // An OpenAI-COMPATIBLE catalog provider: these keep the openai-completions
  // codec. `openai` itself now routes to the Responses wire and is exercised
  // by its own cases below.
  providerKind: 'vertexai',
  maxTokens: 8192,
  systemPrompt: 'static\n\nworkspace\n\ndynamic',
  systemPromptBlocks: createCachedSystemPromptBlocks({
    staticPrompt: 'static',
    workspacePrompt: 'workspace',
    dynamicPrompt: 'dynamic',
  }),
  messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  tools: [
    {
      name: 'read_file',
      description: 'Read a file.',
      inputSchema: {
        type: 'object',
        properties: { targetFile: { type: 'string' } },
        required: ['targetFile'],
        additionalProperties: false,
      },
    },
  ],
  signal: new AbortController().signal,
  ...overrides,
});

const collect = async (stream: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> => {
  const events: ModelStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
};

const usage = (
  input: number,
  output: number,
  options: Pick<Usage, 'reasoning' | 'cacheWrite1h'> & {
    readonly cacheRead?: number;
    readonly cacheWrite?: number;
  } = {},
): Usage => ({
  input,
  output,
  cacheRead: options.cacheRead ?? 0,
  cacheWrite: options.cacheWrite ?? 0,
  totalTokens: input + output + (options.cacheRead ?? 0) + (options.cacheWrite ?? 0),
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
  ...(options.cacheWrite1h === undefined ? {} : { cacheWrite1h: options.cacheWrite1h }),
});

const createGatewayModelTransport = (options: Omit<GatewayModelTransportOptions, 'model'>) =>
  createGatewayModelTransportWithModel({
    ...options,
    model: { contextWindow: 200_000, maxTokens: 8192 },
  });

const sseFixture = authoritativeGatewayWireFixtures.toolTurn;

const fixtureResponse = (): Response => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(sseFixture.join(''));
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 11) {
          controller.enqueue(bytes.slice(offset, offset + 11));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
};

const byteSplitResponse = (frames: readonly string[]): Response => {
  const bytes = new TextEncoder().encode(frames.join(''));
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const byte of bytes) {
          controller.enqueue(Uint8Array.of(byte));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
};

const responseFromChunks = (chunks: readonly string[], contentType = 'text/event-stream'): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': contentType } },
  );
};

describe('createGatewayModelTransport', () => {
  it('posts pi-ai OpenAI Chat Completions bytes and maps a fragmented gateway SSE stream', async () => {
    let body: BodyInit | undefined;
    let credentials: string | undefined;
    let headers: Headers | undefined;
    let path: string | undefined;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      path = new URL(input instanceof Request ? input.url : input).pathname;
      credentials = init?.credentials;
      headers = new Headers(init?.headers);
      body = init?.body ?? undefined;
      return fixtureResponse();
    });

    const events = await collect(
      createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: fetchSpy }).stream(request()),
    );

    expect(path).toBe('/v1/llm/openai/v1/chat/completions');
    expect(credentials).toBe('include');
    expect(headers?.has('authorization')).toBe(false);
    expect(headers?.has('x-api-key')).toBe(false);
    // OpenAI's system field has no per-block cache-control wire shape, so this
    // provider deliberately degrades to pi's blanket cacheRetention policy.
    expect(body).toBe(
      String.raw`{"model":"fixture-model","messages":[{"role":"developer","content":"static\n\nworkspace\n\ndynamic"},{"role":"user","content":"hello"}],"stream":true,"stream_options":{"include_usage":true},"store":false,"max_completion_tokens":8192,"tools":[{"type":"function","function":{"name":"read_file","description":"Read a file.","parameters":{"type":"object","properties":{"targetFile":{"type":"string"}},"required":["targetFile"],"additionalProperties":false},"strict":false}}]}`,
    );
    expect(events).toEqual([
      { type: 'thinking-delta', text: 'think' },
      { type: 'thinking-delta', text: '', signature: 'reasoning_content' },
      { type: 'tool-input', toolCallId: 'call-1', toolName: 'read_file', input: { targetFile: 'main.ts' } },
      {
        type: 'usage',
        usage: usage(7, 4, { cacheRead: 5, reasoning: 0 }),
      },
      { type: 'completed', stopReason: 'toolUse' },
    ]);
  });

  /*
   * Direct-OpenAI catalog rows must leave over the Responses wire: gpt-5.6-luna
   * answers 400 to any /chat/completions request carrying function tools, and
   * the browser host always sends tools.
   */
  it('posts pi-ai OpenAI Responses bytes for a direct-OpenAI catalog model', async () => {
    let body: string | undefined;
    let headerNames: string[] | undefined;
    let path: string | undefined;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      path = new URL(input instanceof Request ? input.url : input).pathname;
      headerNames = [...new Headers(init?.headers).keys()];
      body = init?.body as string;
      return byteSplitResponse(authoritativeGatewayWireFixtures.openAiResponsesToolTurn);
    });

    const events = await collect(
      createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: fetchSpy }).stream(
        request({ providerKind: 'openai' }),
      ),
    );

    expect(path).toBe('/v1/llm/openai/v1/responses');
    // Same surviving header set as the completions wire, so apps/api's CORS
    // allow-list needs nothing new for this route.
    expect(headerNames).toEqual(['accept', 'content-type', 'user-agent']);
    expect(JSON.parse(body!)).toEqual({
      model: 'fixture-model',
      input: [
        { role: 'developer', content: 'static\n\nworkspace\n\ndynamic' },
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      ],
      stream: true,
      store: false,
      reasoning: { effort: 'none' },
      max_output_tokens: 8192,
      tools: [
        {
          type: 'function',
          name: 'read_file',
          description: 'Read a file.',
          parameters: {
            type: 'object',
            properties: { targetFile: { type: 'string' } },
            required: ['targetFile'],
            additionalProperties: false,
          },
        },
      ],
    });
    expect(events).toEqual([
      { type: 'tool-input', toolCallId: 'call-1|fc_1', toolName: 'read_file', input: { targetFile: 'main.ts' } },
      { type: 'message-metadata', metadata: { responseId: 'resp-fixture' } },
      { type: 'usage', usage: usage(7, 4, { cacheRead: 5, reasoning: 0 }) },
      { type: 'completed', stopReason: 'toolUse' },
    ]);
  });

  it('sends a bearer Authorization header when an auth provider is configured', async () => {
    let headers: Headers | undefined;
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return fixtureResponse();
    });
    const auth = vi.fn(async () => 'session-token');

    await collect(
      createGatewayModelTransport({ auth, baseUrl: 'https://gateway.example', fetch: fetchSpy }).stream(request()),
    );

    expect(auth).toHaveBeenCalledOnce();
    expect(headers?.get('authorization')).toBe('Bearer session-token');
    expect(headers?.has('x-api-key')).toBe(false);
  });

  it('strips the header again when the auth provider yields no token', async () => {
    let headers: Headers | undefined;
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return fixtureResponse();
    });

    await collect(
      createGatewayModelTransport({
        auth: () => undefined,
        baseUrl: 'https://gateway.example',
        fetch: fetchSpy,
      }).stream(request()),
    );

    expect(headers?.has('authorization')).toBe(false);
  });

  it('strips the bundled SDK telemetry headers the gateway CORS allow-list rejects', async () => {
    const seen: Array<readonly string[]> = [];
    const transportFor = (response: () => Response) =>
      createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          seen.push([...new Headers(init?.headers).keys()]);
          return response();
        }),
      });

    await collect(transportFor(fixtureResponse).stream(request()));
    await collect(
      transportFor(() => byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn)).stream(
        request({ providerKind: 'anthropic' }),
      ),
    );

    // Every surviving name must sit in apps/api's CORS allow-list
    // (apps/api/app/constants/http-header.constant.ts) or be CORS-safelisted.
    expect(seen).toEqual([
      ['accept', 'content-type', 'user-agent'],
      ['accept', 'anthropic-beta', 'anthropic-version', 'content-type', 'user-agent'],
    ]);
  });

  it('posts pi-ai native Anthropic cache bytes and maps every byte-split event type', async () => {
    let body: BodyInit | undefined;
    let headers: Headers | undefined;
    let path: string | undefined;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      path = new URL(input instanceof Request ? input.url : input).pathname;
      headers = new Headers(init?.headers);
      body = init?.body ?? undefined;
      return byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn);
    });

    const events = await collect(
      createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: fetchSpy }).stream(
        request({ providerKind: 'anthropic' }),
      ),
    );

    expect(path).toBe('/v1/llm/anthropic/v1/messages');
    expect(headers?.get('anthropic-version')).toBe('2023-06-01');
    expect(headers?.has('authorization')).toBe(false);
    expect(headers?.has('x-api-key')).toBe(false);
    // This binds SP-8's static/workspace/dynamic ordering to pi-ai's native
    // system/history/tool cache breakpoints without duplicating its codec.
    expect(body).toBe(
      String.raw`{"model":"fixture-model","messages":[{"role":"user","content":[{"type":"text","text":"hello","cache_control":{"type":"ephemeral"}}]}],"max_tokens":8192,"stream":true,"system":[{"type":"text","text":"static","cache_control":{"type":"ephemeral"}},{"type":"text","text":"workspace","cache_control":{"type":"ephemeral"}},{"type":"text","text":"dynamic"}],"tools":[{"name":"read_file","description":"Read a file.","eager_input_streaming":true,"input_schema":{"type":"object","properties":{"targetFile":{"type":"string"}},"required":["targetFile"]},"cache_control":{"type":"ephemeral"}}]}`,
    );
    expect(events).toEqual([
      { type: 'thinking-delta', text: 'think' },
      { type: 'thinking-delta', text: '', signature: 'sig-fixture' },
      { type: 'tool-input', toolCallId: 'call-1', toolName: 'read_file', input: { targetFile: 'main.ts' } },
      { type: 'message-metadata', metadata: { responseId: 'msg-fixture' } },
      {
        type: 'usage',
        usage: usage(7, 4, { cacheRead: 5, cacheWrite: 2, cacheWrite1h: 0 }),
      },
      { type: 'completed', stopReason: 'toolUse' },
    ]);
  });

  // Anthropic answers 400 `system.N: cache_control cannot be set for empty text
  // blocks` and `system: text content blocks must be non-empty`; the gateway
  // sanitizes that to an opaque 503, so the only place it can be caught is here.
  it('drops empty Anthropic system blocks instead of emitting a body the provider rejects', async () => {
    let body: { readonly system?: unknown } | undefined;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body)) as { readonly system?: unknown };
        return byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn);
      }),
    });

    await collect(
      transport.stream(
        request({
          providerKind: 'anthropic',
          // Exactly what the browser chat client emits when a project has no
          // workspace prompt: an empty middle block that still carries a breakpoint.
          systemPromptBlocks: [
            { type: 'text', text: 'static', cacheControl: { type: 'ephemeral' } },
            { type: 'text', text: '', cacheControl: { type: 'ephemeral' } },
            { type: 'text', text: 'dynamic' },
          ],
        }),
      ),
    );

    expect(body?.system).toEqual([
      { type: 'text', text: 'static', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'dynamic' },
    ]);
  });

  // `cache_control.scope` is not an Anthropic wire field: the provider answers
  // 400 `system.0.cache_control.ephemeral.scope: Extra inputs are not permitted`
  // with and without every beta the gateway allow-lists.
  it('never emits a cache-control scope on the Anthropic wire', async () => {
    let body: string | undefined;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = String(init?.body);
        return byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn);
      }),
    });

    await collect(
      transport.stream(
        request({
          providerKind: 'anthropic',
          systemPromptBlocks: createCachedSystemPromptBlocks({
            staticPrompt: 'static',
            workspacePrompt: 'workspace',
            dynamicPrompt: 'dynamic',
          }),
        }),
      ),
    );

    expect(body).not.toContain('scope');
  });

  it('reads a typed gateway code out of the flattened API error envelope', async () => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'Llm Gateway Error',
              code: 'UPSTREAM_REJECTED',
              message: 'The model provider rejected the request.',
              statusCode: 502,
            }),
            { status: 502, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });

    await expect(collect(transport.stream(request({ providerKind: 'anthropic' })))).rejects.toMatchObject({
      code: 'UPSTREAM_REJECTED',
      message: 'The model provider rejected the request.',
      status: 502,
    });
  });

  it('keeps reading the typed gateway envelope when the API preserves it', async () => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({ type: 'error', error: { type: 'MODEL_NOT_IN_CATALOG', message: 'Not available.' } }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });

    await expect(collect(transport.stream(request({ providerKind: 'anthropic' })))).rejects.toMatchObject({
      code: 'MODEL_NOT_IN_CATALOG',
      message: 'Not available.',
      status: 400,
    });
  });

  it('normalizes unpaired surrogates in replaced Anthropic system blocks', async () => {
    let body: unknown;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn);
      }),
    });

    await collect(
      transport.stream(
        request({
          providerKind: 'anthropic',
          systemPromptBlocks: [
            { type: 'text', text: 'static\uD800prompt' },
            { type: 'text', text: 'workspace' },
            { type: 'text', text: 'dynamic' },
          ],
        }),
      ),
    );

    expect(body).toMatchObject({ system: [{ text: 'static�prompt' }, { text: 'workspace' }, { text: 'dynamic' }] });
  });

  it('persists pi usage cost and reasoning through the session record and reducer', async () => {
    const cost = { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 2.5 };
    const transport = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192, cost },
      fetch: vi.fn(async () =>
        responseFromChunks([
          'data: {"id":"chatcmpl-priced","choices":[{"delta":{"content":"priced"}}]}\n\n',
          'data: {"id":"chatcmpl-priced","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":40,"prompt_tokens_details":{"cached_tokens":20},"completion_tokens_details":{"reasoning_tokens":10}}}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    });
    const file = createMemoryEventLogFile();
    const log = await file.open();
    const session = await createAgentSession({
      chatId: 'chat-priced',
      runId: 'run-priced',
      leaderEpoch: 'epoch-priced',
      systemPrompt: 'system',
      model: {
        id: 'fixture-model',
        providerKind: 'vertexai',
        contextWindow: 200_000,
        maxTokens: 8192,
        cost,
      },
      modelTransport: transport,
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: log,
      createId: () => 'assistant-priced',
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    await session.prompt({ id: 'turn-priced', role: 'user', content: 'price this turn' });

    const assistant = reduceEventLog(await log.read()).findLast((message) => message.role === 'assistant');
    expect(assistant?.metadata?.usage).toMatchObject({
      input: 80,
      output: 40,
      cacheRead: 20,
      reasoning: 10,
      cost: {
        input: 0.000_159_999_999_999_999_99,
        output: 0.000_319_999_999_999_999_97,
        cacheRead: 0.000_004_000_000_000_000_001,
        total: 0.000_483_999_999_999_999_95,
      },
    });
    await session.close();
  });

  it.runIf(process.env['TAU_RUN_LOCAL_SSE_FIXTURE'] === '1')('streams through a local HTTP SSE fixture', async () => {
    const server = createServer((incoming, response) => {
      incoming.resume();
      incoming.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        for (const chunk of sseFixture) {
          response.write(chunk);
        }
        response.end();
      });
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const { port } = server.address() as AddressInfo;
      await expect(
        collect(createGatewayModelTransport({ baseUrl: `http://127.0.0.1:${port}` }).stream(request())),
      ).resolves.toContainEqual({ type: 'completed', stopReason: 'toolUse' });
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });

  it.each(['INSUFFICIENT_CREDIT', 'MODEL_NOT_IN_CATALOG', 'RATE_LIMITED'] as const)(
    'surfaces %s as a typed transport failure',
    async (code) => {
      const transport = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: vi.fn(
          async () =>
            new Response(JSON.stringify({ type: 'error', error: { type: code, message: `fixture ${code}` } }), {
              status: 402,
              headers: { 'content-type': 'application/json' },
            }),
        ),
      });

      await expect(collect(transport.stream(request()))).rejects.toMatchObject({
        name: 'GatewayModelTransportError',
        code,
        message: `fixture ${code}`,
      });
    },
  );

  it('refuses a catalog-resolved provider whose wire is unsupported before fetch', async () => {
    const fetchSpy = vi.fn();
    const transport = createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: fetchSpy });

    await expect(collect(transport.stream(request({ providerKind: 'ollama' })))).rejects.toMatchObject({
      code: 'MODEL_PROVIDER_UNSUPPORTED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('round-trips pi-ai reasoning replay markers and provider response metadata', async () => {
    let body: unknown;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return responseFromChunks([
          'data: {"id":"chatcmpl-2","model":"upstream-model","choices":[{"delta":{"reasoning_content":"think"}}]}\n\n',
          'data: {"id":"chatcmpl-2","model":"upstream-model","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]);
      }),
    });

    const events = await collect(
      transport.stream(
        request({
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: 'prior', thinkingSignature: 'reasoning_content' },
                { type: 'text', text: 'previous' },
              ],
            },
          ],
        }),
      ),
    );

    expect(body).toMatchObject({ messages: [expect.anything(), { role: 'assistant' }] });
    const assistantWire = (body as { readonly messages: ReadonlyArray<Record<string, unknown>> }).messages[1];
    expect(assistantWire?.['reasoning_content']).toBe('prior');
    expect(events).toContainEqual({
      type: 'message-metadata',
      metadata: { responseId: 'chatcmpl-2', responseModel: 'upstream-model' },
    });
    expect(events).toContainEqual({ type: 'thinking-delta', text: 'think' });
    expect(events).toContainEqual({ type: 'thinking-delta', text: '', signature: 'reasoning_content' });
  });

  it('round-trips Anthropic thinking signatures and native tool blocks on the next request', async () => {
    let body: unknown;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return responseFromChunks([
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]);
      }),
    });

    await collect(
      transport.stream(
        request({
          providerKind: 'anthropic',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: 'prior', thinkingSignature: 'sig-1' },
                { type: 'text', text: 'checking' },
                { type: 'toolCall', id: 'call-1', name: 'read_file', arguments: { targetFile: 'main.ts' } },
              ],
            },
            {
              id: 'tool-input-1',
              role: 'tool-input',
              toolCallId: 'call-1',
              toolName: 'read_file',
              content: { targetFile: 'main.ts' },
            },
            {
              id: 'tool-output-1',
              role: 'tool-output',
              toolCallId: 'call-1',
              toolName: 'read_file',
              content: 'source',
              isError: false,
            },
          ],
        }),
      ),
    );

    expect(body).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'prior', signature: 'sig-1' },
            { type: 'text', text: 'checking' },
            { type: 'tool_use', id: 'call-1', name: 'read_file', input: { targetFile: 'main.ts' } },
          ],
        },
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic's provider wire uses snake_case.
          content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'source' }],
        },
      ],
    });
  });

  it('parses CRLF correctly at every byte boundary and joins multiline data fields', async () => {
    const frame =
      'event: message\r\ndata: {"choices":[\r\ndata: {"delta":{"content":"ok"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n';
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks([...frame])),
    });

    await expect(collect(transport.stream(request()))).resolves.toEqual([
      { type: 'text-delta', text: 'ok' },
      { type: 'usage', usage: usage(0, 0) },
      { type: 'completed', stopReason: 'stop' },
    ]);
  });

  it.each([
    [
      'an event:error frame',
      ['event: error\ndata: {"type":"error","error":{"type":"RATE_LIMITED","message":"slow down"}}\n\n'],
    ],
    ['an error envelope', ['data: {"type":"error","error":{"type":"PROVIDER_UNAVAILABLE","message":"offline"}}\n\n']],
  ] as const)('rejects %s instead of completing successfully', async (_label, chunks) => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(chunks)),
    });

    await expect(collect(transport.stream(request()))).rejects.toBeInstanceOf(Error);
  });

  it.each([
    [
      'an Anthropic error envelope',
      ['event: error\ndata: {"type":"error","error":{"type":"RATE_LIMITED","message":"slow down"}}\n\n'],
    ],
    [
      'Anthropic EOF before message_stop',
      [
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n',
      ],
    ],
  ] as const)('rejects %s as a typed failure', async (_label, chunks) => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(chunks)),
    });

    await expect(collect(transport.stream(request({ providerKind: 'anthropic' })))).rejects.toBeInstanceOf(Error);
  });

  it('rejects a non-SSE success body and EOF without a terminal marker', async () => {
    const wrongType = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(['{}'], 'application/json')),
    });
    const truncated = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'])),
    });

    await expect(collect(wrongType.stream(request()))).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(collect(truncated.stream(request()))).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('wraps response-body failures as NETWORK_ERROR without rewriting an abort', async () => {
    const failedBody = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.error(new TypeError('socket reset'));
      },
    });
    const network = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => new Response(failedBody, { headers: { 'content-type': 'text/event-stream' } })),
    });
    await expect(collect(network.stream(request()))).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    const operation = new AbortController();
    const abortedBody = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        operation.signal.addEventListener('abort', () => {
          controller.error(new DOMException('aborted', 'AbortError'));
        });
      },
    });
    const aborted = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => new Response(abortedBody, { headers: { 'content-type': 'text/event-stream' } })),
    });
    const collecting = collect(aborted.stream(request({ signal: operation.signal })));
    operation.abort();
    await expect(collecting).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('settles the usage received before cancellation, then rejects with AbortError', async () => {
    const operation = new AbortController();
    const encoder = new TextEncoder();
    let sent = false;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        if (sent) {
          return;
        }
        sent = true;
        controller.enqueue(
          encoder.encode(
            [
              'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":7,"output_tokens":0}}}\n\n',
              'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
              'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n',
            ].join(''),
          ),
        );
        operation.signal.addEventListener(
          'abort',
          () => {
            controller.error(new DOMException('aborted', 'AbortError'));
          },
          { once: true },
        );
      },
    });
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })),
    });
    const iterator = transport
      .stream(request({ providerKind: 'anthropic', signal: operation.signal }))
      [Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'text-delta', text: 'partial' },
    });
    operation.abort();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'usage', usage: usage(7, 0, { cacheWrite1h: 0 }) },
    });
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps unknown gateway codes distinct and maps 403 without claiming authentication failed', async () => {
    const unknown = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(JSON.stringify({ type: 'error', error: { type: 'NEW_GATEWAY_CODE', message: 'new' } }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    });

    await expect(collect(unknown.stream(request()))).rejects.toMatchObject({
      code: 'UNKNOWN_GATEWAY_ERROR',
      rawType: 'NEW_GATEWAY_CODE',
      status: 403,
    });

    const origin = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(JSON.stringify({ type: 'error', error: { type: 'ORIGIN_NOT_ALLOWED', message: 'origin' } }), {
            status: 403,
          }),
      ),
    });
    await expect(collect(origin.stream(request()))).rejects.toMatchObject({
      code: 'ORIGIN_NOT_ALLOWED',
      status: 403,
    });
  });
});
