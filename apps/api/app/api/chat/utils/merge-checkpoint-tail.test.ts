/* eslint-disable @typescript-eslint/naming-convention -- LangChain ToolMessage constructor uses snake_case `tool_call_id` to mirror the upstream Python API. */
import { describe, it, expect } from 'vitest';
import { ToolMessage } from '@langchain/core/messages';
import type { MyUIMessage } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { mergeCheckpointTail } from '#api/chat/utils/merge-checkpoint-tail.js';

describe('mergeCheckpointTail', () => {
  // Request shape mirrors the wire contract enforced by `chatTurnRequestSchema`:
  // an optional historical user turn (kicking off the conversation), the
  // assistant turn whose stale tool parts the splice repairs, and the
  // trailing user turn that drives the current request.
  const historicalUserTurn: MyUIMessage = {
    id: 'm_user_history',
    role: 'user',
    parts: [{ type: 'text', text: 'go' }],
    metadata: { createdAt: 1 },
  };

  const trailingUserTurn: MyUIMessage = {
    id: 'm_user_trailing',
    role: 'user',
    parts: [{ type: 'text', text: 'continue' }],
    metadata: { createdAt: 3 },
  };

  it('returns a copy when checkpoint has no tool messages', () => {
    const assistant: MyUIMessage = {
      id: 'm_asst',
      role: 'assistant',
      parts: [
        {
          type: `tool-${toolName.createFile}`,
          toolCallId: 'call_1',
          state: 'input-available',
          input: { targetFile: 'a.scad', content: 'x' },
        },
      ],
      metadata: { createdAt: 2 },
    };
    const requestMessages = [historicalUserTurn, assistant, trailingUserTurn];
    const next = mergeCheckpointTail({ requestMessages, checkpointMessages: [] });
    expect(next).toEqual(requestMessages);
    expect(next).not.toBe(requestMessages);
  });

  it('splices checkpoint tool results for matching ids on the most recent assistant message', () => {
    const assistant: MyUIMessage = {
      id: 'm_asst',
      role: 'assistant',
      parts: [
        {
          type: `tool-${toolName.createFile}`,
          toolCallId: 'tc_a',
          state: 'input-available',
          input: { targetFile: 'a.scad', content: 'cube();' },
        },
        {
          type: `tool-${toolName.createFile}`,
          toolCallId: 'tc_b',
          state: 'input-available',
          input: { targetFile: 'b.scad', content: 'sphere();' },
        },
      ],
      metadata: { createdAt: 2 },
    };

    const toolA = new ToolMessage({
      content: JSON.stringify({ ok: true, file: 'a.scad' }),
      tool_call_id: 'tc_a',
    });
    const toolB = new ToolMessage({
      content: JSON.stringify({ ok: true, file: 'b.scad' }),
      tool_call_id: 'tc_b',
    });

    const merged = mergeCheckpointTail({
      requestMessages: [historicalUserTurn, assistant, trailingUserTurn],
      checkpointMessages: [toolA, toolB],
    });

    expect(merged.at(-1)).toBe(trailingUserTurn);
    const spliced = merged.find((message) => message.id === 'm_asst');
    expect(spliced?.role).toBe('assistant');
    const { parts } = spliced!;

    expect(parts[0]).toMatchObject({
      state: 'output-available',
      toolCallId: 'tc_a',
      output: { ok: true, file: 'a.scad' },
    });
    expect(parts[1]).toMatchObject({
      state: 'output-available',
      toolCallId: 'tc_b',
      output: { ok: true, file: 'b.scad' },
    });
  });

  it('splices only tool calls present in checkpoint, leaves others untouched', () => {
    const assistant: MyUIMessage = {
      id: 'm_asst',
      role: 'assistant',
      parts: [
        {
          type: `tool-${toolName.createFile}`,
          toolCallId: 'tc_ready',
          state: 'input-available',
          input: { targetFile: 'x.scad', content: '//' },
        },
        {
          type: `tool-${toolName.createFile}`,
          toolCallId: 'tc_pending',
          state: 'input-available',
          input: { targetFile: 'y.scad', content: '//' },
        },
      ],
      metadata: { createdAt: 2 },
    };

    const toolReady = new ToolMessage({
      content: JSON.stringify({ done: true }),
      tool_call_id: 'tc_ready',
    });

    const merged = mergeCheckpointTail({
      requestMessages: [historicalUserTurn, assistant, trailingUserTurn],
      checkpointMessages: [toolReady],
    });

    const splicedParts = merged.find((message) => message.id === 'm_asst')!.parts;

    expect(splicedParts[0]).toMatchObject({
      state: 'output-available',
      toolCallId: 'tc_ready',
      output: { done: true },
    });
    expect(splicedParts[1]).toMatchObject({ state: 'input-available', toolCallId: 'tc_pending' });
  });
});
