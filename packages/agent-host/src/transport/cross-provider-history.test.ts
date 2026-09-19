/* eslint-disable @typescript-eslint/naming-convention -- Every provider wire asserted here uses snake_case keys. */
import { describe, expect, it, vi } from 'vitest';
import type { StopReason } from '@earendil-works/pi-ai';
import type { JsonObject, ModelProviderKind, ProviderMessage } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest } from '#waist/ports.js';
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';

/*
 * The cross-provider history contract (blueprint "Cross-Provider Contract").
 *
 * Every case drives the real gateway transport with a history recorded by
 * provider A and a request for provider B, and asserts B's outbound body. The
 * transform itself is pi-ai's `transformMessages` plus each codec's converter
 * (ruling Q6: no Tau-owned transform module); this suite pins what that
 * actually puts on the wire, so a pi upgrade or a Tau seam change that breaks a
 * switch fails here rather than live.
 */

const encoder = new TextEncoder();

const wireFamilies = ['anthropic', 'openai', 'vertexai', 'xai'] as const;
type WireFamily = (typeof wireFamilies)[number];

/**
 * The model id a same-provider switch carries end to end. Hermetic: the test
 * hands it in and asserts the same string comes back on the wire, so it reads
 * no catalog and does not track one — the 3.1 Pro row itself now routes to
 * `gemini-3.1-pro-preview-customtools`.
 */
const geminiSwitchModelId = 'gemini-3.1-pro-preview';

type Flavour = {
  /** The pi API the recording provider spoke. */
  readonly api: string;
  readonly modelId: string;
  /** Tool-call ids in this provider's own id shape. */
  readonly callIds: readonly [string, string];
  /** What the durable thinking block carries for this provider. */
  readonly thinkingSignature: string;
  /** Gemini's per-tool-call credential; no other wire mints one. */
  readonly thoughtSignature?: string;
  /** Strings that must never reach a different provider. */
  readonly secrets: readonly string[];
};

const flavours: Readonly<Record<WireFamily, Flavour>> = {
  anthropic: {
    api: 'anthropic-messages',
    modelId: 'claude-fixture-4',
    callIds: ['toolu_01FixtureAlpha', 'toolu_01FixtureBeta'],
    thinkingSignature: 'anthropic-signature-FIXTURE',
    secrets: ['anthropic-signature-FIXTURE'],
  },
  openai: {
    // Responses ids are `{call_id}|{item_id}` and long enough that Anthropic's
    // 64-character normalization actually truncates them.
    api: 'openai-responses',
    modelId: 'gpt-fixture-5',
    callIds: [
      'call_wTZc0Vs8hR9pA3kQ|fc_68d1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
      'call_pLm4Xq7bN2vY8sJd|fc_71e2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4',
    ],
    thinkingSignature: JSON.stringify({
      type: 'reasoning',
      id: 'rs_openai_FIXTURE',
      summary: [],
      encrypted_content: 'openai-encrypted-FIXTURE',
    }),
    secrets: ['openai-encrypted-FIXTURE', 'rs_openai_FIXTURE'],
  },
  vertexai: {
    api: 'openai-completions',
    modelId: 'gemini-3.7-flash',
    callIds: ['uMxj91xgFixture', 'Pv2kd81QFixture'],
    // What the Vertex shim plus pi's completions codec record for a Gemini thought.
    thinkingSignature: 'reasoning_content',
    thoughtSignature: 'gemini-thought-FIXTURE',
    secrets: ['gemini-thought-FIXTURE'],
  },
  xai: {
    api: 'openai-responses',
    modelId: 'grok-fixture-4',
    callIds: ['call_xaiA|fc_xaiA', 'call_xaiB|fc_xaiB'],
    thinkingSignature: JSON.stringify({
      type: 'reasoning',
      id: 'rs_xai_FIXTURE',
      summary: [],
      encrypted_content: 'xai-encrypted-FIXTURE',
    }),
    secrets: ['xai-encrypted-FIXTURE', 'rs_xai_FIXTURE'],
  },
};

/** Google's documented stand-in for a signature Tau does not hold (live T21). */
const dummyThoughtSignature = 'skip_thought_signature_validator';

