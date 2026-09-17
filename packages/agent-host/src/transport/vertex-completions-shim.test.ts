/* eslint-disable @typescript-eslint/naming-convention -- Vertex's OpenAI-compatible wire uses snake_case keys. */
import { describe, expect, it } from 'vitest';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type { AssistantMessageEvent, Context, Model } from '@earendil-works/pi-ai';
import type { ModelProviderKind } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest } from '#waist/ports.js';
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import { createVertexResponseShim, echoThoughtSignatures } from '#transport/vertex-completions-shim.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const signature = 'opaque-Gemini+/=signature';

const sse = (chunks: readonly unknown[]): string =>
  chunks.map((chunk) => `data: ${typeof chunk === 'string' ? chunk : JSON.stringify(chunk)}\n\n`).join('');

const geminiStream = sse([
  {
    id: 'c1',
    object: 'chat.completion.chunk',
    model: 'gemini',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: '<think>plan the cube</think>',
          extra_content: { google: { thought: true } },
        },
      },
    ],
  },
  {
    id: 'c1',
    object: 'chat.completion.chunk',
    model: 'gemini',
    choices: [{ index: 0, delta: { content: 'Building it now.' } }],
  },
  {
    id: 'c1',
    object: 'chat.completion.chunk',
    model: 'gemini',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'run', arguments: '{"a":1}' },
              extra_content: { google: { thought_signature: signature } },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'c1',
    object: 'chat.completion.chunk',
    model: 'gemini',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
  '[DONE]',
]);

const plainStream = sse([
  // Deliberately non-canonical spacing: a re-serialised line would not match.
  '{ "id": "c2", "choices": [ {"index": 0, "delta": {"role": "assistant", "content": "Hello."}} ] }',
  {
    id: 'c2',
    object: 'chat.completion.chunk',
    model: 'gpt',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [{ index: 0, id: 'call_plain', type: 'function', function: { name: 'run', arguments: '{}' } }],
        },
      },
    ],
  },
  {
    id: 'c2',
    object: 'chat.completion.chunk',
    model: 'gpt',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  },
  '[DONE]',
]);

/** Feed `text` through the shim in `cuts + 1` chunks split at absolute byte offsets. */
const throughShim = async (
  text: string,
  signatures: Map<string, string>,
  cuts: readonly number[] = [],
): Promise<string> => {
  const raw = encoder.encode(text);
  const offsets = [0, ...cuts, raw.byteLength];
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < offsets.length - 1; index++) {
        controller.enqueue(raw.slice(offsets[index], offsets[index + 1]));
      }
      controller.close();
    },
  });
  const reader = source.pipeThrough(createVertexResponseShim(signatures)).getReader();
  let out = '';
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    out += decoder.decode(next.value, { stream: true });
  }
  return out + decoder.decode();
};

const model = {
  id: 'gemini-fixture',
  name: 'gemini-fixture',
  provider: 'vertexai',
  api: 'openai-completions',
  baseUrl: 'http://127.0.0.1:9/v1',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 512,
  compat: { supportsDeveloperRole: false },
} as Model<'openai-completions'>;

const context: Context = {
  systemPrompt: 'CAD',
  messages: [{ role: 'user', content: 'make a cube', timestamp: Date.now() }],
  tools: [{ name: 'run', description: 'run', parameters: { type: 'object', properties: { a: { type: 'number' } } } }],
};

