import { toBaseMessages } from '@ai-sdk/langchain';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { MyUIMessage } from '@taucad/chat';
import { describe, expect, it, vi } from 'vitest';
import { deterministicToolMessageId, toBaseMessagesWithIds } from '#api/chat/utils/to-base-messages-with-ids.js';

vi.mock('@ai-sdk/langchain', () => ({
  toBaseMessages: vi.fn(),
}));

const toolCallsKey = 'tool_calls';

describe('toBaseMessagesWithIds', () => {
  it('restores stable UI message ids on user and assistant messages', async () => {
    vi.mocked(toBaseMessages).mockResolvedValueOnce([new HumanMessage('hello'), new AIMessage('hi')] as Awaited<
      ReturnType<typeof toBaseMessages>
    >);

    const result = await toBaseMessagesWithIds([
      { id: 'msg_user', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      { id: 'msg_assistant', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
    ]);

    expect(result[0]?.id).toBe('msg_user');
    expect(result[1]?.id).toBe('msg_assistant');
  });

  it('uses deterministic assistant-owned ids for converted tool messages', async () => {
    vi.mocked(toBaseMessages).mockResolvedValueOnce([
      new HumanMessage('run tool'),
      new AIMessage({
        content: '',
        [toolCallsKey]: [{ id: 'call_1', name: 'read_file', args: { targetFile: 'main.ts' } }],
      }),
      new ToolMessage({
        content: JSON.stringify({ content: 'ok' }),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain wire shape uses snake_case
        tool_call_id: 'call_1',
        name: 'read_file',
      }),
    ] as Awaited<ReturnType<typeof toBaseMessages>>);

    const messages: MyUIMessage[] = [
      { id: 'msg_user', role: 'user', parts: [{ type: 'text', text: 'run tool' }] },
      {
        id: 'msg_assistant',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'call_1',
            state: 'output-available',
            input: { targetFile: 'main.ts' },
            output: { content: 'ok' },
          } as unknown as MyUIMessage['parts'][number],
        ],
      },
    ];

    const result = await toBaseMessagesWithIds(messages);

    expect(result[1]?.id).toBe('msg_assistant');
    expect(result[2]?.id).toBe(deterministicToolMessageId('msg_assistant', 'call_1'));
  });
});
