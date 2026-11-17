import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';

import {
  bypassModeIds,
  defaultModeOf,
  discoveredModeOptions,
  grokNoAutoFallback,
  modeDecisionOf,
  planModeId,
  withoutPlanModes,
} from '#acp/acp-modes.js';
import { acpAgentProfiles } from '#acp/registry.js';

type Select = Extract<SessionConfigOption, { readonly type: 'select' }>;

/* The claude-agent-acp 0.70.0 `buildAvailableModes` on a model with `supportsAutoMode` (ALLOW_BYPASS on). */
const claudeModes = ['auto', 'default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'];
/* The same on a model without it (Haiku). */
const claudeModesWithoutAuto = claudeModes.filter((id) => id !== 'auto');
/* The codex-acp 1.7.0 `AgentMode.all()`. */
const codexModes = ['read-only', 'agent', 'agent-full-access'];
/* Tau's Grok permission select, before and after Grok reports Auto enabled. */
const grokModes = ['ask', 'always-approve'];
const grokModesWithAuto = ['ask', 'auto', 'always-approve'];

const preferenceOf = (id: string): readonly string[] =>
  acpAgentProfiles.find((profile) => profile.id === id)?.defaultModePreference ?? [];

const select = (id: string, values: readonly string[], currentValue: string): Select => ({
  id,
  name: id,
  category: 'mode',
  type: 'select',
  currentValue,
  options: values.map((value) => ({ value, name: `${value} name`, description: `${value} description` })),
});

describe('defaultModeOf', () => {
  it('should choose auto when the agent advertises it', () => {
    expect(defaultModeOf(claudeModes, preferenceOf('claude'))).toBe('auto');
    expect(defaultModeOf(grokModesWithAuto, preferenceOf('grok'))).toBe('auto');
  });

  it('should fall back to the most permissive mode that keeps a vendor boundary', () => {
    expect(defaultModeOf(claudeModesWithoutAuto, preferenceOf('claude'))).toBe('acceptEdits');
    expect(defaultModeOf(codexModes, preferenceOf('codex'))).toBe('agent');
    expect(defaultModeOf(['read-only', 'agent-full-access'], preferenceOf('codex'))).toBe('read-only');
  });

  it('should start Grok without Auto in always-approve (PR5 amendment, operator 2026-11-17T03:42Z)', () => {
    expect(grokNoAutoFallback).toBe('always-approve');
    expect(defaultModeOf(grokModes, preferenceOf('grok'))).toBe('always-approve');
  });

  it('should never choose a bypass mode other than the ruled Grok fallback, nor a plan mode', () => {
    const everything = [...claudeModes, ...codexModes, ...grokModesWithAuto];
    for (const profile of acpAgentProfiles) {
      for (const offered of [everything, everything.filter((id) => id !== 'auto')]) {
        const chosen = defaultModeOf(offered, profile.defaultModePreference);
        expect(chosen).not.toBe(planModeId);
        expect(chosen === undefined || !bypassModeIds.has(chosen) || chosen === grokNoAutoFallback).toBe(true);
      }
    }
    expect(defaultModeOf(['bypassPermissions', 'plan'], ['bypassPermissions', 'plan'])).toBeUndefined();
    expect(defaultModeOf(['agent-full-access'], ['agent-full-access'])).toBeUndefined();
  });

  it('should keep every reviewed profile free of plan and of bypass ids but the Grok fallback', () => {
    for (const profile of acpAgentProfiles) {
      expect(profile.defaultModePreference[0]).toBe('auto');
      for (const id of profile.defaultModePreference) {
        expect(id).not.toBe(planModeId);
        expect(!bypassModeIds.has(id) || (profile.id === 'grok' && id === grokNoAutoFallback)).toBe(true);
      }
    }
  });
});

