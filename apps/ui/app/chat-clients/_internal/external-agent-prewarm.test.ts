import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentChannelClient } from '@taucad/agent-host';
import type { CadAgentExecution } from '@taucad/chat';
import { prewarmExternalAgent, resetExternalAgentPrewarm } from '#chat-clients/_internal/external-agent-prewarm.js';

const claude: CadAgentExecution = { kind: 'acp', hostId: 'hst_daemon', agentId: 'claude', model: 'opus' };
const tau: CadAgentExecution = { kind: 'tau', model: 'm' };

const fakeDial = () => {
  const prewarm = vi.fn(async () => undefined);
  const close = vi.fn();
  const dial = vi.fn(async () => ({ prewarm, close }) as unknown as AgentChannelClient);
  return { dial, prewarm, close };
};

afterEach(() => {
  resetExternalAgentPrewarm();
});

describe('prewarmExternalAgent (WP-18)', () => {
  it('asks the agent host for the chat session once per selection, then closes its channel', async () => {
    const { dial, prewarm, close } = fakeDial();

    await prewarmExternalAgent({ projectId: 'p', chatId: 'c', execution: claude }, dial);
    await prewarmExternalAgent({ projectId: 'p', chatId: 'c', execution: claude }, dial);

    expect(dial).toHaveBeenCalledTimes(1);
    expect(prewarm).toHaveBeenCalledWith({
      chatId: 'c',
      agent: { kind: 'acp', id: 'claude', hostId: 'hst_daemon', model: 'opus' },
    });
    expect(close).toHaveBeenCalledTimes(1);

    await prewarmExternalAgent({ projectId: 'p', chatId: 'c', execution: { ...claude, agentId: 'codex' } }, dial);
    expect(dial).toHaveBeenCalledTimes(2);
  });

  it('asks nothing for a Tau turn, and swallows a host it cannot reach', async () => {
    const { dial } = fakeDial();
    await prewarmExternalAgent({ projectId: 'p', chatId: 'c', execution: tau }, dial);
    expect(dial).not.toHaveBeenCalled();

    const unreachable = vi.fn(async () => {
      throw new Error('unreachable');
    });
    await expect(
      prewarmExternalAgent({ projectId: 'p', chatId: 'c', execution: claude }, unreachable),
    ).resolves.toBeUndefined();
  });
});
