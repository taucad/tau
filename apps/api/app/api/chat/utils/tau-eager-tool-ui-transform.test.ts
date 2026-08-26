import { describe, expect, it } from 'vitest';
import type { UIMessageChunk } from 'ai';
import { createTauEagerToolUiTransform } from '#api/chat/utils/tau-eager-tool-ui-transform.js';

async function transformChunks(chunks: UIMessageChunk[]): Promise<UIMessageChunk[]> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return Array.fromAsync(stream.pipeThrough(createTauEagerToolUiTransform()));
}

describe('createTauEagerToolUiTransform', () => {
  it('keeps eager tool output settled when late adapter input chunks arrive', async () => {
    const chunks = await transformChunks([
      {
        type: 'data-tau-eager-tool-input-available',
        id: 'data_input',
        data: {
          type: 'tau-eager-tool-input-available',
          toolCallId: 'call_create',
          toolName: 'create_file',
          input: { targetFile: 'main.ts' },
        },
      },
      {
        type: 'data-tau-eager-tool-output-available',
        id: 'data_output',
        data: {
          type: 'tau-eager-tool-output-available',
          toolCallId: 'call_create',
          output: { success: true },
        },
      },
      {
        type: 'tool-input-start',
        toolCallId: 'call_create',
        toolName: 'create_file',
      },
      {
        type: 'tool-input-delta',
        toolCallId: 'call_create',
        inputTextDelta: '{"targetFile":"main.ts"}',
      },
      {
        type: 'tool-output-error',
        toolCallId: 'call_create',
        errorText: 'late duplicate failure',
      },
    ] as UIMessageChunk[]);

    expect(chunks).toEqual([
      {
        type: 'tool-input-available',
        toolCallId: 'call_create',
        toolName: 'create_file',
        input: { targetFile: 'main.ts' },
        dynamic: true,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call_create',
        output: { success: true },
      },
    ]);
  });
});
