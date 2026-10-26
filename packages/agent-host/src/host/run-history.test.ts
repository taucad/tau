import { describe, expect, it } from 'vitest';
import { abandonedTurnOf } from '#log/event-types.js';
import type { AgentLogEvent, UserProviderMessage } from '#log/event-types.js';
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
    expect(externalSessionOf(events, 'grok', { hostId: 'A' })).toMatchObject({
      hostId: 'A',
      acpSessionId: 'session-A',
      config: { 'tau.grok.permissions': 'ask' },
    });
    expect(externalSessionOf(events, 'grok', { hostId: 'B' })?.acpSessionId).toBe('session-B');
    expect(externalSessionOf(events, 'grok', { hostId: 'C' })).toBeUndefined();
  });
  it('does not infer ownership for legacy records', () => {
    const events = [session(undefined, 'legacy', 0)];
    expect(externalSessionOf(events, 'grok', { hostId: 'A' })).toBeUndefined();
    expect(externalSessionOf(events, 'grok')?.acpSessionId).toBe('legacy');
  });
});

describe('external session device ownership', () => {
  /* Every desktop places its own agents as `desktop`: the host id alone does not say whose session a record names. */
  const words = (acpSessionId: string, sequence: number, deviceId?: string): UserProviderMessage => ({
    id: `user-${String(sequence)}`,
    role: 'user',
    content: 'Hello',
    metadata: {
      tauInternal: {
        kind: 'external-agent',
        runKind: 'acp',
        agentId: 'grok',
        acpSessionId,
        hostId: 'desktop',
        ...(deviceId === undefined ? {} : { deviceId }),
      },
    },
  });
  const appended = (message: UserProviderMessage, sequence: number): AgentLogEvent => ({
    version: 1,
    leaderEpoch: 'epoch',
    sequence,
    recordedAt: '2026-10-16T00:00:00.000Z',
    runId: `run-${String(sequence)}`,
    type: 'message.appended',
    message,
  });

  it('restores only the session this device stamped, not one another desktop named later', () => {
    const events = [appended(words('session-1', 0, 'device-1'), 0), appended(words('session-2', 1, 'device-2'), 1)];
    expect(externalSessionOf(events, 'grok', { hostId: 'desktop', deviceId: 'device-1' })?.acpSessionId).toBe(
      'session-1',
    );
    expect(externalSessionOf(events, 'grok', { hostId: 'desktop', deviceId: 'device-2' })?.acpSessionId).toBe(
      'session-2',
    );
  });

  /* A takeover says another device's turn as data (XD3): it names that device's session, never one this device holds. */
  it('never restores a session from a copy of another device’s turn', () => {
    const own = appended(words('session-1', 0, 'device-1'), 0);
    const copy = appended(abandonedTurnOf(words('session-2', 1, 'device-2')), 1);
    expect(externalSessionOf([own, copy], 'grok', { hostId: 'desktop', deviceId: 'device-1' })?.acpSessionId).toBe(
      'session-1',
    );
    const legacy = appended(words('legacy', 0), 0);
    const unstampedCopy = appended(abandonedTurnOf(words('session-2', 1)), 1);
    expect(externalSessionOf([legacy, unstampedCopy], 'grok', { hostId: 'desktop' })?.acpSessionId).toBe('legacy');
  });
});
