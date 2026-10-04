import { describe, expect, it } from 'vitest';
import { isUnattendedAction, machineActionDescriptorOf, standardMachineAction } from '#machines/machine-actions.js';

describe('standardMachineAction', () => {
  it('starts a low-risk family at agent for its listed component kind', () => {
    const light = machineActionDescriptorOf(
      standardMachineAction({
        id: 'switch.set',
        componentId: 'chamber-light',
        componentKind: 'light',
        label: 'Light',
        when: ['ready'],
      }),
    );
    expect(light.safety.authority).toBe('agent');
    expect(isUnattendedAction('light', light)).toBe(true);
  });

  it('keeps the family floor for any other component kind', () => {
    const fan = machineActionDescriptorOf(
      standardMachineAction({
        id: 'switch.set',
        componentId: 'fan',
        componentKind: 'fan',
        label: 'Fan',
        when: ['ready'],
      }),
    );
    expect(fan.safety.authority).toBe('approved-agent');
    expect(isUnattendedAction('fan', fan)).toBe(false);
  });

  it('lets a provider raise a low-risk floor', () => {
    const light = machineActionDescriptorOf(
      standardMachineAction({
        id: 'switch.set',
        componentId: 'chamber-light',
        componentKind: 'light',
        label: 'Light',
        when: ['ready'],
        safety: { authority: 'person' },
      }),
    );
    expect(light.safety.authority).toBe('person');
    expect(isUnattendedAction('light', light)).toBe(false);
  });
});
