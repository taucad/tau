/* eslint-disable @typescript-eslint/naming-convention -- LangChain `AIMessage*` constructors use snake_case fields (`tool_call_chunks`, `tool_calls`). */
import { describe, expect, it, vi } from 'vitest';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages';
import type { ToolCallChunk } from '@langchain/core/messages/tool';
import type { HandleLLMNewTokenCallbackFields, NewTokenIndices } from '@langchain/core/callbacks/base';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatGeneration, LLMResult } from '@langchain/core/outputs';
import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { toolName } from '@taucad/chat/constants';
import { EagerToolDispatchHandler } from '#api/chat/eager-dispatch/eager-tool-dispatch.handler.js';

const noopStructuredToolSchema = z.object({ value: z.string() });

function createNoopTool(
  executeImpl: (input: z.infer<typeof noopStructuredToolSchema>) => Promise<string>,
): StructuredToolInterface {
  return tool(executeImpl, {
    name: 'noop',
    description: 'Test tool.',
    schema: noopStructuredToolSchema,
  }) as unknown as StructuredToolInterface;
}

function getToolInvokeValueArgument(callArguments: unknown[]): string | undefined {
  const candidate = callArguments[0];
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const valueField: unknown = Reflect.get(candidate, 'value');
  return typeof valueField === 'string' ? valueField : undefined;
}
function emitChunk(handler: EagerToolDispatchHandler, toolCallChunks: ToolCallChunk[]): void {
  const message = new AIMessageChunk({ content: '', tool_call_chunks: toolCallChunks });
  const chunk = new ChatGenerationChunk({ message, text: '' });
  handler.handleLLMNewToken('', undefined as unknown as NewTokenIndices, 'run-id', undefined, undefined, {
    chunk,
  } as HandleLLMNewTokenCallbackFields);
}

function emitEnd(handler: EagerToolDispatchHandler, toolCalls: ToolCall[]): void {
  const terminal = new AIMessage({ content: '', tool_calls: toolCalls });
  const generationRow: ChatGeneration = { text: '', message: terminal };
  const llmEnd: LLMResult = {
    generations: [[generationRow]],
  };

  handler.handleLLMEnd(llmEnd);
}

async function settleEntries(handler: EagerToolDispatchHandler): Promise<void> {
  await Promise.all([...handler.entries.values()].map(async (entry) => entry.invokePromise));
}