const thinkingText = 'Weigh a through-hole against a blind pocket.';
const firstAssistantText = 'Reading the entry file first.';
const closingAssistantText = 'The entry file is tiny.';
const abortedAssistantText = 'Starting the cut';
const musingText = 'No further tool call is needed here.';
const toolOutputText = 'export const main = 1;';
const syntheticResultText = 'No result provided';

const variants = [
  'baseline',
  'parallel',
  'parallelResume',
  'midLoop',
  'orphan',
  'errored',
  'attachment',
  'thinkingOnly',
] as const;
type Variant = (typeof variants)[number];

/** Variants whose last assistant turn is still open, so its calls are the current turn. */
const resumeVariants = new Set<Variant>(['midLoop', 'parallelResume']);

const assistantMetadata = (source: WireFamily, stopReason: StopReason, timestamp: number) => ({
  provider: source,
  api: flavours[source].api,
  model: flavours[source].modelId,
  stopReason,
  timestamp,
});

const toolCallBlock = (source: WireFamily, index: 0 | 1, signed: boolean): JsonObject => {
  const flavour = flavours[source];
  return {
    type: 'toolCall',
    id: flavour.callIds[index],
    name: 'read_file',
    arguments: { targetFile: index === 0 ? 'main.ts' : 'part.ts' },
    ...(signed && flavour.thoughtSignature !== undefined ? { thoughtSignature: flavour.thoughtSignature } : {}),
  };
};

const toolOutput = (source: WireFamily, index: 0 | 1, timestamp: number): ProviderMessage => ({
  id: `tool-${index}`,
  role: 'tool-output',
  toolCallId: flavours[source].callIds[index],
  toolName: 'read_file',
  content: toolOutputText,
  isError: false,
  metadata: { timestamp },
});

/**
 * One provider-A-flavoured durable history in the shape Tau's reducer projects.
 *
 * Every variant shares a spine — user turn, an assistant turn carrying A's
 * native thinking credential plus a tool call, that call's result, a closing
 * assistant text and a fresh user turn — so any difference in B's outbound body
 * is attributable to the variant alone. Gemini signs only the first call of a
 * parallel batch, which is what Vertex validates (live T14–T17).
 *
 * @param source - The provider that produced the recorded assistant rows.
 * @param variant - Which history shape to build.
 * @returns Durable provider messages for a {@link ModelStreamRequest}.
 */
const historyFor = (source: WireFamily, variant: Variant): readonly ProviderMessage[] => {
  const flavour = flavours[source];
  const opening: ProviderMessage = {
    id: 'user-1',
    role: 'user',
    content:
      variant === 'attachment'
        ? [
            { type: 'text', text: 'design a cube from this sketch' },
            { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
          ]
        : 'design a cube with a cylinder cutout',
    metadata: { timestamp: 1 },
  };
  const parallel = variant === 'parallel' || variant === 'parallelResume';
  const calling: ProviderMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: thinkingText, thinkingSignature: flavour.thinkingSignature },
      { type: 'text', text: firstAssistantText },
      toolCallBlock(source, 0, true),
      ...(parallel ? [toolCallBlock(source, 1, false)] : []),
    ],
    metadata: assistantMetadata(source, 'toolUse', 2),
  };
  const results: readonly ProviderMessage[] = [
    toolOutput(source, 0, 3),
    ...(parallel ? [toolOutput(source, 1, 4)] : []),
  ];
  const closing: ProviderMessage = {
    id: 'assistant-2',
    role: 'assistant',
    content: [{ type: 'text', text: closingAssistantText }],
    metadata: assistantMetadata(source, 'stop', 5),
  };
  const followUp: ProviderMessage = {
    id: 'user-2',
    role: 'user',
    content: 'now add the hole',
    metadata: { timestamp: 6 },
  };
  if (variant === 'orphan') {
    // The call was never answered and the person typed again.
    return [opening, calling, followUp];
  }
  if (resumeVariants.has(variant)) {
    // A switch with the loop still open: B resumes from the tool result.
    return [opening, calling, ...results];
  }
  if (variant === 'thinkingOnly') {
    // A turn that thought and then said nothing: the only shape in Tau's history
    // that can reach a wire as a message with neither content nor tool calls.
    const musing: ProviderMessage = {
      id: 'assistant-musing',
      role: 'assistant',
      content: [{ type: 'thinking', thinking: musingText, thinkingSignature: flavour.thinkingSignature }],
      metadata: assistantMetadata(source, 'stop', 6),
    };
    return [opening, calling, ...results, closing, musing, followUp];
  }
  if (variant === 'errored') {
    const aborted: ProviderMessage = {
      id: 'assistant-aborted',
      role: 'assistant',
      content: [{ type: 'text', text: abortedAssistantText }, toolCallBlock(source, 1, true)],
      metadata: { ...assistantMetadata(source, 'aborted', 6), errorMessage: 'The operation was aborted.' },
    };
    return [opening, calling, ...results, closing, aborted, followUp];
  }
  return [opening, calling, ...results, closing, followUp];
};

