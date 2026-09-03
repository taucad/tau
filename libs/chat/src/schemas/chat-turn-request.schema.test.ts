import { describe, expect, expectTypeOf, it } from 'vitest';
import { chatTurnRequestSchema, parseChatTurnRequest } from '#schemas/chat-turn-request.schema.js';
import type { ChatTurnRequestInput } from '#schemas/chat-turn-request.schema.js';
import type { MyUIMessage } from '#types/message.types.js';

const request = (messages: unknown[]) => ({
  id: 'chat_1',
  projectId: 'project_1',
  execution: { workspaceId: 'workspace_1', baseRevisionId: 'revision_1', hostId: 'host_1' },
  admission: { version: 1, idempotencyKey: 'request_0000000001' },
  messages,
  agent: {
    profile: 'cad',
    execution: { kind: 'tau', model: 'openai-gpt-5.5' },
    kernel: 'replicad',
    mode: 'agent',
    toolChoice: 'auto',
    testingEnabled: true,
  },
});

describe('parseChatTurnRequest', () => {
  it('keeps the synchronous envelope honest and rejects counterfeit messages asynchronously', async () => {
    const input = request([42]);

    expect(chatTurnRequestSchema.safeParse(input).success).toBe(true);
    await expect(parseChatTurnRequest(input)).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['messages'] })],
    });
    expectTypeOf<ChatTurnRequestInput['messages'][number]>().toEqualTypeOf<unknown>();
  });

  it('returns fully validated messages from the shared parser', async () => {
    const message: MyUIMessage = { id: 'message_1', role: 'user', parts: [{ type: 'text', text: 'hello' }] };

    await expect(parseChatTurnRequest(request([message]))).resolves.toMatchObject({ messages: [message] });
  });
});
