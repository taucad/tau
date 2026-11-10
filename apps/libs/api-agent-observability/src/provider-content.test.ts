/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields use snake_case. */
import { describe, expect, it } from 'vitest';
import { vertexUpstreamBody } from '@taucad/api-llm-gateway';
import { ProviderOutputCapture, contentSection, requestContent } from '#provider-content.js';
import type { ContentMessage } from '#provider-content.js';

const png = Buffer.alloc(3000, 7).toString('base64');
const pdf = Buffer.alloc(500, 1).toString('base64');

/** Ten messages: four completed exchanges, then the new user message and its image. */
const anthropicBody = {
  model: 'claude-route',
  max_tokens: 8192,
  thinking: { type: 'enabled', budget_tokens: 4096 },
  metadata: { user_id: 'PRIVATE_ACCOUNT' },
  system: [{ type: 'text', text: 'You are Tau.' }],
  tools: [{ name: 'edit_file', input_schema: { type: 'object' } }],
  messages: [
    { role: 'user', content: 'OLD_PROMPT_1' },
    { role: 'assistant', content: [{ type: 'text', text: 'OLD_REPLY_1' }] },
    { role: 'user', content: 'OLD_PROMPT_2' },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'OLD_THOUGHT', signature: 'SIG' },
        { type: 'tool_use', id: 'toolu_1', name: 'edit_file', input: { path: 'a.ts' } },
      ],
    },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'OLD_RESULT' }] },
    { role: 'assistant', content: 'OLD_REPLY_2' },
    { role: 'user', content: 'OLD_PROMPT_3' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'screenshot', input: {} }] },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_2',
          content: [
            { type: 'text', text: 'Captured.' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } },
          ],
        },
      ],
    },
    { role: 'user', content: [{ type: 'text', text: 'Now make it taller' }] },
  ],
};

const completionsBody = {
  model: 'route',
  max_completion_tokens: 2000,
  reasoning_effort: 'high',
  tools: [{ type: 'function', function: { name: 'edit_file', parameters: {} } }],
  messages: [
    { role: 'system', content: 'You are Tau.' },
    { role: 'user', content: 'OLD_PROMPT_1' },
    { role: 'assistant', content: 'OLD_REPLY_1' },
    { role: 'user', content: 'OLD_PROMPT_2' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'edit_file', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'call_1', content: 'OLD_RESULT' },
    { role: 'assistant', content: 'OLD_REPLY_2' },
    { role: 'user', content: 'OLD_PROMPT_3' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'call_2', content: 'export default 1;' },
  ],
};

const responsesBody = {
  model: 'route',
  instructions: 'You are Tau.',
  max_output_tokens: 4000,
  reasoning: { effort: 'medium', summary: 'auto' },
  tools: [{ type: 'function', name: 'edit_file', parameters: {} }],
  input: [
    { role: 'user', content: 'OLD_PROMPT_1' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OLD_REPLY_1' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'OLD_PROMPT_2' }] },
    { type: 'reasoning', id: 'rs_1', encrypted_content: 'ENCRYPTED', summary: [] },
    { type: 'function_call', call_id: 'call_1', name: 'edit_file', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call_1', output: 'OLD_RESULT' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OLD_REPLY_2' }] },
    { role: 'user', content: 'OLD_PROMPT_3' },
    { type: 'function_call', call_id: 'call_2', name: 'read_file', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call_2', output: 'export default 1;' },
  ],
};

const allText = (messages: readonly ContentMessage[]): string => JSON.stringify(messages);

