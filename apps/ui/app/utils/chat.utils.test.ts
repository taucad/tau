import process from 'node:process';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { createMessage, serializeMessage, serializeTranscript } from '#utils/chat.utils.js';
import { metaConfig } from '#constants/meta.constants.js';

const baseMessage = (parts: MyUIMessage['parts']): MyUIMessage => ({
  id: 'msg-1',
  role: 'assistant',
  parts,
});

describe('serializeMessage', () => {
  describe('text parts', () => {
    it('serializes a single text part', () => {
      const message = baseMessage([{ type: 'text', text: 'Hello world' }]);
      expect(serializeMessage(message)).toBe('Hello world');
    });

    it('joins multiple text parts with double newline', () => {
      const message = baseMessage([
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' },
      ]);
      expect(serializeMessage(message)).toBe('First\n\nSecond');
    });
  });

  describe('reasoning parts', () => {
    it('wraps reasoning in thinking tags', () => {
      const message = baseMessage([{ type: 'reasoning', text: 'Let me consider...' }]);
      expect(serializeMessage(message)).toBe('<thinking>\nLet me consider...\n</thinking>');
    });
  });

  describe('step-start parts', () => {
    it('omits step-start and produces no segment', () => {
      const message = baseMessage([{ type: 'step-start' }]);
      expect(serializeMessage(message)).toBe('');
    });

    it('omits step-start among other parts', () => {
      const message = baseMessage([
        { type: 'text', text: 'Before' },
        { type: 'step-start' },
        { type: 'text', text: 'After' },
      ]);
      expect(serializeMessage(message)).toBe('Before\n\nAfter');
    });
  });

  describe('file parts', () => {
    it('serializes file with filename', () => {
      const message = baseMessage([
        { type: 'file', url: 'data:image/png;base64,abc', mediaType: 'image/png', filename: 'screenshot.png' },
      ]);
      expect(serializeMessage(message)).toBe('[Attached file: screenshot.png (image/png)]');
    });

    it('serializes file without filename as image', () => {
      const message = baseMessage([{ type: 'file', url: 'data:image/webp;base64,xyz', mediaType: 'image/webp' }]);
      expect(serializeMessage(message)).toBe('[Attached image (image/webp)]');
    });
  });

  describe('source-url parts', () => {
    it('serializes as markdown link with title', () => {
      const message = baseMessage([
        { type: 'source-url', sourceId: 's1', url: 'https://example.com', title: 'Example' },
      ]);
      expect(serializeMessage(message)).toBe('[Example](https://example.com)');
    });

    it('falls back to url when title missing', () => {
      const message = baseMessage([{ type: 'source-url', sourceId: 's1', url: 'https://example.com' }]);
      expect(serializeMessage(message)).toBe('[https://example.com](https://example.com)');
    });
  });

  describe('source-document parts', () => {
    it('serializes document reference', () => {
      const message = baseMessage([
        { type: 'source-document', sourceId: 's1', mediaType: 'application/pdf', title: 'Doc' },
      ]);
      expect(serializeMessage(message)).toBe('[Document: Doc]');
    });
  });

  describe('data-usage parts', () => {
    it('serializes usage summary with model and tokens', () => {
      const message = baseMessage([
        {
          type: 'data-usage',
          data: {
            type: 'usage',
            id: 'u1',
            model: 'gpt-4',
            inputTokens: 10,
            outputTokens: 20,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            inputTokensCost: 0,
            outputTokensCost: 0,
            cacheReadTokensCost: 0,
            cacheWriteTokensCost: 0,
            totalCost: 0,
          },
        },
      ]);
      expect(serializeMessage(message)).toBe('Model: gpt-4 | Tokens: 10 in / 20 out');
    });

    it('includes cost when totalCost > 0', () => {
      const message = baseMessage([
        {
          type: 'data-usage',
          data: {
            type: 'usage',
            id: 'u1',
            model: 'claude-3',
            inputTokens: 5,
            outputTokens: 15,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            inputTokensCost: 0,
            outputTokensCost: 0,
            cacheReadTokensCost: 0,
            cacheWriteTokensCost: 0,
            totalCost: 0.002,
          },
        },
      ]);
      expect(serializeMessage(message)).toBe('Model: claude-3 | Tokens: 5 in / 15 out | Cost: $0.0020');
    });

    it('aggregates multiple data-usage parts into one line with summed tokens and cost', () => {
      const message = baseMessage([
        {
          type: 'data-usage',
          data: {
            type: 'usage',
            id: 'u1',
            model: 'gpt-4',
            inputTokens: 10,
            outputTokens: 20,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            inputTokensCost: 0,
            outputTokensCost: 0,
            cacheReadTokensCost: 0,
            cacheWriteTokensCost: 0,
            totalCost: 0.001,
          },
        },
        {
          type: 'data-usage',
          data: {
            type: 'usage',
            id: 'u2',
            model: 'claude-3',
            inputTokens: 5,
            outputTokens: 15,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            inputTokensCost: 0,
            outputTokensCost: 0,
            cacheReadTokensCost: 0,
            cacheWriteTokensCost: 0,
            totalCost: 0.002,
          },
        },
      ]);
      expect(serializeMessage(message)).toBe('Model: claude-3 | Tokens: 15 in / 35 out | Cost: $0.0030');
    });
  });

  describe('dynamic-tool parts', () => {
    it('serializes input-streaming state', () => {
      const message = baseMessage([
        {
          type: 'dynamic-tool',
          toolName: 'unknown_tool',
          toolCallId: 'c1',
          state: 'input-streaming',
          input: { foo: 'bar' },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="unknown_tool">\ninput:\n{\n  "foo": "bar"\n}\n</tool_call>\n<tool_result>\n[Streaming...]\n</tool_result>',
      );
    });

    it('serializes output-available state', () => {
      const message = baseMessage([
        {
          type: 'dynamic-tool',
          toolName: 'custom',
          toolCallId: 'c1',
          state: 'output-available',
          input: { x: 1 },
          output: 'Done',
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="custom">\ninput:\n{\n  "x": 1\n}\n</tool_call>\n<tool_result>\nDone\n</tool_result>',
      );
    });

    it('serializes output-error state', () => {
      const message = baseMessage([
        {
          type: 'dynamic-tool',
          toolName: 'custom',
          toolCallId: 'c1',
          state: 'output-error',
          input: {},
          errorText: 'Something failed',
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="custom">\ninput:\n{}\n</tool_call>\n<tool_result>\n[Error: Something failed]\n</tool_result>',
      );
    });
  });

  describe('tool parts', () => {
    it('serializes tool-web_search output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-web_search',
          toolCallId: 'c1',
          state: 'output-available',
          input: { query: 'test' },
          output: [{ title: 'Result', url: 'https://a.com', content: 'Snippet' }],
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="web_search">\nquery: test\n</tool_call>\n<tool_result>\n- [Result](https://a.com)\n  Snippet\n</tool_result>',
      );
    });

    it('serializes tool-edit_file output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-edit_file',
          toolCallId: 'c1',
          state: 'output-available',
          input: { targetFile: 'src/foo.ts', codeEdit: 'const x = 1;' },
          output: {
            diffStats: {
              linesAdded: 1,
              linesRemoved: 0,
              originalContent: '',
              modifiedContent: 'const x = 1;',
            },
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="edit_file">\ntargetFile: src/foo.ts\ncodeEdit: <12 chars>\n</tool_call>\n<tool_result>\n+1/-0 lines\n```\nconst x = 1;\n```\n</tool_result>',
      );
    });

    it('serializes tool-read_file output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-read_file',
          toolCallId: 'c1',
          state: 'output-available',
          input: { targetFile: 'readme.md' },
          output: { content: 'Hello', totalLines: 1, startLine: 1 },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="read_file">\ntargetFile: readme.md\n</tool_call>\n<tool_result>\nLine 1:\n```\nHello\n```\n</tool_result>',
      );
    });

    it('serializes tool with output-error state', () => {
      const message = baseMessage([
        {
          type: 'tool-read_file',
          toolCallId: 'c1',
          state: 'output-error',
          input: { targetFile: 'missing.ts' },
          errorText: 'File not found',
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="read_file">\ntargetFile: missing.ts\n</tool_call>\n<tool_result>\n[Error: File not found]\n</tool_result>',
      );
    });

    it('serializes tool-list_directory output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-list_directory',
          toolCallId: 'c1',
          state: 'output-available',
          input: { path: '/' },
          output: {
            path: '/',
            entries: [
              { name: 'src', type: 'dir', size: 0 },
              { name: 'file.txt', type: 'file', size: 10 },
            ],
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="list_directory">\npath: /\n</tool_call>\n<tool_result>\nPath: /\n  [dir] src\n   file.txt\n</tool_result>',
      );
    });

    it('serializes tool-grep output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-grep',
          toolCallId: 'c1',
          state: 'output-available',
          input: { pattern: 'foo' },
          output: {
            matches: [{ file: 'a.ts', line: 1, content: 'foo' }],
            totalMatches: 1,
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="grep">\npattern: foo\n</tool_call>\n<tool_result>\nTotal: 1\na.ts:1: foo\n</tool_result>',
      );
    });

    it('serializes tool-test_model output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-test_model',
          toolCallId: 'c1',
          state: 'output-available',
          input: {},
          output: {
            passed: 2,
            total: 3,
            passes: [{ id: 'p1', requirement: 'r1' }],
            failures: [{ id: 'f1', requirement: 'req', reason: 'failed', suggestion: 'fix' }],
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="test_model">\n</tool_call>\n<tool_result>\n2/3 passed\n- FAIL: req\n  failed\n</tool_result>',
      );
    });

    it('serializes tool-get_kernel_result output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-get_kernel_result',
          toolCallId: 'c1',
          state: 'output-available',
          input: { targetFile: 'main.kcl' },
          output: {
            status: 'error',
            kernelIssues: [{ message: 'Syntax error', severity: 'error' as const }],
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="get_kernel_result">\ntargetFile: main.kcl\n</tool_call>\n<tool_result>\nStatus: error\nIssues:\n  - Syntax error\n</tool_result>',
      );
    });

    it('serializes tool-transfer_to_cad_expert output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-transfer_to_cad_expert',
          toolCallId: 'c1',
          state: 'output-available',
          input: {},
          output: 'Transferred',
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="transfer_to_cad_expert">\n</tool_call>\n<tool_result>\nTransferred\n</tool_result>',
      );
    });

    it('serializes tool in input-available state as Pending', () => {
      const message = baseMessage([
        {
          type: 'tool-read_file',
          toolCallId: 'c1',
          state: 'input-available',
          input: { targetFile: 'x.ts' },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="read_file">\ntargetFile: x.ts\n</tool_call>\n<tool_result>\n[Pending...]\n</tool_result>',
      );
    });
  });

  describe('mixed parts', () => {
    it('serializes text, reasoning, and tool in order', () => {
      const message = baseMessage([
        { type: 'text', text: 'Here is the result.' },
        { type: 'reasoning', text: 'I looked it up.' },
        {
          type: 'tool-web_search',
          toolCallId: 'c1',
          state: 'output-available',
          input: { query: 'test' },
          output: [{ title: 'T', url: 'https://u', content: 'C' }],
        },
      ]);
      expect(serializeMessage(message)).toBe(
        'Here is the result.\n\n<thinking>\nI looked it up.\n</thinking>\n\n<tool_call name="web_search">\nquery: test\n</tool_call>\n<tool_result>\n- [T](https://u)\n  C\n</tool_result>',
      );
    });
  });
});