describe('modeDecisionOf', () => {
  const claude = preferenceOf('claude');

  it('should choose the default when the turn names no mode', () => {
    const option = select('mode', claudeModes, 'default');
    expect(
      modeDecisionOf({ option, offered: claudeModes, requested: undefined, defaulted: undefined, preference: claude }),
    ).toEqual({ configId: 'mode', value: 'auto', defaulted: true });
  });

  it("should keep the person's pick", () => {
    const option = select('mode', claudeModes, 'auto');
    expect(
      modeDecisionOf({ option, offered: claudeModes, requested: 'default', defaulted: 'auto', preference: claude }),
    ).toEqual({ configId: 'mode', value: 'default', defaulted: false });
  });

  it('should treat an echo of the last default as no pick, so a model with auto upgrades it', () => {
    const option = select('mode', claudeModes, 'acceptEdits');
    expect(
      modeDecisionOf({
        option,
        offered: claudeModes,
        requested: 'acceptEdits',
        defaulted: 'acceptEdits',
        preference: claude,
      }),
    ).toEqual({ configId: 'mode', value: 'auto', defaulted: true });
  });

  it('should keep a picked acceptEdits when a model switch brings auto back', () => {
    const option = select('mode', claudeModes, 'acceptEdits');
    expect(
      modeDecisionOf({
        option,
        offered: claudeModes,
        requested: 'acceptEdits',
        defaulted: undefined,
        preference: claude,
      }),
    ).toEqual({ configId: 'mode', value: 'acceptEdits', defaulted: false });
  });

  it('should fall back when the picked or defaulted mode is no longer offered', () => {
    const option = select('mode', claudeModesWithoutAuto, 'default');
    for (const defaulted of ['auto', undefined]) {
      expect(
        modeDecisionOf({
          option,
          offered: claudeModesWithoutAuto,
          requested: 'auto',
          defaulted,
          preference: claude,
        }),
      ).toEqual({ configId: 'mode', value: 'acceptEdits', defaulted: true });
    }
  });

  it('should move a session off plan even when the turn asks for it', () => {
    const option = select('mode', claudeModes, 'plan');
    expect(
      modeDecisionOf({ option, offered: claudeModes, requested: 'plan', defaulted: undefined, preference: claude }),
    ).toEqual({ configId: 'mode', value: 'auto', defaulted: true });
  });

  it("should keep the agent's own mode when no preferred mode is offered", () => {
    const option = select('mode', ['default', 'plan'], 'default');
    expect(
      modeDecisionOf({
        option,
        offered: ['default', 'plan'],
        requested: undefined,
        defaulted: undefined,
        preference: claude,
      }),
    ).toEqual({ configId: 'mode', value: 'default', defaulted: true });
  });
});

describe('withoutPlanModes', () => {
  it("should drop plan from the mode menu and keep the adapter's names and descriptions", () => {
    const [mode] = withoutPlanModes([select('mode', claudeModes, 'auto')]);
    expect(mode).toEqual(
      select(
        'mode',
        claudeModes.filter((id) => id !== 'plan'),
        'auto',
      ),
    );
  });

  it('should drop a select left with one value (Codex collaboration mode, Grok planning)', () => {
    const options = withoutPlanModes([
      { ...select('collaboration_mode', ['default', 'plan'], 'default'), category: 'collaboration_mode' },
      { ...select('model', ['plan', 'other'], 'other'), category: 'model' },
    ]);
    expect(options.map((option) => option.id)).toEqual(['model']);
  });

  it('should keep a plan value the session is in, so the person can leave it', () => {
    expect(withoutPlanModes([select('mode', claudeModes, 'plan')])[0]).toEqual(select('mode', claudeModes, 'plan'));
  });
});

describe('discoveredModeOptions', () => {
  it('should show a new chat its default mode and no plan', () => {
    const [mode] = discoveredModeOptions([select('mode', claudeModesWithoutAuto, 'default')], preferenceOf('claude'));
    expect(mode).toMatchObject({ currentValue: 'acceptEdits' });
    expect(mode?.type === 'select' && mode.options.some((entry) => 'value' in entry && entry.value === 'plan')).toBe(
      false,
    );
  });

  it('should move a discovery session that opens in plan to its fallback and drop plan', () => {
    const [mode] = discoveredModeOptions(
      [select('mode', ['default', 'dontAsk', 'plan'], 'plan')],
      preferenceOf('claude'),
    );
    expect(mode).toMatchObject({ currentValue: 'default' });
    expect(mode?.type === 'select' && mode.options.some((entry) => 'value' in entry && entry.value === 'plan')).toBe(
      false,
    );
  });
});