describe('requestContent', () => {
  it.each([
    ['anthropic', anthropicBody, 8],
    ['openai-completions', completionsBody, 8],
    ['openai-responses', responsesBody, 9],
  ] as const)('records only the messages after the last assistant message on %s', (wire, body, history) => {
    const content = requestContent(wire, body);

    expect(content).toBeDefined();
    const recorded = allText(content!.messages);
    expect(recorded).not.toMatch(/OLD_|ENCRYPTED|SIG|You are Tau/u);
    expect(content!.context.historyMessages).toBe(history);
    expect(content!.context.history).toMatch(/^[a-f\d]{64}$/u);
    expect(content!.context.system).toMatch(/^[a-f\d]{64}$/u);
    expect(content!.context.tools).toMatch(/^[a-f\d]{64}$/u);
  });

  it('records the tool results that answer the previous call, and an image as its type and size', () => {
    const content = requestContent('anthropic', anthropicBody)!;

    expect(content.messages).toEqual([
      {
        role: 'tool',
        parts: [
          { kind: 'tool-result', call: 'toolu_2', error: false, text: 'Captured.' },
          { kind: 'media', mime: 'image/png', bytes: 3000, digest: expect.stringMatching(/^[a-f\d]{64}$/u) as string },
        ],
      },
      { role: 'user', parts: [{ kind: 'text', text: 'Now make it taller' }] },
    ]);
    expect(allText(content.messages)).not.toContain(png.slice(0, 32));
  });

  it('records a tool result from each of the OpenAI wires', () => {
    for (const [wire, body] of [
      ['openai-completions', completionsBody],
      ['openai-responses', responsesBody],
    ] as const) {
      expect(requestContent(wire, body)!.messages).toEqual([
        { role: 'tool', parts: [{ kind: 'tool-result', call: 'call_2', error: false, text: 'export default 1;' }] },
      ]);
    }
  });

  it('records the first call of a chat whole, apart from its system prompt', () => {
    const content = requestContent('openai-completions', {
      messages: [
        { role: 'system', content: 'You are Tau.' },
        { role: 'user', content: 'Hello' },
      ],
    })!;

    expect(content.messages).toEqual([{ role: 'user', parts: [{ kind: 'text', text: 'Hello' }] }]);
    expect(content.context).toMatchObject({ historyMessages: 0, history: null, tools: null });
  });

  it('records the same PDF whether it reads the body before or after the Vertex rewrite', () => {
    const body = {
      model: 'route',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read this' },
            { type: 'file', file: { filename: 'spec.pdf', file_data: `data:application/pdf;base64,${pdf}` } },
          ],
        },
      ],
    };

    const before = requestContent('openai-completions', body);
    const after = requestContent('openai-completions', vertexUpstreamBody(body));

    expect(after).toEqual(before);
    expect(before!.messages[0]!.parts[1]).toMatchObject({ kind: 'media', mime: 'application/pdf', bytes: 500 });
  });

  it('keeps only allowlisted request parameters, flattened one level', () => {
    expect(requestContent('anthropic', anthropicBody)!.parameters).toEqual({
      max_tokens: 8192,
      'thinking.type': 'enabled',
      'thinking.budget_tokens': 4096,
    });
    expect(requestContent('openai-responses', responsesBody)!.parameters).toEqual({
      max_output_tokens: 4000,
      'reasoning.effort': 'medium',
      'reasoning.summary': 'auto',
    });
  });

  it('answers nothing for a body it cannot read', () => {
    expect(requestContent('anthropic', 'not a body')).toBeUndefined();
    expect(requestContent('openai-completions', { messages: 'x' })).toBeUndefined();
  });
});

const frames = (wire: ConstructorParameters<typeof ProviderOutputCapture>[0], items: readonly unknown[]) => {
  const capture = new ProviderOutputCapture(wire);
  for (const item of items) {
    capture.accept(item);
  }
  return capture;
};

