// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import { withExecutionModel, withTauExecutionModel } from '#utils/chat-execution.js';

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

  it('drops the retired placement and revision properties and converts an external execution', () => {
    const legacy = {
      kind: 'tau',
      model: 'a',
      hostId: 'origin',
      placement: 'browser-host',
      revision: 'branch',
    } as unknown as CadAgentExecution;

    // Both are pre-cutover ride-alongs a persisted row still carries (VI9);
    // neither may reach the strict turn wire.
    expect(withTauExecutionModel(legacy, 'b')).toEqual({ kind: 'tau', model: 'b', hostId: 'origin' });
    expect(withTauExecutionModel({ kind: 'acp', hostId: 'origin', agentId: 'claude' }, 'b')).toEqual({
      kind: 'tau',
      model: 'b',
    });
  });
});

describe('withExecutionModel', () => {
  it('keeps an external-agent execution external when a retry names a model', () => {
    /* V5: a retry is "answer that turn again", never "and move it to another
       substrate" — routing every retry through `withTauExecutionModel` silently
       converted an ACP chat to a Tau one. */
    expect(withExecutionModel({ kind: 'acp', hostId: 'origin', agentId: 'codex' }, 'gpt-5.6-sol')).toEqual({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      model: 'gpt-5.6-sol',
    });
  });

  it('rebuilds a Tau execution exactly as before', () => {
    expect(withExecutionModel({ kind: 'tau', model: 'a', hostId: 'origin' }, 'b')).toEqual({
      kind: 'tau',
      model: 'b',
      hostId: 'origin',
    });
  });
});
