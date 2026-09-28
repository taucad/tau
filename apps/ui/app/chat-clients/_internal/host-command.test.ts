import { describe, expect, it, vi } from 'vitest';
import type { CommandAnswer, HostCommand } from '@taucad/agent-host/wire';
import { sendHostCommand } from '#chat-clients/_internal/host-command.js';
import type { AgentHostClient } from '#services/agent-host-client.js';

const start: HostCommand = {
  type: 'start',
  commandId: 'gesture-1',
  payload: {
    chatId: 'chat-1',
    runId: 'gesture-1',
    message: { id: 'user-1', role: 'user', content: 'Make a cube' },
    trigger: 'submit',
  },
};

const answer = (status: 'applied' | 'replayed'): CommandAnswer => ({
  commandId: start.commandId,
  generation: 1,
  status,
  effect: 'durable',
  cursor: 1,
});

describe('sendHostCommand', () => {
  it('resends a start with its original command id after a coded unknown-effect close', async () => {
    const hostCommand = vi
      .fn()
      .mockResolvedValueOnce({
        commandId: start.commandId,
        generation: 1,
        status: 'refused',
        effect: 'unknown',
        code: 'PEER_UNRESPONSIVE',
        message: 'The owner did not answer.',
      })
      .mockResolvedValueOnce(answer('replayed'));
    const close = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ hostCommand, close }) as unknown as AgentHostClient);

    await expect(sendHostCommand(connect, start, { retryDelay: async () => undefined })).resolves.toEqual(
      answer('replayed'),
    );
    expect(connect).toHaveBeenCalledTimes(2);
    expect(hostCommand).toHaveBeenNthCalledWith(1, start);
    expect(hostCommand).toHaveBeenNthCalledWith(2, start);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('holds the same start behind a settling run and refuses a permanent code', async () => {
    const hostCommand = vi
      .fn()
      .mockResolvedValueOnce({
        commandId: start.commandId,
        generation: 1,
        status: 'refused',
        effect: 'not-applied',
        code: 'CHAT_RUN_LIVE',
        message: 'The earlier run is settling.',
        details: { state: 'settling' },
      })
      .mockResolvedValueOnce(answer('applied'));
    const retryDelay = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ hostCommand, close: async () => undefined }) as unknown as AgentHostClient);

    await expect(sendHostCommand(connect, start, { retryDelay })).resolves.toEqual(answer('applied'));
    expect(hostCommand).toHaveBeenNthCalledWith(2, start);
    expect(retryDelay).toHaveBeenCalledOnce();

    hostCommand.mockResolvedValueOnce({
      commandId: start.commandId,
      generation: 1,
      status: 'refused',
      effect: 'not-applied',
      code: 'LEADER_VERSION_MISMATCH',
      message: 'Another build owns this chat.',
    });
    await expect(sendHostCommand(connect, start, { retryDelay })).resolves.toMatchObject({
      status: 'refused',
      code: 'LEADER_VERSION_MISMATCH',
    });
    expect(retryDelay).toHaveBeenCalledOnce();
  });
});
