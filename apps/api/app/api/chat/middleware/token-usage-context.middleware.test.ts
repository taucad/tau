// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ModelService } from '#api/models/model.service.js';
import { createTokenUsageContextMiddleware } from '#api/chat/middleware/token-usage-context.middleware.js';
import { resolveMiddlewareHook } from '#testing/middleware-testing.utils.js';

// =============================================================================
// When the model API supplies per-turn token counts (`AIMessage.usage_metadata`),
// inject a deterministic `<system-reminder>` HumanMessage carrying
// `used X / total Y / remaining Z` so the agent can self-throttle as it
// approaches the context window — but ONLY once the conversation has consumed
// at least 70% of the context window. Below the gate the reminder is
// suppressed because its monotonically-growing `used` value would otherwise
// flip `messages[0]` on every turn and bust every provider's prompt cache.
//
// Cache-safety: middleware must not mutate inputs (prepend-only, new
// instances); for identical inputs the produced byte stream must be
// deterministic so prompt caches keep hitting; below the 70% gate the
// outgoing `messages` must be referentially equal to the incoming array so
// the cacheable prefix is byte-stable across turns.
// =============================================================================

/* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
function aiMessageWithUsage(input: number, output: number): AIMessage {
  return new AIMessage({
    content: 'reply',
    response_metadata: { model: 'm' },
    usage_metadata: {
      input_tokens: input,
      output_tokens: output,
      total_tokens: input + output,
    },
  });
}
/* eslint-enable @typescript-eslint/naming-convention -- end */

function buildModelService(contextWindow: number | undefined = 200_000): ModelService {
  const service = mock<ModelService>();
  service.getContextWindow.mockReturnValue(contextWindow);
  return service;
}

function buildModelServiceWithoutContextWindow(): ModelService {
  const service = mock<ModelService>();
  service.getContextWindow.mockReturnValue(undefined);
  return service;
}

type RequestShape = {
  systemMessage: SystemMessage;
  messages: BaseMessage[];
  state: Record<string, unknown>;
  runtime: { context: { modelId: string; modelService: ModelService } };
};

async function invoke(messages: BaseMessage[], modelService: ModelService): Promise<RequestShape> {
  const middleware = createTokenUsageContextMiddleware();
  const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);
  const handler = vi.fn().mockResolvedValue({ content: 'response' });

  await wrapModelCall(
    {
      systemMessage: new SystemMessage('static'),
      messages,
      state: {},
      runtime: { context: { modelId: 'm', modelService } },
    },
    handler,
  );

  /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- vi.fn mock.calls is typed as any[][] */
  return handler.mock.calls[0]![0] as RequestShape;
}