const wireResponse = (target: WireFamily): Response => {
  const frames =
    target === 'anthropic'
      ? authoritativeGatewayWireFixtures.anthropicToolTurn
      : target === 'vertexai'
        ? authoritativeGatewayWireFixtures.toolTurn
        : authoritativeGatewayWireFixtures.openAiResponsesToolTurn;
  return new Response(encoder.encode(frames.join('')), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
};

type WireRecord = Record<string, unknown>;

/**
 * Drive the real gateway transport for target B over a history recorded by A.
 *
 * @param options - Recording provider, target provider, history variant and an optional target model override.
 * @returns The outbound request body B's wire received.
 */
const outboundBody = async (options: {
  readonly source: WireFamily;
  readonly target: WireFamily;
  readonly variant: Variant;
  readonly targetModelId?: string;
}): Promise<WireRecord> => {
  const bodies: WireRecord[] = [];
  const transport = createGatewayModelTransport({
    baseUrl: 'https://gateway.example',
    model: { contextWindow: 200_000, maxTokens: 8192 },
    fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(init?.body as string) as WireRecord);
      return wireResponse(options.target);
    }) as unknown as typeof globalThis.fetch,
  });
  const request: ModelStreamRequest = {
    attemptId: 'attempt-cross-provider-1',
    invocationPurpose: 'generation',
    modelId: options.targetModelId ?? flavours[options.target].modelId,
    providerKind: options.target as ModelProviderKind,
    maxTokens: 8192,
    contextWindow: 200_000,
    systemPrompt: 'CAD',
    messages: historyFor(options.source, options.variant),
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
    // Only Vertex reads a reasoning effort off this transport's `extra_body`.
    ...(options.target === 'vertexai' ? { reasoning: { effort: 'medium' } as const } : {}),
  };
  const events: ModelStreamEvent[] = [];
  for await (const event of transport.stream(request)) {
    events.push(event);
  }
  expect(bodies).toHaveLength(1);
  return bodies[0]!;
};

type WireItem = Record<string, unknown>;

/** One target wire's body reduced to the facts the contract constrains. */
type WireView = {
  /** Tool calls in wire order, with the per-call Gemini signature when present. */
  readonly calls: ReadonlyArray<{ readonly id: string; readonly position: number; readonly signature?: string }>;
  /** Tool results in wire order. */
  readonly results: ReadonlyArray<{ readonly id: string; readonly position: number }>;
  /** Every assistant-visible text B receives, concatenated. */
  readonly assistantText: string;
  /** Provider-native reasoning carriers (thinking blocks, reasoning items, `reasoning_content`). */
  readonly nativeReasoning: readonly WireItem[];
  /** Messages B's wire would reject for carrying no content at all. */
  readonly emptyMessages: readonly WireItem[];
  /** Roles in wire order, for ordering assertions. */
  readonly roles: readonly string[];
};

const blocksOf = (message: WireItem): readonly WireItem[] =>
  Array.isArray(message['content']) ? (message['content'] as WireItem[]) : [];

const isBlank = (value: unknown): boolean => typeof value !== 'string' || value.trim().length === 0;

