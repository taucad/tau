import process from 'node:process';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import {
  createMessage,
  finalizeInterruptedToolParts,
  serializeMessage,
  serializeTranscript,
} from '#utils/chat.utils.js';
import type { RequestTerminationCause } from '#hooks/chat-persistence.machine.js';
import { clearLedger, recordRpcOutcome } from '#services/rpc-ledger.js';
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
        {
          type: 'file',
          url: 'data:image/png;base64,abc',
          mediaType: 'image/png',
          filename: 'screenshot.png',
        },
      ]);
      expect(serializeMessage(message)).toBe('[Attached file: screenshot.png (image/png)]');
    });

    it('serializes file without filename as image', () => {
      const message = baseMessage([
        {
          type: 'file',
          url: 'data:image/webp;base64,xyz',
          mediaType: 'image/webp',
        },
      ]);
      expect(serializeMessage(message)).toBe('[Attached image (image/webp)]');
    });
  });

  describe('source-url parts', () => {
    it('serializes as markdown link with title', () => {
      const message = baseMessage([
        {
          type: 'source-url',
          sourceId: 's1',
          url: 'https://example.com',
          title: 'Example',
        },
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
        {
          type: 'source-document',
          sourceId: 's1',
          mediaType: 'application/pdf',
          title: 'Doc',
        },
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
            appliedHeadLimit: 50,
            appliedOffset: 0,
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="grep">\npattern: foo\n</tool_call>\n<tool_result>\nTotal: 1\na.ts:1: foo\n</tool_result>',
      );
    });

    it('serializes tool-test_model output-available with [targetFile] prefix on each failure', () => {
      const message = baseMessage([
        {
          type: 'tool-test_model',
          toolCallId: 'c1',
          state: 'output-available',
          input: {},
          output: {
            passed: 2,
            total: 4,
            passes: [{ id: 'p1', requirement: 'r1', targetFile: 'main.scad' }],
            failures: [
              {
                id: 'f1',
                requirement: 'req-main',
                reason: 'main failed',
                suggestion: 'fix main',
                targetFile: 'main.scad',
              },
              {
                id: 'f2',
                requirement: 'req-lib',
                reason: 'lib failed',
                suggestion: 'fix lib',
                targetFile: 'lib/bracket.scad',
              },
            ],
            geometryArtifactPaths: {
              /* eslint-disable @typescript-eslint/naming-convention -- file-path keys can't be camelCase */
              'main.scad': '.tau/artifacts/c1__main.scad.glb',
              'lib/bracket.scad': '.tau/artifacts/c1__lib_bracket.scad.glb',
              /* eslint-enable @typescript-eslint/naming-convention -- end file-path key allowance */
            },
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="test_model">\n</tool_call>\n<tool_result>\n2/4 passed\n- FAIL [main.scad]: req-main\n  main failed\n- FAIL [lib/bracket.scad]: req-lib\n  lib failed\n</tool_result>',
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
            kernelIssues: [{ message: 'Syntax error', code: 'RUNTIME', severity: 'error' }],
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

describe('finalizeInterruptedToolParts', () => {
  afterEach(() => {
    clearLedger('chat_finalize_test');
  });

  it('returns the same reference when the last message is not an assistant message', () => {
    const userOnly: MyUIMessage[] = [
      { id: 'u', role: 'user', parts: [{ type: 'text', text: 'hi' }], metadata: { createdAt: 1 } },
    ];

    expect(finalizeInterruptedToolParts(userOnly, undefined, 'user_stop')).toBe(userOnly);
  });

  it.each<{
    cause: RequestTerminationCause;
    expectedCode: 'USER_INTERRUPTED' | 'CLIENT_DISCONNECTED' | 'STREAM_ERROR';
    expectedMessage: string;
  }>([
    {
      cause: 'user_stop',
      expectedCode: 'USER_INTERRUPTED',
      expectedMessage: 'Interrupted by user.',
    },
    {
      cause: 'preempt',
      expectedCode: 'USER_INTERRUPTED',
      expectedMessage: 'Interrupted by user.',
    },
    {
      cause: 'disconnect',
      expectedCode: 'CLIENT_DISCONNECTED',
      expectedMessage: 'The network dropped while the tool was running.',
    },
    {
      cause: 'error',
      expectedCode: 'STREAM_ERROR',
      expectedMessage: 'The chat stream ended before this tool could finish.',
    },
  ])(
    'demotes in-flight tools to the fallback error for cause $cause when ledger is unavailable',
    ({ cause, expectedCode, expectedMessage }) => {
      const messages: MyUIMessage[] = [
        {
          id: 'a',
          role: 'assistant',
          parts: [
            {
              type: 'tool-create_file',
              toolCallId: 'tc_x',
              state: 'input-available',
              input: { targetFile: 'z.scad', content: '//' },
            },
          ],
          metadata: { createdAt: 2 },
        },
      ];

      const next = finalizeInterruptedToolParts(messages, 'chat_finalize_test', cause);

      expect(next).not.toBe(messages);
      const part = next.at(-1)!.parts[0]!;
      expect(part.type).toBe('tool-create_file');
      expect((part as { state: string }).state).toBe('output-error');

      expect(JSON.parse((part as { errorText: string }).errorText)).toEqual({
        errorCode: expectedCode,
        message: expectedMessage,
        toolCallId: 'tc_x',
        toolName: 'create_file',
      });
    },
  );

  it('upgrades interrupted parts to output-available when the ledger captured success', () => {
    recordRpcOutcome('chat_finalize_test', 'tc_keep', {
      kind: 'success',
      output: { wrote: true },
    });

    const messages: MyUIMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        parts: [
          {
            type: 'tool-create_file',
            toolCallId: 'tc_keep',
            state: 'input-available',
            input: { targetFile: 'z.scad', content: '//' },
          },
        ],
        metadata: { createdAt: 2 },
      },
    ];

    const next = finalizeInterruptedToolParts(messages, 'chat_finalize_test', 'disconnect');

    const part = next.at(-1)!.parts[0] as { state: string; output: unknown };
    expect(part.state).toBe('output-available');
    expect(part.output).toEqual({ wrote: true });
  });

  it('writes output-error using ledger codes when ledger captured failure', () => {
    recordRpcOutcome('chat_finalize_test', 'tc_fail', {
      kind: 'error',
      errorCode: 'IO_ERROR',
      message: 'broken',
    });

    const messages: MyUIMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        parts: [
          {
            type: 'tool-create_file',
            toolCallId: 'tc_fail',
            state: 'input-available',
            input: { targetFile: 'z.scad', content: '//' },
          },
        ],
        metadata: { createdAt: 2 },
      },
    ];

    const next = finalizeInterruptedToolParts(messages, 'chat_finalize_test', 'error');
    const { errorText } = next.at(-1)!.parts[0] as { errorText: string };
    expect(JSON.parse(errorText)).toMatchObject({
      errorCode: 'IO_ERROR',
      message: 'broken',
      toolName: 'create_file',
      toolCallId: 'tc_fail',
    });
  });

  // T2.6: chatId provided but no ledger entry → USER_INTERRUPTED preserved.
  it('falls through to USER_INTERRUPTED when chatId is provided but ledger has no entry', () => {
    const messages: MyUIMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        parts: [
          {
            type: 'tool-create_file',
            toolCallId: 'tc_no_ledger',
            state: 'input-available',
            input: { targetFile: 'z.scad', content: '//' },
          },
        ],
        metadata: { createdAt: 2 },
      },
    ];

    const next = finalizeInterruptedToolParts(messages, 'chat_finalize_test', 'user_stop');

    expect(next).not.toBe(messages);
    const part = next.at(-1)!.parts[0] as { state: string; errorText: string };
    expect(part.state).toBe('output-error');
    expect(JSON.parse(part.errorText)).toMatchObject({
      errorCode: 'USER_INTERRUPTED',
      message: 'Interrupted by user.',
      toolCallId: 'tc_no_ledger',
      toolName: 'create_file',
    });
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
