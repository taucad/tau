import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { renderCompactionTranscript } from '#api/chat/utils/compaction-renderer.js';

describe('renderCompactionTranscript', () => {
  it('renders provider-neutral text with message and tool boundaries', () => {
    const result = renderCompactionTranscript([
      new HumanMessage({ id: 'u1', content: 'Create a cube' }),
      new AIMessage({
        id: 'a1',
        content: [{ type: 'text', text: 'I will inspect the file.' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
        tool_calls: [{ id: 'call_read', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' }],
      }),
      new ToolMessage({
        content: 'export default cube();',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
        tool_call_id: 'call_read',
        name: 'read_file',
      }),
    ]);

    expect(result).toContain('--- message 1 role=user id=u1 ---');
    expect(result).toContain('Create a cube');
    expect(result).toContain('<tool_call index=0 id=call_read name=read_file>');
    expect(result).toContain('"targetFile":"main.ts"');
    expect(result).toContain('[tool_result tool_call_id=call_read name=read_file]');
    expect(result).toContain('export default cube();');
  });

  it('omits reasoning, tool-call content blocks, and opaque signatures', () => {
    const result = renderCompactionTranscript([
      new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'hidden', signature: 'opaque' },
          { type: 'thinking', thinking: 'hidden too', thoughtSignature: 'opaque-google' },
          { type: 'tool_call', id: 'call_bad', name: 'read_file', args: {} },
          { type: 'text', text: 'Visible answer' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
        tool_calls: [{ id: 'call_bad', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' }],
      }),
    ]);

    expect(result).toContain('Visible answer');
    expect(result).toContain('<tool_call index=0 id=call_bad name=read_file>');
    expect(result).not.toContain('hidden');
    expect(result).not.toContain('opaque');
    expect(result).not.toContain('thoughtSignature');
  });

  it('wraps matching content with keepContext tags', () => {
    const result = renderCompactionTranscript([new HumanMessage('Important <pin> detail')], {
      keepContextTags: ['<pin>'],
    });

    expect(result).toContain('<keepContext>');
    expect(result).toContain('Important <pin> detail');
    expect(result).toContain('</keepContext>');
  });
});
