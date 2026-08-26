import { BadRequestException } from '@nestjs/common';
import type { MyUIMessage } from '@taucad/chat';
import { describe, expect, it } from 'vitest';
import { assertSupportedApprovalReplay } from '#api/chat/utils/assert-supported-approval-replay.js';

const userMessage: MyUIMessage = {
  id: 'u0',
  role: 'user',
  parts: [{ type: 'text', text: 'continue' }],
};

describe('assertSupportedApprovalReplay', () => {
  it('should allow ordinary interrupted tool histories without approval metadata', () => {
    const messages: MyUIMessage[] = [
      userMessage,
      {
        id: 'a0',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'call_interrupted',
            state: 'output-error',
            input: undefined,
            rawInput: { limit: 15 },
            errorText: 'interrupted',
          },
        ],
      },
    ];

    expect(() => assertSupportedApprovalReplay(messages)).not.toThrow();
  });

  it('should reject static approval-responded histories with a named bad-request code', () => {
    const messages: MyUIMessage[] = [
      userMessage,
      {
        id: 'a0',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'call_approved',
            state: 'approval-responded',
            input: { targetFile: 'main.ts' },
            approval: { id: 'approval_1', approved: true },
          },
        ],
      },
    ];

    try {
      assertSupportedApprovalReplay(messages);
      expect.fail('expected approval replay to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'UNSUPPORTED_TOOL_APPROVAL_REPLAY',
      });
    }
  });

  it('should reject dynamic output histories that carry approval metadata', () => {
    const messages: MyUIMessage[] = [
      userMessage,
      {
        id: 'a0',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'experimental_tool',
            toolCallId: 'call_dynamic_approved',
            state: 'output-available',
            input: { ok: true },
            output: { done: true },
            approval: { id: 'approval_dynamic', approved: true },
          },
        ],
      },
    ];

    expect(() => assertSupportedApprovalReplay(messages)).toThrow(BadRequestException);
  });
});
