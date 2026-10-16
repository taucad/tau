// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AcpSessionData } from '@taucad/chat';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

const execution: { current: ChatComposerContextValue['execution']['execution'] } = {
  current: { kind: 'acp', hostId: 'origin', agentId: 'codex' },
};
const setActiveExecution = vi.fn<ChatComposerContextValue['execution']['setActiveExecution']>();

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
  hostId: 'origin',
  commands: [],
  configOptions,
  ...overrides,
});

const renderConfig = (initial: {
  sessionData: AcpSessionData | undefined;
  status: string;
  discoveredOptions?: AcpSessionData['configOptions'];
}) =>
  renderHook(({ sessionData, status, discoveredOptions }) => useAgentConfig(sessionData, status, discoveredOptions), {
    initialProps: initial,
  });

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

  it('offers the discovered reasoning before a session, then reads the live session', () => {
    const discoveredOptions = [thinking('medium')];
    const view = renderConfig({ sessionData: undefined, status: 'ready', discoveredOptions });
    expect(thoughtValue(view.result.current)).toBe('medium');
    act(() => {
      view.result.current.select('thought_level', 'high');
    });
    expect(setActiveExecution).toHaveBeenLastCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- ACP option IDs retain the provider's wire spelling.
      config: { thought_level: 'high' },
    });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- ACP option IDs retain the provider's wire spelling.
    execution.current = { kind: 'acp', hostId: 'origin', agentId: 'codex', config: { thought_level: 'high' } };
    view.rerender({ sessionData: undefined, status: 'ready', discoveredOptions });
    expect(thoughtValue(view.result.current)).toBe('high');
    view.rerender({
      sessionData: session([thinking('medium', ['medium', 'high', 'max'])]),
      status: 'ready',
      discoveredOptions,
    });
    expect(view.result.current.options).toEqual([thinking('medium', ['medium', 'high', 'max'])]);
    expect(thoughtValue(view.result.current)).toBe('high');
    view.rerender({ sessionData: session([thinking('medium')]), status: 'submitted', discoveredOptions });
    view.rerender({ sessionData: session([thinking('medium')]), status: 'ready', discoveredOptions });
    expect(thoughtValue(view.result.current)).toBe('medium');
  });

  it('should store pre-session permissions in an immutable execution choice and prefer later session controls', () => {
    execution.current = { kind: 'acp', hostId: 'origin', agentId: 'grok' };
    const permissions: AcpSessionData['configOptions'][number] = {
      type: 'select',
      id: 'tau.grok.permissions',
      category: 'mode',
      name: 'Permissions',
      currentValue: 'ask',
      options: [
        { value: 'ask', name: 'Ask' },
        { value: 'always-approve', name: 'Always approve' },
      ],
    };
    const discoveredOptions = [permissions, thinking('medium')];
    const view = renderConfig({ sessionData: undefined, status: 'ready', discoveredOptions });
    expect(view.result.current.options).toEqual(discoveredOptions);
    act(() => {
      view.result.current.select(permissions.id, 'always-approve');
    });
    const selected: unknown = setActiveExecution.mock.lastCall?.[0];
    expect(selected).toEqual({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'grok',
      config: { 'tau.grok.permissions': 'always-approve' },
    });
    act(() => {
      view.result.current.select(permissions.id, 'ask');
    });
    expect(selected).toEqual({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'grok',
      config: { 'tau.grok.permissions': 'always-approve' },
    });
    view.rerender({ sessionData: session([], { agentId: 'grok' }), status: 'ready', discoveredOptions });
    expect(view.result.current.options).toEqual([]);
  });

  it.each([
    { hostId: 'origin', agentId: 'codex', model: 'model-a' },
    { hostId: 'other-host', agentId: 'grok', model: 'model-a' },
    { hostId: 'origin', agentId: 'grok', model: 'model-b' },
  ])('should discard pending choices and stale callbacks when execution changes to $hostId/$agentId/$model', (next) => {
    execution.current = { kind: 'acp', hostId: 'origin', agentId: 'grok', model: 'model-a' };
    const view = renderConfig({ sessionData: undefined, status: 'ready', discoveredOptions: [thinking('medium')] });
    const oldSelect = view.result.current.select;
    act(() => {
      oldSelect('tau.grok.permissions', 'always-approve');
    });
    execution.current = { kind: 'acp', ...next };
    view.rerender({ sessionData: undefined, status: 'ready', discoveredOptions: [thinking('medium')] });
    setActiveExecution.mockClear();
    act(() => {
      oldSelect('tau.grok.permissions', 'always-approve');
    });
    expect(setActiveExecution).not.toHaveBeenCalled();
    const current = session([thinking('medium')], { agentId: next.agentId, hostId: next.hostId });
    view.rerender({ sessionData: undefined, status: 'submitted', discoveredOptions: [thinking('medium')] });
    view.rerender({ sessionData: current, status: 'ready', discoveredOptions: [thinking('medium')] });
    expect(
      setActiveExecution.mock.calls.some(
        ([choice]) => choice.kind === 'acp' && Object.hasOwn(choice.config ?? {}, 'tau.grok.permissions'),
      ),
    ).toBe(false);
  });

  it.each(['other-host', undefined])(
    'should ignore another or unknown session host %s even for the same agent',
    (hostId) => {
      execution.current = { kind: 'acp', hostId: 'origin', agentId: 'grok' };
      const permissions: AcpSessionData['configOptions'][number] = {
        type: 'select',
        id: 'tau.grok.permissions',
        name: 'Permissions',
        category: 'mode',
        currentValue: 'ask',
        options: [
          { value: 'ask', name: 'Ask' },
          { value: 'always-approve', name: 'Always approve' },
        ],
      };
      const foreign = session([{ ...permissions, currentValue: 'always-approve' }], { agentId: 'grok', hostId });
      const view = renderConfig({ sessionData: foreign, status: 'ready', discoveredOptions: [permissions] });
      expect(view.result.current.options).toEqual([permissions]);
      expect(view.result.current.valueOf(permissions)).toBe('ask');
      expect(setActiveExecution).not.toHaveBeenCalled();
      view.rerender({ sessionData: foreign, status: 'submitted', discoveredOptions: [permissions] });
      view.rerender({ sessionData: foreign, status: 'ready', discoveredOptions: [permissions] });
      expect(setActiveExecution).not.toHaveBeenCalled();
    },
  );

  it('should use selected model reasoning while keeping the same session general controls', () => {
    execution.current = { kind: 'acp', hostId: 'origin', agentId: 'codex', model: 'model-b' };
    const mode: AcpSessionData['configOptions'][number] = {
      type: 'select',
      id: 'mode',
      name: 'Permissions',
      category: 'mode',
      currentValue: 'ask',
      options: [{ value: 'ask', name: 'Ask' }],
    };
    const model: AcpSessionData['configOptions'][number] = {
      type: 'select',
      id: 'model',
      name: 'Model',
      category: 'model',
      currentValue: 'model-a',
      options: [
        { value: 'model-a', name: 'Model A' },
        { value: 'model-b', name: 'Model B' },
      ],
    };
    const view = renderConfig({
      sessionData: session([mode, model, thinking('high')]),
      status: 'ready',
      discoveredOptions: [thinking('low', ['low', 'medium'])],
    });
    expect(configOptionOf(view.result.current, 'mode')).toEqual(mode);
    expect(thoughtValue(view.result.current)).toBe('low');
    act(() => {
      view.result.current.select('thought_level', 'medium');
    });
    expect(setActiveExecution).toHaveBeenLastCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      model: 'model-b',
      config: Object.fromEntries([['thought_level', 'medium']]),
    });
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
