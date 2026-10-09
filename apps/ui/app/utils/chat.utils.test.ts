import process from 'node:process';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import {
  buildUserMessage,
  finalizeInterruptedToolParts,
  serializeMessage,
  serializeTranscript,
  stampMessageCreatedAt,
} from '#utils/chat.utils.js';
import type { RequestTerminationCause } from '#hooks/chat-persistence.machine.js';
import { clearLedger, recordRpcOutcome } from '#services/rpc-ledger.js';
import { metaConfig } from '#constants/meta.constants.js';
import { storedRef } from '#utils/attachment.test-utils.js';
import { Chat } from '@ai-sdk/react';
import { initialChatProjection, materializeTranscript, reduceChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { openRunWatch } from '#chat-clients/_internal/run-watch.js';
import { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';

const baseMessage = (parts: MyUIMessage['parts']): MyUIMessage => ({
  id: 'msg-1',
  role: 'assistant',
  parts,
});

it.each([1, 16, 113])(
  'should converge live, reload and export for 55 calls and 9 edits in batches of %s',
  async (size) => {
    const rows = [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')];
    for (let index = 0; index < 55; index++) {
      const edit = index >= 46;
      const content = edit
        ? [
            {
              type: 'diff',
              path: index % 2 === 0 ? 'main.cs' : 'main.geospec.ts',
              oldText: 'before',
              newText: `after-${String(index)}`,
            },
          ]
        : { result: index };
      const call = { toolCallId: `vendor-${String(index)}`, kind: edit ? 'edit' : 'execute', content };
      const identity = {
        toolCallId: `call-${String(index)}`,
        toolName: edit ? 'applyPatch' : 'shell',
        metadata: { tauInternal: { kind: 'external-tool', origin: 'external' } },
      };
      rows.push(
        logRow(rows.length, {
          type: 'message.appended',
          message: {
            ...identity,
            id: `in-${String(index)}`,
            role: 'tool-input',
            content: { index },
            call: { ...call, status: 'pending' },
          },
        }),
      );
      rows.push(
        logRow(rows.length, {
          type: 'message.appended',
          message: {
            ...identity,
            id: `out-${String(index)}`,
            role: 'tool-output',
            content,
            call: { ...call, status: 'completed' },
            isError: false,
          },
        }),
      );
    }
    rows.push(lifecycleRow(rows.length, 'completed'));
    const prefix = 24; // The first 11 calls are visible before call 12's progress.
    let projection = reduceChatProjection(initialChatProjection, {
      type: 'batch',
      answer: { status: 'batch', cursor: 0, nextCursor: prefix, endCursor: rows.length, events: rows.slice(0, prefix) },
    }).state;
    const listeners = new Set<() => void>();
    const watch = openRunWatch({
      runId: 'run_1',
      getProjection: () => projection,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    const transport = new BrowserPlacementChatTransport<MyUIMessage>();
    transport.arm(watch.stream);
    const errors: Error[] = [];
    const chat = new Chat<MyUIMessage>({ id: 'convergence', transport, onError: (error) => errors.push(error) });
    try {
      const request = chat.sendMessage({ role: 'user', parts: [{ type: 'text', text: 'fixture' }] });
      projection = reduceChatProjection(projection, {
        type: 'live',
        event: {
          type: 'tool-output-update',
          chatId: 'convergence',
          runId: 'run_1',
          messageId: 'in-11',
          contentIndex: 0,
          toolCallId: 'call-11',
          toolName: 'shell',
          output: 'early',
          isError: false,
        },
      }).state;
      for (const listener of listeners) {
        listener();
      }
      for (let cursor = prefix; cursor < rows.length; cursor += size) {
        const events = rows.slice(cursor, cursor + size);
        projection = reduceChatProjection(projection, {
          type: 'batch',
          answer: { status: 'batch', cursor, nextCursor: cursor + events.length, endCursor: rows.length, events },
        }).state;
        for (const listener of listeners) {
          listener();
        }
      }
      await request;
      const restored = await materializeTranscript(projection);
      const tools = (messages: MyUIMessage[]) =>
        messages.flatMap((message) => message.parts).filter((part) => part.type === 'dynamic-tool');
      expect(errors).toEqual([]);
      expect(chat.status).toBe('ready');
      expect(tools(chat.messages)).toEqual(tools(restored));
      expect(new Set(tools(restored).map((part) => part.toolCallId)).size).toBe(55);
      expect(tools(restored).every((part) => part.state === 'output-available')).toBe(true);
      expect(tools(restored).filter((part) => part.toolName === 'applyPatch')).toHaveLength(9);
      const exported = serializeTranscript(restored, 'Recovered fixture');
      expect(exported.match(/<tool_call /gu)).toHaveLength(55);
      expect(exported.match(/"type": "diff"/gu)).toHaveLength(9);
      expect(exported).toContain('main.cs');
      expect(exported).toContain('main.geospec.ts');
      expect(exported).not.toMatch(/\[Pending\.\.\.\]|\[Streaming\.\.\.\]/u);
      expect(listeners.size).toBe(0);
    } finally {
      watch.detach();
    }
  },
);

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
          },
        },
      ]);
      expect(serializeMessage(message)).toBe('Model: gpt-4 | Tokens: 10 in / 20 out');
    });

    /* V6: an external turn's tokens are the vendor's own report, and Tau quotes
     * no price for them — it did not sell them. The agent is named instead. */
    it('names the external agent and quotes no Tau price for its usage', () => {
      const message = baseMessage([
        {
          type: 'data-usage',
          data: {
            type: 'usage',
            id: 'u1',
            agent: 'codex',
            model: 'gpt-5.3-codex',
            inputTokens: 1200,
            outputTokens: 300,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      ]);
      expect(serializeMessage(message)).toBe('Agent: codex | Model: gpt-5.3-codex | Tokens: 1200 in / 300 out');
    });

    /* B4 R2: an export names the funded operations whose receipts hold the
     * charge; it never quotes a locally multiplied amount. */
    it('names the funded Tau operations instead of quoting a price', () => {
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
            operationId: 'op_b',
            attemptId: 'att_1',
            billingStatus: 'terminal',
          },
        },
        {
          type: 'data-usage',
          data: {
            type: 'usage',
            id: 'u2',
            model: 'claude-3',
            inputTokens: 1,
            outputTokens: 2,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            operationId: 'op_a',
          },
        },
      ]);
      const serialized = serializeMessage(message);
      expect(serialized).toBe('Model: claude-3 | Tokens: 6 in / 17 out | Tau operations: op_a, op_b');
      expect(serialized).not.toContain('$');
    });

    it('aggregates multiple data-usage parts into one line with summed tokens', () => {
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
          },
        },
      ]);
      expect(serializeMessage(message)).toBe('Model: claude-3 | Tokens: 15 in / 35 out');
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
    it('serializes the arrange call keys and written record paths', () => {
      const message = baseMessage([
        {
          type: 'tool-arrange_workbench',
          toolCallId: 'arrange-1',
          state: 'output-available',
          input: { open: [{ kind: 'pane', pane: 'details' }], lanes: { workbench: true } },
          output: {
            status: 'written',
            revisions: [{ path: '.tau/workbench/layout.json', digest: 'missing', previousDigest: 'missing' }],
            visible: [{ kind: 'pane', pane: 'details' }],
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="arrange_workbench">\narrange_workbench(open, lanes)\n</tool_call>\n<tool_result>\n-> .tau/workbench/layout.json\n</tool_result>',
      );
    });
    it('serializes the requested package edits and what was locked or refused', () => {
      const message = baseMessage([
        {
          type: 'tool-install_packages',
          toolCallId: 'install-1',
          state: 'output-available',
          input: { add: { alea: '^1.0.1', 'simplex-noise': '^9.0.0' }, remove: ['lodash'] },
          output: {
            manifestChanged: false,
            lockChanged: false,
            packages: [{ name: 'alea', version: '1.0.1', path: 'node_modules/alea' }],
            issues: [{ code: 'no-matching-version', name: 'simplex-noise', message: 'No published version matches.' }],
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="install_packages">\nadd: alea@^1.0.1\nadd: simplex-noise@^9.0.0\nremove: lodash\n</tool_call>\n<tool_result>\nalea@1.0.1\nno-matching-version: No published version matches.\n</tool_result>',
      );
    });
    it('serializes the questions with lettered options and the answers with their source', () => {
      const message = baseMessage([
        {
          type: 'tool-ask_questions',
          toolCallId: 'ask-1',
          state: 'output-available',
          input: {
            chatId: 'chat_a',
            questions: [
              {
                id: 'form',
                header: 'Form',
                question: 'Which form?',
                options: [
                  { label: 'Ribbon', description: 'Prints without supports.' },
                  { label: 'Gem', description: 'Crisp facets.' },
                ],
              },
            ],
          },
          output: {
            status: 'defaulted',
            path: '.tau/chats/chat_a/questions.yaml',
            answers: [{ id: 'form', answer: 'Ribbon', source: 'recommended' }],
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="ask_questions">\nWhich form?\n  A. Ribbon\n  B. Gem\n</tool_call>\n<tool_result>\nform: Ribbon (recommended, no reply)\n</tool_result>',
      );
    });
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
          output: { content: 'Hello', totalLines: 1, startLine: 1, size: 5, contentKind: 'text' },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="read_file">\ntargetFile: readme.md\n</tool_call>\n<tool_result>\nL1-L1\n```\nHello\n```\n</tool_result>',
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

    it('serializes tool-use_skill without dumping the raw SKILL.md body', () => {
      const message = baseMessage([
        {
          type: 'tool-use_skill',
          toolCallId: 'c1',
          state: 'output-available',
          input: { skillName: 'woodworking', reason: 'Need joinery guidance' },
          output: {
            skillName: 'woodworking',
            resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
            skillPath: '.agents/skills/woodworking/SKILL.md',
            baseDirectory: '.agents/skills/woodworking',
            source: 'user',
            fingerprint: 'woodhash',
            frontmatter: {},
            content: '# Full Woodworking Skill Body',
            supportingFiles: [],
          },
        },
      ]);

      const serialized = serializeMessage(message);
      expect(serialized).toBe(
        '<tool_call name="use_skill">\nskillName: woodworking\nreason: Need joinery guidance\n</tool_call>\n<tool_result>\nActivated skill: woodworking\npath: .agents/skills/woodworking/SKILL.md\nresource: file:.agents/skills/woodworking/SKILL.md\nsource: user\nfingerprint: woodhash\n</tool_result>',
      );
      expect(serialized).not.toContain('Full Woodworking Skill Body');
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
              { name: 'file.txt', type: 'file', size: 10, contentKind: 'text', lineCount: 1 },
            ],
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="list_directory">\npath: /\n</tool_call>\n<tool_result>\nPath: /\n  [dir] src\n   file.txt (1 line, 10B)\n</tool_result>',
      );
    });

    it('serializes tool-glob_search output-available with enriched entries', () => {
      const message = baseMessage([
        {
          type: 'tool-glob_search',
          toolCallId: 'c1',
          state: 'output-available',
          input: { pattern: '**/*' },
          output: {
            files: ['src/main.ts', 'preview.glb'],
            entries: [
              { path: 'src/main.ts', size: 4096, contentKind: 'text', lineCount: 142 },
              { path: 'preview.glb', size: 1_363_149, contentKind: 'binary' },
            ],
            totalFiles: 2,
          },
        },
      ]);

      expect(serializeMessage(message)).toBe(
        '<tool_call name="glob_search">\npattern: **/*\n</tool_call>\n<tool_result>\nTotal: 2\nsrc/main.ts (142 lines, 4KB)\npreview.glb (binary, 1.3MB)\n</tool_result>',
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

    it('serializes tool-grep context lines with ripgrep-style separators', () => {
      const message = baseMessage([
        {
          type: 'tool-grep',
          toolCallId: 'c1',
          state: 'output-available',
          input: { pattern: 'fn', context: 1 },
          output: {
            matches: [{ file: 'a.kcl', line: 2, content: 'fn box(', before: ['// Box.'], after: ['  w: number,'] }],
            totalMatches: 1,
            appliedHeadLimit: 50,
            appliedOffset: 0,
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="grep">\npattern: fn\ncontext: 1\n</tool_call>\n<tool_result>\nTotal: 1\na.kcl-1- // Box.\na.kcl:2: fn box(\na.kcl-3-   w: number,\n</tool_result>',
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
          },
        },
      ]);
      expect(serializeMessage(message)).toBe(
        '<tool_call name="test_model">\n</tool_call>\n<tool_result>\n2/4 passed\n- FAIL [main.scad]: req-main\n  main failed\n- FAIL [lib/bracket.scad]: req-lib\n  lib failed\n</tool_result>',
      );
    });

    it('serializes tool-evaluate_model output-available', () => {
      const message = baseMessage([
        {
          type: 'tool-evaluate_model',
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
        '<tool_call name="evaluate_model">\ntargetFile: main.kcl\n</tool_call>\n<tool_result>\nStatus: error\nIssues:\n  - Syntax error\n</tool_result>',
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
    expectedCode: 'USER_INTERRUPTED' | 'CLIENT_DISCONNECTED' | 'STREAM_ERROR' | 'ORPHANED_TOOL_CALL';
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
    {
      cause: 'success',
      expectedCode: 'ORPHANED_TOOL_CALL',
      expectedMessage: 'The chat stream ended before this tool produced a result.',
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

  it('finalizes dynamic-tool input-available parts with their dynamic toolName', () => {
    const messages: MyUIMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'experimental_tool',
            toolCallId: 'tc_dynamic',
            state: 'input-available',
            input: { draft: true },
          },
        ],
        metadata: { createdAt: 2 },
      },
    ];

    const next = finalizeInterruptedToolParts(messages, undefined, 'user_stop');

    expect(next).not.toBe(messages);
    const part = next.at(-1)!.parts[0] as { state: string; errorText: string; input: unknown };
    expect(part.state).toBe('output-error');
    expect(part.input).toEqual({ draft: true });
    expect(JSON.parse(part.errorText)).toEqual({
      errorCode: 'USER_INTERRUPTED',
      message: 'Interrupted by user.',
      toolCallId: 'tc_dynamic',
      toolName: 'experimental_tool',
    });
  });
});

describe('buildUserMessage', () => {
  // P38: the one user-message builder; the data-URL builders it replaced are gone.
  it('should be the only user-message builder the module exports', async () => {
    const exported = Object.keys(await import('#utils/chat.utils.js'));
    expect(exported).toContain('buildUserMessage');
    expect(exported).not.toContain('createMessage');
    expect(exported).not.toContain('extractMimeTypeFromDataUrl');
  });

  const imageHash = 'a'.repeat(64);
  const documentHash = 'b'.repeat(64);

  it('should put each attachment reference ahead of the trimmed text', () => {
    const message = buildUserMessage({
      text: '  model the bracket  ',
      attachments: [
        storedRef({ hash: imageHash, mediaType: 'image/jpeg' }),
        storedRef({ hash: documentHash, mediaType: 'application/pdf', filename: 'bracket-spec.pdf' }),
      ],
    });

    expect(message).toMatchObject({ id: expect.stringMatching(/^msg_/u) as unknown, role: 'user' });
    expect(message.metadata).toMatchObject({ status: 'pending', createdAt: expect.any(Number) as unknown });
    expect(message.parts).toEqual([
      { type: 'file', mediaType: 'image/jpeg', url: `attachments/${imageHash}.jpg` },
      {
        type: 'file',
        mediaType: 'application/pdf',
        filename: 'bracket-spec.pdf',
        url: `attachments/${documentHash}.pdf`,
      },
      { type: 'text', text: 'model the bracket' },
    ]);
  });

  it('should carry the byte length only when the reference knows it (P29)', () => {
    const message = buildUserMessage({
      text: '',
      attachments: [storedRef({ hash: imageHash, mediaType: 'image/png', byteLength: 42 })],
    });

    expect(message.parts).toEqual([
      {
        type: 'file',
        mediaType: 'image/png',
        url: `attachments/${imageHash}.png`,
        providerMetadata: { common: { byteLength: 42 } },
      },
    ]);
  });

  it('should omit an empty text part and give every message its own id', () => {
    const first = buildUserMessage({ text: '   ' });
    const second = buildUserMessage({ text: 'x' });

    expect(first.parts).toEqual([]);
    expect(first.id).not.toBe(second.id);
  });
});

describe('stampMessageCreatedAt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should stamp createdAt on an assistant message that lacks it', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const messages: MyUIMessage[] = [{ id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'reply' }] }];

    const stamped = stampMessageCreatedAt(messages);

    expect(stamped[0]?.metadata?.createdAt).toBe(1000);
    expect(stamped).not.toBe(messages); // A mutation returns a fresh array.
  });

  it('should stamp createdAt on a user message that lacks it (defense in depth, R5)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1500);
    const messages: MyUIMessage[] = [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'prompt' }] }];

    const stamped = stampMessageCreatedAt(messages);

    expect(stamped[0]?.metadata?.createdAt).toBe(1500);
    expect(stamped).not.toBe(messages);
  });

  it('should return the same reference when every message is already stamped', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    const messages: MyUIMessage[] = [
      { id: 'u', role: 'user', parts: [{ type: 'text', text: 'prompt' }], metadata: { createdAt: 5 } },
      { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'reply' }], metadata: { createdAt: 7 } },
    ];

    const result = stampMessageCreatedAt(messages);

    expect(result).toBe(messages); // No-op → original reference.
    expect(result[0]?.metadata?.createdAt).toBe(5); // User untouched.
    expect(result[1]?.metadata?.createdAt).toBe(7); // Existing assistant stamp not overwritten.
  });

  it('should be idempotent and stable across re-persists even as the clock advances', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(3000);
    const messages: MyUIMessage[] = [{ id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'reply' }] }];

    const first = stampMessageCreatedAt(messages);
    now.mockReturnValue(9999); // Clock advances before the next persist.
    const second = stampMessageCreatedAt(first);

    expect(first[0]?.metadata?.createdAt).toBe(3000);
    expect(second).toBe(first); // Second persist is a no-op.
    expect(second[0]?.metadata?.createdAt).toBe(3000); // Value never changes.
  });

  it('should preserve existing metadata (status) when stamping createdAt', () => {
    vi.spyOn(Date, 'now').mockReturnValue(4000);
    const messages: MyUIMessage[] = [
      { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'reply' }], metadata: { status: 'success' } },
    ];

    const stamped = stampMessageCreatedAt(messages);

    expect(stamped[0]?.metadata).toEqual({ status: 'success', createdAt: 4000 });
  });
});

it('exports an unregistered static tool through generic recorded-data serialization', () => {
  const part = {
    type: 'tool-unregistered_operation',
    toolCallId: 'unknown',
    state: 'output-available',
    input: { note: 'Recorded input' },
    output: 'Recorded output',
  } as unknown as MyUIMessage['parts'][number];
  const transcript = serializeMessage(baseMessage([part]));
  expect(transcript).toContain('<tool_call name="unregistered_operation">');
  expect(transcript).toContain('Recorded input');
  expect(transcript).toContain('Recorded output');
});
