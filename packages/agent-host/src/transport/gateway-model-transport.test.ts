import { createHash } from 'node:crypto';
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
  GatewayModelTransportError,
} from '#transport/gateway-model-transport.js';
import type { GatewayModelTransportOptions } from '#transport/gateway-model-transport.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
import { stampedHistory } from '#transport/prefix-stamp.fixture.js';

const request = (overrides: Partial<ModelStreamRequest> = {}): ModelStreamRequest => ({
  attemptId: 'attempt-fixture-1',
  invocationPurpose: 'generation',
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

const isPrefixStamp = (event: ModelStreamEvent): boolean =>
  event.type === 'message-metadata' && event.metadata['prefix'] !== undefined;

/** The reply's events. The request's prefix stamp leads them and has its own cases, so it is left out here. */
/**
 * A request that continues a chat on the same model: its assistant rows carry the stamps their own requests left, so
 * their native reasoning is replayed (P2).
 *
 * @param overrides - What the request changes about the fixture request.
 * @returns The request, its history stamped.
 */
const continuing = async (overrides: Partial<ModelStreamRequest>): Promise<ModelStreamRequest> => {
  const next = request(overrides);
  return { ...next, messages: await stampedHistory(next) };
};

const collect = async (stream: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> => {
  const events: ModelStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events.filter((event) => !isPrefixStamp(event));
};

/** Read past the request's prefix stamp, which leads every generation stream. */
const skipPrefixStamp = async (iterator: AsyncIterator<ModelStreamEvent>): Promise<void> => {
  const first = await iterator.next();
  expect(first.done === true ? undefined : isPrefixStamp(first.value)).toBe(true);
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
  createTauCloudGatewayModelTransport({
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
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-tau-operation-id': 'operation-fixture-1',
      },
    },
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
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-tau-operation-id': 'operation-fixture-1',
      },
    },
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
    {
      status: 200,
      headers: {
        'content-type': contentType,
        'x-tau-operation-id': 'operation-fixture-1',
      },
    },
  );
};

/**
 * The headers one composition puts on the wire for one request.
 *
 * @param options - Per-composition transport options beyond the base URL.
 * @param overrides - Per-request fields under test.
 * @returns The headers the gateway was called with.
 */
const headersFor = async (
  options: Pick<GatewayModelTransportOptions, 'projectId' | 'hostLabels'> = {},
  overrides: Partial<ModelStreamRequest> = {},
): Promise<Headers> => {
  let headers: Headers | undefined;
  await collect(
    createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      ...options,
      fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        headers = new Headers(init?.headers);
        return fixtureResponse();
      }),
    }).stream(request(overrides)),
  );
  return headers!;
};

/**
 * The gateway's coded mid-stream failure frame, in the one shape it puts on the
 * wire. Only `code`, `message` and `details` vary between failures, so every
 * case below builds the frame here rather than restating the contract.
 *
 * @param code - Tau gateway code carried by the frame.
 * @param message - The provider's own sentence.
 * @param details - Structured fields belonging to the code.
 * @returns The frame's JSON payload.
 */
const tauGatewayFrame = (code: string, message: string, details?: Record<string, string>): string =>
  JSON.stringify({
    type: 'error',
    code,
    message,
    error: { type: 'tau_gateway', code, message, ...(details === undefined ? {} : { details }) },
  });

/**
 * Chunk a coded frame so the marker lands with the frame still open and the
 * payload only completes three chunks later: the guard has to withhold bytes
 * several pulls in a row before it can read the code.
 *
 * @param frame - The frame payload, from {@link tauGatewayFrame}.
 * @returns Relayed chunks ending with the frame's event boundary.
 */
const splitAcrossChunks = (frame: string): readonly string[] => {
  const marker = frame.indexOf('"type":"tau_gateway"') + '"type":"tau_gateway"'.length;
  const rest = frame.slice(marker);
  const third = Math.floor(rest.length / 3);
  return [
    'data: {"id":"chatcmpl-held","choices":[{"delta":{"content":"partial"}}]}\n\n',
    `event: error\ndata: ${frame.slice(0, marker)}`,
    rest.slice(0, third),
    rest.slice(third, third * 2),
    `${rest.slice(third * 2)}\n\n`,
  ];
};

/**
 * A fetch whose body behaves like a network one: chunks first, EOF only on a
 * later task, and an `AbortError` when the caller's own request is aborted.
 *
 * `responseFromChunks` closes in `start`, so the read after a terminal frame
 * returns `done` before the SDK can cancel the reader. A real body is still
 * open at that point, which is the shape that exposed the masking.
 *
 * @param chunks - SSE text delivered one chunk per pull.
 * @returns A fetch stub for the transport options.
 */
const openBodyFetch = (chunks: readonly string[]) =>
  vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const encoder = new TextEncoder();
    const signal = init?.signal ?? undefined;
    let index = 0;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        const chunk = chunks[index];
        if (chunk !== undefined) {
          index += 1;
          controller.enqueue(encoder.encode(chunk));
          return;
        }
        await new Promise<void>((resolve) => {
          const onAbort = (): void => {
            controller.error(new DOMException('The user aborted a request.', 'AbortError'));
            resolve();
          };
          signal?.addEventListener('abort', onAbort, { once: true });
          globalThis.setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            if (!signal?.aborted) {
              controller.close();
            }
            resolve();
          }, 0);
        });
      },
    });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-fixture-1' },
    });
  });

/** Every outbound tool call of a Vertex body as `[id, thought signature]`, in wire order. */
const toolCallSignatures = (body: unknown): ReadonlyArray<readonly [unknown, unknown]> =>
  ((body as { readonly messages?: ReadonlyArray<Record<string, unknown>> }).messages ?? [])
    .flatMap((message) => (message['tool_calls'] as Array<Record<string, unknown>> | undefined) ?? [])
    .map(
      (call) =>
        [
          call['id'],
          (call['extra_content'] as { readonly google?: { readonly thought_signature?: unknown } } | undefined)?.google
            ?.thought_signature,
        ] as const,
    );

const heldAnthropicResponse = () => {
  const encoder = new TextEncoder();
  const waiting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let sentStart = false;
  const response = new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        if (!sentStart) {
          sentStart = true;
          controller.enqueue(
            encoder.encode(
              'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-held","type":"message","role":"assistant","content":[],"model":"fixture-model","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n' +
                'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-held","name":"read_file","input":{}}}\n\n',
            ),
          );
          return;
        }
        waiting.resolve();
        await release.promise;
        controller.enqueue(
          encoder.encode(
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"targetFile\\":\\"main.ts\\"}"}}\n\n' +
              'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n' +
              'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":1}}\n\n' +
              'event: message_stop\ndata: {"type":"message_stop"}\n\n',
          ),
        );
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-tau-operation-id': 'operation-held-1',
      },
    },
  );
  return { response, release, waiting };
};

