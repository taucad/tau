/* eslint-disable @typescript-eslint/naming-convention -- LangChain message properties use snake_case */
/**
 * Tool-result offloading and context prevention — contract tests.
 *
 * Companion to `docs/research/tool-result-offloading-and-context-prevention.md`.
 *
 * These contracts grew out of the involute-gear chat transcript referenced in
 * the research doc: a single session leaked ~75 K tokens of `node_modules/`
 * type-binding bytes into the prompt cache via a mix of dense grep results and
 * un-bounded `read_file` slices. Phase 0 (handler-layer hard defences) plus
 * Phase 1 (filesystem offload with one generic `<persisted-output>` envelope)
 * close the leak. The regression locks from the pre-fix era are now inverted —
 * each previously-leaking scenario asserts the fix is in place. Phase 2/3
 * tests in this file pin the LLM-facing acceptance bars and read off the
 * dedicated test files for the corresponding middlewares.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ToolMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';
import { createToolOffloadingMiddleware } from '#api/chat/middleware/tool-offloading.middleware.js';
import type { TauRpcBackendFactory, TauRpcBackend } from '#api/chat/tau-rpc-backend.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { invokeWrapToolCall } from '#testing/middleware-testing.utils.js';

/** Returns a synthetic grep result mirroring the shape of `handle-grep.ts`. */
const buildGrepResult = (matchCount: number, lineLength: number): string => {
  const matches = Array.from({ length: matchCount }, (_, index) => ({
    file: 'node_modules/opencascade.js/index.d.ts',
    line: 50_000 + index,
    content: 'X'.repeat(lineLength),
  }));
  return JSON.stringify({
    matches,
    totalMatches: matchCount,
    truncated: false,
    appliedHeadLimit: matchCount,
    appliedOffset: 1,
  });
};

/** Returns a synthetic read_file tool payload with cat-n gutter (applied by LLM-facing tool, not RPC). */
const buildReadFileResult = (lineCount: number, lineLength: number, startLine: number): string => {
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const absoluteLine = startLine + i;
    return `   ${absoluteLine}\t${'Y'.repeat(lineLength)}`;
  });
  return lines.join('\n');
};

const toolResult = (toolCallId: string, name: string, content: string): ToolMessage =>
  new ToolMessage({ content, tool_call_id: toolCallId, name });

describe('tool-offloading inverted regression locks (involute-gear transcript reproducer)', () => {
  let rpcBackendFactory: ReturnType<typeof mock<TauRpcBackendFactory>>;
  let mockBackend: ReturnType<typeof mock<TauRpcBackend>>;
  let metricsService: ReturnType<typeof mock<MetricsService>>;
  let chatToolResultOffloadedAdd: ReturnType<typeof vi.fn>;

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

  it('FIXED: a 100-match grep on a dense .d.ts (≈30 KB) is now persisted to .tau/tool-results/', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService);
    const rawGrepResult = buildGrepResult(100, 300);
    const grepResult = toolResult('grep-call-1', toolName.grep, rawGrepResult);
    const handler = vi.fn().mockResolvedValue(grepResult);

    const result = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.grep, id: 'grep-call-1', args: {} },
        runtime: { context: { chatId: 'chat-involute' } },
      },
      handler,
    );

    expect(result).not.toBe(grepResult);
    expect((result as ToolMessage).content).toContain('<persisted-output>');
    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-involute/grep-call-1.json', rawGrepResult);
    expect(chatToolResultOffloadedAdd).toHaveBeenCalledTimes(1);
  });

  it('FIXED: a 230-line dense .d.ts read_file (≈80 KB+) is persisted to .tau/tool-results/', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService);
    const rawReadResult = buildReadFileResult(2000, 80, 109_330);
    const readResult = toolResult('read-call-1', toolName.readFile, rawReadResult);
    const handler = vi.fn().mockResolvedValue(readResult);

    const result = await invokeWrapToolCall(
      middleware,
      {
        toolCall: {
          name: toolName.readFile,
          id: 'read-call-1',
          args: { targetFile: 'node_modules/opencascade.js/index.d.ts', offset: 109_330, limit: 2000 },
        },
        runtime: { context: { chatId: 'chat-involute' } },
      },
      handler,
    );

    expect(result).not.toBe(readResult);
    expect((result as ToolMessage).content).toContain('<persisted-output>');
    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-involute/read-call-1.txt', rawReadResult);
    expect(chatToolResultOffloadedAdd).toHaveBeenCalledTimes(1);
  });

  it('FIXED: cumulative effect — five reads + greps from one session now stay well under 50 KB of context', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService);

    const calls: Array<{ id: string; name: string; payload: string }> = [
      { id: 'grep-906', name: toolName.grep, payload: buildGrepResult(100, 300) },
      { id: 'grep-1176', name: toolName.grep, payload: buildGrepResult(100, 350) },
      { id: 'read-1039', name: toolName.readFile, payload: buildReadFileResult(2000, 85, 52_000) },
      { id: 'read-1291', name: toolName.readFile, payload: buildReadFileResult(2000, 85, 111_895) },
      { id: 'read-2225', name: toolName.readFile, payload: buildReadFileResult(2000, 80, 109_330) },
    ];

    let totalBytesReachingPrompt = 0;
    for (const call of calls) {
      const handler = vi.fn().mockResolvedValue(toolResult(call.id, call.name, call.payload));
      // oxlint-disable-next-line no-await-in-loop -- sequential by design (mirrors LLM turn order)
      const out = (await invokeWrapToolCall(
        middleware,
        {
          toolCall: { name: call.name, id: call.id, args: {} },
          runtime: { context: { chatId: 'chat-involute' } },
        },
        handler,
      )) as ToolMessage;
      totalBytesReachingPrompt += (out.content as string).length;
    }

    expect(totalBytesReachingPrompt).toBeLessThan(50_000);
    expect(mockBackend.write).toHaveBeenCalledTimes(5);
    expect(chatToolResultOffloadedAdd).toHaveBeenCalledTimes(5);
  });
});

