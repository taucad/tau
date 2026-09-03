import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { MyUIMessage } from '@taucad/chat';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { CadAgentConfigInput } from '@taucad/chat/schemas';
import { ChatMessagesValidationPipe } from '#api/chat/chat.dto.js';

const validUserMessage: MyUIMessage = {
  id: 'msg_1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};

const cadAgent: CadAgentConfigInput = {
  profile: 'cad',
  model: 'openai-gpt-5.5',
  kernel: 'replicad',
  mode: 'agent',
  toolChoice: 'auto',
  testingEnabled: true,
};

const baseBody = {
  id: 'chat_1',
  messages: [validUserMessage],
  agent: cadAgent,
};

const expectIssueAtPath = (
  issues: ReadonlyArray<{ path: readonly PropertyKey[] }>,
  expectedPath: readonly PropertyKey[],
): void => {
  const matched = issues.some(
    (issue) =>
      issue.path.length === expectedPath.length &&
      expectedPath.every((segment, index) => issue.path[index] === segment),
  );
  expect(
    matched,
    `expected an issue at path [${expectedPath.join('.')}] but saw ${JSON.stringify(issues, null, 2)}`,
  ).toBe(true);
};

describe('chatTurnRequestSchema', () => {
  describe('happy path per profile', () => {
    it('should accept a body with a valid cad agent', () => {
      const result = chatTurnRequestSchema.safeParse(baseBody);

      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues, null, 2)).toBe(true);
    });

    it('should accept a body with a valid project_name agent', () => {
      const result = chatTurnRequestSchema.safeParse({
        id: 'chat_pn',
        messages: [validUserMessage],
        agent: { profile: 'project_name' },
      });

      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues, null, 2)).toBe(true);
    });

    it('should accept a body with a valid commit_name agent', () => {
      const result = chatTurnRequestSchema.safeParse({
        id: 'chat_cn',
        messages: [validUserMessage],
        agent: { profile: 'commit_name' },
      });

      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues, null, 2)).toBe(true);
    });

    it('should accept a body whose historical user messages omit metadata entirely', () => {
      const historicalMessage: MyUIMessage = {
        id: 'msg_history',
        role: 'user',
        parts: [{ type: 'text', text: 'old turn' }],
      };
      const assistantReply: MyUIMessage = {
        id: 'msg_history_reply',
        role: 'assistant',
        parts: [{ type: 'text', text: 'old reply' }],
      };
      const result = chatTurnRequestSchema.safeParse({
        ...baseBody,
        messages: [historicalMessage, assistantReply, validUserMessage],
      });

      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues, null, 2)).toBe(true);
    });
  });

  describe('agent field is required', () => {
    it('should reject a body that omits agent with an issue at path [agent]', () => {
      const { agent: _omitted, ...withoutAgent } = baseBody;
      const result = chatTurnRequestSchema.safeParse(withoutAgent);

      expect(result.success).toBe(false);
      if (!result.success) {
        expectIssueAtPath(result.error.issues, ['agent']);
      }
    });

    it('should reject a body whose agent has an unknown profile', () => {
      const result = chatTurnRequestSchema.safeParse({
        ...baseBody,
        agent: { profile: 'unknown' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expectIssueAtPath(result.error.issues, ['agent', 'profile']);
      }
    });
  });

  describe('cad agent variant required fields surface as agent.<field>', () => {
    const requiredFields = ['model', 'kernel', 'mode', 'toolChoice', 'testingEnabled'] as const;

    for (const field of requiredFields) {
      it(`should reject a cad agent missing ${field} with path [agent, ${field}]`, () => {
        const { [field]: _omitted, ...remaining } = cadAgent;
        const result = chatTurnRequestSchema.safeParse({
          ...baseBody,
          agent: remaining,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expectIssueAtPath(result.error.issues, ['agent', field]);
        }
      });
    }

    it('should reject a cad agent whose kernel is not a known kernel provider', () => {
      const result = chatTurnRequestSchema.safeParse({
        ...baseBody,
        agent: { ...cadAgent, kernel: 'not-a-real-kernel' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expectIssueAtPath(result.error.issues, ['agent', 'kernel']);
      }
    });
  });

  describe('messages contract', () => {
    it('should reject a body whose messages are empty', () => {
      const result = chatTurnRequestSchema.safeParse({
        ...baseBody,
        messages: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const hasMessagesIssue = result.error.issues.some((issue) => issue.path[0] === 'messages');
        expect(hasMessagesIssue).toBe(true);
      }
    });

    it('should reject a body whose messages contain a malformed part through the async controller pipe', async () => {
      const result = chatTurnRequestSchema.parse({
        ...baseBody,
        messages: [
          {
            id: 'msg_bad',
            role: 'user',
            parts: [{ type: 'text' }],
          },
        ],
      });

      // CL1 moves full message validation from the synchronous DTO schema to Nest's async pipe.
      await expect(new ChatMessagesValidationPipe().transform(result)).rejects.toMatchObject({ status: 400 });
    });

    it('should redact rejected message payloads and preserve the validation error contract', async () => {
      const canary = 'private-chat-canary';
      const envelope = chatTurnRequestSchema.parse({
        ...baseBody,
        messages: [{ id: 'msg_bad', role: 'user', parts: [{ type: 'text', canary }] }],
      });

      const error: unknown = await new ChatMessagesValidationPipe()
        .transform(envelope)
        .catch((error: unknown) => error);

      expect(error).toBeInstanceOf(HttpException);
      if (!(error instanceof HttpException)) {
        throw error;
      }
      expect(error.getResponse()).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed: messages: Invalid input.',
      });
      expect(JSON.stringify({ message: error.message, response: error.getResponse() })).not.toContain(canary);
    });
  });

  describe('snapshot / contextPayload optionality', () => {
    it('should leave snapshot and contextPayload undefined on the parsed cad agent when omitted', () => {
      const result = chatTurnRequestSchema.safeParse(baseBody);

      expect(result.success).toBe(true);
      if (result.success && result.data.agent.profile === 'cad') {
        expect(result.data.agent.snapshot).toBeUndefined();
        expect(result.data.agent.contextPayload).toBeUndefined();
      }
    });
  });
});