const anthropicView = (body: WireRecord): WireView => {
  const messages = body['messages'] as WireItem[];
  const calls: Array<{ id: string; position: number; signature?: string }> = [];
  const results: Array<{ id: string; position: number }> = [];
  const nativeReasoning: WireItem[] = [];
  const emptyMessages: WireItem[] = [];
  let assistantText = '';
  for (const [position, message] of messages.entries()) {
    const blocks = blocksOf(message);
    if (blocks.length === 0 && isBlank(message['content'])) {
      emptyMessages.push(message);
    }
    for (const block of blocks) {
      if (block['type'] === 'tool_use') {
        calls.push({ id: block['id'] as string, position });
      }
      if (block['type'] === 'tool_result') {
        results.push({ id: block['tool_use_id'] as string, position });
      }
      if (block['type'] === 'thinking' || block['type'] === 'redacted_thinking') {
        nativeReasoning.push(block);
      }
      if (block['type'] === 'text' && message['role'] === 'assistant') {
        assistantText += block['text'] as string;
      }
      if (block['type'] === 'text' && isBlank(block['text'])) {
        emptyMessages.push(message);
      }
    }
  }
  return {
    calls,
    results,
    assistantText,
    nativeReasoning,
    emptyMessages,
    roles: messages.map((message) => message['role'] as string),
  };
};

const completionsView = (body: WireRecord): WireView => {
  const messages = body['messages'] as WireItem[];
  const calls: Array<{ id: string; position: number; signature?: string }> = [];
  const results: Array<{ id: string; position: number }> = [];
  const nativeReasoning: WireItem[] = [];
  const emptyMessages: WireItem[] = [];
  let assistantText = '';
  for (const [position, message] of messages.entries()) {
    const toolCalls = (message['tool_calls'] as WireItem[] | undefined) ?? [];
    for (const call of toolCalls) {
      const signature = (call['extra_content'] as { google?: { thought_signature?: string } } | undefined)?.google
        ?.thought_signature;
      calls.push({ id: call['id'] as string, position, ...(signature === undefined ? {} : { signature }) });
    }
    if (message['role'] === 'tool') {
      results.push({ id: message['tool_call_id'] as string, position });
      if (isBlank(message['content'])) {
        emptyMessages.push(message);
      }
    }
    if (message['role'] === 'assistant') {
      if (typeof message['content'] === 'string') {
        assistantText += message['content'];
      }
      if (message['reasoning_content'] !== undefined || message['reasoning_details'] !== undefined) {
        nativeReasoning.push(message);
      }
      if (isBlank(message['content']) && toolCalls.length === 0) {
        emptyMessages.push(message);
      }
    }
  }
  return {
    calls,
    results,
    assistantText,
    nativeReasoning,
    emptyMessages,
    roles: messages.map((message) => message['role'] as string),
  };
};

const responsesView = (body: WireRecord): WireView => {
  const items = body['input'] as WireItem[];
  const calls: Array<{ id: string; position: number; signature?: string }> = [];
  const results: Array<{ id: string; position: number }> = [];
  const nativeReasoning: WireItem[] = [];
  const emptyMessages: WireItem[] = [];
  let assistantText = '';
  for (const [position, item] of items.entries()) {
    if (item['type'] === 'function_call') {
      calls.push({ id: item['call_id'] as string, position });
    }
    if (item['type'] === 'function_call_output') {
      results.push({ id: item['call_id'] as string, position });
    }
    if (item['type'] === 'reasoning') {
      nativeReasoning.push(item);
    }
    if (item['type'] === 'message' && item['role'] === 'assistant') {
      const parts = blocksOf(item);
      if (parts.length === 0) {
        emptyMessages.push(item);
      }
      for (const part of parts) {
        assistantText += (part['text'] as string | undefined) ?? '';
        if (isBlank(part['text'])) {
          emptyMessages.push(item);
        }
      }
    }
  }
  return {
    calls,
    results,
    assistantText,
    nativeReasoning,
    emptyMessages,
    roles: items.map((item) => (item['type'] as string | undefined) ?? `role:${item['role'] as string}`),
  };
};

const viewOf = (target: WireFamily, body: WireRecord): WireView =>
  target === 'anthropic' ? anthropicView(body) : target === 'vertexai' ? completionsView(body) : responsesView(body);

/** Every tool-call id a target accepts. Anthropic's is the strictest of the three. */
const idPatternFor = (target: WireFamily): RegExp =>
  target === 'vertexai' ? /^[\w-]{1,128}$/u : /^[a-zA-Z0-9_-]{1,64}$/u;

