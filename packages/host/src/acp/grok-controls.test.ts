/* eslint-disable @typescript-eslint/naming-convention -- Fixtures retain Grok's exact wire field names. */
import { describe, expect, it } from 'vitest';
import {
  grokAutoAvailability,
  grokControlOptions,
  grokControlsSupported,
  grokPermissionMetadata,
  grokPermissionModeOf,
  grokPermissionNotification,
  grokPlanningRequest,
} from '#acp/grok-controls.js';

describe('Grok controls', () => {
  it('should require the verified native version before offering synthetic controls', () => {
    expect(grokControlsSupported('grok', { grokShell: true, agentVersion: '1.0.52' })).toBe(true);
    expect(grokControlsSupported('grok', { grokShell: true, agentVersion: '1.0.51' })).toBe(false);
    expect(grokControlsSupported('codex', { grokShell: true, agentVersion: '1.0.52' })).toBe(false);
    expect(grokControlsSupported('grok', { grokShell: true, agentVersion: 'broken' })).toBe(false);
    expect(grokControlsSupported('grok', { grokShell: true, agentVersion: '1.0.52-preview' })).toBe(false);
  });

  it('should explicitly disable both approval modes when selecting Ask', () => {
    expect(grokPermissionMetadata('ask')).toEqual({ yoloMode: false, autoMode: false });
    expect(grokPermissionNotification('ask')).toEqual({
      method: '_x.ai/yolo_mode_changed',
      params: { clientIdentifier: 'tau-host', yolo_mode: false, auto_mode: false, permission_mode: 'ask' },
    });
    expect(grokPermissionMetadata('auto')).toEqual({ yoloMode: false, autoMode: true });
    expect(grokPermissionMetadata('always-approve')).toEqual({ yoloMode: true, autoMode: false });
    expect(grokPermissionModeOf('allow')).toBeUndefined();
  });

  it('should keep unknown Auto availability distinct from an explicit remote refusal', () => {
    expect(grokAutoAvailability(true, {})).toBe(true);
    expect(grokAutoAvailability(true, { auto_permission_mode_enabled: 'yes' })).toBe(true);
    expect(grokAutoAvailability(true, { auto_permission_mode_enabled: null })).toBeUndefined();
    expect(grokAutoAvailability(true, { auto_permission_mode_enabled: false })).toBe(false);
    const options = grokControlOptions({ permission: 'ask', planning: 'plan', autoAvailable: undefined });
    expect(options[0]).toMatchObject({ category: 'mode', currentValue: 'ask' });
    const choices = (available: boolean | undefined) =>
      grokControlOptions({ permission: 'ask', planning: 'default', autoAvailable: available }).flatMap((option) =>
        option.type === 'select' && option.category === 'mode'
          ? option.options.flatMap((entry) =>
              'options' in entry ? entry.options.map((choice) => choice.value) : [entry.value],
            )
          : [],
      );
    expect(choices(undefined)).not.toContain('auto');
    expect(choices(true)).toContain('auto');
  });

  it('should retain a previously selected Auto policy when its gate is withdrawn', () => {
    expect(grokControlOptions({ permission: 'auto', planning: 'default', autoAvailable: false })[0]).toMatchObject({
      currentValue: 'auto',
    });
    expect(grokPlanningRequest('chat-A', 'plan')).toEqual({
      method: 'session/set_mode',
      params: { sessionId: 'chat-A', modeId: 'plan' },
    });
  });
});