/** Stream the Gemini fixture through the shim and pi's unpatched completions codec. */
const streamThroughPi = async (options: {
  readonly signatures: Map<string, string>;
  readonly bodies: unknown[];
  readonly cuts?: readonly number[];
  readonly context: Context;
  readonly onPayload?: (payload: unknown) => unknown;
}): Promise<AssistantMessageEvent[]> => {
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    options.bodies.push(JSON.parse(String(init?.body)));
    const rewritten = await throughShim(geminiStream, options.signatures, options.cuts);
    return new Response(encoder.encode(rewritten), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof globalThis.fetch;
  const events: AssistantMessageEvent[] = [];
  for await (const event of openAICompletionsApi().stream(model, options.context, {
    apiKey: 'fixture',
    fetch: fetchImpl,
    maxRetries: 0,
    ...(options.onPayload === undefined ? {} : { onPayload: options.onPayload }),
  })) {
    events.push(event);
  }
  return events;
};

describe('createVertexResponseShim', () => {
  it('should route a Gemini thought delta into thinking without leaking its markers', async () => {
    const signatures = new Map<string, string>();
    const events = await streamThroughPi({ signatures, bodies: [], context });

    const thinking = events
      .filter((event) => event.type === 'thinking_delta')
      .map((event) => event.delta)
      .join('');
    const text = events
      .filter((event) => event.type === 'text_delta')
      .map((event) => event.delta)
      .join('');
    const done = events.find((event) => event.type === 'done');

    expect({ thinking, text, reason: done?.reason }).toEqual({
      thinking: 'plan the cube',
      text: 'Building it now.',
      reason: 'toolUse',
    });
    expect(done?.message.content).toContainEqual(
      expect.objectContaining({ type: 'toolCall', id: 'call_1', name: 'run' }),
    );
  });

  it('should capture a tool-call thought signature by call id and strip it from the wire', async () => {
    const signatures = new Map<string, string>();
    const rewritten = await throughShim(geminiStream, signatures);

    expect([...signatures]).toEqual([['call_1', signature]]);
    expect(rewritten).not.toContain('thought_signature');
    expect(rewritten).not.toContain('<think>');
  });

  it('should produce the same result when a chunk boundary splits a JSON object', async () => {
    const whole = new Map<string, string>();
    const split = new Map<string, string>();
    const raw = encoder.encode(geminiStream);
    const signatureOffset = geminiStream.indexOf('thought_signature');
    // Three cuts inside one JSON object: the middle chunk holds no newline at
    // all, so a shim that flushed per chunk would corrupt the stream.
    const cuts = [signatureOffset - 4, signatureOffset + 4, Math.floor(raw.byteLength / 3)].sort((a, b) => a - b);
    const events = await streamThroughPi({ signatures: split, bodies: [], context, cuts });

    expect(await throughShim(geminiStream, split, cuts)).toBe(await throughShim(geminiStream, whole));
    expect([...split]).toEqual([['call_1', signature]]);
    expect(
      events
        .filter((event) => event.type === 'thinking_delta')
        .map((event) => event.delta)
        .join(''),
    ).toBe('plan the cube');
  });

  it('should leave every non-Vertex provider stream unchanged through the gateway transport', async () => {
    const textFor = async (providerKind: ModelProviderKind): Promise<string> => {
      const transport = createGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model: { contextWindow: 200_000, maxTokens: 8192 },
        fetch: async () =>
          new Response(encoder.encode(geminiStream), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }),
      });
      const events: ModelStreamEvent[] = [];
      for await (const event of transport.stream({
        attemptId: 'attempt-shim-1',
        invocationPurpose: 'generation',
        modelId: 'fixture-model',
        providerKind,
        systemPrompt: 'CAD',
        messages: [{ id: 'user-1', role: 'user', content: 'make a cube' }],
        tools: [],
        signal: new AbortController().signal,
      } satisfies ModelStreamRequest)) {
        events.push(event);
      }
      return events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.text)
        .join('');
    };

    // Untouched bytes reach pi's codec, so Gemini's own markers stay in the text.
    expect(await textFor('cerebras')).toBe('<think>plan the cube</think>Building it now.');
    expect(await textFor('vertexai')).toBe('Building it now.');
  });

  it('should leave a stream with no thoughts and no signatures byte-identical', async () => {
    const signatures = new Map<string, string>();
    const cut = Math.floor(encoder.encode(plainStream).byteLength / 2);

    expect(await throughShim(plainStream, signatures, [cut])).toBe(plainStream);
    expect([...signatures]).toEqual([]);
  });
});

describe('echoThoughtSignatures', () => {
  it('should echo a captured signature onto the next request tool calls', async () => {
    const signatures = new Map<string, string>();
    const bodies: unknown[] = [];
    const first = await streamThroughPi({ signatures, bodies, context });
    const assistant = first.find((event) => event.type === 'done')!.message;
    const continuation: Context = {
      ...context,
      messages: [
        ...context.messages,
        {
          ...assistant,
          content: assistant.content.map((block) =>
            block.type === 'toolCall' ? { ...block, thoughtSignature: signatures.get(block.id) } : block,
          ),
        },
        {
          role: 'toolResult',
          toolCallId: 'call_1',
          toolName: 'run',
          content: [{ type: 'text', text: 'ok' }],
          isError: false,
          timestamp: Date.now(),
        },
      ],
    };
    bodies.length = 0;

    await streamThroughPi({
      signatures,
      bodies,
      context: continuation,
      onPayload: echoThoughtSignatures(continuation),
    });

    const sent = bodies[0] as { readonly messages: ReadonlyArray<Record<string, unknown>> };
    const echoed = sent.messages.flatMap((message) => (message['tool_calls'] as unknown[]) ?? []);
    expect(echoed).toContainEqual(
      expect.objectContaining({
        id: 'call_1',
        extra_content: { google: { thought_signature: signature } },
      }),
    );
  });

  it('should leave the payload unchanged when no tool call carries a signature', () => {
    expect(echoThoughtSignatures(context)({ messages: [{ role: 'user', content: 'hi' }] })).toBeUndefined();
  });
});
