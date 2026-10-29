import { describe, expect, it, vi } from 'vitest';
import type { ModelStreamEvent, ModelStreamRequest } from '#waist/ports.js';
import {
  createCachedSystemPromptBlocks,
  createGatewayModelTransport,
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

const fixtureResponse = (): Response => {
  const bytes = new TextEncoder().encode(authoritativeGatewayWireFixtures.toolTurn.join(''));
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
  children: RecordedSpan[];
};

/**
 * A parent span that records the tree built under it.
 *
 * The spans themselves are asserted once `model-observation.ts` is wired into
 * the three provider streams; until then this only has to be a usable span, so
 * the remaining cases can prove the seam is consulted and that configuring one
 * changes nothing a caller sees.
 *
 * @returns The root's recorded children and the span to pass as the parent.
 */
const recordingParent = (): { readonly spans: RecordedSpan[]; readonly parent: ModelTelemetryParent } => {
  const spans: RecordedSpan[] = [];
  const spanFor = (siblings: RecordedSpan[]): ModelTelemetryParent => {
    const node: RecordedSpan = { name: '', attributes: {}, children: [] };
    const span: ModelTelemetryParent = {
      async startSpan(options, callback) {
        const child: RecordedSpan = { name: options.name, attributes: { ...options.attributes }, children: [] };
        node.children.push(child);
        return callback(childSpan(child));
      },
      addLink: () => undefined,
      addEvent: () => undefined,
      setAttributes: (attributes) => {
        Object.assign(node.attributes, attributes);
      },
      setStatus: () => undefined,
    };
    siblings.push(node);
    return span;
  };
  const childSpan = (node: RecordedSpan): ModelTelemetryParent => ({
    async startSpan(options, callback) {
      const child: RecordedSpan = { name: options.name, attributes: { ...options.attributes }, children: [] };
      node.children.push(child);
      return callback(childSpan(child));
    },
    addLink: () => undefined,
    addEvent: () => undefined,
    setAttributes: (attributes) => {
      Object.assign(node.attributes, attributes);
    },
    setStatus: () => undefined,
  });
  return { spans, parent: spanFor(spans) };
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
