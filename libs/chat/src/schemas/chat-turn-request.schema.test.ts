import { describe, expect, expectTypeOf, it } from 'vitest';
import { chatTurnRequestSchema, parseChatTurnRequest } from '#schemas/chat-turn-request.schema.js';
import type { ChatTurnRequestInput } from '#schemas/chat-turn-request.schema.js';
import type { MyUIMessage } from '#types/message.types.js';

const request = (messages: unknown[]) => ({
  id: 'chat_1',
  projectId: 'project_1',
  execution: { hostId: 'host_1', workspaceId: 'workspace_1', baseRevisionId: 'revision_1' },
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

  it('requires nothing of a target but the host that writes', () => {
    // W3d/D7: placement is non-branching by default, so there is no revision
    // mode to name — the host that owns the tree records the turn either way.
    const verdict = chatTurnRequestSchema.safeParse({ ...validRequest(), execution: { hostId: 'origin' } });

    expect(verdict.success).toBe(true);
  });

  it('carries the conflict a resolution turn is being asked about (W10)', () => {
    // *Ask chat to resolve* seeds a turn from the conflicted revision itself,
    // so the paths still without a side ride the placement, not the prompt.
    const verdict = chatTurnRequestSchema.safeParse({
      ...validRequest(),
      execution: { ...validRequest().execution, conflict: { revisionId: 'revision_9', paths: ['src/bracket.ts'] } },
    });

    expect(verdict.success).toBe(true);
  });

  it('rejects a conflict with no path to decide', () => {
    const verdict = chatTurnRequestSchema.safeParse({
      ...validRequest(),
      execution: { ...validRequest().execution, conflict: { revisionId: 'revision_9', paths: [] } },
    });

    expect(verdict.success).toBe(false);
  });

  it('rejects a revision mode the wire no longer speaks', () => {
    const verdict = chatTurnRequestSchema.safeParse({
      ...validRequest(),
      execution: { ...validRequest().execution, mode: 'candidate' },
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
