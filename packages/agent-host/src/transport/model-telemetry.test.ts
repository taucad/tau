import { AI_TELEMETRY_SCHEMA } from '@earendil-works/pi-ai';
import { describe, expect, it, vi } from 'vitest';
import type { ModelStreamEvent, ModelStreamRequest } from '#waist/ports.js';
import {
  createCachedSystemPromptBlocks,
  createGatewayModelTransport,
  GatewayModelTransportError,
} from '#transport/gateway-model-transport.js';
import { modelTelemetryParent, modelTelemetrySubject } from '#transport/model-telemetry.js';
import type { ModelTelemetryParent, ModelTelemetrySeam, ModelTelemetrySubject } from '#transport/model-telemetry.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';

const request = (overrides: Partial<ModelStreamRequest> = {}): ModelStreamRequest => ({
  attemptId: 'attempt-fixture-1',
  chatId: 'chat-fixture-1',
  invocationPurpose: 'generation',
  modelId: 'fixture-model',
  providerKind: 'vertexai',
  maxTokens: 8192,
  systemPrompt: 'static\n\nworkspace\n\ndynamic',
  systemPromptBlocks: createCachedSystemPromptBlocks({
    staticPrompt: 'static',
    workspacePrompt: 'workspace',
    dynamicPrompt: 'dynamic',
  }),
  messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  tools: [],
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

const fixtureResponse = (frames: readonly string[] = authoritativeGatewayWireFixtures.toolTurn): Response => {
  const bytes = new TextEncoder().encode(frames.join(''));
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
};

/** One span the recorder observed, flattened to what the assertions care about. */
type RecordedSpan = {
  name: string;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; attributes?: Record<string, unknown> | undefined }>;
  status?: unknown;
  ended: boolean;
  children: RecordedSpan[];
};

/**
 * A parent span that records the tree built under it.
 *
 * @returns The parent's recorded children and the span to pass as the parent.
 */
const recordingParent = (): { readonly spans: RecordedSpan[]; readonly parent: ModelTelemetryParent } => {
  const spans: RecordedSpan[] = [];
  const spanFor = (node: RecordedSpan, siblings: RecordedSpan[]): ModelTelemetryParent => ({
    async startSpan(options, callback) {
      const child: RecordedSpan = {
        name: options.name,
        attributes: { ...options.attributes },
        events: [],
        ended: false,
        children: [],
      };
      siblings.push(child);
      try {
        return await callback(spanFor(child, child.children));
      } finally {
        child.ended = true;
      }
    },
    addLink: () => undefined,
    addEvent: (name, attributes) => {
      node.events.push({ name, ...(attributes === undefined ? {} : { attributes: { ...attributes } }) });
    },
    setAttributes: (attributes) => {
      Object.assign(node.attributes, attributes);
    },
    setStatus: (status) => {
      node.status = status;
    },
  });
  const root: RecordedSpan = { name: 'root', attributes: {}, events: [], ended: false, children: spans };
  return { spans, parent: spanFor(root, spans) };
};

/** Let the span's settle callback run: it ends on a microtask after the result. */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('modelTelemetrySubject', () => {
  it('carries the invocation identity and nothing the request also holds', () => {
    const subject = modelTelemetrySubject(request());

    expect(subject).toEqual({
      attemptId: 'attempt-fixture-1',
      chatId: 'chat-fixture-1',
      invocationPurpose: 'generation',
      modelId: 'fixture-model',
      providerKind: 'vertexai',
    });
  });

  it('omits the chat and provider a caller did not name rather than sending undefined', () => {
    const subject = modelTelemetrySubject(request({ chatId: undefined, providerKind: undefined }));

    expect(Object.hasOwn(subject, 'chatId')).toBe(false);
    expect(Object.hasOwn(subject, 'providerKind')).toBe(false);
  });
});

describe('modelTelemetryParent', () => {
  const subject = modelTelemetrySubject(request());

  it('answers nothing when no composition supplied a seam', () => {
    expect(modelTelemetryParent(undefined, subject)).toBeUndefined();
  });

  it('answers the span the seam gave, asked once with the subject', () => {
    const { parent } = recordingParent();
    const parentFor = vi.fn(() => parent);

    expect(modelTelemetryParent({ parentFor }, subject)).toBe(parent);
    expect(parentFor).toHaveBeenCalledExactlyOnceWith(subject);
  });

  it('answers nothing when the seam declines this invocation', () => {
    expect(modelTelemetryParent({ parentFor: () => undefined }, subject)).toBeUndefined();
  });

  it('answers nothing when the seam throws, so telemetry cannot fail a model call', () => {
    const seam: ModelTelemetrySeam = {
      parentFor: () => {
        throw new Error('composition fault');
      },
    };

    expect(() => modelTelemetryParent(seam, subject)).not.toThrow();
    expect(modelTelemetryParent(seam, subject)).toBeUndefined();
  });

  it('refuses an answer that is not a span rather than passing it to the provider', () => {
    const seam = { parentFor: () => 'not-a-span' } as unknown as ModelTelemetrySeam;

    expect(modelTelemetryParent(seam, subject)).toBeUndefined();
  });
});

describe('the gateway transport with a telemetry seam', () => {
  it('streams the same events whether or not a seam is configured', async () => {
    const { parent } = recordingParent();
    const base = {
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
    } as const;

    const untelemetered = await collect(
      createGatewayModelTransport({ ...base, fetch: vi.fn(async () => fixtureResponse()) }).stream(request()),
    );
    const telemetered = await collect(
      createGatewayModelTransport({
        ...base,
        fetch: vi.fn(async () => fixtureResponse()),
        telemetry: { parentFor: () => parent },
      }).stream(request()),
    );

    expect(telemetered).toEqual(untelemetered);
  });

  it('completes the model call when the seam throws', async () => {
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: vi.fn(async () => fixtureResponse()),
      telemetry: {
        parentFor: () => {
          throw new Error('composition fault');
        },
      },
    });

    await expect(collect(transport.stream(request()))).resolves.not.toHaveLength(0);
  });

  it('asks the seam once per invocation, with that invocation’s identity', async () => {
    const { parent } = recordingParent();
    const parentFor = vi.fn((_subject: ModelTelemetrySubject) => parent);
    const transport = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: vi.fn(async () => fixtureResponse()),
      telemetry: { parentFor },
    });

    await collect(transport.stream(request({ attemptId: 'attempt-a' })));
    await collect(transport.stream(request({ attemptId: 'attempt-b', invocationPurpose: 'compaction' })));

    expect(parentFor).toHaveBeenCalledTimes(2);
    expect(parentFor.mock.calls.map(([subject]) => [subject.attemptId, subject.invocationPurpose])).toEqual([
      ['attempt-a', 'generation'],
      ['attempt-b', 'compaction'],
    ]);
  });
});