describe('createTokenUsageContextMiddleware', () => {
  it('does NOT inject a token-usage reminder on turn 1 (no AIMessage with usage_metadata yet)', async () => {
    const modelService = buildModelService();
    const initial: BaseMessage[] = [new HumanMessage('first user message')];

    const passed = await invoke(initial, modelService);

    expect(passed.messages).toEqual(initial);
  });

  it('does NOT inject when no AIMessage carries usage_metadata', async () => {
    const modelService = buildModelService();
    const messages: BaseMessage[] = [new HumanMessage('q'), new AIMessage('a (no usage)'), new HumanMessage('q2')];

    const passed = await invoke(messages, modelService);

    expect(passed.messages).toEqual(messages);
  });

  it('injects a deterministic <system-reminder> when usage crosses the 70% gate, using the most recent usage_metadata', async () => {
    const modelService = buildModelService(200_000);
    // 150_000 + 500 = 150_500 used, 75.25% of 200_000 -> over the 70% gate.
    const messages: BaseMessage[] = [
      new HumanMessage('first'),
      aiMessageWithUsage(150_000, 500),
      new HumanMessage('second'),
    ];

    const passed = await invoke(messages, modelService);

    expect(passed.messages).toHaveLength(messages.length + 1);
    const first = passed.messages[0]!;
    expect(first).toBeInstanceOf(HumanMessage);
    const text = first.content as string;
    expect(text.startsWith('<system-reminder>')).toBe(true);
    expect(text.trimEnd().endsWith('</system-reminder>')).toBe(true);
    expect(text).toContain('Token usage');
    expect(text).toContain('150500');
    expect(text).toContain('200000');
    expect(text).toContain('49500');
  });

  it('uses the most recent AIMessage with usage_metadata when several are present (above gate)', async () => {
    const modelService = buildModelService(100_000);
    // Most recent: 80_000 + 1000 = 81_000 used, 81% -> over the 70% gate.
    const messages: BaseMessage[] = [
      new HumanMessage('first'),
      aiMessageWithUsage(1000, 100),
      new HumanMessage('second'),
      aiMessageWithUsage(80_000, 1000),
      new HumanMessage('third'),
    ];

    const passed = await invoke(messages, modelService);

    const text = passed.messages[0]!.content as string;
    expect(text).toContain('81000');
    expect(text).toContain('19000');
  });

  it('does NOT inject when used < 70% of context window (cache-safety regression)', async () => {
    const modelService = buildModelService(200_000);
    // 10_000 + 500 = 10_500 used, 5.25% -> well below 70% gate.
    const messages: BaseMessage[] = [
      new HumanMessage('first'),
      aiMessageWithUsage(10_000, 500),
      new HumanMessage('second'),
    ];

    const passed = await invoke(messages, modelService);

    expect(passed.messages).toEqual(messages);
    expect(passed.messages).toHaveLength(messages.length);
  });

  it('does NOT inject when used == 70% of context window (boundary: < threshold)', async () => {
    const modelService = buildModelService(100_000);
    // 70_000 used = exactly 70% -> below the strict-less-than threshold check
    // (the gate trips at >= 70%, so 70% itself is on the inject side).
    const messages: BaseMessage[] = [
      new HumanMessage('first'),
      aiMessageWithUsage(70_000, 0),
      new HumanMessage('second'),
    ];

    const passed = await invoke(messages, modelService);

    // 70% triggers inject (used / total = 0.7, NOT < 0.7).
    expect(passed.messages).toHaveLength(messages.length + 1);
    const text = passed.messages[0]!.content as string;
    expect(text).toContain('70000');
    expect(text).toContain('30000');
  });

  it('does NOT inject when context window is unknown (cache-safe default)', async () => {
    const modelService = buildModelServiceWithoutContextWindow();
    const messages: BaseMessage[] = [
      new HumanMessage('first'),
      aiMessageWithUsage(2000, 100),
      new HumanMessage('second'),
    ];

    const passed = await invoke(messages, modelService);

    expect(passed.messages).toEqual(messages);
  });

  it('CS1: does not mutate the input messages array or any message instance (above gate)', async () => {
    const modelService = buildModelService(1000);
    const ai = aiMessageWithUsage(800, 50);
    const user = new HumanMessage('q');
    const messages: BaseMessage[] = [user, ai];
    const snapshot = [...messages];

    await invoke(messages, modelService);

    expect(messages).toEqual(snapshot);
    expect(messages[0]).toBe(user);
    expect(messages[1]).toBe(ai);
  });

  it('CS3: produces byte-identical output for byte-identical input (above gate)', async () => {
    const modelService = buildModelService(1000);
    const build = (): BaseMessage[] => [
      new HumanMessage('hello'),
      aiMessageWithUsage(750, 45),
      new HumanMessage('again'),
    ];

    const a = await invoke(build(), modelService);
    const b = await invoke(build(), modelService);

    expect(a.messages[0]!.content).toBe(b.messages[0]!.content);
  });

  it('CS4: two below-threshold turns produce byte-identical messages arrays (steady-state cache stability)', async () => {
    const modelService = buildModelService(200_000);

    // Turn N: 10_000 used (5%).
    const turnN: BaseMessage[] = [
      new HumanMessage('hello'),
      aiMessageWithUsage(10_000, 250),
      new HumanMessage('follow-up'),
    ];

    // Turn N+1: 12_500 used (6.25%) — still below the 70% gate.
    const turnNext: BaseMessage[] = [
      new HumanMessage('hello'),
      aiMessageWithUsage(12_500, 300),
      new HumanMessage('follow-up'),
    ];

    const a = await invoke(turnN, modelService);
    const b = await invoke(turnNext, modelService);

    // The crucial property: the prefix forwarded to the model is the same
    // length on both turns (no reminder prepended), so the cacheable byte
    // prefix at messages[0] is stable.
    expect(a.messages).toHaveLength(turnN.length);
    expect(b.messages).toHaveLength(turnNext.length);
    expect(a.messages[0]).toBe(turnN[0]);
    expect(b.messages[0]).toBe(turnNext[0]);
    // The user-authored first message is byte-identical across the two turns,
    // i.e. nothing the middleware does breaks the prefix.
    expect(a.messages[0]!.content as string).toBe(b.messages[0]!.content as string);
  });

  it('does not modify the SystemMessage (above gate)', async () => {
    const modelService = buildModelService(1000);
    const messages: BaseMessage[] = [new HumanMessage('first'), aiMessageWithUsage(800, 5), new HumanMessage('second')];

    const passed = await invoke(messages, modelService);

    expect(passed.systemMessage.content).toBe('static');
  });
});
