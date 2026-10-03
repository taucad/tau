import { describe, expect, it } from 'vitest';
import type { AcpAgentExecution, TauAgentExecution } from '@taucad/chat';
import { resolveNewChatExecution, tauModelReadiness } from '#utils/new-chat-execution.js';
import type { ModelCatalog } from '#utils/new-chat-execution.js';

const codex: AcpAgentExecution = {
  kind: 'acp',
  hostId: 'desktop',
  agentId: 'codex',
  model: 'gpt-6-astra',
  config: { mode: 'high' },
};
const opus: TauAgentExecution = { kind: 'tau', model: 'anthropic-claude-opus-4.8', hostId: 'desktop', effort: 'high' };
const loaded = (...models: ReadonlyArray<{ id: string; recommended?: boolean }>): ModelCatalog => ({
  status: 'loaded',
  models,
});

describe('resolveNewChatExecution', () => {
  it('should start a new chat on the last external agent with its model and config', () => {
    expect(resolveNewChatExecution({ last: codex, lastTau: opus, catalog: loaded({ id: 'x' }) })).toBe(codex);
  });

  it('should keep the external agent while the catalog is unavailable', () => {
    expect(resolveNewChatExecution({ last: codex, lastTau: opus, catalog: { status: 'unavailable' } })).toBe(codex);
  });

  it('should keep the last Tau execution exactly when the catalog offers its model', () => {
    expect(
      resolveNewChatExecution({ last: opus, lastTau: opus, catalog: loaded({ id: opus.model }, { id: 'y' }) }),
    ).toBe(opus);
  });

  it('should move a Tau default the catalog no longer offers to the recommended model, keeping host and effort', () => {
    expect(
      resolveNewChatExecution({
        last: opus,
        lastTau: opus,
        catalog: loaded({ id: 'plain' }, { id: 'pick', recommended: true }),
      }),
    ).toEqual({ ...opus, model: 'pick' });
  });

  it('should fall back to the first offered model when none is recommended', () => {
    expect(
      resolveNewChatExecution({ last: opus, lastTau: opus, catalog: loaded({ id: 'first' }, { id: 'b' }) }),
    ).toEqual({ ...opus, model: 'first' });
  });

  it('should leave a Tau default unchanged while the catalog is loading, unavailable or empty', () => {
    for (const catalog of [{ status: 'loading' }, { status: 'unavailable' }, loaded()] as const) {
      expect(resolveNewChatExecution({ last: opus, lastTau: opus, catalog })).toBe(opus);
    }
  });

  it('should resolve the last Tau choice when nothing else was remembered', () => {
    const haiku: TauAgentExecution = { kind: 'tau', model: 'retired-haiku' };
    expect(
      resolveNewChatExecution({ last: undefined, lastTau: haiku, catalog: loaded({ id: 'pick', recommended: true }) }),
    ).toEqual({ kind: 'tau', model: 'pick' });
  });

  it('should be stable when its own result is remembered and resolved again', () => {
    const catalog = loaded({ id: 'plain' }, { id: 'pick', recommended: true });
    const once = resolveNewChatExecution({ last: opus, lastTau: opus, catalog });
    expect(resolveNewChatExecution({ last: once, lastTau: opus, catalog })).toEqual(once);
  });
});

describe('tauModelReadiness', () => {
  it('should report each catalog state the picker and admission explain', () => {
    expect(tauModelReadiness('m', { status: 'loading' })).toBe('checking');
    expect(tauModelReadiness('m', { status: 'unavailable' })).toBe('catalog-unavailable');
    expect(tauModelReadiness('m', loaded())).toBe('catalog-unavailable');
    expect(tauModelReadiness('m', loaded({ id: 'other' }))).toBe('not-offered');
    expect(tauModelReadiness('m', loaded({ id: 'm' }))).toBe('ready');
  });
});