describe('serializeTranscript', () => {
  const originalTz = process.env.TZ;
  const header = `# Test Chat\n\n_Exported on 2/8/2026 at 23:29:19 GMT+13 from ${metaConfig.userAgent}_`;

  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-08T10:29:19Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns header only for empty array', () => {
    expect(serializeTranscript([], 'Test Chat')).toBe(header);
  });

  it('serializes single user message with bold role header', () => {
    const message: MyUIMessage = {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
      metadata: { createdAt: 0 },
    };
    expect(serializeTranscript([message], 'Test Chat')).toBe(`${header}\n\n---\n\n**User**\n\nHello\n`);
  });

  it('serializes single assistant message with bold role header', () => {
    const message = baseMessage([{ type: 'text', text: 'Hi there' }]);
    expect(serializeTranscript([message], 'Test Chat')).toBe(`${header}\n\n---\n\n**Assistant**\n\nHi there\n`);
  });

  it('serializes two messages separated by horizontal rules', () => {
    const userMessage: MyUIMessage = {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
      metadata: { createdAt: 0 },
    };
    const assistantMessage = baseMessage([{ type: 'text', text: 'Hi there' }]);
    expect(serializeTranscript([userMessage, assistantMessage], 'Test Chat')).toBe(
      `${header}\n\n---\n\n**User**\n\nHello\n\n---\n\n**Assistant**\n\nHi there\n`,
    );
  });

  it('emits role header only when message body is empty (e.g. step-start only)', () => {
    const message = baseMessage([{ type: 'step-start' }]);
    expect(serializeTranscript([message], 'Test Chat')).toBe(`${header}\n\n---\n\n**Assistant**\n`);
  });
});

describe('createMessage', () => {
  it('creates a message with text and optional images', () => {
    const message = createMessage({
      content: 'Hello',
      role: 'user',
      metadata: {},
    });
    expect(message.role).toBe('user');
    expect(message.parts).toHaveLength(1);
    expect(message.parts[0]).toEqual({ type: 'text', text: 'Hello' });
  });

  it('trims content', () => {
    const message = createMessage({
      content: '  trimmed  ',
      role: 'user',
      metadata: {},
    });
    expect((message.parts[0] as { type: 'text'; text: string }).text).toBe('trimmed');
  });
});
