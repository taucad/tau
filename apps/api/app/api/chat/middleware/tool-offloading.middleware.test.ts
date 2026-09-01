/* eslint-disable @typescript-eslint/naming-convention -- LangChain + OTEL attribute names use snake_case/dot-notation */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ToolMessage } from '@langchain/core/messages';
import { toolName, fileUnchangedMarker } from '@taucad/chat/constants';
import {
  createToolOffloadingMiddleware,
  compactLargeStrings,
} from '#api/chat/middleware/tool-offloading.middleware.js';
import type { TauRpcBackendFactory, TauRpcBackend } from '#api/chat/tau-rpc-backend.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { invokeWrapToolCall } from '#testing/middleware-testing.utils.js';

describe('createToolOffloadingMiddleware', () => {
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

  it('should pass through small tool results unchanged', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService);

    const smallResult = new ToolMessage({
      content: 'small result',
      tool_call_id: 'tc1',
      name: toolName.webSearch,
    });

    const handler = vi.fn().mockResolvedValue(smallResult);

    const result = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.webSearch, id: 'tc1', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    expect(result).toBe(smallResult);
    expect(mockBackend.write).not.toHaveBeenCalled();
    expect(chatToolResultOffloadedAdd).not.toHaveBeenCalled();
  });

  it('should offload read_file results exceeding their per-tool maxChars with a generic <persisted-output> envelope', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 100 },
    });

    const lines: string[] = [];
    for (let i = 1; i <= 200; i++) {
      lines.push(`${String(i).padStart(4, ' ')}\tdeclare const symbol_${i}: () => unknown; ${'X'.repeat(40)}`);
    }
    const rawContent = lines.join('\n');
    const result = new ToolMessage({
      content: rawContent,
      tool_call_id: 'toolu_abc',
      name: toolName.readFile,
    });

    const handler = vi.fn().mockResolvedValue(result);

    const replaced = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'toolu_abc', args: { targetFile: 'node_modules/foo/index.d.ts' } },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    expect(replaced).toBeInstanceOf(ToolMessage);
    const content = (replaced as ToolMessage).content as string;

    expect(content).toContain('<persisted-output>');
    expect(content).toContain('</persisted-output>');
    expect(content).toContain('.tau/tool-results/chat-1/toolu_abc.txt');
    expect(content).toContain(`Tool ${toolName.readFile} output persisted`);
    expect(content).toContain('Re-read narrower ranges via read_file');
    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-1/toolu_abc.txt', rawContent);
  });

  it('should head-truncate the envelope preview at a newline boundary', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 100 },
    });

    const lines = Array.from({ length: 4000 }, (_, i) => `${String(i + 1).padStart(5, ' ')}\tline${i + 1}`);
    const rawContent = lines.join('\n');
    const result = new ToolMessage({
      content: rawContent,
      tool_call_id: 'tc2',
      name: toolName.readFile,
    });

    const handler = vi.fn().mockResolvedValue(result);
    const replaced = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'tc2', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    const content = (replaced as ToolMessage).content as string;
    expect(content).toContain('line1');
    expect(content).not.toContain('line4000');
    const previewBody = content.split('\n').slice(3, -1).join('\n');
    expect(previewBody.endsWith('\n')).toBe(false);
    expect(content).toMatch(/chars omitted/);
  });

  it('should preserve gutter line numbers from read_file in the envelope preview', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 50 },
    });

    const lines = ['   1\timport { foo } from "bar";', '   2\texport const x = 1;', '   3\texport const y = 2;'];
    const rawContent = lines.join('\n');
    const result = new ToolMessage({
      content: rawContent,
      tool_call_id: 'tc3',
      name: toolName.readFile,
    });

    const handler = vi.fn().mockResolvedValue(result);
    const replaced = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'tc3', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    const content = (replaced as ToolMessage).content as string;
    expect(content).toContain('   1\timport');
    expect(content).toContain('   2\texport const x = 1;');
  });

  it.each([toolName.editFile, toolName.createFile, toolName.deleteFile, toolName.screenshot])(
    'should skip offload for mutator/binary tool: %s',
    async (skipName) => {
      const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
        perToolMaxCharsOverride: { [skipName]: 10 },
      });

      const largeContent = 'X'.repeat(200);
      const original = new ToolMessage({
        content: largeContent,
        tool_call_id: 'tc1',
        name: skipName,
      });

      const handler = vi.fn().mockResolvedValue(original);
      const result = await invokeWrapToolCall(
        middleware,
        {
          toolCall: { name: skipName, id: 'tc1', args: {} },
          runtime: { context: { chatId: 'chat-1' } },
        },
        handler,
      );

      expect(result).toBe(original);
      expect(mockBackend.write).not.toHaveBeenCalled();
      expect(chatToolResultOffloadedAdd).not.toHaveBeenCalled();
    },
  );

  it('should fall back to jsonCompact for unknown tools with structured JSON output', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      unknownToolMaxChars: 50,
    });

    const toolOutput = {
      images: [{ view: 'composite', dataUrl: 'data:image/webp;base64,' + 'A'.repeat(2000) }],
    };
    const jsonContent = JSON.stringify(toolOutput);
    const original = new ToolMessage({
      content: jsonContent,
      tool_call_id: 'tc1',
      name: toolName.testModel,
    });

    const handler = vi.fn().mockResolvedValue(original);
    const result = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.testModel, id: 'tc1', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    const content = (result as ToolMessage).content as string;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const images = parsed['images'] as Array<Record<string, unknown>>;

    expect(images[0]!['view']).toBe('composite');
    expect(images[0]!['dataUrl']).toMatch(/^\[offloaded: \d+ chars]$/);
    expect(parsed['_offloadedTo']).toBe('.tau/tool-results/chat-1/tc1.json');
    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-1/tc1.json', jsonContent);
  });

  it('should persist with .txt extension for non-JSON envelopes', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.grep]: 50 },
    });

    const rawContent = Array.from({ length: 80 }, (_, i) => `file${i}.ts:${i + 1}:match line ${i}`).join('\n');
    const original = new ToolMessage({
      content: rawContent,
      tool_call_id: 'tc1',
      name: toolName.grep,
    });

    const handler = vi.fn().mockResolvedValue(original);
    await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.grep, id: 'tc1', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-1/tc1.txt', rawContent);
  });

  it('should scope persisted paths by chatId so concurrent chats never collide', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 50 },
    });

    const rawContent = 'X'.repeat(200);
    const original = new ToolMessage({
      content: rawContent,
      tool_call_id: 'toolu_shared',
      name: toolName.readFile,
    });

    const handler = vi.fn().mockResolvedValue(original);

    await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'toolu_shared', args: {} },
        runtime: { context: { chatId: 'chat-a' } },
      },
      handler,
    );
    await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'toolu_shared', args: {} },
        runtime: { context: { chatId: 'chat-b' } },
      },
      handler,
    );

    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-a/toolu_shared.txt', rawContent);
    expect(mockBackend.write).toHaveBeenCalledWith('.tau/tool-results/chat-b/toolu_shared.txt', rawContent);
  });

  it('should fall back to flat-string envelope for non-JSON unknown-tool content', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      unknownToolMaxChars: 50,
    });

    const plainText = 'not valid JSON '.repeat(100);
    const original = new ToolMessage({
      content: plainText,
      tool_call_id: 'tc1',
      name: toolName.webSearch,
    });

    const handler = vi.fn().mockResolvedValue(original);
    const result = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.webSearch, id: 'tc1', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    const content = (result as ToolMessage).content as string;
    expect(content).toContain('Tool result too large');
    expect(content).toContain('.tau/tool-results/chat-1/tc1.txt');
  });

  it('should handle RPC write failures gracefully and return the original result', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 10 },
    });

    mockBackend.write.mockRejectedValue(new Error('Write failed'));

    const largeContent = 'X'.repeat(200);
    const largeResult = new ToolMessage({
      content: largeContent,
      tool_call_id: 'tc1',
      name: toolName.readFile,
    });

    const handler = vi.fn().mockResolvedValue(largeResult);

    const result = await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'tc1', args: {} },
        runtime: { context: { chatId: 'chat-1' } },
      },
      handler,
    );

    expect(result).toBe(largeResult);
    expect(chatToolResultOffloadedAdd).not.toHaveBeenCalled();
  });

  it('should emit chatToolResultOffloaded telemetry on every successful offload with tool + byte attributes', async () => {
    const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
      perToolMaxCharsOverride: { [toolName.readFile]: 50 },
    });

    const rawContent = 'X'.repeat(2000);
    const original = new ToolMessage({
      content: rawContent,
      tool_call_id: 'tc1',
      name: toolName.readFile,
    });

    const handler = vi.fn().mockResolvedValue(original);
    await invokeWrapToolCall(
      middleware,
      {
        toolCall: { name: toolName.readFile, id: 'tc1', args: {} },
        runtime: { context: { chatId: 'chat-telemetry' } },
      },
      handler,
    );

    expect(chatToolResultOffloadedAdd).toHaveBeenCalledTimes(1);
    const firstCall = chatToolResultOffloadedAdd.mock.calls[0] as [number, Record<string, number | string>];
    const count = firstCall[0];
    const attributes = firstCall[1];
    expect(count).toBe(1);
    expect(attributes).toMatchObject({
      'tool.name': toolName.readFile,
      'tool.result.original_bytes': 2000,
    });
    expect(attributes['tool.result.persisted_bytes']).toBeGreaterThan(0);
    expect(attributes['tool.result.original_tokens_estimated']).toBe(Math.ceil(2000 / 4));
    expect(attributes['tool.result.persisted_tokens_estimated']).toBeGreaterThan(0);
  });

  describe('read-file dedup short-circuit', () => {
    it('should short-circuit (no backend.write, no telemetry) when read_file content already carries fileUnchangedMarker', async () => {
      const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
        perToolMaxCharsOverride: { [toolName.readFile]: 10 },
      });

      const markerJson = JSON.stringify({
        content: fileUnchangedMarker.build('toolu_first'),
        totalLines: 1,
      });

      const dedupedResult = new ToolMessage({
        content: markerJson,
        tool_call_id: 'toolu_second',
        name: toolName.readFile,
      });

      const result = await invokeWrapToolCall(
        middleware,
        {
          toolCall: { name: toolName.readFile, id: 'toolu_second', args: { targetFile: 'a.ts' } },
          runtime: { context: { chatId: 'chat-1' } },
        },
        vi.fn().mockResolvedValue(dedupedResult),
      );

      expect(result).toBe(dedupedResult);
      expect(mockBackend.write).not.toHaveBeenCalled();
      expect(chatToolResultOffloadedAdd).not.toHaveBeenCalled();
    });

    it('should still offload when read_file content does NOT carry the marker (cache miss)', async () => {
      const middleware = createToolOffloadingMiddleware(rpcBackendFactory, metricsService, {
        perToolMaxCharsOverride: { [toolName.readFile]: 10 },
      });

      const freshJson = JSON.stringify({
        content: '   1\thello\n   2\tworld',
        totalLines: 2,
      });

      const out = await invokeWrapToolCall(
        middleware,
        {
          toolCall: { name: toolName.readFile, id: 'toolu_first', args: { targetFile: 'a.ts' } },
          runtime: { context: { chatId: 'chat-1' } },
        },
        vi
          .fn()
          .mockResolvedValue(
            new ToolMessage({ content: freshJson, tool_call_id: 'toolu_first', name: toolName.readFile }),
          ),
      );

      expect((out as ToolMessage).content).toContain('<persisted-output>');
      expect(mockBackend.write).toHaveBeenCalled();
    });
  });

  describe('compactLargeStrings', () => {
    it('should pass through primitives unchanged', () => {
      expect(compactLargeStrings(42, 100)).toBe(42);
      expect(compactLargeStrings(true, 100)).toBe(true);
      expect(compactLargeStrings(null, 100)).toBeNull();
    });

    it('should pass through empty objects and arrays unchanged', () => {
      expect(compactLargeStrings({}, 100)).toEqual({});
      expect(compactLargeStrings([], 100)).toEqual([]);
    });

    it('should compact strings exceeding the threshold', () => {
      const result = compactLargeStrings('A'.repeat(101), 100);
      expect(result).toBe('[offloaded: 101 chars]');
    });

    it('should preserve strings at exactly the threshold', () => {
      const exact = 'B'.repeat(100);
      expect(compactLargeStrings(exact, 100)).toBe(exact);
    });

    it('should recurse into nested objects/arrays', () => {
      const input = {
        level1: {
          small: 'keep',
          large: 'B'.repeat(2000),
          items: [{ name: 'a', data: 'C'.repeat(2000) }],
        },
      };
      const compacted = compactLargeStrings(input, 1000) as typeof input;
      expect(compacted.level1.small).toBe('keep');
      expect(compacted.level1.large).toMatch(/^\[offloaded: 2000 chars]$/);
      expect(compacted.level1.items[0]!.data).toMatch(/^\[offloaded: 2000 chars]$/);
    });
  });
});
