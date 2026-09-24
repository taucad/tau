// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AcpSessionData } from '@taucad/chat';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

const execution: { current: ChatComposerContextValue['execution']['execution'] } = {
  current: { kind: 'acp', hostId: 'origin', agentId: 'codex' },
};
const setActiveExecution = vi.fn();

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ execution: { execution: execution.current, setActiveExecution } }),
}));

const { configOptionOf, useAgentConfig } = await import('#components/chat/use-agent-config.js');

const thinking = (currentValue: string, values = ['medium', 'high']): AcpSessionData['configOptions'][number] => ({
  type: 'select',
  id: 'thought_level',
  name: 'Thinking',
  category: 'thought_level',
  currentValue,
  options: values.map((value) => ({ value, name: value })),
});

const session = (
  configOptions: AcpSessionData['configOptions'],
  overrides: Partial<AcpSessionData> = {},
): AcpSessionData => ({
  type: 'acp-session',
  id: 'state',
  agentId: 'codex',
  commands: [],
  configOptions,
  ...overrides,
});

const renderConfig = (initial: { sessionData: AcpSessionData | undefined; status: string }) =>
  renderHook(({ sessionData, status }) => useAgentConfig(sessionData, status), { initialProps: initial });

const thoughtValue = (config: ReturnType<typeof useAgentConfig>): string | boolean | undefined => {
  const option = configOptionOf(config, 'thought_level');
  return option ? config.valueOf(option) : undefined;
};

describe('useAgentConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execution.current = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
  });

  it('offers every non-model option and stores the exact selected value on the execution', () => {
    const model: AcpSessionData['configOptions'][number] = {
      type: 'select',
      id: 'model',
      name: 'Model',
      category: 'model',
      currentValue: 'gpt-5.6-sol',
      options: [{ value: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' }],
    };
    const { result } = renderConfig({ sessionData: session([model, thinking('medium')]), status: 'ready' });

    expect(result.current.options.map((option) => option.id)).toEqual(['thought_level']);
    act(() => {
      result.current.select('thought_level', 'high');
    });
    expect(setActiveExecution).toHaveBeenCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      config: Object.fromEntries([['thought_level', 'high']]),
    });
    expect(thoughtValue(result.current)).toBe('high');
  });

  it('shows the agent-confirmed value instead of a stale requested one', () => {
    execution.current = {
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      config: Object.fromEntries([['thought_level', 'high']]),
    };
    const { result } = renderConfig({ sessionData: session([thinking('medium')]), status: 'ready' });

    expect(thoughtValue(result.current)).toBe('medium');
  });

  it('offers nothing on Tau, or for another agent’s session', () => {
    const { result, rerender } = renderConfig({
      sessionData: session([thinking('medium')], { agentId: 'claude' }),
      status: 'ready',
    });
    expect(result.current.options).toEqual([]);

    execution.current = { kind: 'tau', model: 'm' };
    rerender({ sessionData: session([thinking('medium')]), status: 'ready' });
    expect(result.current.options).toEqual([]);
  });

  it('clears a rejected request even when the confirmed value is unchanged', () => {
    const confirmed = session([thinking('medium')]);
    const view = renderConfig({ sessionData: confirmed, status: 'ready' });
    act(() => {
      view.result.current.select('thought_level', 'high');
    });
    view.rerender({ sessionData: confirmed, status: 'submitted' });
    view.rerender({ sessionData: { ...confirmed }, status: 'ready' });

    expect(thoughtValue(view.result.current)).toBe('medium');
    expect(setActiveExecution).toHaveBeenLastCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      config: Object.fromEntries([['thought_level', 'medium']]),
    });
  });

  it('retains an option edited after the submitted snapshot', () => {
    const confirmed = session([thinking('medium', ['medium', 'high', 'max'])]);
    const view = renderConfig({ sessionData: confirmed, status: 'ready' });
    act(() => {
      view.result.current.select('thought_level', 'high');
    });
    view.rerender({ sessionData: confirmed, status: 'submitted' });
    act(() => {
      view.result.current.select('thought_level', 'max');
    });
    view.rerender({ sessionData: { ...confirmed }, status: 'ready' });

    expect(thoughtValue(view.result.current)).toBe('max');
    expect(setActiveExecution).toHaveBeenLastCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      config: Object.fromEntries([['thought_level', 'max']]),
    });
  });

  it('waits for the turn boundary before acknowledging unchanged startup configuration', () => {
    const confirmed = session([thinking('medium')], { sessionId: 'session' });
    const view = renderConfig({ sessionData: confirmed, status: 'ready' });
    act(() => {
      view.result.current.select('thought_level', 'high');
    });
    view.rerender({ sessionData: confirmed, status: 'submitted' });
    const startup = { ...confirmed, commands: [{ name: 'help', description: 'Help' }] };
    view.rerender({ sessionData: startup, status: 'streaming' });
    expect(thoughtValue(view.result.current)).toBe('high');
    view.rerender({ sessionData: startup, status: 'ready' });
    expect(thoughtValue(view.result.current)).toBe('medium');
  });

  it('drops unsubmitted settings when the session is replaced', () => {
    const confirmed = session([thinking('medium')], { sessionId: 'session-before' });
    const view = renderConfig({ sessionData: confirmed, status: 'ready' });
    act(() => {
      view.result.current.select('thought_level', 'high');
    });
    view.rerender({ sessionData: { ...confirmed, sessionId: 'session-after' }, status: 'ready' });

    expect(thoughtValue(view.result.current)).toBe('medium');
    expect(setActiveExecution).toHaveBeenLastCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      config: Object.fromEntries([['thought_level', 'medium']]),
    });
  });
});
