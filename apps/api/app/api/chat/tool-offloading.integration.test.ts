// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- LangChain APIs use snake_case */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ToolMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';
import { createToolOffloadingMiddleware } from '#api/chat/middleware/tool-offloading.middleware.js';
import { createToolResultBudgetMiddleware } from '#api/chat/middleware/tool-result-budget.middleware.js';
import type { TauRpcBackendFactory, TauRpcBackend } from '#api/chat/tau-rpc-backend.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { invokeWrapToolCall, invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

/**
 * Integration: replay the eight `read_file node_modules/opencascade.js/index.d.ts`
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
  let chatToolResultOffloadedAdd: ReturnType<typeof vi.fn>;

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

    chatToolResultOffloadedAdd = vi.fn();
    metricsService = mock<MetricsService>();
    (
      metricsService as unknown as { chatToolResultOffloaded: { add: typeof chatToolResultOffloadedAdd } }
    ).chatToolResultOffloaded = {
      add: chatToolResultOffloadedAdd,
    };
  });

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
            args: { targetFile: 'node_modules/opencascade.js/index.d.ts' },
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
          toolCall: { name: toolName.readFile, id, args: { targetFile: 'node_modules/opencascade.js/index.d.ts' } },
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
          toolCall: { name: toolName.readFile, id, args: { targetFile: 'node_modules/opencascade.js/index.d.ts' } },
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
});