describe('createGatewayModelTransport', () => {
  it('uses no financial recovery or operation binding when cloud mode is off', async () => {
    const response = fixtureResponse();
    response.headers.delete('x-tau-operation-id');
    const transport = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => response),
      model: { contextWindow: 200_000, maxTokens: 8192 },
    });

    await expect(collect(transport.stream(request()))).resolves.not.toHaveLength(0);
    expect(transport.funding).toEqual({ type: 'unfunded' });
  });

  it('emits tool identity before held argument generation completes', async () => {
    const held = heldAnthropicResponse();
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => held.response),
    });
    const iterator = transport.stream(request({ providerKind: 'anthropic' }))[Symbol.asyncIterator]();
    // async-iife: bootstrap -- the read is left pending on purpose, so the test can race it against a timer.
    const first = (async () => {
      await skipPrefixStamp(iterator);
      return iterator.next();
    })();

    try {
      await held.waiting.promise;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      const observed = await Promise.race([
        first.then((event) => ({ kind: 'event', event }) as const),
        new Promise<{ readonly kind: 'blocked' }>((resolve) => {
          setTimeout(() => {
            resolve({ kind: 'blocked' });
          }, 100);
        }),
      ]);
      expect(observed).toEqual({
        kind: 'event',
        event: {
          done: false,
          value: {
            type: 'tool-input-start',
            contentIndex: 0,
            toolCallId: 'call-held',
            toolName: 'read_file',
          },
        },
      });
    } finally {
      held.release.resolve();
      await iterator.return?.();
    }
  });

  it('sends no Together reasoning object the gateway completions boundary would refuse', async () => {
    let body: unknown;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return fixtureResponse();
      }),
    });

    await collect(transport.stream(request({ providerKind: 'together' })));

    expect(body).not.toHaveProperty('reasoning');
  });

  it('posts pi-ai OpenAI Chat Completions bytes and maps a fragmented gateway SSE stream', async () => {
    let body: BodyInit | undefined;
    let credentials: string | undefined;
    let headers: Headers | undefined;
    let path: string | undefined;
    const bindings: unknown[] = [];
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      path = new URL(input instanceof Request ? input.url : input).pathname;
      credentials = init?.credentials;
      headers = new Headers(init?.headers);
      body = init?.body ?? undefined;
      return fixtureResponse();
    });

    const events = await collect(
      createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: fetchSpy,
      }).stream(
        request({
          onInvocationBound: async (binding) => {
            bindings.push(binding);
          },
        }),
      ),
    );

    expect(path).toBe('/v1/llm/openai/v1/chat/completions');
    expect(credentials).toBe('include');
    expect(headers?.has('authorization')).toBe(false);
    expect(headers?.has('x-api-key')).toBe(false);
    expect(headers?.get('x-tau-attempt-id')).toBe('attempt-fixture-1');
    expect(bindings).toEqual([{ operationId: 'operation-fixture-1' }]);
    /* OpenAI's system field has no per-block cache-control wire shape, so this
     * provider deliberately degrades to pi's blanket cacheRetention policy. The
     * request names no reasoning, so it carries no `extra_body` at all. */
    expect(body).toBe(
      String.raw`{"model":"fixture-model","messages":[{"role":"system","content":"static\n\nworkspace\n\ndynamic"},{"role":"user","content":"hello"}],"stream":true,"stream_options":{"include_usage":true},"store":false,"max_completion_tokens":8192,"tools":[{"type":"function","function":{"name":"read_file","description":"Read a file.","parameters":{"type":"object","properties":{"targetFile":{"type":"string"}},"required":["targetFile"],"additionalProperties":false}}}]}`,
    );
    expect(events).toEqual([
      { type: 'thinking-start', contentIndex: 0 },
      { type: 'thinking-delta', contentIndex: 0, text: 'think' },
      {
        type: 'tool-input-start',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
      },
      {
        type: 'tool-input-delta',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
        delta: '{"target',
      },
      {
        type: 'tool-input-delta',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
        delta: 'File":"main.ts"}',
      },
      { type: 'thinking-end', contentIndex: 0, content: 'think' },
      { type: 'thinking-signature', contentIndex: 0, signature: 'reasoning_content' },
      {
        type: 'tool-input',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
        input: { targetFile: 'main.ts' },
      },
      {
        type: 'usage',
        usage: usage(7, 4, { cacheRead: 5, reasoning: 0 }),
      },
      { type: 'completed', stopReason: 'toolUse' },
    ]);
  });

  it('maps Vertex thought-marked content to thinking events', async () => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () =>
        responseFromChunks([
          'data: {"id":"chatcmpl-thought","choices":[{"index":0,"delta":{"content":"<think>\\nplan ","extra_content":{"google":{"thought":true}}}}]}\n\n',
          'data: {"id":"chatcmpl-thought","choices":[{"index":0,"delta":{"content":"carefully","extra_content":{"google":{"thought":true}}}}]}\n\n',
          'data: {"id":"chatcmpl-thought","choices":[{"index":0,"delta":{"content":"</think>answer"}}]}\n\n',
          'data: {"id":"chatcmpl-thought","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    });

    const events = await collect(transport.stream(request()));

    expect(
      events
        .filter((event) => event.type === 'thinking-delta')
        .map((event) => event.text)
        .join(''),
    ).toBe('plan carefully');
    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.text)
        .join(''),
    ).toBe('answer');
    expect(events.map((event) => event.type)).toEqual([
      'thinking-start',
      'thinking-delta',
      'thinking-delta',
      'text-start',
      'text-delta',
      'thinking-end',
      'thinking-signature',
      'text-end',
      'message-metadata',
      'usage',
      'completed',
    ]);
  });

  it('should preserve a Vertex tool-call thought signature through durable replay', async () => {
    const signature = 'opaque-Gemini+/=signature';
    const bodies: unknown[] = [];
    let invocation = 0;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        invocation++;
        return invocation === 1
          ? responseFromChunks([
              `data: {"id":"chatcmpl-signed","model":"fixture-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-signed","type":"function","function":{"name":"read_file","arguments":"{\\"targetFile\\":\\"main.ts\\"}"},"extra_content":{"google":{"thought_signature":"${signature}"}}}]}}]}\n\n`,
              'data: {"id":"chatcmpl-signed","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
              'data: [DONE]\n\n',
            ])
          : responseFromChunks([
              'data: {"id":"chatcmpl-done","choices":[{"index":0,"delta":{"content":"done"}}]}\n\n',
              'data: {"id":"chatcmpl-done","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
              'data: [DONE]\n\n',
            ]);
      }),
    });
    const file = createMemoryEventLogFile();
    let id = 0;
    const createId = (): string => `signed-${id++}`;
    const createSession = async (runId: string) =>
      createAgentSession({
        chatId: 'chat-signed',
        runId,
        leaderEpoch: `epoch-${runId}`,
        systemPrompt: 'system',
        model: {
          id: 'fixture-model',
          providerKind: 'vertexai',
          contextWindow: 200_000,
        },
        modelTransport: transport,
        toolRegistry: {
          list: () => [
            {
              name: 'read_file',
              description: 'Read a file.',
              inputSchema: {
                type: 'object',
                properties: { targetFile: { type: 'string' } },
              },
            },
          ],
          invoke: async () => ({ content: 'source', isError: false }),
        },
        eventLog: await file.open(),
        createId,
      });

    const first = await createSession('run-signed-1');
    await first.prompt({
      id: 'turn-signed-1',
      role: 'user',
      content: 'read the file',
    });
    const firstSnapshot = await first.snapshot();
    expect(JSON.stringify(bodies[0])).toContain('"role":"system","content":"system"');
    expect(firstSnapshot.messages.find((message) => message.role === 'assistant')).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 'call-signed',
          name: 'read_file',
          arguments: { targetFile: 'main.ts' },
          thoughtSignature: signature,
        },
      ],
    });
    await first.close();

    const second = await createSession('run-signed-2');
    await second.prompt({
      id: 'turn-signed-2',
      role: 'user',
      content: 'continue',
    });
    await second.close();

    for (const body of bodies.slice(1)) {
      const { messages } = body as {
        readonly messages?: ReadonlyArray<Record<string, unknown>>;
      };
      const assistant = messages?.find((message) => message['role'] === 'assistant');
      const calls = assistant?.['tool_calls'];
      const signedCall = Array.isArray(calls)
        ? (calls as unknown[]).find(
            (candidate) =>
              typeof candidate === 'object' &&
              candidate !== null &&
              'id' in candidate &&
              candidate.id === 'call-signed',
          )
        : undefined;
      expect(signedCall).toMatchObject({
        id: 'call-signed',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Vertex's OpenAI-compatible wire uses snake_case.
        extra_content: { google: { thought_signature: signature } },
      });
    }
    expect(bodies).toHaveLength(3);
  });

  /*
   * Gemini validates the thought signature of the FIRST call of a parallel
   * batch and tolerates the rest unsigned (live T14–T17), so the echo has to
   * land on the right call even when two calls share a tool name.
   */
  it('should echo a Gemini thought signature onto the first call of a rehydrated parallel batch', async () => {
    const signature = 'opaque-Gemini+/=signature';
    let body: unknown;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return responseFromChunks([
          'data: {"id":"chatcmpl-done","choices":[{"index":0,"delta":{"content":"done"}}]}\n\n',
          'data: {"id":"chatcmpl-done","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]);
      }),
    });

    await collect(
      transport.stream(
        await continuing({
          messages: [
            { id: 'user-1', role: 'user', content: 'read both files' },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [
                {
                  type: 'toolCall',
                  id: 'call-a',
                  name: 'read_file',
                  arguments: { targetFile: 'a.ts' },
                  thoughtSignature: signature,
                },
                { type: 'toolCall', id: 'call-b', name: 'read_file', arguments: { targetFile: 'b.ts' } },
              ],
            },
            {
              id: 'tool-output-a',
              role: 'tool-output',
              toolCallId: 'call-a',
              toolName: 'read_file',
              content: 'a',
              isError: false,
            },
            {
              id: 'tool-output-b',
              role: 'tool-output',
              toolCallId: 'call-b',
              toolName: 'read_file',
              content: 'b',
              isError: false,
            },
          ],
        }),
      ),
    );

    expect(toolCallSignatures(body)).toEqual([
      ['call-a', signature],
      ['call-b', undefined],
    ]);
  });

  /*
   * A current-turn function call with no signature is a 400 on Vertex (live
   * T3/T5/T8/T13), which is what a foreign-provider history or a resume with a
   * switched model produces. Google accepts the documented dummy in its place
   * (T21). Calls in earlier, completed turns may stay unsigned (T23), so they
   * are left exactly as they are.
   */
  it('should sign only an unsigned current-turn Gemini tool call with the dummy validator', async () => {
    let body: unknown;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return responseFromChunks([
          'data: {"id":"chatcmpl-done","choices":[{"index":0,"delta":{"content":"done"}}]}\n\n',
          'data: {"id":"chatcmpl-done","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]);
      }),
    });

    await collect(
      transport.stream(
        request({
          messages: [
            { id: 'user-1', role: 'user', content: 'read a' },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'toolCall', id: 'call-old', name: 'read_file', arguments: { targetFile: 'a.ts' } }],
            },
            {
              id: 'tool-output-old',
              role: 'tool-output',
              toolCallId: 'call-old',
              toolName: 'read_file',
              content: 'a',
              isError: false,
            },
            { id: 'user-2', role: 'user', content: 'now read b and c' },
            {
              id: 'assistant-2',
              role: 'assistant',
              content: [
                { type: 'toolCall', id: 'call-new', name: 'read_file', arguments: { targetFile: 'b.ts' } },
                { type: 'toolCall', id: 'call-next', name: 'read_file', arguments: { targetFile: 'c.ts' } },
              ],
            },
            {
              id: 'tool-output-new',
              role: 'tool-output',
              toolCallId: 'call-new',
              toolName: 'read_file',
              content: 'b',
              isError: false,
            },
            {
              id: 'tool-output-next',
              role: 'tool-output',
              toolCallId: 'call-next',
              toolName: 'read_file',
              content: 'c',
              isError: false,
            },
          ],
        }),
      ),
    );

    expect(toolCallSignatures(body)).toEqual([
      ['call-old', undefined],
      ['call-new', 'skip_thought_signature_validator'],
      ['call-next', undefined],
    ]);
  });

  /*
   * The pi model's context window is the *request's*, not the transport's: a
   * host that configures no default row (every client names its own) must still
   * stream, and one whose request names none has nothing to run against.
   */
  it('takes the pi model context window from the request, not a configured default', async () => {
    const modelless = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => fixtureResponse()) as unknown as typeof globalThis.fetch,
    });

    await expect(collect(modelless.stream(request({ contextWindow: 200_000 })))).resolves.toContainEqual({
      type: 'completed',
      stopReason: 'toolUse',
    });
    await expect(collect(modelless.stream(request()))).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  describe('resolveInvocation (GI-S4)', () => {
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const resolverFor = (fetch: typeof globalThis.fetch, auth?: () => Promise<string | undefined>) => {
      const { funding } = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch,
        ...(auth === undefined ? {} : { auth }),
      });
      if (funding.type !== 'funded') {
        throw new Error('Tau Cloud transport must be funded');
      }
      return async (attemptId = 'attempt-fixture-1', signal = new AbortController().signal) =>
        funding.resolveInvocation({ attemptId, signal });
    };

    it('should report the charged amount when the attempt settled', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(new URL(input instanceof Request ? input.url : input).pathname).toBe(
          '/v1/billing/attempts/gateway/attempt-fixture-1',
        );
        expect(init?.method ?? 'GET').toBe('GET');
        return json({
          state: 'terminal',
          operationId: 'operation-fixture-1',
          receipt: { customerState: 'settled', chargedCreditAtoms: '1200', futureField: 'ignored' },
        });
      });

      await expect(resolverFor(fetchSpy)()).resolves.toEqual({
        status: 'terminal',
        operationId: 'operation-fixture-1',
        outcome: 'settled',
        chargedCreditAtoms: '1200',
      });
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('should report an unknown principal until the credential port supplies it', async () => {
      const { funding } = createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: vi.fn() });
      if (funding.type !== 'funded') {
        throw new Error('Tau Cloud transport must be funded');
      }
      await expect(funding.principal()).resolves.toBeUndefined();
    });

    it('should report a pending attempt without its operation', async () => {
      await expect(resolverFor(async () => json({ state: 'pending', operationId: 'operation-1' }))()).resolves.toEqual({
        status: 'pending',
      });
    });

    it('should report the settlement instant a pending attempt states (W2)', async () => {
      /* The API's default invocation deadline plus its recovery grace, from an admission at the epoch. */
      const settlesBy = new Date(300_000 + 5 * 60_000).toISOString();
      await expect(
        resolverFor(async () => json({ state: 'pending', operationId: 'operation-1', settlesBy }))(),
      ).resolves.toEqual({ status: 'pending', settlesBy });
    });

    it('should report a voided attempt when the gateway never admitted it', async () => {
      await expect(resolverFor(async () => json({ state: 'not_found', voided: true }))()).resolves.toEqual({
        status: 'voided',
      });
      // RV5-F3: a bare not_found comes from an image that did not void the key, so nothing is proved yet.
      await expect(resolverFor(async () => json({ state: 'not_found' }))()).resolves.toEqual({
        status: 'unavailable',
      });
    });

    it('should report unavailable when the lookup fails', async () => {
      await expect(
        resolverFor(async () => {
          throw new TypeError('fetch failed');
        })(),
      ).resolves.toEqual({ status: 'unavailable' });
      await expect(resolverFor(async () => json({ error: 'down' }, 503))()).resolves.toEqual({ status: 'unavailable' });
      await expect(
        resolverFor(async () => json({ state: 'unavailable', operationId: 'op', reason: 'authority_unavailable' }))(),
      ).resolves.toEqual({ status: 'unavailable' });
      const lookupDeadline = new AbortController();
      const timedOut = new DOMException('The operation timed out.', 'TimeoutError');
      lookupDeadline.abort(timedOut);
      await expect(
        resolverFor(async () => {
          throw timedOut;
        })('attempt-fixture-1', lookupDeadline.signal),
      ).resolves.toEqual({ status: 'unavailable' });
    });

    it('should answer unavailable when the lookup outlasts its 10 s bound (RA-Q5)', async () => {
      vi.useFakeTimers();
      try {
        let lookupSignal: AbortSignal | undefined;
        const answer = resolverFor(
          async (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              lookupSignal = init?.signal ?? undefined;
              lookupSignal?.addEventListener('abort', () => {
                reject(new DOMException('The operation timed out.', 'TimeoutError'));
              });
            }),
        )();
        await vi.advanceTimersByTimeAsync(9999);
        expect(lookupSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(answer).resolves.toEqual({ status: 'unavailable' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('should rethrow when the caller cancels the lookup', async () => {
      const cancelled = new AbortController();
      const reason = new DOMException('The operation was aborted.', 'AbortError');
      cancelled.abort(reason);
      await expect(
        resolverFor(async () => {
          throw reason;
        })('attempt-fixture-1', cancelled.signal),
      ).rejects.toBe(reason);
    });

    it('should resolve an attempt through a paired daemon', async () => {
      const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer device-credential');
        return json({ state: 'not_found', voided: true });
      });

      await expect(resolverFor(fetchSpy, async () => 'device-credential')()).resolves.toEqual({ status: 'voided' });
    });

    it('should map 401 to the auth code', async () => {
      await expect(
        resolverFor(async () => json({ type: 'error', error: { type: 'UNAUTHENTICATED' } }, 401))(),
      ).rejects.toMatchObject({ name: 'GatewayModelTransportError', code: 'UNAUTHENTICATED', status: 401 });
    });

    it('should carry a 403 refusal as its own code, never as a sign-in failure', async () => {
      const refused = async (body: unknown) => resolverFor(async () => json(body, 403))();
      await expect(
        refused({ type: 'error', error: { type: 'BILLING_ACCOUNT_CLOSED', message: 'closed' } }),
      ).rejects.toMatchObject({ code: 'BILLING_ACCOUNT_CLOSED', status: 403 });
      await expect(
        refused({ type: 'error', error: { type: 'ORIGIN_NOT_ALLOWED', message: 'origin' } }),
      ).rejects.toMatchObject({ code: 'ORIGIN_NOT_ALLOWED', status: 403 });
      await expect(
        refused({ type: 'error', error: { type: 'BILLING_ACCOUNT_RESTRICTED', message: 'restricted' } }),
      ).rejects.toMatchObject({ code: 'BILLING_ACCOUNT_RESTRICTED', status: 403 });
      await expect(refused({ message: 'Forbidden' })).rejects.toMatchObject({
        code: 'UNKNOWN_GATEWAY_ERROR',
        status: 403,
      });
    });

    it('should answer unavailable when the caller times out reading the body, and rethrow a cancel', async () => {
      const failingBody = (reason: DOMException): Response =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(reason);
            },
          }),
          { status: 200 },
        );
      const timedOut = new DOMException('The operation timed out.', 'TimeoutError');
      const deadline = new AbortController();
      deadline.abort(timedOut);
      await expect(
        resolverFor(async () => failingBody(timedOut))('attempt-fixture-1', deadline.signal),
      ).resolves.toEqual({ status: 'unavailable' });

      const cancelled = new DOMException('The operation was aborted.', 'AbortError');
      const cancel = new AbortController();
      cancel.abort(cancelled);
      await expect(resolverFor(async () => failingBody(cancelled))('attempt-fixture-1', cancel.signal)).rejects.toBe(
        cancelled,
      );
    });

    it('should refuse an answer this build cannot read as MALFORMED_RESPONSE', async () => {
      await expect(
        resolverFor(async () => json({ state: 'terminal', operationId: 'op', receipt: { customerState: 'maybe' } }))(),
      ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
      await expect(resolverFor(async () => new Response('<html>', { status: 200 }))()).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      });
    });
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
      createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: fetchSpy,
      }).stream(request({ providerKind: 'openai' })),
    );

    expect(path).toBe('/v1/llm/openai/v1/responses');
    // Same surviving header set as the completions wire, so apps/api's CORS
    // allow-list needs nothing new for this route.
    expect(headerNames).toEqual(['accept', 'content-type', 'user-agent', 'x-tau-attempt-id']);
    expect(JSON.parse(body!)).toEqual({
      model: 'fixture-model',
      input: [
        { role: 'developer', content: 'static\n\nworkspace\n\ndynamic' },
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      ],
      stream: true,
      store: false,
      reasoning: { effort: 'none' },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI's wire uses snake_case.
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
      {
        type: 'tool-input-start',
        contentIndex: 0,
        toolCallId: 'call-1|fc_1',
        toolName: 'read_file',
      },
      {
        type: 'tool-input-delta',
        contentIndex: 0,
        toolCallId: 'call-1|fc_1',
        toolName: 'read_file',
        delta: '{"target',
      },
      {
        type: 'tool-input-delta',
        contentIndex: 0,
        toolCallId: 'call-1|fc_1',
        toolName: 'read_file',
        delta: 'File":"main.ts"}',
      },
      {
        type: 'tool-input',
        contentIndex: 0,
        toolCallId: 'call-1|fc_1',
        toolName: 'read_file',
        input: { targetFile: 'main.ts' },
      },
      { type: 'message-metadata', metadata: { responseId: 'resp-fixture' } },
      { type: 'usage', usage: usage(7, 4, { cacheRead: 5, reasoning: 0 }) },
      { type: 'completed', stopReason: 'toolUse' },
    ]);
  });

  /* eslint-disable @typescript-eslint/naming-convention -- Frozen upstream provider wire keys use snake_case. */
  it.each([
    {
      name: 'OpenAI Responses',
      providerKind: 'openai',
      reasoning: { effort: 'high', summary: 'auto' },
      expectedPath: '/v1/llm/openai/v1/responses',
      expectedBody: { reasoning: { effort: 'high', summary: 'auto' } },
      response: authoritativeGatewayWireFixtures.openAiResponsesToolTurn,
    },
    {
      name: 'Anthropic Messages',
      providerKind: 'anthropic',
      reasoning: { effort: 'high', display: 'summarized' },
      expectedPath: '/v1/llm/anthropic/v1/messages',
      expectedBody: { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: 'high' } },
      response: authoritativeGatewayWireFixtures.anthropicToolTurn,
    },
    {
      name: 'Gemini OpenAI compatibility',
      providerKind: 'vertexai',
      reasoning: { effort: 'medium' },
      expectedPath: '/v1/llm/openai/v1/chat/completions',
      expectedBody: {
        extra_body: {
          google: {
            thinking_config: { include_thoughts: true, thinking_level: 'MEDIUM' },
            thought_tag_marker: 'think',
          },
        },
      },
      response: authoritativeGatewayWireFixtures.toolTurn,
    },
    {
      name: 'xAI Responses',
      providerKind: 'xai',
      reasoning: { effort: 'high', summary: 'auto' },
      expectedPath: '/v1/llm/openai/v1/responses',
      expectedBody: {
        reasoning: { effort: 'high', summary: 'auto' },
        include: ['reasoning.encrypted_content'],
      },
      response: authoritativeGatewayWireFixtures.openAiResponsesToolTurn,
    },
  ] as const)('sends the frozen $name reasoning and tool-stream controls', async (fixture) => {
    let body: unknown;
    let path: string | undefined;
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        path = new URL(input instanceof Request ? input.url : input).pathname;
        if (typeof init?.body !== 'string') {
          throw new TypeError('Expected a JSON request body.');
        }
        body = JSON.parse(init.body);
        return byteSplitResponse(fixture.response);
      }),
    });

    await collect(
      transport.stream(
        request({
          providerKind: fixture.providerKind,
          reasoning: fixture.reasoning,
        } as Partial<ModelStreamRequest>),
      ),
    );

    expect(path).toBe(fixture.expectedPath);
    expect(body).toMatchObject(fixture.expectedBody);
    /* No wire carries `stream_function_call_arguments`: Vertex cancels a turn
     * mid-stream whenever a streamed tool call closes a nested object on a
     * string value, which `apply_parameter_operation` does (T3-R). */
    expect(JSON.stringify(body)).not.toContain('stream_function_call_arguments');
  });
  /* eslint-enable @typescript-eslint/naming-convention -- End frozen provider wire fixture. */

  it('sends a bearer Authorization header when an auth provider is configured', async () => {
    let headers: Headers | undefined;
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return fixtureResponse();
    });
    const auth = vi.fn(async () => 'session-token');

    await collect(
      createGatewayModelTransport({
        auth,
        baseUrl: 'https://gateway.example',
        fetch: fetchSpy,
      }).stream(request()),
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

  it('names the project and chat a call belongs to, and sends neither when it has neither', async () => {
    /* The receipt is the only place spend can be attributed: without these the
     * `/usage` page can say nothing about which project or chat a turn belonged
     * to. The project is per-composition (one worker serves one project) and
     * the chat is per-request (one transport serves every chat in it). Absent,
     * not empty, when unknown — a `tau serve` workspace has no cloud project,
     * and the server would drop an unparseable hint anyway. */
    const both = await headersFor({ projectId: 'proj_fixture' }, { chatId: 'chat_fixture' });
    expect(both.get('x-tau-project-id')).toBe('proj_fixture');
    expect(both.get('x-tau-chat-id')).toBe('chat_fixture');

    const neither = await headersFor({});
    expect(neither.has('x-tau-project-id')).toBe(false);
    expect(neither.has('x-tau-chat-id')).toBe(false);

    // Each stands alone: a chat in a project with no cloud identity still names itself.
    const chatOnly = await headersFor({}, { chatId: 'chat_fixture' });
    expect(chatOnly.has('x-tau-project-id')).toBe(false);
    expect(chatOnly.get('x-tau-chat-id')).toBe('chat_fixture');
  });

  it('names a compaction call as compaction, and leaves an ordinary turn to the gateway default', async () => {
    /* `compaction` is a kind of its own in the billing wire
     * (`financialActivityKindSchema`), so a summarisation the person never
     * asked for reads as what it was instead of as their turn. Generation sends
     * nothing: the gateway's own default is `agent`, and a header repeating it
     * would be one more value to keep in step for no gain. The host has no
     * third purpose to map — `invocationPurpose` is exactly these two. */
    const compaction = await headersFor({}, { invocationPurpose: 'compaction' });
    expect(compaction.get('x-tau-activity')).toBe('compaction');

    const generation = await headersFor({}, { invocationPurpose: 'generation' });
    expect(generation.has('x-tau-activity')).toBe(false);
  });

  it('sends the turn labels as headers, the gap only when known, and nothing when the request has none', async () => {
    /* The gateway's turn-step series (`readTurnTelemetry` in apps/api) reads exactly these names and values. */
    const labelled = await headersFor({}, { turn: { step: 'first', gap: '5m_60m' } });
    expect(labelled.get('x-tau-turn-step')).toBe('first');
    expect(labelled.get('x-tau-turn-gap')).toBe('5m_60m');

    const continuation = await headersFor({}, { turn: { step: 'continuation', gap: 'first_turn' } });
    expect(continuation.get('x-tau-turn-step')).toBe('continuation');
    expect(continuation.get('x-tau-turn-gap')).toBe('first_turn');

    /* A gap the host could not read is left to the gateway, which records it as `unknown`. */
    const stepOnly = await headersFor({}, { turn: { step: 'continuation' } });
    expect(stepOnly.get('x-tau-turn-step')).toBe('continuation');
    expect(stepOnly.has('x-tau-turn-gap')).toBe(false);

    const none = await headersFor({});
    expect(none.has('x-tau-turn-step')).toBe(false);
    expect(none.has('x-tau-turn-gap')).toBe(false);
  });

  it('sends the host, build, kernel and model labels on every call once the composition names its host', async () => {
    /* LW17: the gateway reads exactly these names (`readHostLabels` in apps/api) and tags the API's provider fact with
     * them. The model label is the request's own route id, so a compaction call is labelled as well. */
    const labelled = await headersFor(
      { hostLabels: { kind: 'browser', build: '0123456789ab', kernel: 'replicad' } },
      { modelId: 'fixture-model' },
    );
    expect(labelled.get('x-tau-host-kind')).toBe('browser');
    expect(labelled.get('x-tau-host-build')).toBe('0123456789ab');
    expect(labelled.get('x-tau-kernel')).toBe('replicad');
    expect(labelled.get('x-tau-model')).toBe('fixture-model');

    const compaction = await headersFor({ hostLabels: { kind: 'desktop' } }, { invocationPurpose: 'compaction' });
    expect(compaction.get('x-tau-host-kind')).toBe('desktop');
    expect(compaction.get('x-tau-model')).toBe('fixture-model');
    /* A build or kernel the composition cannot name is left to the gateway, which then records no such label. */
    expect(compaction.has('x-tau-host-build')).toBe(false);
    expect(compaction.has('x-tau-kernel')).toBe(false);

    /* Server before client (I6): a composition that names no host sends none of the four, so a browser build never
     * reaches a gateway whose CORS allow-list predates them. */
    const unnamed = await headersFor({});
    for (const name of ['x-tau-host-kind', 'x-tau-host-build', 'x-tau-kernel', 'x-tau-model']) {
      expect(unnamed.has(name)).toBe(false);
    }
  });

  it('drops a host label a header cannot carry rather than failing the call', async () => {
    /* `Headers#set` throws on a control or non-Latin-1 character; a label is never worth a turn. */
    const headers = await headersFor({
      hostLabels: { kind: 'daemon', build: 'build\nwith-newline', kernel: 'k'.repeat(129) },
    });
    expect(headers.get('x-tau-host-kind')).toBe('daemon');
    expect(headers.has('x-tau-host-build')).toBe(false);
    expect(headers.has('x-tau-kernel')).toBe(false);
  });

  it('keeps the request body byte-identical with and without host labels', async () => {
    const bodies: string[] = [];
    const transportFor = (hostLabels?: GatewayModelTransportOptions['hostLabels']) =>
      createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        ...(hostLabels === undefined ? {} : { hostLabels }),
        fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          bodies.push(init?.body as string);
          return byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn);
        }),
      });
    await collect(transportFor().stream(request({ providerKind: 'anthropic', chatId: 'chat_fixture' })));
    await collect(
      transportFor({ kind: 'cloud', build: 'fedcba987654', kernel: 'openscad' }).stream(
        request({ providerKind: 'anthropic', chatId: 'chat_fixture' }),
      ),
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[0]).not.toMatch(/fedcba987654|openscad|x-tau-host/u);
  });

  it.each(['anthropic', 'openai', 'vertexai'] as const)(
    'keeps the %s request body byte-identical with and without turn labels',
    async (providerKind) => {
      /* The labels ride in headers only: the prompt bytes, the prompt-cache key and the billing request digest
       * (computed over the body) are what they would be without them (I4). */
      const responses = {
        anthropic: () => byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn),
        openai: () => byteSplitResponse(authoritativeGatewayWireFixtures.openAiResponsesToolTurn),
        vertexai: fixtureResponse,
      };
      const bodies: string[] = [];
      const transport = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          bodies.push(init?.body as string);
          return responses[providerKind]();
        }),
      });
      await collect(transport.stream(request({ providerKind, chatId: 'chat_fixture' })));
      await collect(
        transport.stream(request({ providerKind, chatId: 'chat_fixture', turn: { step: 'first', gap: 'gt_60m' } })),
      );
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toBe(bodies[0]);
      expect(bodies[0]).not.toMatch(/first|gt_60m|x-tau-turn/u);
    },
  );

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

    /* Every surviving name must sit in apps/api's CORS allow-list
     * (apps/api/app/constants/http-header.constant.ts) or be CORS-safelisted.
     * No project or chat hint here: this composition names no project and the
     * request no chat, which is how a `tau serve` workspace calls. */
    expect(seen).toEqual([
      ['accept', 'content-type', 'user-agent', 'x-tau-attempt-id'],
      ['accept', 'anthropic-version', 'content-type', 'user-agent', 'x-tau-attempt-id'],
    ]);

    /* A browser turn's full set: the chat hint and both turn labels join it, each in the CORS allow-list
     * (`httpHeader.xTauChatId`, `xTauTurnStep`, `xTauTurnGap`). */
    seen.length = 0;
    await collect(
      transportFor(() => byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn)).stream(
        request({ providerKind: 'anthropic', chatId: 'chat_fixture', turn: { step: 'continuation', gap: 'lt_5m' } }),
      ),
    );
    expect(seen).toEqual([
      [
        'accept',
        'anthropic-version',
        'content-type',
        'user-agent',
        'x-tau-attempt-id',
        'x-tau-chat-id',
        'x-tau-turn-gap',
        'x-tau-turn-step',
      ],
    ]);
  });

  it('posts no query parameter to the gateway, which refuses every one of them', async () => {
    const targets: string[] = [];
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        targets.push(input instanceof Request ? input.url : String(input));
        return byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn);
      }),
    });

    await collect(transport.stream(request({ providerKind: 'anthropic' })));

    /* An Anthropic messages call is posted by pi to `…/v1/messages?beta=true` whatever betas the request asks for, and
     * the gateway accepts no query input at all, because price and funded identity come from the body and an
     * allow-listed header set (`assertNoQuery` in apps/api). Left on, it answers 400 and no turn reaches a model. */
    expect(targets).toEqual(['https://gateway.example/v1/llm/anthropic/v1/messages']);
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
      createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: fetchSpy,
      }).stream(request({ providerKind: 'anthropic' })),
    );

    expect(path).toBe('/v1/llm/anthropic/v1/messages');
    expect(headers?.get('anthropic-version')).toBe('2023-06-01');
    expect(headers?.has('authorization')).toBe(false);
    expect(headers?.has('x-api-key')).toBe(false);
    // This binds SP-8's static/workspace/dynamic ordering to pi-ai's native
    // system/history/tool cache breakpoints without duplicating its codec.
    expect(body).toBe(
      String.raw`{"model":"fixture-model","messages":[{"role":"user","content":[{"type":"text","text":"hello","cache_control":{"type":"ephemeral","ttl":"1h"}}]}],"max_tokens":8192,"stream":true,"system":[{"type":"text","text":"static","cache_control":{"type":"ephemeral","ttl":"1h"}},{"type":"text","text":"workspace","cache_control":{"type":"ephemeral","ttl":"1h"}},{"type":"text","text":"dynamic"}],"tools":[{"name":"read_file","description":"Read a file.","eager_input_streaming":true,"input_schema":{"type":"object","properties":{"targetFile":{"type":"string"}},"required":["targetFile"]},"cache_control":{"type":"ephemeral","ttl":"1h"}}]}`,
    );
    expect(events).toEqual([
      { type: 'thinking-start', contentIndex: 0 },
      { type: 'thinking-delta', contentIndex: 0, text: 'think' },
      { type: 'thinking-end', contentIndex: 0, content: 'think' },
      { type: 'thinking-signature', contentIndex: 0, signature: 'sig-fixture' },
      {
        type: 'tool-input-start',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
      },
      {
        type: 'tool-input-delta',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
        delta: '{"target',
      },
      {
        type: 'tool-input-delta',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
        delta: 'File":"main.ts"}',
      },
      {
        type: 'tool-input',
        contentIndex: 1,
        toolCallId: 'call-1',
        toolName: 'read_file',
        input: { targetFile: 'main.ts' },
      },
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
            {
              type: 'text',
              text: 'static',
              cacheControl: { type: 'ephemeral' },
            },
            { type: 'text', text: '', cacheControl: { type: 'ephemeral' } },
            { type: 'text', text: 'dynamic' },
          ],
        }),
      ),
    );

    expect(body?.system).toEqual([
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic's wire uses snake_case.
      { type: 'text', text: 'static', cache_control: { type: 'ephemeral', ttl: '1h' } },
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

  describe('prompt-cache lifetime and routing', () => {
    type CacheControl = Readonly<Record<string, unknown>>;

    /** Every `cache_control` of an Anthropic body in the order Anthropic reads its prefix: tools, system, messages. */
    const anthropicBreakpoints = (body: Record<string, unknown>): readonly CacheControl[] => {
      const found: CacheControl[] = [];
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
          for (const item of value) {
            visit(item);
          }
          return;
        }
        if (typeof value !== 'object' || value === null) {
          return;
        }
        for (const [key, item] of Object.entries(value)) {
          if (key === 'cache_control') {
            found.push(item as CacheControl);
          } else {
            visit(item);
          }
        }
      };
      visit(body['tools']);
      visit(body['system']);
      visit(body['messages']);
      return found;
    };

    const bodyFor = async (overrides: Partial<ModelStreamRequest>): Promise<Record<string, unknown>> => {
      let body: Record<string, unknown> | undefined;
      const anthropic = overrides.providerKind === 'anthropic';
      const responses = overrides.providerKind === 'openai' || overrides.providerKind === 'xai';
      await collect(
        createGatewayModelTransport({
          baseUrl: 'https://gateway.example',
          fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            body = JSON.parse(init?.body as string) as Record<string, unknown>;
            return anthropic
              ? byteSplitResponse(authoritativeGatewayWireFixtures.anthropicToolTurn)
              : responses
                ? byteSplitResponse(authoritativeGatewayWireFixtures.openAiResponsesToolTurn)
                : fixtureResponse();
          }),
        }).stream(request(overrides)),
      );
      return body!;
    };

    /* Anthropic refuses a one-hour breakpoint after a five-minute one, and more than four of them. */
    const expectAdmissibleBreakpoints = (breakpoints: readonly CacheControl[]): void => {
      expect(breakpoints.length).toBeGreaterThan(0);
      expect(breakpoints.length).toBeLessThanOrEqual(4);
      const firstShort = breakpoints.findIndex((control) => control['ttl'] !== '1h');
      if (firstShort !== -1) {
        expect(breakpoints.slice(firstShort).every((control) => control['ttl'] !== '1h')).toBe(true);
      }
    };

    const generationShapes = [
      { name: 'one turn', overrides: {} },
      {
        name: 'a follow-up step with a tool result',
        overrides: {
          messages: [
            { id: 'user-1', role: 'user', content: 'hello' },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'toolCall', id: 'call-1', name: 'read_file', arguments: { targetFile: 'main.ts' } }],
              metadata: { api: 'anthropic-messages', provider: 'anthropic', model: 'fixture-model' },
            },
            {
              id: 'tool-1',
              role: 'tool-output',
              toolCallId: 'call-1',
              toolName: 'read_file',
              content: { text: 'export const main = 1;' },
              isError: false,
            },
          ],
        },
      },
      {
        name: 'more system breakpoints than Anthropic admits',
        overrides: {
          systemPromptBlocks: [
            { type: 'text', text: 'static', cacheControl: { type: 'ephemeral' } },
            { type: 'text', text: 'workspace', cacheControl: { type: 'ephemeral' } },
            { type: 'text', text: 'skills', cacheControl: { type: 'ephemeral' } },
            { type: 'text', text: 'dynamic' },
          ],
        },
      },
    ] as const satisfies ReadonlyArray<{ name: string; overrides: Partial<ModelStreamRequest> }>;

    it.each(generationShapes)('puts the one-hour lifetime on every Anthropic breakpoint of $name', async (shape) => {
      const body = await bodyFor({ providerKind: 'anthropic', chatId: 'chat_fixture', ...shape.overrides });

      const breakpoints = anthropicBreakpoints(body);
      expectAdmissibleBreakpoints(breakpoints);
      expect(breakpoints).toEqual(breakpoints.map(() => ({ type: 'ephemeral', ttl: '1h' })));
      // A hashed key is for the Responses wire only; Anthropic routes no conversation by it.
      expect(body).not.toHaveProperty('prompt_cache_key');
    });

    it('keeps the earliest system breakpoints when pi-ai has spent the rest', async () => {
      const body = await bodyFor({ providerKind: 'anthropic', ...generationShapes[2].overrides });

      // Tool and history take two of the four; the static prompt, which every chat shares, keeps its own.
      /* eslint-disable @typescript-eslint/naming-convention -- Anthropic's wire uses snake_case. */
      expect(body['system']).toEqual([
        { type: 'text', text: 'static', cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: 'workspace', cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: 'skills' },
        { type: 'text', text: 'dynamic' },
      ]);
      /* eslint-enable @typescript-eslint/naming-convention -- End Anthropic wire fixture. */
    });

    it('keeps a compaction on the five-minute default for every Anthropic breakpoint', async () => {
      /* The tail a compaction writes is replaced by its summary and never read
       * again within the hour, so it is not worth the one-hour write price. */
      const body = await bodyFor({ providerKind: 'anthropic', invocationPurpose: 'compaction' });

      const breakpoints = anthropicBreakpoints(body);
      expectAdmissibleBreakpoints(breakpoints);
      expect(breakpoints).toEqual(breakpoints.map(() => ({ type: 'ephemeral' })));
    });

    it.each(['openai', 'xai'] as const)(
      'routes a %s chat by its hashed id and hands the supplier no Tau id',
      async (providerKind) => {
        let headerNames: string[] | undefined;
        let body: Record<string, unknown> | undefined;
        const fetchFor = (): typeof globalThis.fetch =>
          vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            headerNames = [...new Headers(init?.headers).keys()];
            body = JSON.parse(init?.body as string) as Record<string, unknown>;
            return byteSplitResponse(authoritativeGatewayWireFixtures.openAiResponsesToolTurn);
          });

        await collect(
          createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: fetchFor() }).stream(
            request({ providerKind, chatId: 'chat_fixture' }),
          ),
        );

        const key = createHash('sha256').update('chat_fixture').digest('hex').slice(0, 32);
        expect(body?.['prompt_cache_key']).toBe(key);
        expect(JSON.stringify(body)).not.toContain('chat_fixture');
        // Retention stays the provider's own: the longer controls are refused or deprecated.
        expect(body).not.toHaveProperty('prompt_cache_retention');
        expect(body).not.toHaveProperty('prompt_cache_options');
        // The key rides the body only. pi-ai's `sessionId` would also stamp
        // `session_id` and `x-client-request-id`, which the CORS allow-list refuses.
        expect(headerNames).toEqual(['accept', 'content-type', 'user-agent', 'x-tau-attempt-id', 'x-tau-chat-id']);

        await collect(
          createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: fetchFor() }).stream(
            request({ providerKind }),
          ),
        );
        // A request with no chat has nothing to route by.
        expect(body).not.toHaveProperty('prompt_cache_key');
      },
    );

    it.each(['vertexai', 'cerebras', 'together', 'morph', 'moonshot'] as const)(
      'never puts a cache key or retention on a %s Completions body, which the gateway refuses',
      async (providerKind) => {
        const body = await bodyFor({ providerKind, chatId: 'chat_fixture' });

        expect(body).not.toHaveProperty('prompt_cache_key');
        expect(body).not.toHaveProperty('prompt_cache_retention');
        expect(JSON.stringify(body)).not.toContain('cache_control');
      },
    );
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
            JSON.stringify({
              type: 'error',
              error: {
                type: 'MODEL_NOT_IN_CATALOG',
                message: 'Not available.',
              },
            }),
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

    expect(body).toMatchObject({
      system: [{ text: 'static�prompt' }, { text: 'workspace' }, { text: 'dynamic' }],
    });
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
      toolRegistry: {
        list: () => [],
        invoke: async () => ({ content: null, isError: false }),
      },
      eventLog: log,
      createId: () => 'assistant-priced',
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    await session.prompt({
      id: 'turn-priced',
      role: 'user',
      content: 'price this turn',
    });

    const assistant = reduceEventLog(await log.read()).findLast((message) => message.role === 'assistant');
    expect(assistant?.metadata?.usage).toMatchObject({
      input: 80,
      output: 40,
      cacheRead: 20,
      reasoning: 10,
      cost: {
        input: 0.00015999999999999999,
        output: 0.00031999999999999997,
        cacheRead: 0.000004000000000000001,
        total: 0.00048399999999999995,
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
        collect(
          createGatewayModelTransport({
            baseUrl: `http://127.0.0.1:${port}`,
          }).stream(request()),
        ),
      ).resolves.toContainEqual({ type: 'completed', stopReason: 'toolUse' });
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });

  it.each([
    ['INSUFFICIENT_CREDIT', 402],
    ['MODEL_NOT_IN_CATALOG', 400],
    ['RATE_LIMITED', 429],
    ['FUNDED_OPERATION_LIMIT', 429],
    ['FUNDED_HELPER_LIMIT', 429],
    ['BILLING_RECOVERY_UNAVAILABLE', 503],
  ] as const)('surfaces %s as a typed transport failure', async (code, status) => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: code, message: `fixture ${code}` },
            }),
            {
              status,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    });

    await expect(collect(transport.stream(request()))).rejects.toMatchObject({
      name: 'GatewayModelTransportError',
      code,
      message: `fixture ${code}`,
      status,
    });
  });

  it('carries a credit denial shortfall off the 402 body', async () => {
    const details = {
      requiredCreditAtoms: '4244000',
      availableCreditAtoms: '300000',
      routeId: 'anthropic-claude-astra-5',
    };
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: 'INSUFFICIENT_CREDIT', message: 'Insufficient Tau credit.', details },
            }),
            { status: 402, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });

    await expect(collect(transport.stream(request()))).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDIT',
      status: 402,
      details,
    });
  });

  it('carries the gateway Retry-After into the refusal details', async () => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(JSON.stringify({ type: 'error', error: { type: 'FUNDED_OPERATION_LIMIT', message: 'Busy.' } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '30' },
          }),
      ),
    });

    await expect(collect(transport.stream(request()))).rejects.toMatchObject({
      code: 'FUNDED_OPERATION_LIMIT',
      status: 429,
      details: { retryAfterSeconds: 30 },
    });
  });

  it('refuses a catalog-resolved provider whose wire is unsupported before fetch', async () => {
    const fetchSpy = vi.fn();
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: fetchSpy,
    });

    await expect(collect(transport.stream(request({ providerKind: 'ollama' })))).rejects.toMatchObject({
      code: 'MODEL_PROVIDER_UNSUPPORTED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses unsupported Vertex xhigh reasoning before fetch', async () => {
    const fetchSpy = vi.fn();
    const transport = createGatewayModelTransport({ baseUrl: 'https://gateway.example', fetch: fetchSpy });

    await expect(
      collect(transport.stream(request({ providerKind: 'vertexai', reasoning: { effort: 'xhigh' } }))),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
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
        await continuing({
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking: 'prior',
                  thinkingSignature: 'reasoning_content',
                },
                { type: 'text', text: 'previous' },
              ],
            },
          ],
        }),
      ),
    );

    expect(body).toMatchObject({
      messages: [expect.anything(), { role: 'assistant' }],
    });
    const assistantWire = (body as { readonly messages: ReadonlyArray<Record<string, unknown>> }).messages[1];
    expect(assistantWire?.['reasoning_content']).toBe('prior');
    expect(events).toContainEqual({
      type: 'message-metadata',
      metadata: { responseId: 'chatcmpl-2', responseModel: 'upstream-model' },
    });
    expect(events).toContainEqual({ type: 'thinking-delta', contentIndex: 0, text: 'think' });
    expect(events).toContainEqual({
      type: 'thinking-signature',
      contentIndex: 0,
      signature: 'reasoning_content',
    });
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
        await continuing({
          providerKind: 'anthropic',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking: 'prior',
                  thinkingSignature: 'sig-1',
                },
                { type: 'text', text: 'checking' },
                {
                  type: 'toolCall',
                  id: 'call-1',
                  name: 'read_file',
                  arguments: { targetFile: 'main.ts' },
                },
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
            {
              type: 'tool_use',
              id: 'call-1',
              name: 'read_file',
              input: { targetFile: 'main.ts' },
            },
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

  describe('reasoning controls the catalog declares for a model', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- The provider wires asserted here use snake_case. */
    const anthropicReply = (start: Record<string, unknown> = {}): Response =>
      responseFromChunks([
        `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 }, ...start } })}\n\n`,
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    const sendAnthropic = async (
      overrides: Partial<ModelStreamRequest>,
      start?: Record<string, unknown>,
    ): Promise<{ body: Record<string, unknown>; beta: string | undefined; events: ModelStreamEvent[] }> => {
      let body: Record<string, unknown> = {};
      let beta: string | undefined;
      const transport = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          body = JSON.parse(init?.body as string) as Record<string, unknown>;
          beta = new Headers(init?.headers).get('anthropic-beta') ?? undefined;
          return anthropicReply(start);
        }),
      });
      const events = await collect(transport.stream(request({ providerKind: 'anthropic', ...overrides })));
      return { body, beta, events };
    };
    const bindingBeta = 'thinking-binding-controls-2026-08-01';
    const effortBeta = 'mid-conversation-output-config-2026-07-01';

    it('should send no binding control and no effort marker for a model that declares neither', async () => {
      const { body, beta } = await sendAnthropic({ reasoning: { effort: 'medium', display: 'summarized' } });

      expect(body['thinking']).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body).toMatchObject({ output_config: { effort: 'medium' } });
      expect(JSON.stringify(body['messages'])).not.toContain('"system"');
      expect(beta ?? '').not.toContain(bindingBeta);
      expect(beta ?? '').not.toContain(effortBeta);
    });

    it.each([
      ['drop', 'drop_block'],
      ['refuse', 'error'],
    ] as const)(
      'should tell Anthropic to %s a replayed block whose prefix changed, on a model with no transcript effort',
      async (replayBinding, behavior) => {
        const { body, beta } = await sendAnthropic({ reasoning: { effort: 'medium', replayBinding } });

        expect(body['thinking']).toMatchObject({
          type: 'adaptive',
          block_binding: { prefix_mismatch_behavior: behavior },
        });
        expect(body).toMatchObject({ output_config: { effort: 'medium' } });
        expect(beta?.split(',')).toContain(bindingBeta);
        expect(beta ?? '').not.toContain(effortBeta);
      },
    );

    it('should carry the effort in the transcript and pin the request field, for a model that reads it there', async () => {
      const { body, beta, events } = await sendAnthropic({
        reasoning: { effort: 'medium', display: 'summarized', effortInTranscript: true, replayBinding: 'refuse' },
      });

      /* The request field no longer moves with the level: that is what keeps the provider's cached messages. */
      expect(body).toMatchObject({ output_config: { effort: 'high' } });
      expect(body['thinking']).toEqual({
        type: 'adaptive',
        display: 'summarized',
        block_binding: { prefix_mismatch_behavior: 'error' },
      });
      expect(body['messages']).toEqual([
        expect.objectContaining({ role: 'user' }),
        { role: 'system', content: [], output_config: { effort: 'medium' } },
      ]);
      expect(beta?.split(',')).toEqual(expect.arrayContaining([bindingBeta, effortBeta]));
      /* The reply's row records the level it ran at, which the next request puts back in front of it. */
      expect(events).toContainEqual({
        type: 'message-metadata',
        metadata: expect.objectContaining({ reasoningLevel: 'medium' }) as unknown,
      });
    });

    it('should put a recorded level back in front of the reply that ran at it', async () => {
      const { body } = await sendAnthropic(
        await continuing({
          providerKind: 'anthropic',
          reasoning: { effort: 'low', effortInTranscript: true },
          messages: [
            { id: 'user-1', role: 'user', content: 'hello' },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text', text: 'hi' }],
              metadata: { reasoningLevel: 'high' },
            },
            { id: 'user-2', role: 'user', content: 'again' },
          ],
        }),
      );

      expect((body['messages'] as Array<{ role: string }>).map((message) => message.role)).toEqual([
        'user',
        'system',
        'assistant',
        'user',
        'system',
      ]);
      expect(body['messages']).toMatchObject([
        {},
        { role: 'system', output_config: { effort: 'high' } },
        {},
        {},
        { role: 'system', output_config: { effort: 'low' } },
      ]);
    });

    it('should carry the effort as a configuration update on the Responses wire, for an OpenAI model that reads it there', async () => {
      let body: Record<string, unknown> = {};
      const transport = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: vi.fn(async (_input, init) => {
          body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return responseFromChunks([
            'data: {"type":"response.completed","response":{"id":"resp-1","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
          ]);
        }),
      });

      await collect(
        transport.stream(
          request({ providerKind: 'openai', reasoning: { effort: 'high', summary: 'auto', effortInTranscript: true } }),
        ),
      );

      expect(body).toMatchObject({ reasoning: { effort: 'medium', summary: 'auto' } });
      expect((body['input'] as unknown[]).at(-1)).toEqual({
        type: 'configuration_update',
        reasoning: { effort: 'high' },
      });
    });

    it('should leave the effort on the request for xAI, whose Responses wire has no transcript form', async () => {
      let body: Record<string, unknown> = {};
      const transport = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: vi.fn(async (_input, init) => {
          body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return responseFromChunks([
            'data: {"type":"response.completed","response":{"id":"resp-1","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
          ]);
        }),
      });

      await collect(
        transport.stream(request({ providerKind: 'xai', reasoning: { effort: 'high', effortInTranscript: true } })),
      );

      expect(body).toMatchObject({ reasoning: { effort: 'high' } });
      expect(JSON.stringify(body['input'])).not.toContain('configuration_update');
    });

    it('should record the replayed blocks the provider itself left out, which the replay rule should have', async () => {
      const { events } = await sendAnthropic(
        { reasoning: { effort: 'medium', replayBinding: 'drop' } },
        {
          input_transformations: [
            { type: 'thinking_dropped', path: 'messages.1.content.0', reason: 'prefix_binding_mismatch' },
            { type: 'thinking_dropped', path: 'messages.3.content.0', reason: 'prefix_binding_mismatch' },
            /* Another model's block is not an edit, and a value this build does not know is not counted. */
            { type: 'thinking_dropped', path: 'messages.5.content.0', reason: 'model_binding_mismatch' },
            { type: 'something_new', path: 'messages.7.content.0', reason: 'prefix_binding_mismatch' },
          ],
        },
      );

      expect(events).toContainEqual({ type: 'message-metadata', metadata: { reasoningDroppedByProvider: 2 } });
    });

    it('should record nothing when the provider left nothing out', async () => {
      const { events } = await sendAnthropic(
        { reasoning: { effort: 'medium', replayBinding: 'drop' } },
        { input_transformations: [] },
      );

      expect(events.filter((event) => event.type === 'message-metadata' && !isPrefixStamp(event))).toEqual([]);
    });
    /* eslint-enable @typescript-eslint/naming-convention -- End provider wire assertions. */
  });

  it('parses CRLF correctly at every byte boundary and joins multiline data fields', async () => {
    const frame =
      'event: message\r\ndata: {"choices":[\r\ndata: {"delta":{"content":"ok"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n';
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks([...frame])),
    });

    await expect(collect(transport.stream(request()))).resolves.toEqual([
      { type: 'text-start', contentIndex: 0 },
      { type: 'text-delta', contentIndex: 0, text: 'ok' },
      { type: 'text-end', contentIndex: 0, content: 'ok' },
      { type: 'usage', usage: usage(0, 0) },
      { type: 'completed', stopReason: 'stop' },
    ]);
  });

  it.each([
    {
      label: 'an event:error frame',
      chunks: ['event: error\ndata: {"type":"error","error":{"type":"RATE_LIMITED","message":"slow down"}}\n\n'],
      code: 'PROVIDER_UNAVAILABLE',
      reason: 'slow down',
    },
    {
      label: 'an error envelope',
      chunks: ['data: {"type":"error","error":{"type":"PROVIDER_UNAVAILABLE","message":"offline"}}\n\n'],
      code: 'PROVIDER_UNAVAILABLE',
      reason: 'offline',
    },
  ] as const)('rejects $label with the provider reason', async ({ chunks, code, reason }) => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(chunks)),
    });

    // The provider's own sentence, never the body guard's own close.
    const failing = collect(transport.stream(request()));
    await expect(failing).rejects.toMatchObject({ code });
    await expect(failing).rejects.toThrow(reason);
  });

  it.each([
    {
      label: 'an Anthropic error envelope',
      chunks: ['event: error\ndata: {"type":"error","error":{"type":"RATE_LIMITED","message":"slow down"}}\n\n'],
      code: 'PROVIDER_UNAVAILABLE',
      reason: 'slow down',
    },
    {
      label: 'Anthropic EOF before message_stop',
      chunks: [
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n',
      ],
      code: 'MALFORMED_RESPONSE',
      reason: 'stream',
    },
  ] as const)('rejects $label as a typed failure', async ({ chunks, code, reason }) => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(chunks)),
    });

    const failing = collect(transport.stream(request({ providerKind: 'anthropic' })));
    await expect(failing).rejects.toMatchObject({ code });
    await expect(failing).rejects.toThrow(reason);
  });

  it.each([
    {
      label: 'response.failed',
      terminal:
        'event: response.failed\ndata: {"type":"response.failed","sequence_number":1,"response":{"id":"resp_1","object":"response","status":"failed","error":{"code":"server_error","message":"The server had an error while processing your request."},"output":[],"model":"fixture-model"}}\n\n',
      code: 'PROVIDER_UNAVAILABLE',
      reason: 'The server had an error while processing your request.',
    },
    {
      label: 'event: error naming the context window',
      terminal:
        'event: error\ndata: {"type":"error","sequence_number":1,"code":"context_length_exceeded","message":"Your input exceeds the context window of this model.","param":null}\n\n',
      code: 'INVALID_REQUEST',
      reason: 'Your input exceeds the context window of this model.',
    },
  ] as const)(
    'reports the provider reason for $label on a body still open past the terminal frame',
    async ({ terminal, code, reason }) => {
      /* The SDK cancels the reader from inside its own `for await` on a terminal
       * frame and aborts its request; the guard must not report either as a
       * network failure of its own. */
      const transport = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: openBodyFetch([
          'event: response.created\ndata: {"type":"response.created","sequence_number":0,"response":{"id":"resp_1","object":"response","status":"in_progress","output":[],"model":"fixture-model"}}\n\n',
          terminal,
        ]),
      });

      const failing = collect(transport.stream(request({ providerKind: 'openai' })));
      await expect(failing).rejects.toMatchObject({ code });
      await expect(failing).rejects.toThrow(reason);
    },
  );

  it('rejects a non-SSE success body and EOF without a terminal marker', async () => {
    const wrongType = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(['{}'], 'application/json')),
    });
    const truncated = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'])),
    });

    await expect(collect(wrongType.stream(request()))).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
    await expect(collect(truncated.stream(request()))).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('wraps response-body failures as NETWORK_ERROR without rewriting an abort', async () => {
    const failedBody = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.error(new TypeError('socket reset'));
      },
    });
    const network = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(failedBody, {
            headers: {
              'content-type': 'text/event-stream',
              'x-tau-operation-id': 'operation-fixture-1',
            },
          }),
      ),
    });
    await expect(collect(network.stream(request()))).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });

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
      fetch: vi.fn(
        async () =>
          new Response(abortedBody, {
            headers: {
              'content-type': 'text/event-stream',
              'x-tau-operation-id': 'operation-fixture-1',
            },
          }),
      ),
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
      fetch: vi.fn(
        async () =>
          new Response(body, {
            headers: {
              'content-type': 'text/event-stream',
              'x-tau-operation-id': 'operation-fixture-1',
            },
          }),
      ),
    });
    const iterator = transport
      .stream(request({ providerKind: 'anthropic', signal: operation.signal }))
      [Symbol.asyncIterator]();
    await skipPrefixStamp(iterator);
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'text-start', contentIndex: 0 },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'text-delta', contentIndex: 0, text: 'partial' },
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
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: 'NEW_GATEWAY_CODE', message: 'new' },
            }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' },
            },
          ),
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
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: 'ORIGIN_NOT_ALLOWED', message: 'origin' },
            }),
            {
              status: 403,
            },
          ),
      ),
    });
    await expect(collect(origin.stream(request()))).rejects.toMatchObject({
      code: 'ORIGIN_NOT_ALLOWED',
      status: 403,
    });
  });

  it('should preserve a closed-account 403 from the non-OK stream response', async () => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: 'BILLING_ACCOUNT_CLOSED', message: 'This Tau billing account is closed.' },
            }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });

    await expect(collect(transport.stream(request()))).rejects.toMatchObject({
      name: 'GatewayModelTransportError',
      code: 'BILLING_ACCOUNT_CLOSED',
      message: 'This Tau billing account is closed.',
      status: 403,
    });
  });

  /* The route and account denials (W6, W11a) cross the transport as the gateway sent them: the code and its details
   * decide the card, so neither may be reread from the status. */
  it.each([
    {
      code: 'MODEL_ROUTE_PAUSED',
      status: 503,
      message: "This model route is paused by Tau's operators.",
      details: { routeId: 'fixture-route' },
    },
    {
      code: 'BILLING_ACCOUNT_RESTRICTED',
      status: 403,
      message: 'This Tau billing account is restricted.',
      details: undefined,
    },
  ] as const)('should pass a $code refusal through with its code and details unchanged', async (refusal) => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: refusal.code,
                message: refusal.message,
                ...(refusal.details === undefined ? {} : { details: refusal.details }),
              },
            }),
            { status: refusal.status, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });

    const refused = collect(transport.stream(request()));
    await expect(refused).rejects.toBeInstanceOf(GatewayModelTransportError);
    await expect(refused).rejects.toMatchObject({
      name: 'GatewayModelTransportError',
      code: refusal.code,
      message: refusal.message,
      status: refusal.status,
      rawType: undefined,
    });
    await expect(refused).rejects.toHaveProperty('details', refusal.details);
  });

  it('should read an oversized request as REQUEST_TOO_LARGE, enveloped or bare', async () => {
    const enveloped = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: 'REQUEST_TOO_LARGE',
                message: 'Model request is larger than Tau accepts.',
                details: { maximumBytes: 32_000_000 },
              },
            }),
            { status: 413, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });
    await expect(collect(enveloped.stream(request()))).rejects.toMatchObject({
      code: 'REQUEST_TOO_LARGE',
      status: 413,
      details: { maximumBytes: 32_000_000 },
    });

    // A proxy in front of the gateway answers its own 413 with no Tau envelope.
    const bare = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => new Response('Payload Too Large', { status: 413 })),
    });
    await expect(collect(bare.stream(request()))).rejects.toMatchObject({
      code: 'REQUEST_TOO_LARGE',
      status: 413,
    });
  });

  it('should carry a provider-account refusal envelope off the 503 body', async () => {
    const details = {
      providerId: 'openai',
      providerCode: 'insufficient_quota',
      accountOwner: 'operator',
    };
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: 'PROVIDER_ACCOUNT_EXHAUSTED',
                message: 'You exceeded your current quota, please check your plan and billing details.',
                details,
              },
            }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          ),
      ),
    });

    await expect(collect(transport.stream(request()))).rejects.toMatchObject({
      name: 'GatewayModelTransportError',
      code: 'PROVIDER_ACCOUNT_EXHAUSTED',
      message: 'You exceeded your current quota, please check your plan and billing details.',
      status: 503,
      details,
    });
  });

  it('should end the run with the coded refusal when the gateway rewrites an in-stream error frame', async () => {
    const details = {
      providerId: 'anthropic',
      providerCode: 'credit_balance_exhausted',
      accountOwner: 'tau',
    };
    const message = "The model provider's account is unavailable.";
    const refusal = tauGatewayFrame('PROVIDER_ACCOUNT_EXHAUSTED', message, details);
    // The rewritten frame is split mid-payload: the marker lands in one chunk
    // and the refusal only becomes readable with the next one.
    const split = refusal.indexOf('"details"');
    const transport = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: vi.fn(async () =>
        responseFromChunks([
          'data: {"id":"chatcmpl-refused","choices":[{"delta":{"content":"partial"}}]}\n\n',
          `event: error\ndata: ${refusal.slice(0, split)}`,
          `${refusal.slice(split)}\n\n`,
        ]),
      ),
    });
    const file = createMemoryEventLogFile();
    const log = await file.open();
    const session = await createAgentSession({
      chatId: 'chat-refused',
      runId: 'run-refused',
      leaderEpoch: 'epoch-refused',
      systemPrompt: 'system',
      model: {
        id: 'fixture-model',
        providerKind: 'vertexai',
        contextWindow: 200_000,
        maxTokens: 8192,
      },
      modelTransport: transport,
      toolRegistry: {
        list: () => [],
        invoke: async () => ({ content: null, isError: false }),
      },
      eventLog: log,
      createId: () => 'assistant-refused',
      now: () => new Date('2026-09-19T00:00:00.000Z'),
    });

    await session.prompt({ id: 'turn-refused', role: 'user', content: 'run this turn' });

    const snapshot = await session.snapshot();
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure).toEqual({
      code: 'PROVIDER_ACCOUNT_EXHAUSTED',
      message,
      status: 200,
      details,
    });
    await session.close();
  });

  it.each([
    {
      label: 'a mid-stream rate limit',
      wireCode: 'RATE_LIMITED',
      message: 'Resource exhausted. Please try again later.',
      details: { providerId: 'vertexai', providerCode: 'RESOURCE_EXHAUSTED' },
      expected: { code: 'RATE_LIMITED', rawType: undefined },
    },
    {
      label: 'a code this client does not know yet',
      wireCode: 'GATEWAY_CODE_FROM_THE_FUTURE',
      message: 'The gateway ended this stream.',
      details: undefined,
      expected: { code: 'UNKNOWN_GATEWAY_ERROR', rawType: 'GATEWAY_CODE_FROM_THE_FUTURE' },
    },
  ])('should raise $label off a mid-stream Tau gateway frame', async ({ wireCode, message, details, expected }) => {
    /* The gateway rewrites every classified provider failure into this one
     * frame, not only an exhausted provider account — a live Vertex stream cut
     * by quota arrives as `RATE_LIMITED` mid-body. The code travels in
     * `error.code` and is mapped exactly as an error body's code is on the HTTP
     * path, so a code this build has never heard of degrades to
     * `UNKNOWN_GATEWAY_ERROR` with the wire code preserved. */
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () =>
        responseFromChunks([
          'data: {"id":"chatcmpl-cut","choices":[{"delta":{"content":"partial"}}]}\n\n',
          `event: error\ndata: ${tauGatewayFrame(wireCode, message, details)}\n\n`,
        ]),
      ),
    });

    await expect(collect(transport.stream(request()))).rejects.toMatchObject({
      name: 'GatewayModelTransportError',
      message,
      status: 200,
      details,
      ...expected,
    });
  });

  it.each([
    {
      label: 'a terminal frame missing its trailing blank line',
      chunks: ['data: {"id":"chatcmpl-1","choices":[{"delta":{},"finish_reason":"stop"}]}\n'],
    },
    {
      label: "Vertex's bare JSON 429 tail behind a 200",
      // Captured live: Vertex abandons SSE framing and appends a pretty-printed
      // JSON array, then closes the body cleanly. No `data:` prefix, so no
      // decoder in the chain dispatches it. Classifying it is the gateway's job
      // (it rewrites the tail into the Tau frame above); the client must not
      // guess at non-SSE trailing bytes, and says the stream was malformed.
      chunks: [
        'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"partial"}}]}\n\n',
        '\n[{\n  "error": {\n    "code": 429,\n    "message": "Resource exhausted. Please try again later.",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n]',
      ],
    },
  ])('should fail $label as a malformed response', async ({ chunks }) => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: vi.fn(async () => responseFromChunks(chunks)),
    });

    await expect(collect(transport.stream(request()))).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('should hand a complete Tau frame that is not a refusal to the SDK with the bytes held behind it', async () => {
    const transport = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: vi.fn(async () =>
        responseFromChunks([
          'data: {"id":"chatcmpl-tau","choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n',
          // The marker lands with the frame still open; the transport must
          // hold, then release these bytes once the frame proves harmless.
          'data: {"id":"chatcmpl-tau","type":"tau_gateway","choices":[{"index":0,"delta":{"content":" tail"}}]}',
          '\n\ndata: {"id":"chatcmpl-tau","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    });

    const events = await collect(transport.stream(request()));

    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.text)
        .join(''),
    ).toBe('partial tail');
    expect(events.at(-1)?.type).toBe('completed');
  });

  it.each([
    {
      label: 'a refusal',
      // The marker lands mid-payload and the refusal only becomes readable
      // three chunks later, so the guard withholds several times in a row.
      chunks: splitAcrossChunks(
        tauGatewayFrame('PROVIDER_ACCOUNT_EXHAUSTED', "The model provider's account is unavailable.", {
          providerId: 'anthropic',
          providerCode: 'credit_balance_exhausted',
          accountOwner: 'tau',
        }),
      ),
      outcome: 'PROVIDER_ACCOUNT_EXHAUSTED',
    },
    {
      // Same withholding, a different code: the guard must hold and raise on
      // any coded frame, not just the one it was written for.
      label: 'a rate limit',
      chunks: splitAcrossChunks(
        tauGatewayFrame('RATE_LIMITED', 'Resource exhausted. Please try again later.', {
          providerId: 'vertexai',
          providerCode: 'RESOURCE_EXHAUSTED',
        }),
      ),
      outcome: 'RATE_LIMITED',
    },
    {
      label: 'a complete Tau frame that is not a refusal',
      chunks: [
        'data: {"id":"chatcmpl-tau","choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n',
        'data: {"id":"chatcmpl-tau","type":"tau_gateway",',
        '"choices":[{"index":0,',
        '"delta":{"content":" tail"}}]}',
        '\n\ndata: {"id":"chatcmpl-tau","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ],
      outcome: 'partial tail',
    },
  ] as const)('settles $label whose marker frame spans several chunks', async ({ chunks, outcome }) => {
    /* A `pull` that only withholds delivers nothing, so the stream schedules no
     * further pull of its own: two withheld chunks in a row must not strand the
     * consumer's pending read. */
    const transport = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: vi.fn(async () => responseFromChunks(chunks)),
    });

    const settled = await Promise.race([
      collect(transport.stream(request())).then(
        (events) =>
          events
            .filter((event) => event.type === 'text-delta')
            .map((event) => event.text)
            .join(''),
        (error: unknown) => (error as { code?: string }).code ?? 'rejected',
      ),
      new Promise<'stalled'>((resolve) => {
        globalThis.setTimeout(() => {
          resolve('stalled');
        }, 500);
      }),
    ]);

    expect(settled).toBe(outcome);
  });

  it('should release the bytes held behind an unfinished Tau frame when the stream ends', async () => {
    /* A marker frame the body never terminated is not a refusal, so the healthy
     * frames that shared its chunks are still the SDK's. Dropping them at EOF
     * closes the stream clean and the turn dies as `Stream ended without
     * finish_reason` even though the terminal frame was on the wire. */
    const transport = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: vi.fn(async () =>
        responseFromChunks([
          'data: {"id":"chatcmpl-cut","choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n',
          'data: {"id":"chatcmpl-cut","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}' +
            '\n\ndata: {"id":"chatcmpl-cut","type":"tau_gateway"',
        ]),
      ),
    });

    const events = await collect(transport.stream(request()));

    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.text)
        .join(''),
    ).toBe('partial');
    expect(events.at(-1)).toEqual({ type: 'completed', stopReason: 'stop' });
  });

  it('preserves split UTF-8 bytes when releasing complete frames before an unfinished Tau marker', async () => {
    const text =
      'data: {"id":"unicode","choices":[{"index":0,"delta":{"content":"é"}}]}\n\n' +
      'data: {"id":"unicode","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
      'data: {"type":"tau_gateway"';
    const bytes = new TextEncoder().encode(text);
    const split = bytes.indexOf(0xc3) + 1;
    const transport = createGatewayModelTransportWithModel({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(bytes.slice(0, split));
                controller.enqueue(bytes.slice(split));
                controller.close();
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      ),
    });
    const events = await collect(transport.stream(request()));
    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.text)
        .join(''),
    ).toBe('é');
    expect(events.at(-1)).toEqual({ type: 'completed', stopReason: 'stop' });
  });

  it.each([
    { label: 'a Gemini tool turn', frames: authoritativeGatewayWireFixtures.toolTurn, providerKind: 'vertexai' },
    { label: 'a Gemini text turn', frames: authoritativeGatewayWireFixtures.browserTurn, providerKind: 'vertexai' },
    {
      label: 'a Responses tool turn',
      frames: authoritativeGatewayWireFixtures.openAiResponsesToolTurn,
      providerKind: 'openai',
    },
    {
      label: 'an Anthropic tool turn',
      frames: authoritativeGatewayWireFixtures.anthropicToolTurn,
      providerKind: 'anthropic',
    },
  ] as const)('should relay $label identically under every chunk partition', async ({ frames, providerKind }) => {
    /* A Gemini turn that died as `Stream ended without finish_reason` would look
     * exactly like a relay stage losing the terminal frame at a chunk boundary.
     * Replayed at every single byte split and at randomised multi-splits — inside
     * `data:` prefixes, between the two newlines of an event boundary and inside
     * multi-byte characters — the relayed events must not move. */
    const bytes = new TextEncoder().encode(frames.join(''));
    const relay = async (cuts: readonly number[]): Promise<ModelStreamEvent[]> => {
      const offsets = [0, ...cuts, bytes.byteLength];
      return collect(
        createGatewayModelTransport({
          baseUrl: 'https://gateway.example',
          fetch: vi.fn(
            async () =>
              new Response(
                new ReadableStream<Uint8Array<ArrayBuffer>>({
                  start(controller) {
                    for (let index = 0; index < offsets.length - 1; index += 1) {
                      controller.enqueue(bytes.slice(offsets[index], offsets[index + 1]));
                    }
                    controller.close();
                  },
                }),
                {
                  status: 200,
                  headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-fixture-1' },
                },
              ),
          ),
        }).stream(request({ providerKind })),
      );
    };
    const baseline = await relay([]);

    expect(baseline.at(-1)?.type).toBe('completed');
    for (let cut = 1; cut < bytes.byteLength; cut += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each partition is a separate stream run.
      expect(await relay([cut])).toEqual(baseline);
    }
    for (const stride of [1, 2, 3, 5, 7, 11, 13, 17, 29, 47, 101]) {
      const cuts = Array.from(
        { length: Math.ceil(bytes.byteLength / stride) - 1 },
        (_value, index) => (index + 1) * stride,
      );
      // oxlint-disable-next-line no-await-in-loop -- each partition is a separate stream run.
      expect(await relay(cuts)).toEqual(baseline);
    }
  });

  it('should leave a healthy Responses stream untouched while scanning for the refusal frame', async () => {
    const events = await collect(
      createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        fetch: vi.fn(async () => byteSplitResponse(authoritativeGatewayWireFixtures.openAiResponsesToolTurn)),
      }).stream(request({ providerKind: 'openai' })),
    );

    expect(events).toEqual([
      { type: 'tool-input-start', contentIndex: 0, toolCallId: 'call-1|fc_1', toolName: 'read_file' },
      {
        type: 'tool-input-delta',
        contentIndex: 0,
        toolCallId: 'call-1|fc_1',
        toolName: 'read_file',
        delta: '{"target',
      },
      {
        type: 'tool-input-delta',
        contentIndex: 0,
        toolCallId: 'call-1|fc_1',
        toolName: 'read_file',
        delta: 'File":"main.ts"}',
      },
      {
        type: 'tool-input',
        contentIndex: 0,
        toolCallId: 'call-1|fc_1',
        toolName: 'read_file',
        input: { targetFile: 'main.ts' },
      },
      { type: 'message-metadata', metadata: { responseId: 'resp-fixture' } },
      { type: 'usage', usage: usage(7, 4, { cacheRead: 5, reasoning: 0 }) },
      { type: 'completed', stopReason: 'toolUse' },
    ]);
  });
});