describe('native model spans from the gateway transport', () => {
  const base = {
    baseUrl: 'https://gateway.example',
    model: { contextWindow: 200_000, maxTokens: 8192 },
  } as const;
  const telemetered = (parent: ModelTelemetryParent) =>
    createGatewayModelTransport({
      ...base,
      fetch: vi.fn(async () => fixtureResponse()),
      telemetry: { parentFor: () => parent },
    });

  it('writes one closed pi.ai.request span with identity, usage and the stop reason', async () => {
    const { spans, parent } = recordingParent();

    await collect(telemetered(parent).stream(request()));
    await flush();

    expect(spans).toHaveLength(1);
    const [span] = spans;
    expect(span).toMatchObject({
      name: 'pi.ai.request',
      ended: true,
      attributes: { model: 'fixture-model', stop: 'toolUse', 'usage.output': 4 },
    });
    expect(typeof span?.attributes['provider']).toBe('string');
    expect(typeof span?.attributes['api']).toBe('string');
    expect(span?.events.map((event) => event.name)).toEqual(['pi.ai.first_chunk', 'pi.ai.block', 'pi.ai.block']);
    expect(span?.events.slice(1).map((event) => event.attributes)).toEqual([
      { type: 'thinking', index: 0, chars: 'think'.length },
      { type: 'tool_call', index: 1, chars: '{"targetFile":"main.ts"}'.length, tool: 'read_file' },
    ]);
  });

  it('records lengths and names, never the reasoning, arguments or prompt', async () => {
    const { spans, parent } = recordingParent();

    await collect(telemetered(parent).stream(request()));
    await flush();

    const written = JSON.stringify(spans);
    for (const content of ['think"', 'main.ts', 'targetFile', 'hello', 'static', 'workspace', 'dynamic']) {
      expect(written).not.toContain(content);
    }
  });

  it('writes only span, event and attribute names pi declares in its telemetry schema', async () => {
    const { spans, parent } = recordingParent();

    await collect(telemetered(parent).stream(request({ reasoning: { effort: 'high' } })));
    await flush();

    const declared = AI_TELEMETRY_SCHEMA.spans['pi.ai.request'];
    const attributeNames = new Set([...Object.keys(declared.startAttributes), ...Object.keys(declared.endAttributes)]);
    for (const span of spans) {
      expect(Object.keys(AI_TELEMETRY_SCHEMA.spans)).toContain(span.name);
      for (const name of Object.keys(span.attributes)) {
        expect(attributeNames).toContain(name);
      }
      for (const event of span.events) {
        expect(Object.keys(declared.events)).toContain(event.name);
        const eventAttributes = Object.keys(declared.events[event.name as keyof typeof declared.events].attributes);
        for (const name of Object.keys(event.attributes ?? {})) {
          expect(eventAttributes).toContain(name);
        }
      }
    }
    expect(spans[0]?.attributes['reasoning']).toBe('high');
  });

  it('streams the same events and closes the span when the span throws on every event', async () => {
    const { spans, parent } = recordingParent();
    const faulty: ModelTelemetryParent = {
      ...parent,
      async startSpan(options, callback) {
        return parent.startSpan(options, async (span) =>
          callback({
            ...span,
            addEvent: () => {
              throw new Error('exporter fault');
            },
          }),
        );
      },
    };
    const untelemetered = await collect(
      createGatewayModelTransport({ ...base, fetch: vi.fn(async () => fixtureResponse()) }).stream(request()),
    );

    const observed = await collect(telemetered(faulty).stream(request()));
    await flush();

    expect(observed).toEqual(untelemetered);
    expect(spans.map((span) => span.ended)).toEqual([true]);
  });

  it('streams the same events when the parent refuses to start a span', async () => {
    const parent: ModelTelemetryParent = {
      ...recordingParent().parent,
      startSpan: async () => {
        throw new Error('span refused');
      },
    };
    const untelemetered = await collect(
      createGatewayModelTransport({ ...base, fetch: vi.fn(async () => fixtureResponse()) }).stream(request()),
    );

    await expect(collect(telemetered(parent).stream(request()))).resolves.toEqual(untelemetered);
  });

  it('closes the span when the caller stops reading before the result', async () => {
    const { spans, parent } = recordingParent();

    for await (const _event of telemetered(parent).stream(request())) {
      break;
    }
    await flush();

    expect(spans.map((span) => [span.name, span.ended, span.attributes['stop']])).toEqual([
      ['pi.ai.request', true, undefined],
    ]);
  });
});

