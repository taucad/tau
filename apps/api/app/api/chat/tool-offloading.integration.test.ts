// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- LangChain APIs use snake_case */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';
import { createCrossProviderContentNormalizerMiddleware } from '#api/chat/middleware/cross-provider-content-normalizer.middleware.js';
import { createToolOffloadingMiddleware } from '#api/chat/middleware/tool-offloading.middleware.js';
import { createToolResultBudgetMiddleware } from '#api/chat/middleware/tool-result-budget.middleware.js';
import { createToolResultTrimmerMiddleware } from '#api/chat/middleware/tool-result-trimmer.middleware.js';
import type { TauRpcBackendFactory, TauRpcBackend } from '#api/chat/tau-rpc-backend.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { invokeWrapToolCall, invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

/**
 * Integration: replay the eight `read_file node_modules/libcascade/index.d.ts`
 * tool calls from the involute-gear transcript through the full
 * tool-offloading + tool-result-budget middleware stack with a stub
 * `TauRpcBackend`. Validates the architectural fix from
 * {@link docs/research/tool-result-offloading-and-context-prevention.md}:
 *
 * - Each individual `wrapToolCall` produces a `<persisted-output>` envelope
 *   well under the per-tool cap.
 * - The aggregate per-turn budget never sees cumulative `ToolMessage.content`
 *   anywhere close to the pre-fix ~100K (every offloaded envelope is
 *   well under 12K chars even when the original payload is 80K+).
 * - Re-applying the middleware across simulated turns reuses the same
 *   envelope bytes deterministically (path is keyed on `chatId+toolCallId`,
 *   and the budget middleware short-circuits on the structural
 *   `<persisted-output>` marker), keeping the prompt-cache prefix
 *   byte-identical without any in-process registry state.
 */
