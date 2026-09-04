import { describe, expect, it } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import { withTauExecutionModel } from '#utils/chat-execution.js';
import { getChatRevisionMode, withChatRevisionMode, withoutChatRevisionMode } from '#utils/chat-revision-mode.js';

const tau: CadAgentExecution = { kind: 'tau', model: 'openai-gpt-5.5' };
/** Pre-cutover rows still carry `placement`; the strict type never did. */
const retiredPlacementFields = { kind: 'tau', model: 'openai-gpt-5.5', placement: 'browser-host' };
const persistedWithRetiredPlacement = retiredPlacementFields as unknown as CadAgentExecution;
const paseo: CadAgentExecution = { kind: 'paseo', connectionId: 'connection-1', agentId: 'claude' };

describe('chat revision mode', () => {
  it('defaults to local for an execution that carries no mode', () => {
    expect(getChatRevisionMode(tau)).toBe('local');
  });

  it('round-trips both modes through the execution object', () => {
    const branch = withChatRevisionMode(tau, 'branch');

    expect(branch).toEqual({ kind: 'tau', model: 'openai-gpt-5.5', revision: 'branch' });
    expect(getChatRevisionMode(branch)).toBe('branch');
    expect(withChatRevisionMode(branch, 'local')).toEqual({ kind: 'tau', model: 'openai-gpt-5.5' });
    expect(getChatRevisionMode(withChatRevisionMode(branch, 'local'))).toBe('local');
  });

  it('drops the retired placement property instead of rejecting a persisted execution', () => {
    // Executions persisted before the browser host became the only Tau
    // placement still carry `placement: 'browser-host'`. It must parse, and it
    // must never reach the strict turn wire.
    const persisted = persistedWithRetiredPlacement;

    expect(withChatRevisionMode(persisted, 'branch')).toEqual({
      kind: 'tau',
      model: 'openai-gpt-5.5',
      revision: 'branch',
    });
    expect(withoutChatRevisionMode(persisted)).toEqual({ kind: 'tau', model: 'openai-gpt-5.5' });
  });

  it('reads local and never persists a mode for a non-Tau execution', () => {
    expect(getChatRevisionMode(paseo)).toBe('local');
    expect(withChatRevisionMode(paseo, 'branch')).toBe(paseo);
  });

  it('ignores an unrecognised persisted mode instead of failing the turn', () => {
    const corrupt = { kind: 'tau', model: 'm', revision: 'nonsense' } as unknown as CadAgentExecution;

    expect(getChatRevisionMode(corrupt)).toBe('local');
  });

  it('strips the client-only mode so the strict turn schema never sees it', () => {
    expect(withoutChatRevisionMode(withChatRevisionMode(tau, 'branch'))).toEqual(tau);
    expect(withoutChatRevisionMode(tau)).toEqual(tau);
  });
});

describe('chat revision mode survives sibling execution edits', () => {
  it('keeps a branch selection when the model changes', () => {
    const branch = withChatRevisionMode(tau, 'branch');

    expect(getChatRevisionMode(withTauExecutionModel(branch, 'anthropic-claude-haiku-4.5'))).toBe('branch');
    expect(withTauExecutionModel(branch, 'anthropic-claude-haiku-4.5')).toEqual({
      kind: 'tau',
      model: 'anthropic-claude-haiku-4.5',
      revision: 'branch',
    });
  });

  it('drops the retired placement when the model changes', () => {
    const persisted = persistedWithRetiredPlacement;

    expect(withTauExecutionModel(persisted, 'anthropic-claude-haiku-4.5')).toEqual({
      kind: 'tau',
      model: 'anthropic-claude-haiku-4.5',
    });
  });
});
