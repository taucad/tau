import { describe, expect, it } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { CadAgentConfigInput } from '@taucad/chat/schemas';

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

    it('should reject a body whose messages contain a malformed part with a path under messages.<i>', () => {
      const result = chatTurnRequestSchema.safeParse({
        ...baseBody,
        messages: [
          {
            id: 'msg_bad',
            role: 'user',
            parts: [{ type: 'text' }],
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const hasMessagePathIssue = result.error.issues.some((issue) => issue.path[0] === 'messages');
        expect(hasMessagePathIssue).toBe(true);
      }
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
