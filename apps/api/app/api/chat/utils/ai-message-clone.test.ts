import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { cloneAiMessage } from '#api/chat/utils/ai-message-clone.js';

describe('cloneAiMessage', () => {
  it('preserves provider replay metadata unless explicitly overridden', () => {
    const toolCalls = [{ id: 'call_read', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' }];
    const invalidToolCalls = [
      { id: 'bad_call', name: 'read_file', args: '{"targetFile":', error: 'Malformed args', type: 'invalid_tool_call' },
    ];
    const additionalKwargs = {
      providerNative: {
        functionCallSignatures: [{ id: 'call_read', thoughtSignature: 'sig_google' }],
      },
    };
    const responseMetadata = { model_provider: 'vertexai', output_version: 'v1' };
    const usageMetadata = { input_tokens: 10, output_tokens: 2, total_tokens: 12 };
    const message = new AIMessage({
      content: [{ type: 'text', text: 'hello' }],
      id: 'msg_ai',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      tool_calls: toolCalls,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      invalid_tool_calls: invalidToolCalls,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      additional_kwargs: additionalKwargs,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      response_metadata: responseMetadata,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      usage_metadata: usageMetadata,
    });

    const result = cloneAiMessage(message, { content: [{ type: 'text', text: 'changed' }] });

    expect(result.content).toEqual([
      { type: 'text', text: 'changed' },
      { id: 'call_read', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' },
    ]);
    expect(result.id).toBe('msg_ai');
    expect(result.tool_calls).toEqual(toolCalls);
    expect(result.invalid_tool_calls).toEqual(invalidToolCalls);
    expect(result.additional_kwargs).toEqual(additionalKwargs);
    expect(result.response_metadata).toEqual(responseMetadata);
    expect(result.usage_metadata).toEqual(usageMetadata);
  });

  it('allows intentional provider metadata overrides', () => {
    const message = new AIMessage({
      content: 'hello',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      additional_kwargs: { stale: true },
    });

    const result = cloneAiMessage(message, {
      additionalKwargs: { fresh: true },
      toolCalls: [],
    });

    expect(result.additional_kwargs).toEqual({ fresh: true });
    expect(result.tool_calls).toEqual([]);
  });

  it('drops v1 output marker when scalar content would violate LangChain constructor invariants', () => {
    const message = new AIMessage({
      content: [{ type: 'text', text: 'hello' }],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      response_metadata: { model_provider: 'openai', output_version: 'v1' },
    });

    const result = cloneAiMessage(message, { content: 'plain text' });

    expect(result.content).toBe('plain text');
    expect(result.response_metadata).toEqual({ model_provider: 'openai' });
  });
});
