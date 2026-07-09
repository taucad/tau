import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCrossProviderContentNormalizerMiddleware } from '#api/chat/middleware/cross-provider-content-normalizer.middleware.js';
import { invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

describe('createCrossProviderContentNormalizerMiddleware', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn().mockResolvedValue({ content: 'response' });
  });

  it('maps Anthropic thinking to reasoning and keeps signature when target is anthropic', async () => {
    const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
    const aiMessage = new AIMessage({
      content: [
        {
          type: 'thinking',
          thinking: 'plan step',
          signature: 'sig-anthropic',
        },
      ],
    });
    const messages: BaseMessage[] = [new HumanMessage('hi'), aiMessage];

    await invokeWrapModelCall(middleware, { messages }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    const out = request.messages[1] as AIMessage;
    expect(out.content).toEqual([{ type: 'reasoning', reasoning: 'plan step', signature: 'sig-anthropic' }]);
  });

  it('maps thinking to reasoning and drops signature when target is not anthropic', async () => {
    const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
    const aiMessage = new AIMessage({
      content: [{ type: 'thinking', thinking: 'plan step', signature: 'sig-anthropic' }],
    });

    await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    expect((request.messages[0] as AIMessage).content).toEqual([{ type: 'reasoning', reasoning: 'plan step' }]);
  });

  it('wraps redacted_thinking and compaction as non_standard', async () => {
    const middleware = createCrossProviderContentNormalizerMiddleware('openai');
    const redacted = { type: 'redacted_thinking', data: 'x' };
    const compaction = { type: 'compaction', id: 'c1' };
    const aiMessage = new AIMessage({
      content: [redacted, compaction],
    });

    await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    expect((request.messages[0] as AIMessage).content).toEqual([
      { type: 'non_standard', value: redacted },
      { type: 'non_standard', value: compaction },
    ]);
  });

  it('passes through V1 reasoning unchanged when already normalized (idempotent)', async () => {
    const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
    const aiMessage = new AIMessage({
      content: [{ type: 'reasoning', reasoning: 'already v1', signature: 's' }],
    });

    await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    expect(request.messages[0]).toBe(aiMessage);
  });

  it('strips signature from reasoning when target is not anthropic', async () => {
    const middleware = createCrossProviderContentNormalizerMiddleware('together');
    const aiMessage = new AIMessage({
      content: [{ type: 'reasoning', reasoning: 'r', signature: 'sig' }],
    });

    await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    expect((request.messages[0] as AIMessage).content).toEqual([{ type: 'reasoning', reasoning: 'r' }]);
  });

  it('does not modify HumanMessage, ToolMessage, or string AIMessage content', async () => {
    const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
    const human = new HumanMessage('hello');
    const tool = new ToolMessage({
      content: '{}',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_call_id: 't1',
      name: 'read_file',
    });
    const aiString = new AIMessage('plain');

    await invokeWrapModelCall(middleware, { messages: [human, tool, aiString] }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    expect(request.messages[0]).toBe(human);
    expect(request.messages[1]).toBe(tool);
    expect(request.messages[2]).toBe(aiString);
  });

  it('rewrites thinking in multiple AIMessages in one pass', async () => {
    const middleware = createCrossProviderContentNormalizerMiddleware('openai');
    const messages: BaseMessage[] = [
      new AIMessage({ content: [{ type: 'thinking', thinking: 'a', signature: 'x' }] }),
      new AIMessage({ content: [{ type: 'thinking', thinking: 'b', signature: 'y' }] }),
    ];

    await invokeWrapModelCall(middleware, { messages }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    expect((request.messages[0] as AIMessage).content).toEqual([{ type: 'reasoning', reasoning: 'a' }]);
    expect((request.messages[1] as AIMessage).content).toEqual([{ type: 'reasoning', reasoning: 'b' }]);
  });

  /* eslint-disable @typescript-eslint/naming-convention -- LangChain/OpenAI native content blocks use snake_case (image_url, input_image) throughout these test fixtures */
  describe('OpenAI ToolMessage content rewriting', () => {
    const screenshotDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';

    it('rewrites text + image_url (object form) to input_text + input_image for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const tool = new ToolMessage({
        content: [
          { type: 'text', text: 'Inspector prompt' },
          { type: 'image_url', image_url: { url: screenshotDataUrl } },
        ],
        tool_call_id: 'call_screenshot',
        name: 'screenshot',
      });

      await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as ToolMessage;
      expect(out.content).toEqual([
        { type: 'input_text', text: 'Inspector prompt' },
        { type: 'input_image', image_url: screenshotDataUrl, detail: 'auto' },
      ]);
      expect(out.tool_call_id).toBe('call_screenshot');
      expect(out.name).toBe('screenshot');
    });

    it('rewrites image_url string form to input_image for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const tool = new ToolMessage({
        content: [{ type: 'image_url', image_url: screenshotDataUrl }],
        tool_call_id: 'call_screenshot_str',
        name: 'screenshot',
      });

      await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as ToolMessage;
      expect(out.content).toEqual([{ type: 'input_image', image_url: screenshotDataUrl, detail: 'auto' }]);
    });

    it('produces a homogeneous input_* array (every block must be input_text|input_image|input_file)', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const tool = new ToolMessage({
        content: [
          { type: 'text', text: 'one' },
          { type: 'image_url', image_url: { url: screenshotDataUrl } },
          { type: 'text', text: 'two' },
        ],
        tool_call_id: 'call_mixed',
      });

      await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as ToolMessage;
      const blocks = out.content as Array<{ type: string }>;
      const allInput = blocks.every(
        (b) => b.type === 'input_text' || b.type === 'input_image' || b.type === 'input_file',
      );
      expect(allInput).toBe(true);
      expect(blocks.find((b) => b.type === 'text')).toBeUndefined();
      expect(blocks.find((b) => b.type === 'image_url')).toBeUndefined();
    });

    it('passes through already-native input_image / input_text blocks unchanged', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const native = [
        { type: 'input_text', text: 'already native' },
        { type: 'input_image', image_url: screenshotDataUrl, detail: 'high' },
      ];
      const tool = new ToolMessage({
        content: native,
        tool_call_id: 'call_native',
      });

      await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages[0]).toBe(tool);
    });

    it('leaves string tool content untouched for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const tool = new ToolMessage({
        content: '{"foo":"bar"}',
        tool_call_id: 'call_string',
        name: 'read_file',
      });

      await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages[0]).toBe(tool);
    });

    it.each(['anthropic', 'vertexai', 'cerebras', 'together', 'ollama'] as const)(
      'leaves screenshot-shaped ToolMessage byte-identical for %s target (cache-stability guard)',
      async (provider) => {
        const middleware = createCrossProviderContentNormalizerMiddleware(provider);
        const original = [
          { type: 'text', text: 'Inspector prompt' },
          { type: 'image_url', image_url: { url: screenshotDataUrl } },
        ];
        const tool = new ToolMessage({
          content: original,
          tool_call_id: 'call_screenshot',
          name: 'screenshot',
        });

        await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

        const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
        expect(request.messages[0]).toBe(tool);
        expect((request.messages[0] as ToolMessage).content).toBe(original);
      },
    );
  });
  /* eslint-enable @typescript-eslint/naming-convention -- end of LangChain/OpenAI native shape fixtures */

  describe('tool-call content portability', () => {
    const populatedToolCalls = [
      {
        id: 'call_read_1',
        name: 'read_file',
        args: { targetFile: 'main.ts' },
        type: 'tool_call',
      },
    ];

    it('strips Anthropic tool_use blocks for vertexai while preserving tool_calls', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'Reading the file.' },
          {
            type: 'tool_use',
            id: 'call_read_1',
            name: 'read_file',
            input: { targetFile: 'main.ts' },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([{ type: 'text', text: 'Reading the file.' }]);
      expect(out.tool_calls).toEqual(populatedToolCalls);
    });

    it('strips V1 tool_call family blocks for vertexai while preserving tool_calls', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
          { type: 'tool_call_chunk', id: 'call_read_1', name: 'read_file', args: '{"target' },
          { type: 'input_json_delta', input: 'File":"main.ts"}' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([]);
      expect(out.tool_calls).toEqual(populatedToolCalls);
    });

    it('strips v1 tool_call blocks for vertexai without LangChain constructor re-adding them', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'Reading the file.' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([{ type: 'text', text: 'Reading the file.' }]);
      expect(out.tool_calls).toEqual(populatedToolCalls);
      expect(out.response_metadata.output_version).toBeUndefined();
    });

    it('drops v1 output metadata during vertexai legacy cleanup so constructor tool blocks stay stripped', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: {
          custom: 'kept',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          function_call: { name: 'read_file', arguments: '{"targetFile":"legacy.ts"}' },
        },
      });
      (aiMessage.response_metadata as Record<string, unknown>)['output_version'] = 'v1';

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([]);
      expect(out.tool_calls).toEqual(populatedToolCalls);
      expect(out.additional_kwargs).toEqual({ custom: 'kept' });
      expect(out.response_metadata.output_version).toBeUndefined();
    });

    it('normalizes checkpoint-style plain AI messages for vertexai', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = {
        type: 'ai',
        content: [
          { type: 'text', text: 'Reading the file.' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
      } as unknown as BaseMessage;

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(AIMessage.isInstance(out)).toBe(true);
      expect(out.content).toEqual([{ type: 'text', text: 'Reading the file.' }]);
      expect(out.tool_calls).toEqual(populatedToolCalls);
      expect(out.response_metadata.output_version).toBeUndefined();
    });

    it('maps thinking and strips tool_use for vertexai in one pass (mixed reasoning + tool)', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'thinking', thinking: 'plan', signature: 'sig' },
          {
            type: 'tool_use',
            id: 'call_read_1',
            name: 'read_file',
            input: { targetFile: 'main.ts' },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([{ type: 'reasoning', reasoning: 'plan' }]);
      expect(out.tool_calls).toEqual(populatedToolCalls);
    });

    it('heals empty tool_call args from tool_calls for anthropic target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [{ type: 'tool_call', id: 'call_read_1', name: 'read_file', args: '' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const block = (out.content as Array<{ type: string; args: unknown }>)[0];
      expect(block).toEqual({
        type: 'tool_call',
        id: 'call_read_1',
        name: 'read_file',
        args: healedArgs,
      });
    });

    it('dedupes repeated native tool_use ids for anthropic target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'Reading.' },
          { type: 'tool_use', id: 'call_read_1', name: 'read_file', input: '' },
          { type: 'tool_use', id: 'call_read_1', name: 'read_file', input: { stale: true } },
          { type: 'tool_use', id: 'call_read_2', name: 'read_file', input: { targetFile: 'other.ts' } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [
          { id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' },
          { id: 'call_read_2', name: 'read_file', args: { targetFile: 'other.ts' }, type: 'tool_call' },
        ],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const toolBlocks = (out.content as Array<{ type: string; id?: string; input?: unknown }>).filter(
        (block) => block.type === 'tool_use',
      );
      expect(toolBlocks).toEqual([
        { type: 'tool_use', id: 'call_read_1', name: 'read_file', input: healedArgs },
        { type: 'tool_use', id: 'call_read_2', name: 'read_file', input: { targetFile: 'other.ts' } },
      ]);
      expect(out.tool_calls).toEqual(aiMessage.tool_calls);
    });

    it('dedupes repeated v1 tool_call ids for anthropic target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'Reading.' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: '' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { stale: true } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const toolBlocks = (out.content as Array<{ type: string; id?: string; args?: unknown }>).filter(
        (block) => block.type === 'tool_call',
      );
      expect(toolBlocks).toEqual([{ type: 'tool_call', id: 'call_read_1', name: 'read_file', args: healedArgs }]);
      expect(out.response_metadata.output_version).toBe('v1');
      expect(out.tool_calls).toEqual(aiMessage.tool_calls);
    });

    it('dedupes v1 tool_call_chunk when the finalized tool_call for the same id is present', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'I need to inspect a file.' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: '' },
          { type: 'tool_call_chunk', id: 'call_read_1', name: 'read_file', args: '{"targetFile":"main.ts"}' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([
        { type: 'reasoning', reasoning: 'I need to inspect a file.' },
        { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: healedArgs },
      ]);
      expect(
        (out.content as Array<{ type: string; id?: string }>).filter(
          (block) => (block.type === 'tool_call' || block.type === 'tool_call_chunk') && block.id === 'call_read_1',
        ),
      ).toHaveLength(1);
    });

    it('canonicalizes native tool_use blocks in v1 anthropic replay so the constructor cannot re-add tool_call duplicates', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'Reading.' },
          { type: 'tool_use', id: 'call_read_1', name: 'read_file', input: '' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([
        { type: 'text', text: 'Reading.' },
        { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: healedArgs },
      ]);
      expect(
        (out.content as Array<{ type: string; id?: string }>).filter(
          (block) => (block.type === 'tool_use' || block.type === 'tool_call') && block.id === 'call_read_1',
        ),
      ).toHaveLength(1);
      expect(out.response_metadata.output_version).toBe('v1');
      expect(out.tool_calls).toEqual(aiMessage.tool_calls);
    });

    it('normalizes checkpoint-style plain AI messages for anthropic duplicate tool_call ids', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = {
        type: 'ai',
        content: [
          { type: 'text', text: 'Reading.' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: '' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { stale: true } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      } as unknown as BaseMessage;

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const toolBlocks = (out.content as Array<{ type: string; id?: string; args?: unknown }>).filter(
        (block) => block.type === 'tool_call',
      );
      expect(AIMessage.isInstance(out)).toBe(true);
      expect(toolBlocks).toEqual([{ type: 'tool_call', id: 'call_read_1', name: 'read_file', args: healedArgs }]);
      expect(out.response_metadata.output_version).toBe('v1');
    });

    it('leaves duplicate tool_use ids untouched for non-anthropic targets', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const duplicateContent = [
        { type: 'tool_use', id: 'call_read_1', name: 'read_file', input: { targetFile: 'main.ts' } },
        { type: 'tool_use', id: 'call_read_1', name: 'read_file', input: { targetFile: 'main.ts' } },
      ];
      const aiMessage = new AIMessage({
        content: duplicateContent,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect((request.messages[0] as AIMessage).content).toEqual(duplicateContent);
    });

    it('leaves non-empty tool_call args unchanged for anthropic target (idempotent)', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('anthropic');
      const args = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [{ type: 'tool_call', id: 'call_read_1', name: 'read_file', args }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages[0]).toBe(aiMessage);
    });

    it('heals empty tool_call args from tool_calls for morph target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('morph');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [{ type: 'tool_call', id: 'call_read_1', name: 'read_file', args: '' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const block = (out.content as Array<{ type: string; args: unknown }>)[0];
      expect(block).toEqual({
        type: 'tool_call',
        id: 'call_read_1',
        name: 'read_file',
        args: healedArgs,
      });
    });

    it('rewrites V1 assistant text blocks to output_text items and keeps output_version for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'openai' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([
        {
          type: 'non_standard',
          value: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello world', annotations: [] }],
          },
        },
        { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
      ]);
      // The load-bearing v1 flag is preserved (not cleared).
      expect(out.response_metadata.output_version).toBe('v1');
      expect(out.response_metadata.model_provider).toBe('openai');
      expect(out.tool_calls).toEqual(populatedToolCalls);
    });

    it('normalizes model_provider to openai for cross-provider replay so output_text passes through', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const aiMessage = new AIMessage({
        content: [{ type: 'text', text: 'Switched from anthropic.' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.response_metadata.model_provider).toBe('openai');
      expect(out.response_metadata.output_version).toBe('v1');
      expect(out.content).toEqual([
        {
          type: 'non_standard',
          value: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Switched from anthropic.', annotations: [] }],
          },
        },
      ]);
    });

    it('drops foreign non_standard wrappers when rewriting text for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'redacted_thinking', data: 'opaque' },
          { type: 'text', text: 'Visible answer.' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toEqual([
        {
          type: 'non_standard',
          value: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Visible answer.', annotations: [] }],
          },
        },
      ]);
    });

    it('heals empty tool_call args from tool_calls for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'Reading.' },
          { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: '' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'openai' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const toolBlock = (out.content as Array<{ type: string; args?: unknown }>).find(
        (block) => block.type === 'tool_call',
      );
      expect(toolBlock?.args).toEqual(healedArgs);
    });

    it('drops reasoning blocks lacking a valid id for openai (would emit empty-id reasoning item)', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'persisted summary without rs_ id' },
          { type: 'text', text: 'Answer.' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'openai' },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const blocks = out.content as Array<{ type: string }>;
      expect(blocks.find((block) => block.type === 'reasoning')).toBeUndefined();
      expect(blocks).toEqual([
        {
          type: 'non_standard',
          value: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Answer.', annotations: [] }],
          },
        },
      ]);
    });

    it('keeps reasoning blocks with a valid id for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const reasoningWithId = { type: 'reasoning', reasoning: 'kept', id: 'rs_abc123' };
      const aiMessage = new AIMessage({
        content: [reasoningWithId, { type: 'tool_call', id: 'call_1', name: 'read_file', args: { targetFile: 'x' } }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'openai' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_1', name: 'read_file', args: { targetFile: 'x' }, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      const blocks = out.content as Array<{ type: string; id?: string }>;
      expect(blocks.find((block) => block.type === 'reasoning')).toEqual(reasoningWithId);
    });

    it('heals empty tool_call args from tool_calls for xai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('xai');
      const healedArgs = { targetFile: 'main.ts' };
      const aiMessage = new AIMessage({
        content: [{ type: 'tool_call', id: 'call_read_1', name: 'read_file', args: '' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'openai' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_read_1', name: 'read_file', args: healedArgs, type: 'tool_call' }],
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect((out.content as Array<{ args?: unknown }>)[0]?.args).toEqual(healedArgs);
    });

    it('drops idless reasoning and rewrites assistant text for xai Responses replay', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('xai');
      const aiMessage = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'summary without provider id' },
          { type: 'text', text: 'Answer.' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.response_metadata.model_provider).toBe('openai');
      expect(out.content).toEqual([
        {
          type: 'non_standard',
          value: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Answer.', annotations: [] }],
          },
        },
      ]);
    });

    it('normalizes tool message image blocks for xai Responses replay', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('xai');
      const toolMessage = new ToolMessage({
        content: [
          { type: 'text', text: 'screenshot' },
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain image blocks use snake_case.
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_screenshot',
      });

      await invokeWrapModelCall(middleware, { messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect((request.messages[0] as ToolMessage).content).toEqual([
        { type: 'input_text', text: 'screenshot' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI/xAI Responses image blocks use snake_case.
        { type: 'input_image', image_url: 'data:image/png;base64,abc', detail: 'auto' },
      ]);
    });

    it('leaves V1 assistant message without text blocks untouched for openai target', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('openai');
      const aiMessage = new AIMessage({
        content: [{ type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: populatedToolCalls,
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      // No text block => no rewrite, model_provider untouched.
      expect(out.response_metadata.model_provider).toBe('anthropic');
      expect(out.content).toEqual([
        { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
      ]);
    });

    it('canonicalizes replay-safe legacy additional_kwargs.tool_calls for vertexai', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: {
          custom: 'kept',
          signatures: ['sig'],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          tool_calls: [
            {
              id: 'call_legacy_read',
              type: 'function',
              function: { name: 'read_file', arguments: '{"targetFile":"main.ts"}' },
            },
          ],
        },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.tool_calls).toEqual([
        { id: 'call_legacy_read', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' },
      ]);
      expect(out.additional_kwargs).toEqual({ custom: 'kept', signatures: ['sig'] });
    });

    it('canonicalizes legacy additional_kwargs.tool_calls for vertexai when content is scalar text', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: 'Reading the file.',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: {
          custom: 'kept',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          tool_calls: [
            {
              id: 'call_legacy_read',
              type: 'function',
              function: { name: 'read_file', arguments: '{"targetFile":"main.ts"}' },
            },
          ],
        },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.content).toBe('Reading the file.');
      expect(out.tool_calls).toEqual([
        { id: 'call_legacy_read', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' },
      ]);
      expect(out.additional_kwargs).toEqual({ custom: 'kept' });
    });

    it('drops nameless legacy additional_kwargs.tool_calls for vertexai instead of replaying them', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: {
          custom: 'kept',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          tool_calls: [
            {
              id: '218421',
              type: 'function',
              function: { name: '', arguments: '{}' },
            },
          ],
        },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.tool_calls ?? []).toEqual([]);
      expect(out.additional_kwargs).toEqual({ custom: 'kept' });
    });

    it('drops malformed legacy tool args for vertexai when no canonical tool_calls exist', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          tool_calls: [
            {
              id: 'call_bad_args',
              type: 'function',
              function: { name: 'read_file', arguments: '{"limit":40}{"targetFile":"main.ts"}' },
            },
          ],
        },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.tool_calls ?? []).toEqual([]);
      expect(out.additional_kwargs).toEqual({});
    });

    it('keeps canonical tool_calls authoritative and drops divergent legacy metadata for vertexai', async () => {
      const middleware = createCrossProviderContentNormalizerMiddleware('vertexai');
      const aiMessage = new AIMessage({
        content: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_canonical', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          tool_calls: [
            {
              id: 'call_legacy',
              type: 'function',
              function: { name: '', arguments: '{}' },
            },
          ],
        },
      });

      await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as AIMessage;
      expect(out.tool_calls).toEqual([
        { id: 'call_canonical', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' },
      ]);
      expect(out.additional_kwargs).toEqual({});
    });

    it.each(['anthropic', 'vertexai', 'openai', 'together', 'cerebras', 'ollama', 'xai'] as const)(
      'leaves tool-free AIMessage byte-identical for %s when no rewrite applies',
      async (provider) => {
        const middleware = createCrossProviderContentNormalizerMiddleware(provider);
        const aiMessage = new AIMessage({
          content: [{ type: 'text', text: 'plain assistant text' }],
        });

        await invokeWrapModelCall(middleware, { messages: [aiMessage] }, handler);

        const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
        expect(request.messages[0]).toBe(aiMessage);
      },
    );
  });
});