describe('ProviderOutputCapture', () => {
  it('assembles an Anthropic message with readable thinking, text and a tool call, and no signature', () => {
    const capture = frames('anthropic', [
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Need ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'height.' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIGNATURE' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'redacted_thinking', data: 'ENCRYPTED' } },
      { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Raising it.' } },
      {
        type: 'content_block_start',
        index: 3,
        content_block: { type: 'tool_use', id: 'toolu_9', name: 'edit_file', input: {} },
      },
      { type: 'content_block_delta', index: 3, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
      { type: 'content_block_delta', index: 3, delta: { type: 'input_json_delta', partial_json: '"a.ts"}' } },
    ]);

    expect(capture.messages()).toEqual([
      {
        role: 'assistant',
        parts: [
          { kind: 'thinking', text: 'Need height.' },
          { kind: 'text', text: 'Raising it.' },
          { kind: 'tool-call', call: 'toolu_9', name: 'edit_file', text: '{"path":"a.ts"}' },
        ],
      },
    ]);
    expect(allText(capture.messages())).not.toMatch(/SIGNATURE|ENCRYPTED/u);
  });

  it('assembles a Responses output from its finished items, reasoning summary only', () => {
    const capture = frames('openai-responses', [
      {
        type: 'response.output_item.done',
        item: {
          type: 'reasoning',
          encrypted_content: 'ENCRYPTED',
          summary: [{ type: 'summary_text', text: 'Think.' }],
        },
      },
      {
        type: 'response.output_item.done',
        item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] },
      },
      {
        type: 'response.output_item.done',
        item: { type: 'function_call', call_id: 'call_7', name: 'edit_file', arguments: '{"a":1}' },
      },
    ]);

    expect(capture.messages()).toEqual([
      {
        role: 'assistant',
        parts: [
          { kind: 'thinking', text: 'Think.' },
          { kind: 'text', text: 'Done.' },
          { kind: 'tool-call', call: 'call_7', name: 'edit_file', text: '{"a":1}' },
        ],
      },
    ]);
  });

  it('assembles a completions output from its deltas', () => {
    const capture = frames('openai-completions', [
      { choices: [{ delta: { reasoning_content: 'Hmm.' } }] },
      { choices: [{ delta: { content: 'Hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] },
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, id: 'call_3', function: { name: 'edit_file', arguments: '{"x"' } }] } },
        ],
      },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] } }] },
    ]);

    expect(capture.messages()).toEqual([
      {
        role: 'assistant',
        parts: [
          { kind: 'thinking', text: 'Hmm.' },
          { kind: 'text', text: 'Hello' },
          { kind: 'tool-call', call: 'call_3', name: 'edit_file', text: '{"x":1}' },
        ],
      },
    ]);
  });

  it('stops collecting at its bound and says so', () => {
    const capture = new ProviderOutputCapture('anthropic', 10);
    capture.accept({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    capture.accept({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '0123456789ABCDEF' } });

    expect(capture.truncated).toBe(true);
    expect(capture.messages()).toEqual([{ role: 'assistant', parts: [{ kind: 'text', text: '0123456789' }] }]);
  });
});

describe('contentSection', () => {
  it('caps a part at 64 KiB and keeps only the size and digest of a larger tool result', () => {
    const big = 'line of source\n'.repeat(6000);
    const section = contentSection([
      {
        role: 'tool',
        parts: [
          { kind: 'tool-result', call: 'call_1', error: false, text: big },
          { kind: 'text', text: big },
        ],
      },
    ]);

    const [result, text] = section.messages[0]!.parts;
    expect(result).toMatchObject({ kind: 'tool-result', text: '', retainedBytes: 0, redaction: 'truncated' });
    expect(result).toHaveProperty('digest', expect.stringMatching(/^[a-f\d]{64}$/u));
    expect(text).toMatchObject({ kind: 'text', retainedBytes: 65_536, redaction: 'truncated' });
  });

  it('redacts credentials at the source', () => {
    const section = contentSection([
      { role: 'user', parts: [{ kind: 'text', text: 'my key is ghp_abcdefghijklmnopqrstuvwxyz0123456789' }] },
    ]);

    expect(section.messages[0]!.parts[0]).toMatchObject({ text: 'my key is [credential]', redaction: 'redacted' });
  });

  it('spends one text budget across the section and counts what the bounds left out', () => {
    const parts = Array.from({ length: 40 }, () => ({ kind: 'text', text: 'x '.repeat(100) }) as const);
    const section = contentSection([{ role: 'user', parts }], 250);

    expect(section.messages[0]!.parts).toHaveLength(32);
    expect(section.omitted).toBe(8);
    const kept = section.messages[0]!.parts.map((part) => ('retainedBytes' in part ? part.retainedBytes : 0));
    expect(kept.reduce((sum, bytes) => sum + bytes, 0)).toBe(250);
  });
});