describe('EagerToolDispatchHandler', () => {
  it('repairs a model-authored project path before eager invocation and UI emission', async () => {
    const writer = vi.fn();
    const handler = new EagerToolDispatchHandler({ runnableConfigBaseline: {} });
    const invokeMock = vi.fn(async ({ targetFile }: { targetFile: string }): Promise<string> => targetFile);
    const readFileTool = tool(invokeMock, {
      name: toolName.readFile,
      description: 'Read a file.',
      schema: z.object({ targetFile: z.string() }),
    }) as unknown as StructuredToolInterface;
    handler.bindTools([readFileTool]);
    handler.setWriter(writer);

    emitEnd(handler, [
      { id: 'call_path', name: toolName.readFile, args: { targetFile: '/main.ts' }, type: 'tool_call' },
    ]);
    await settleEntries(handler);

    expect(invokeMock).toHaveBeenCalledWith({ targetFile: 'main.ts' }, expect.anything());
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tau-eager-tool-input-available',
        input: { targetFile: 'main.ts' },
      }),
    );
  });

  it('dispatches indexes 0..3 eagerly when each next block opens and dispatches the last tool on handleLLMEnd', async () => {
    const writer = vi.fn();
    const runnableConfigBaseline: RunnableConfig = {};
    const handler = new EagerToolDispatchHandler({ runnableConfigBaseline });
    const invokeMock = vi.fn(async ({ value }: { value: string }): Promise<string> => `ok:${value}`);
    handler.bindTools([createNoopTool(invokeMock)]);
    handler.setWriter(writer);

    const toolNamesAndIds = [
      ['call_a', 'a'],
      ['call_b', 'b'],
      ['call_c', 'c'],
      ['call_d', 'd'],
      ['call_e', 'e'],
    ] as const;

    for (const [iteration, entry] of toolNamesAndIds.entries()) {
      const [toolCallId, suffix] = entry;
      emitChunk(handler, [
        {
          index: iteration,
          id: toolCallId,
          name: 'noop',
          args: '',
          type: 'tool_call_chunk',
        },
      ]);
      emitChunk(handler, [{ index: iteration, args: `{"value":"${suffix}"}`, type: 'tool_call_chunk' }]);
    }

    const terminalCalls: ToolCall[] = toolNamesAndIds.map(([toolCallId, suffix]) => ({
      id: toolCallId,
      name: 'noop',
      args: { value: suffix },
      type: 'tool_call',
    }));

    emitEnd(handler, terminalCalls);

    await settleEntries(handler);

    const inputChunks = writer.mock.calls.filter(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { type?: unknown }).type === 'tau-eager-tool-input-available',
    );
    expect(inputChunks).toHaveLength(5);

    const outputChunks = writer.mock.calls.filter(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { type?: unknown }).type === 'tau-eager-tool-output-available',
    );
    expect(outputChunks).toHaveLength(5);

    expect(handler.entries.size).toBe(5);
    expect(invokeMock.mock.calls.length).toBe(5);
  });

  it('dispatches slots missing a streamed name exclusively via terminal tool_calls (handleLLMEnd backstop)', async () => {
    const writer = vi.fn();
    const runnableBaseline: RunnableConfig = {};
    const handler = new EagerToolDispatchHandler({ runnableConfigBaseline: runnableBaseline });
    const invokeMock = vi.fn(async ({ value }: { value: string }): Promise<string> => `ok:${value}`);
    handler.bindTools([createNoopTool(invokeMock)]);
    handler.setWriter(writer);

    emitChunk(handler, [{ index: 0, id: 'call_no_header', args: '{"value":"x"}', type: 'tool_call_chunk' }]);
    emitChunk(handler, [{ index: 1, id: 'call_b', name: 'noop', args: '', type: 'tool_call_chunk' }]);
    emitChunk(handler, [{ index: 1, args: '{"value":"y"}', type: 'tool_call_chunk' }]);

    expect(handler.entries.has('call_no_header'), 'Seal skips rows that never accumulated a streamed name').toBe(false);

    emitEnd(handler, [
      {
        id: 'call_no_header',
        name: 'noop',
        args: { value: 'x' },
        type: 'tool_call',
      },
      {
        id: 'call_b',
        name: 'noop',
        args: { value: 'y' },
        type: 'tool_call',
      },
    ]);

    await settleEntries(handler);

    expect(handler.entries.has('call_no_header')).toBe(true);
    expect(handler.entries.has('call_b')).toBe(true);
    expect(invokeMock.mock.calls.length).toBe(2);
  });

  it('routes id-only tool_call_chunks without index and still dispatches via terminal tool_calls when no second block seals the first', async () => {
    const runnableBaseline: RunnableConfig = {};
    const handler = new EagerToolDispatchHandler({ runnableConfigBaseline: runnableBaseline });
    const invokeMock = vi.fn(async ({ value }: { value: string }): Promise<string> => `ok:${value}`);
    handler.bindTools([createNoopTool(invokeMock)]);
    handler.setWriter(vi.fn());

    emitChunk(handler, [{ id: 'id_only_one', name: 'noop', args: '{"value":"solo"}', type: 'tool_call_chunk' }]);

    expect(handler.entries.size).toBe(0);

    emitEnd(handler, [{ id: 'id_only_one', name: 'noop', args: { value: 'solo' }, type: 'tool_call' }]);

    await settleEntries(handler);

    expect(handler.entries.has('id_only_one')).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('never double-invokes the same tool_call id across streaming seal and handleLLMEnd', async () => {
    const runnableBaseline: RunnableConfig = {};
    const handler = new EagerToolDispatchHandler({ runnableConfigBaseline: runnableBaseline });
    const invokeMock = vi.fn(async ({ value }: { value: string }): Promise<string> => `ok:${value}`);
    handler.bindTools([createNoopTool(invokeMock)]);
    handler.setWriter(vi.fn());

    emitChunk(handler, [
      { index: 0, id: 'call_x', name: 'noop', args: '', type: 'tool_call_chunk' },
      { index: 0, args: '{"value":"first"}', type: 'tool_call_chunk' },
    ]);
    emitChunk(handler, [{ index: 1, id: 'call_y', name: 'noop', args: '', type: 'tool_call_chunk' }]);
    emitChunk(handler, [{ index: 1, args: '{"value":"second"}', type: 'tool_call_chunk' }]);

    emitEnd(handler, [
      { id: 'call_x', name: 'noop', args: { value: 'first' }, type: 'tool_call' },
      { id: 'call_y', name: 'noop', args: { value: 'second' }, type: 'tool_call' },
    ]);

    await settleEntries(handler);

    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate terminal tool_call ids instead of silently collapsing them', async () => {
    const runnableBaseline: RunnableConfig = {};
    const handler = new EagerToolDispatchHandler({ runnableConfigBaseline: runnableBaseline });
    const invokeMock = vi.fn(async ({ value }: { value: string }): Promise<string> => `ok:${value}`);
    handler.bindTools([createNoopTool(invokeMock)]);
    handler.setWriter(vi.fn());

    emitEnd(handler, [
      { id: 'duplicate_call_id', name: 'noop', args: { value: 'first' }, type: 'tool_call' },
      { id: 'duplicate_call_id', name: 'noop', args: { value: 'second' }, type: 'tool_call' },
    ]);

    await settleEntries(handler);

    expect(handler.entries.size).toBe(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('records a sealed parse failure then repairs from terminal tool_calls', async () => {
    const runnableBaseline: RunnableConfig = {};
    const handler = new EagerToolDispatchHandler({ runnableConfigBaseline: runnableBaseline });
    const invokeMock = vi.fn(async ({ value }: { value: string }): Promise<string> => `ok:${value}`);
    handler.bindTools([createNoopTool(invokeMock)]);
    handler.setWriter(vi.fn());

    emitChunk(handler, [
      { index: 0, id: 'bad_json_slot', name: 'noop', args: '{broken-json', type: 'tool_call_chunk' },
    ]);
    emitChunk(handler, [{ index: 1, id: 'breaker', name: 'noop', args: '', type: 'tool_call_chunk' }]);
    emitChunk(handler, [{ index: 1, args: '{"value":"b"}', type: 'tool_call_chunk' }]);

    expect(handler.entries.has('bad_json_slot'), 'Strict parse refuses malformed args').toBe(false);
    expect(
      handler.entries.has('breaker'),
      'Trailing block is not sealed until the stream ends (no subsequent tool block)',
    ).toBe(false);

    emitEnd(handler, [
      {
        id: 'bad_json_slot',
        name: 'noop',
        args: { value: 'fixed' },
        type: 'tool_call',
      },
      { id: 'breaker', name: 'noop', args: { value: 'b' }, type: 'tool_call' },
    ]);

    await settleEntries(handler);

    expect(handler.entries.has('bad_json_slot')).toBe(true);
    expect(invokeMock.mock.calls.filter((call) => getToolInvokeValueArgument(call) === 'b')).toHaveLength(1);
    expect(invokeMock.mock.calls.filter((call) => getToolInvokeValueArgument(call) === 'fixed')).toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
