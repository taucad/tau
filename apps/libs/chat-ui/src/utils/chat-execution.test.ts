// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import {
  chatPlacementOf,
  isDeviceRelativeHostId,
  portableExecutionOf,
  withChatPlacement,
  withExecutionModel,
  withTauExecutionModel,
} from '#utils/chat-execution.js';

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

  it('carries the chosen reasoning level across a model change, for the reader to clamp', () => {
    // Fable at xhigh → Gemini reads as high, and back to Fable reads xhigh again.
    expect(withTauExecutionModel({ kind: 'tau', model: 'fable', effort: 'xhigh' }, 'gemini')).toEqual({
      kind: 'tau',
      model: 'gemini',
      effort: 'xhigh',
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

describe('portableExecutionOf', () => {
  it.each(['desktop', 'origin', 'loopback:http://127.0.0.1:4100'])(
    'should drop the device-relative Tau host %s and keep the chat’s intent',
    (hostId) => {
      expect(portableExecutionOf({ kind: 'tau', model: 'a', hostId, effort: 'high' })).toEqual({
        kind: 'tau',
        model: 'a',
        effort: 'high',
      });
    },
  );

  it('should keep a paired device id and an external agent’s host as they are', () => {
    expect(portableExecutionOf({ kind: 'tau', model: 'a', hostId: 'dev_studio' })).toEqual({
      kind: 'tau',
      model: 'a',
      hostId: 'dev_studio',
    });
    expect(portableExecutionOf({ kind: 'acp', hostId: 'desktop', agentId: 'codex' })).toEqual({
      kind: 'acp',
      hostId: 'desktop',
      agentId: 'codex',
    });
  });

  it('should classify only paired device ids as portable', () => {
    expect(
      ['desktop', 'origin', 'loopback:http://localhost:9', 'dev_studio'].map((hostId) =>
        isDeviceRelativeHostId(hostId),
      ),
    ).toEqual([true, true, true, false]);
  });
});

describe('withChatPlacement', () => {
  it('should put this device’s placement back on a Tau execution with no host of its own', () => {
    expect(withChatPlacement({ kind: 'tau', model: 'a' }, 'origin')).toEqual({
      kind: 'tau',
      model: 'a',
      hostId: 'origin',
    });
    expect(withChatPlacement({ kind: 'tau', model: 'a' }, undefined)).toEqual({ kind: 'tau', model: 'a' });
  });

  it('should never move a chat that names a paired device or an external agent', () => {
    expect(withChatPlacement({ kind: 'tau', model: 'a', hostId: 'dev_studio' }, 'origin')).toEqual({
      kind: 'tau',
      model: 'a',
      hostId: 'dev_studio',
    });
    expect(withChatPlacement({ kind: 'acp', hostId: 'dev_studio', agentId: 'codex' }, 'origin')).toEqual({
      kind: 'acp',
      hostId: 'dev_studio',
      agentId: 'codex',
    });
    expect(withChatPlacement(undefined, 'origin')).toBeUndefined();
  });
});

describe('chatPlacementOf', () => {
  it('should keep an explicit daemon choice that is never a device default', () => {
    expect(chatPlacementOf({ kind: 'tau', model: 'a', hostId: 'origin' })).toBe('origin');
    expect(chatPlacementOf({ kind: 'tau', model: 'a', hostId: 'loopback:http://127.0.0.1:4100' })).toBe(
      'loopback:http://127.0.0.1:4100',
    );
  });

  it('should keep nothing for local placement, which every device resolves itself', () => {
    expect(chatPlacementOf({ kind: 'tau', model: 'a' })).toBeUndefined();
    expect(chatPlacementOf({ kind: 'tau', model: 'a', hostId: 'desktop' })).toBeUndefined();
    expect(chatPlacementOf(undefined)).toBeUndefined();
  });

  it('should keep nothing for a placement the chat names itself', () => {
    expect(chatPlacementOf({ kind: 'tau', model: 'a', hostId: 'dev_studio' })).toBeUndefined();
    expect(chatPlacementOf({ kind: 'acp', hostId: 'origin', agentId: 'claude' })).toBeUndefined();
  });
});
