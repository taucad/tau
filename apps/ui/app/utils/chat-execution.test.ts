// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import { withTauExecutionModel } from '#utils/chat-execution.js';
import { withChatRevisionMode, withoutChatRevisionMode } from '#utils/chat-revision-mode.js';

describe('withTauExecutionModel', () => {
  it('carries the daemon hostId across a model change', () => {
    // Same defect class as the revision-mode reset: rebuilding the execution
    // from a literal silently returned a Tau Host chat to this browser on every
    // model swap.
    expect(withTauExecutionModel({ kind: 'tau', model: 'a', hostId: 'origin' }, 'b')).toEqual({
      kind: 'tau',
      model: 'b',
      hostId: 'origin',
    });
  });

  it('carries the hostId and the revision mode together', () => {
    const branched = withChatRevisionMode({ kind: 'tau', model: 'a', hostId: 'device-1' }, 'branch');

    expect(withTauExecutionModel(branched, 'b')).toEqual({
      kind: 'tau',
      model: 'b',
      hostId: 'device-1',
      revision: 'branch',
    });
  });

  it('keeps the hostId on the strict turn wire while dropping the client-only mode', () => {
    const branched = withChatRevisionMode({ kind: 'tau', model: 'a', hostId: 'origin' }, 'branch');

    // `hostId` is a real schema field; `revision` is not.
    expect(withoutChatRevisionMode(branched)).toEqual({ kind: 'tau', model: 'a', hostId: 'origin' });
  });

  it('drops the retired placement property and converts a Paseo execution', () => {
    const legacy = { kind: 'tau', model: 'a', placement: 'browser-host' } as unknown as CadAgentExecution;

    expect(withTauExecutionModel(legacy, 'b')).toEqual({ kind: 'tau', model: 'b' });
    expect(withTauExecutionModel({ kind: 'paseo', connectionId: 'c', agentId: 'a' }, 'b')).toEqual({
      kind: 'tau',
      model: 'b',
    });
  });
});
