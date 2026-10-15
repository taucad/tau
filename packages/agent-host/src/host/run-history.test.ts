import { describe, expect, it } from 'vitest';
import type { AgentLogEvent } from '#log/event-types.js';
import { externalSessionOf } from '#host/run-history.js';

const session = (hostId: string | undefined, acpSessionId: string, sequence: number): AgentLogEvent => ({
  version: 1,
  leaderEpoch: 'epoch',
  sequence,
  recordedAt: '2026-10-16T00:00:00.000Z',
  runId: `run-${String(sequence)}`,
  type: 'message.appended',
  message: {
    id: `user-${String(sequence)}`,
    role: 'user',
    content: 'Hello',
    metadata: {
      tauInternal: {
        kind: 'external-agent',
        runKind: 'acp',
        agentId: 'grok',
        acpSessionId,
        ...(hostId === undefined ? {} : { hostId }),
        config: { 'tau.grok.permissions': hostId === 'A' ? 'ask' : 'always-approve' },
      },
    },
  },
});

describe('external session host ownership', () => {
  it('restores the matching host when another host has newer settings', () => {
    const events = [session('A', 'session-A', 0), session('B', 'session-B', 1)];
    expect(externalSessionOf(events, 'grok', 'A')).toMatchObject({
      hostId: 'A',
      acpSessionId: 'session-A',
      config: { 'tau.grok.permissions': 'ask' },
    });
    expect(externalSessionOf(events, 'grok', 'B')?.acpSessionId).toBe('session-B');
    expect(externalSessionOf(events, 'grok', 'C')).toBeUndefined();
  });
  it('does not infer ownership for legacy records', () => {
    const events = [session(undefined, 'legacy', 0)];
    expect(externalSessionOf(events, 'grok', 'A')).toBeUndefined();
    expect(externalSessionOf(events, 'grok')?.acpSessionId).toBe('legacy');
  });
});
