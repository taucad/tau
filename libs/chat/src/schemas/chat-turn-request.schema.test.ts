import { describe, expect, expectTypeOf, it } from 'vitest';
import { chatTurnRequestSchema, parseChatTurnRequest } from '#schemas/chat-turn-request.schema.js';
import type { ChatTurnRequestInput } from '#schemas/chat-turn-request.schema.js';
import type { MyUIMessage } from '#types/message.types.js';

const request = (messages: unknown[]) => ({
  id: 'chat_1',
  projectId: 'project_1',
  execution: { hostId: 'host_1', mode: 'direct', workspaceId: 'workspace_1', baseRevisionId: 'revision_1' },
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

describe('chatExecutionTargetSchema', () => {
  const validRequest = () => request([{ id: 'message_1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }]);

  it('requires the revision mode on every execution target', () => {
    const { mode: _mode, ...withoutMode } = validRequest().execution;

    // V18/VSC5: the host that owns the tree is the one that has to be told how
    // to record the turn, so a target without a mode is not a target.
    const verdict = chatTurnRequestSchema.safeParse({ ...validRequest(), execution: withoutMode });

    expect(verdict.success).toBe(false);
    expect(verdict.error?.issues.at(0)?.path).toEqual(['execution', 'mode']);
  });

  it('accepts a host-placed target that names no browser workspace', () => {
    // A daemon owns its own workspace and mints its own base; only the mode
    // and the host it rides to are the client's to say.
    const verdict = chatTurnRequestSchema.safeParse({
      ...validRequest(),
      execution: { hostId: 'origin', mode: 'candidate' },
    });

    expect(verdict.success).toBe(true);
  });

  it('rejects a mode the wire does not speak', () => {
    const verdict = chatTurnRequestSchema.safeParse({
      ...validRequest(),
      execution: { ...validRequest().execution, mode: 'branch' },
    });

    expect(verdict.success).toBe(false);
  });
});

it('rejects an unregistered static tool at the request boundary', async () => {
  await expect(
    parseChatTurnRequest(
      request([
        {
          id: 'unknown-tool-message',
          role: 'assistant',
          parts: [
            {
              type: 'tool-unregistered_operation',
              toolCallId: 'unknown',
              state: 'output-available',
              input: {},
              output: 'Old result',
            },
          ],
        },
      ]),
    ),
  ).rejects.toMatchObject({ issues: [expect.objectContaining({ path: ['messages'] })] });
});