const pairs = wireFamilies.flatMap((source) => wireFamilies.map((target) => ({ source, target })));
const crossProviderPairs = pairs.filter(({ source, target }) => source !== target);
const cases = pairs.flatMap((pair) => variants.map((variant) => ({ ...pair, variant })));

describe('cross-provider history contract', () => {
  describe('every ordered pair and history shape', () => {
    it.each(cases)(
      'should hand $target a closed, credential-free loop from $source history ($variant)',
      async ({ source, target, variant }) => {
        const body = await outboundBody({ source, target, variant });
        const view = viewOf(target, body);
        const serialized = JSON.stringify(body);

        // Every call is answered and every result answers a call, in that order.
        expect(view.calls.map((call) => call.id)).toEqual(view.results.map((result) => result.id));
        for (const [index, call] of view.calls.entries()) {
          expect(view.results[index]!.position).toBeGreaterThan(call.position);
          expect(call.id).toMatch(idPatternFor(target));
        }
        // No message B's wire would refuse for carrying nothing.
        expect(view.emptyMessages).toEqual([]);
        // Gemini streams tool arguments in four deltas instead of one; no other
        // wire has the key, and history rebuilding must not move it between them.
        expect(serialized.includes('stream_function_call_arguments')).toBe(target === 'vertexai');
        // Gemini's per-call credential exists on no other wire.
        if (target !== 'vertexai') {
          expect(serialized).not.toContain('thought_signature');
        }
        // A credential minted by another provider never reaches this one.
        if (source !== target) {
          for (const secret of flavours[source].secrets) {
            expect(serialized).not.toContain(secret);
          }
        }
        // An errored or aborted turn is not replayed, and leaves no orphan behind.
        if (variant === 'errored') {
          expect(serialized).not.toContain(abortedAssistantText);
          expect(view.calls).toHaveLength(1);
        }
        // An unanswered call is closed with pi's synthetic error result.
        expect(serialized.includes(syntheticResultText)).toBe(variant === 'orphan');
      },
    );
  });

  describe('reasoning portability (Q6, Q11)', () => {
    it.each(crossProviderPairs)(
      'should replay $source thinking to $target as plain assistant text',
      async ({ source, target }) => {
        const view = viewOf(target, await outboundBody({ source, target, variant: 'baseline' }));

        expect(view.assistantText).toContain(thinkingText);
        expect(view.assistantText).toContain(firstAssistantText);
        expect(view.nativeReasoning).toEqual([]);
      },
    );

    it.each(wireFamilies)(
      'should keep %s native reasoning credentials on a same-model continuation',
      async (family) => {
        const body = await outboundBody({ source: family, target: family, variant: 'baseline' });
        const view = viewOf(family, body);

        expect(view.nativeReasoning).not.toEqual([]);
        for (const secret of flavours[family].secrets) {
          expect(JSON.stringify(body)).toContain(secret);
        }
        // The downgrade replaced nothing: the thought stayed in its own carrier.
        expect(view.assistantText).not.toContain(thinkingText);
      },
    );
  });

  describe('Gemini thought signatures on a switched target', () => {
    it.each(wireFamilies.filter((family) => family !== 'vertexai'))(
      'should stamp the dummy signature on the first current-turn call only, replaying %s history',
      async (source) => {
        const resumed = viewOf(
          'vertexai',
          await outboundBody({ source, target: 'vertexai', variant: 'parallelResume' }),
        );
        const settled = viewOf('vertexai', await outboundBody({ source, target: 'vertexai', variant: 'baseline' }));

        // Live T14–T17: Vertex validates the first call of a current-turn batch.
        expect(resumed.calls.map((call) => call.signature)).toEqual([dummyThoughtSignature, undefined]);
        // Live T23: a completed earlier turn needs no signature and gets none.
        expect(settled.calls.map((call) => call.signature)).toEqual([undefined]);
      },
    );

    it('should keep a real Gemini signature across a Gemini model switch', async () => {
      const body = await outboundBody({
        source: 'vertexai',
        target: 'vertexai',
        variant: 'parallelResume',
        targetModelId: geminiSwitchModelId,
      });
      const view = completionsView(body);

      // Pi's model-exact gate strips `thoughtSignature` for a different model id;
      // Tau's `echoThoughtSignatures` puts the persisted one back by call id, and
      // Vertex accepts a 3.7 Flash signature on 3.1 Pro (live T4). The second call
      // of the batch stays unsigned, which Vertex does not validate.
      expect(view.calls.map((call) => call.signature)).toEqual([flavours.vertexai.thoughtSignature, undefined]);
      expect(body['model']).toBe(geminiSwitchModelId);
    });

    it('should replay Gemini thinking as text across a Gemini model switch', async () => {
      const view = completionsView(
        await outboundBody({
          source: 'vertexai',
          target: 'vertexai',
          variant: 'baseline',
          targetModelId: geminiSwitchModelId,
        }),
      );

      // Q11 follows Q6: a different Gemini row is not the same model to pi.
      expect(view.nativeReasoning).toEqual([]);
      expect(view.assistantText).toContain(thinkingText);
    });
  });

  describe('pinned shapes a live switch suite must confirm (W6)', () => {
    it('should normalize a long Responses tool-call id for Anthropic and keep its result paired', async () => {
      const view = anthropicView(await outboundBody({ source: 'openai', target: 'anthropic', variant: 'parallel' }));

      expect(view.calls.map((call) => call.id)).toEqual([
        'call_wTZc0Vs8hR9pA3kQ_fc_68d1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f',
        'call_pLm4Xq7bN2vY8sJd_fc_71e2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
      ]);
      // Anthropic truncates rather than hashing, so two calls sharing a call id
      // would collide past 64 characters; these differ inside the kept prefix.
      expect(view.calls.map((call) => call.id.length)).toEqual([64, 64]);
      expect(view.results.map((result) => result.id)).toEqual(view.calls.map((call) => call.id));
    });

    it('should split a foreign tool-call id into a Responses call id with no item id', async () => {
      const body = await outboundBody({ source: 'anthropic', target: 'openai', variant: 'baseline' });
      const items = body['input'] as WireItem[];
      const call = items.find((item) => item['type'] === 'function_call')!;

      // Anthropic's id carries no `|`, so there is no item id to rebuild, and
      // OpenAI mints its own rather than validating a fabricated `fc_` pairing.
      expect(call['call_id']).toBe('toolu_01FixtureAlpha');
      expect(call['id']).toBeUndefined();
    });

    it('should rebuild an xAI Responses item id as a hashed fc_ id for OpenAI', async () => {
      const body = await outboundBody({ source: 'xai', target: 'openai', variant: 'baseline' });
      const items = body['input'] as WireItem[];
      const call = items.find((item) => item['type'] === 'function_call')!;

      expect(call['call_id']).toBe('call_xaiA');
      expect(call['id']).toMatch(/^fc_[a-z0-9]+$/u);
    });

    it('should carry a thinking-only turn as text to a switched target and drop it on a Gemini continuation', async () => {
      const switched = viewOf(
        'anthropic',
        await outboundBody({ source: 'vertexai', target: 'anthropic', variant: 'thinkingOnly' }),
      );
      const continued = completionsView(
        await outboundBody({ source: 'vertexai', target: 'vertexai', variant: 'thinkingOnly' }),
      );

      // Q6 keeps the thought as text, so the switched target still sees the turn.
      expect(switched.assistantText).toContain(musingText);
      // A same-model Gemini continuation has neither text nor a tool call to hang
      // `reasoning_content` on, so pi drops the whole message rather than posting
      // one the wire refuses. The thought is lost; the request stays valid.
      expect(continued.assistantText).not.toContain(musingText);
      expect(JSON.stringify(continued)).not.toContain(musingText);
      expect(continued.emptyMessages).toEqual([]);
    });

    it('should leave two consecutive Anthropic user messages when a synthetic result precedes a new turn', async () => {
      const view = anthropicView(await outboundBody({ source: 'openai', target: 'anthropic', variant: 'orphan' }));

      // Pi closes the orphan with a synthetic tool result, which Anthropic carries
      // on a `user` message, and the person's next turn is a second one. Pinned
      // rather than worked around: nothing here can prove Anthropic accepts
      // consecutive user messages, so W6's live pair must confirm it.
      expect(view.roles).toEqual(['user', 'assistant', 'user', 'user']);
    });
  });
});