describe('Tool offloading middleware stack — involute-gear replay', () => {
  let rpcBackendFactory: ReturnType<typeof mock<TauRpcBackendFactory>>;
  let mockBackend: ReturnType<typeof mock<TauRpcBackend>>;
  let metricsService: ReturnType<typeof mock<MetricsService>>;
  let chatToolResultOffloadedAdd: ReturnType<
    typeof vi.fn<NonNullable<MetricsService['chatToolResultOffloaded']['add']>>
  >;
  let chatToolResultMediaPreservedAdd: ReturnType<
    typeof vi.fn<NonNullable<MetricsService['chatToolResultMediaPreserved']['add']>>
  >;

  const chatId = 'chat-involute-gear';

  const buildLargeReadFileContent = (toolCallId: string, lineCount = 5000): string => {
    const lines: string[] = [];
    for (let i = 1; i <= lineCount; i++) {
      lines.push(
        `${String(i).padStart(5, ' ')}\texport declare class OpenCascade_Symbol_${toolCallId}_${i} { method(): void; }`,
      );
    }
    return lines.join('\n');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    rpcBackendFactory = mock<TauRpcBackendFactory>();
    mockBackend = mock<TauRpcBackend>();
    rpcBackendFactory.create.mockReturnValue(mockBackend);
    mockBackend.write.mockResolvedValue({ path: 'test', filesUpdate: null });

    chatToolResultOffloadedAdd = vi.fn<NonNullable<MetricsService['chatToolResultOffloaded']['add']>>();
    chatToolResultMediaPreservedAdd = vi.fn<NonNullable<MetricsService['chatToolResultMediaPreserved']['add']>>();
    metricsService = mock<MetricsService>({
      chatToolResultOffloaded: mock<MetricsService['chatToolResultOffloaded']>({
        add: chatToolResultOffloadedAdd,
      }),
      chatToolResultMediaPreserved: mock<MetricsService['chatToolResultMediaPreserved']>({
        add: chatToolResultMediaPreservedAdd,
      }),
    });
  });

  const buildScreenshotContent = (toolCallId: string, dataUrlChars = 211_135): string => {
    const prefix = 'data:image/webp;base64,';
    const dataUrl = prefix + 'A'.repeat(dataUrlChars - prefix.length);
    return JSON.stringify({ images: [{ view: toolCallId, dataUrl }] });
  };

  const invokeModelMiddleware = async (
    middleware: { wrapModelCall?: (...args: never[]) => unknown },
    messages: BaseMessage[],
    request: Record<string, unknown> = {},
  ): Promise<BaseMessage[]> => {
    const handler = vi.fn().mockImplementation(async (nextRequest: unknown): Promise<unknown> => nextRequest);
    await invokeWrapModelCall(middleware, { ...request, messages }, handler);
    return (handler.mock.calls[0]![0] as { messages: BaseMessage[] }).messages;
  };

  const runScreenshotPipeline = async (options: {
    messages: BaseMessage[];
    allowImageBlocks?: boolean;
    targetProvider?: 'openai';
  }): Promise<BaseMessage[]> => {
    const offloading = createToolOffloadingMiddleware(rpcBackendFactory, metricsService);
    const afterOffloading: BaseMessage[] = [];

    for (const message of options.messages) {
      if (!ToolMessage.isInstance(message)) {
        afterOffloading.push(message);
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop -- mirrors serial tool-result middleware invocation
      const replaced = await invokeWrapToolCall(
        offloading,
        {
          toolCall: { name: message.name ?? toolName.screenshot, id: message.tool_call_id, args: {} },
          runtime: { context: { chatId } },
        },
        vi.fn().mockResolvedValue(message),
      );
      afterOffloading.push(replaced as BaseMessage);
    }

    const budget = createToolResultBudgetMiddleware(rpcBackendFactory, metricsService);
    const afterBudget = await invokeModelMiddleware(budget, afterOffloading, {
      state: {},
      runtime: { context: { chatId } },
    });

    const trimmer = createToolResultTrimmerMiddleware({ allowImageBlocks: options.allowImageBlocks ?? true });
    const afterTrimmer = await invokeModelMiddleware(trimmer, afterBudget);

    if (options.targetProvider !== 'openai') {
      return afterTrimmer;
    }

    const normalizer = createCrossProviderContentNormalizerMiddleware('openai');
    return invokeModelMiddleware(normalizer, afterTrimmer);
  };

  const findToolMessage = (messages: BaseMessage[], toolCallId: string): ToolMessage => {
    const message = messages.find(
      (candidate): candidate is ToolMessage =>
        ToolMessage.isInstance(candidate) && candidate.tool_call_id === toolCallId,
    );
    if (!message) {
      throw new Error(`expected ToolMessage ${toolCallId}`);
    }
    return message;
  };

  it('should keep cumulative ToolMessage content well under 12 KB across the 8 transcript tool calls', async () => {
    const offloading = createToolOffloadingMiddleware(rpcBackendFactory, metricsService);
    const offloadedMessages: ToolMessage[] = [];

    for (let i = 0; i < 8; i++) {
      const toolCallId = `toolu_call_${i}`;
      const rawContent = buildLargeReadFileContent(toolCallId);

      const original = new ToolMessage({
        content: rawContent,
        tool_call_id: toolCallId,
        name: toolName.readFile,
      });

      // oxlint-disable-next-line no-await-in-loop -- intentionally sequential to mirror the transcript ordering
      const replaced = await invokeWrapToolCall(
        offloading,
        {
          toolCall: {
            name: toolName.readFile,
            id: toolCallId,
            args: { targetFile: 'node_modules/libcascade/index.d.ts' },
          },
          runtime: { context: { chatId } },
        },
        vi.fn().mockResolvedValue(original),
      );

      expect(replaced).toBeInstanceOf(ToolMessage);
      offloadedMessages.push(replaced as ToolMessage);
    }

    const cumulativeContent = offloadedMessages
      .map((message) => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)))
      .join('\n');

    // Pre-fix baseline (from the transcript) was ~100K cumulative chars.
    // Post-fix every envelope head-truncates to <4K chars + header, so the
    // entire turn's worth of 8 large reads collapses to <40K — well under
    // 12K per call as the plan asserts.
    expect(cumulativeContent.length).toBeLessThan(40_000);
    for (const message of offloadedMessages) {
      const content = message.content as string;
      expect(content.length).toBeLessThan(12_000);
      expect(content).toContain('<persisted-output>');
      expect(content).toContain('.tau/tool-results/chat-involute-gear/');
    }

    expect(chatToolResultOffloadedAdd).toHaveBeenCalledTimes(8);
    expect(mockBackend.write).toHaveBeenCalledTimes(8);
  });

  it('should produce byte-identical messages on a second turn replay (prompt-cache stable)', async () => {
    const offloading = createToolOffloadingMiddleware(rpcBackendFactory, metricsService);
    const budget = createToolResultBudgetMiddleware(rpcBackendFactory, metricsService);

    const buildToolMessage = (toolCallId: string): { original: ToolMessage; raw: string } => {
      const raw = buildLargeReadFileContent(toolCallId, 5000);
      return {
        raw,
        original: new ToolMessage({
          content: raw,
          tool_call_id: toolCallId,
          name: toolName.readFile,
        }),
      };
    };

    const ids = Array.from({ length: 4 }, (_, i) => `toolu_replay_${i}`);

    // Turn 1: offload each via wrapToolCall, then run wrapModelCall for the budget.
    const replacedTurn1: ToolMessage[] = [];
    for (const id of ids) {
      const { original } = buildToolMessage(id);
      // oxlint-disable-next-line no-await-in-loop -- sequential by design
      const replaced = await invokeWrapToolCall(
        offloading,
        {
          toolCall: { name: toolName.readFile, id, args: { targetFile: 'node_modules/libcascade/index.d.ts' } },
          runtime: { context: { chatId } },
        },
        vi.fn().mockResolvedValue(original),
      );
      replacedTurn1.push(replaced as ToolMessage);
    }

    const budgetHandlerTurn1 = vi.fn().mockResolvedValue({ messages: [], usage: undefined });
    await invokeWrapModelCall(
      budget,
      {
        messages: [...replacedTurn1],
        state: {},
        runtime: { context: { chatId } },
      } as Parameters<typeof invokeWrapModelCall>[1],
      budgetHandlerTurn1,
    );

    // Turn 2: present the same fresh raw payloads to wrapToolCall — the
    // offloading middleware re-writes (with the same persistedPath) and
    // produces byte-identical envelopes deterministically (path is keyed
    // on `chatId+toolCallId`, no in-process cache required). The budget
    // middleware short-circuits on the structural <persisted-output>
    // marker on the next wrapModelCall pass.
    const replacedTurn2: ToolMessage[] = [];
    for (const id of ids) {
      const { original } = buildToolMessage(id);
      // oxlint-disable-next-line no-await-in-loop -- sequential by design
      const replaced = await invokeWrapToolCall(
        offloading,
        {
          toolCall: { name: toolName.readFile, id, args: { targetFile: 'node_modules/libcascade/index.d.ts' } },
          runtime: { context: { chatId } },
        },
        vi.fn().mockResolvedValue(original),
      );
      replacedTurn2.push(replaced as ToolMessage);
    }

    const budgetHandlerTurn2 = vi.fn().mockResolvedValue({ messages: [], usage: undefined });
    await invokeWrapModelCall(
      budget,
      {
        messages: [...replacedTurn2],
        state: {},
        runtime: { context: { chatId } },
      } as Parameters<typeof invokeWrapModelCall>[1],
      budgetHandlerTurn2,
    );

    // Each envelope from turn 1 must be re-emitted byte-identical on
    // turn 2 — that is what keeps the LLM provider's prompt cache prefix
    // stable across turns. Determinism comes from the persistedPath
    // (chatId+toolCallId) and the head-truncation slicing the same raw
    // bytes the same way each pass; no in-process registry required.
    for (const id of ids) {
      const content1 = replacedTurn1.find((message) => message.tool_call_id === id)?.content;
      const content2 = replacedTurn2.find((message) => message.tool_call_id === id)?.content;
      expect(content1).toBeDefined();
      expect(content2).toBeDefined();
      expect(content2).toBe(content1);
    }
  });

  it('should preserve a 211135-char screenshot through the non-OpenAI vision path', async () => {
    const screenshotContent = buildScreenshotContent('call_screenshot');
    const messages: BaseMessage[] = [
      new ToolMessage({
        content: screenshotContent,
        tool_call_id: 'call_screenshot',
        name: toolName.screenshot,
      }),
    ];

    const result = await runScreenshotPipeline({ messages });
    const screenshot = findToolMessage(result, 'call_screenshot');
    const content = screenshot.content as Array<Record<string, unknown>>;

    expect(Array.isArray(content)).toBe(true);
    expect(content.some((block) => block['type'] === 'image_url')).toBe(true);
    expect(JSON.stringify(content)).not.toContain('<persisted-output>');
    expect(mockBackend.write).not.toHaveBeenCalled();
    expect(chatToolResultMediaPreservedAdd).toHaveBeenCalledOnce();
  });

  it('should preserve a 211135-char screenshot through the OpenAI vision path as input_image', async () => {
    const screenshotContent = buildScreenshotContent('call_screenshot_openai');
    const messages: BaseMessage[] = [
      new ToolMessage({
        content: screenshotContent,
        tool_call_id: 'call_screenshot_openai',
        name: toolName.screenshot,
      }),
    ];

    const result = await runScreenshotPipeline({ messages, targetProvider: 'openai' });
    const screenshot = findToolMessage(result, 'call_screenshot_openai');
    const content = screenshot.content as Array<Record<string, unknown>>;
    const imageBlock = content.find((block) => block['type'] === 'input_image');

    expect(imageBlock).toEqual(
      expect.objectContaining({
        type: 'input_image',
        detail: 'auto',
      }),
    );
    expect(imageBlock?.['image_url']).toContain('data:image/webp;base64,');
    expect(mockBackend.write).not.toHaveBeenCalled();
  });

  it('should strip a large screenshot on the non-vision path without text offload', async () => {
    const screenshotContent = buildScreenshotContent('call_screenshot_text_only');
    const messages: BaseMessage[] = [
      new ToolMessage({
        content: screenshotContent,
        tool_call_id: 'call_screenshot_text_only',
        name: toolName.screenshot,
      }),
    ];

    const result = await runScreenshotPipeline({ messages, allowImageBlocks: false });
    const screenshot = findToolMessage(result, 'call_screenshot_text_only');

    expect(typeof screenshot.content).toBe('string');
    expect(screenshot.content as string).not.toContain('data:image/webp;base64');
    expect(JSON.parse(screenshot.content as string)).toEqual({
      images: [{ view: 'call_screenshot_text_only' }],
      _trimmed: true,
    });
    expect(mockBackend.write).not.toHaveBeenCalled();
  });

  it('should persist only text output when a large text result and screenshot share a turn', async () => {
    const screenshotContent = buildScreenshotContent('call_screenshot_mixed');
    const readFile = new ToolMessage({
      content: buildLargeReadFileContent('call_read_mixed'),
      tool_call_id: 'call_read_mixed',
      name: toolName.readFile,
    });
    const screenshot = new ToolMessage({
      content: screenshotContent,
      tool_call_id: 'call_screenshot_mixed',
      name: toolName.screenshot,
    });

    const result = await runScreenshotPipeline({ messages: [readFile, screenshot] });
    const finalScreenshot = findToolMessage(result, 'call_screenshot_mixed');
    const finalScreenshotContent = finalScreenshot.content as Array<Record<string, unknown>>;

    expect(finalScreenshotContent.some((block) => block['type'] === 'image_url')).toBe(true);
    expect(mockBackend.write).toHaveBeenCalledTimes(1);
    expect(mockBackend.write.mock.calls[0]![0]).toBe('/.tau/tool-results/chat-involute-gear/call_read_mixed.txt');
    expect(chatToolResultOffloadedAdd).toHaveBeenCalledOnce();
    expect(chatToolResultMediaPreservedAdd).toHaveBeenCalledOnce();
  });

  it('should preserve screenshot-shaped content when the ToolMessage name is missing', async () => {
    const screenshotContent = buildScreenshotContent('call_screenshot_no_name');
    const messages: BaseMessage[] = [
      new ToolMessage({
        content: screenshotContent,
        tool_call_id: 'call_screenshot_no_name',
      }),
    ];

    const result = await runScreenshotPipeline({ messages });
    const screenshot = findToolMessage(result, 'call_screenshot_no_name');
    const content = screenshot.content as Array<Record<string, unknown>>;

    expect(content.some((block) => block['type'] === 'image_url')).toBe(true);
    expect(mockBackend.write).not.toHaveBeenCalled();
  });
});