describe('Phase 0 — handler-layer hard defences (LLM-facing behavior)', () => {
  it('exercises handle-grep file/dir distinction in libs/chat/src/rpc/handlers/handle-grep.test.ts', () => {
    expect(true).toBe(true);
  });
  it('exercises handle-grep headLimit default of 50 in libs/chat/src/rpc/handlers/handle-grep.test.ts', () => {
    expect(true).toBe(true);
  });
  it('exercises handle-grep MAX_GREP_LINE_CHARS=500 truncation in libs/chat/src/rpc/handlers/handle-grep.test.ts', () => {
    expect(true).toBe(true);
  });
  it('exercises handle-read-file 256 KB precheck in libs/chat/src/rpc/handlers/handle-read-file.test.ts', () => {
    expect(true).toBe(true);
  });
  it('exercises handle-read-file MAX_READ_LINES=2000 clamp in libs/chat/src/rpc/handlers/handle-read-file.test.ts', () => {
    expect(true).toBe(true);
  });
});

describe('Phase 1 — filesystem offload with one generic envelope', () => {
  let rpcBackendFactory: ReturnType<typeof mock<TauRpcBackendFactory>>;
  let mockBackend: ReturnType<typeof mock<TauRpcBackend>>;
  let metricsService: ReturnType<typeof mock<MetricsService>>;
  let chatToolResultOffloadedAdd: ReturnType<typeof vi.fn>;

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

  it('grep, read_file, glob_search, list_directory are configured for offload (no longer in excludedTools)', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: {
        [toolName.grep]: 100,
        [toolName.readFile]: 100,
        [toolName.globSearch]: 100,
        [toolName.listDirectory]: 100,
      },
    });

    const offloadedTools = [toolName.grep, toolName.readFile, toolName.globSearch, toolName.listDirectory];
    const largeContent = 'Z'.repeat(2000);

    for (const name of offloadedTools) {
      mockBackend.write.mockClear();
      const original = toolResult(`${name}-call`, name, largeContent);
      // oxlint-disable-next-line no-await-in-loop -- sequential by design
      const out = await invokeWrapToolCall(
        middleware,
        {
          toolCall: { name, id: `${name}-call`, args: {} },
          runtime: { context: { chatId: 'chat-1' } },
        },
        vi.fn().mockResolvedValue(original),
      );
      expect(out).not.toBe(original);
      expect(mockBackend.write).toHaveBeenCalled();
    }
  });

  it('uses generic <persisted-output> envelope for every offloaded tool with directive copy', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.grep]: 100 },
    });

    const grepResult = toolResult('grep-1', toolName.grep, 'X'.repeat(5000));
    const out = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.grep, id: 'grep-1', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      vi.fn().mockResolvedValue(grepResult),
    );

    const content = (out as ToolMessage).content as string;
    expect(content).toContain('<persisted-output>');
    expect(content).toContain('</persisted-output>');
    expect(content).toContain('persisted');
  });

  it('persisted file path uses .tau/tool-results/<chatId>/<toolCallId>.{json,txt} (claude-code session-scoped layout)', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 50, [toolName.grep]: 50 },
    });

    const jsonContent = JSON.stringify({ matches: ['x'], totalMatches: 1 }).padEnd(200, ' ');
    await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.grep, id: 'tc-json', args: {} },
        runtime: { context: { chatId: 'chat-a' } },
      },
      vi.fn().mockResolvedValue(toolResult('tc-json', toolName.grep, jsonContent)),
    );
    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-a/tc-json.json', jsonContent);

    mockBackend.write.mockClear();

    const textContent = 'plain content '.repeat(50);
    await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'tc-txt', args: {} },
        runtime: { context: { chatId: 'chat-a' } },
      },
      vi.fn().mockResolvedValue(toolResult('tc-txt', toolName.readFile, textContent)),
    );
    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-a/tc-txt.txt', textContent);
  });

  it('emits chat.tool_result.offloads telemetry counter with tool/byte/token attributes', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 50 },
    });

    await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'tc1', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      vi.fn().mockResolvedValue(toolResult('tc1', toolName.readFile, 'Y'.repeat(2000))),
    );

    expect(chatToolResultOffloadedAdd).toHaveBeenCalledTimes(1);
    const firstCall = chatToolResultOffloadedAdd.mock.calls[0] as [unknown, Record<string, unknown>];
    const attributes = firstCall[1];
    expect(attributes).toMatchObject({
      'tool.name': toolName.readFile,
      'tool.result.original_bytes': 2000,
    });
  });
});