/*
 * Provider-family parity: the three wires Tau speaks to its gateway. Each must
 * send the same request whether or not it is observed, write the same shape of
 * span, and leave retry with the gateway: one invocation, one fetch, one span.
 */
describe.each([
  { wire: 'Anthropic Messages', providerKind: 'anthropic', frames: authoritativeGatewayWireFixtures.anthropicToolTurn },
  {
    wire: 'OpenAI Responses',
    providerKind: 'openai',
    frames: authoritativeGatewayWireFixtures.openAiResponsesToolTurn,
  },
  { wire: 'OpenAI Completions', providerKind: 'vertexai', frames: authoritativeGatewayWireFixtures.toolTurn },
] as const)('native model spans on the $wire wire', ({ providerKind, frames }) => {
  const base = {
    baseUrl: 'https://gateway.example',
    model: { contextWindow: 200_000, maxTokens: 8192 },
  } as const;
  type Sent = { url: string; headers: Record<string, string>; body: string };
  const capturing = (respond: () => Response) => {
    const sent: Sent[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: input instanceof Request ? input.url : String(input),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: typeof init?.body === 'string' ? init.body : '',
      });
      return respond();
    });
    return { sent, fetch };
  };
  const run = async (respond: () => Response, parent?: ModelTelemetryParent) => {
    const { sent, fetch } = capturing(respond);
    const events: ModelStreamEvent[] = [];
    let failure: unknown;
    try {
      for await (const event of createGatewayModelTransport({
        ...base,
        fetch,
        ...(parent === undefined ? {} : { telemetry: { parentFor: () => parent } }),
      }).stream(request({ providerKind }))) {
        events.push(event);
      }
    } catch (error) {
      failure = error;
    }
    await flush();
    return { events, sent, failure };
  };

  it('sends the same request, with the same authentication and framing, when observed', async () => {
    const { parent } = recordingParent();

    const plain = await run(() => fixtureResponse(frames));
    const observed = await run(() => fixtureResponse(frames), parent);

    expect(observed.sent).toEqual(plain.sent);
    expect(observed.events).toEqual(plain.events);
  });

  it('writes one closed request span for the tool turn, naming the tool but not its arguments', async () => {
    const { spans, parent } = recordingParent();

    await run(() => fixtureResponse(frames), parent);

    expect(spans.map((span) => [span.name, span.ended, span.attributes['stop']])).toEqual([
      ['pi.ai.request', true, 'toolUse'],
    ]);
    expect(spans[0]?.attributes['usage.output']).toBeGreaterThan(0);
    expect(
      spans[0]?.events
        .filter((event) => event.attributes?.['type'] === 'tool_call')
        .map((event) => event.attributes?.['tool']),
    ).toEqual(['read_file']);
    expect(JSON.stringify(spans)).not.toContain('main.ts');
  });

  it('leaves retry with the gateway: a refused request is one fetch and one errored span', async () => {
    const { spans, parent } = recordingParent();
    const refused = () =>
      new Response(JSON.stringify({ error: { message: 'SYNTHETIC_REFUSAL_DETAIL' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });

    const plain = await run(refused);
    const observed = await run(refused, parent);

    /* The refusal reaches the caller as the same coded gateway error either way. */
    expect(plain.failure).toBeInstanceOf(GatewayModelTransportError);
    expect(observed.failure).toEqual(plain.failure);
    expect(observed.events).toEqual(plain.events);
    expect(observed.sent).toHaveLength(1);
    expect(plain.sent).toHaveLength(1);
    expect(spans.map((span) => [span.name, span.ended, span.attributes['stop']])).toEqual([
      ['pi.ai.request', true, 'error'],
    ]);
    expect(spans[0]?.status).toEqual({ status: 'error', error: { name: 'provider_error', message: 'provider_error' } });
    expect(JSON.stringify(spans)).not.toContain('SYNTHETIC_REFUSAL_DETAIL');
  });
});
