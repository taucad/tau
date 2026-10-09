import { describe, expect, it } from 'vitest';
import { checkMachineAction } from '@taucad/runtime/machine';
import {
  a1MiniManifest,
  carveraManifest,
  machineEntry,
  routerManifest,
  x1cManifest,
} from '#components/print/testing/machines.fixture.js';

describe('machine fixtures', () => {
  it.each([x1cManifest, a1MiniManifest, routerManifest, carveraManifest])(
    'admits $identity.typeId as an entry a person can check its actions against',
    (manifest) => {
      const entry = machineEntry({ manifest });
      expect(entry.descriptor.capabilities.actions.length).toBeGreaterThan(0);
    },
  );

  it('checks a run control against what the idle machine reports', () => {
    const entry = machineEntry({ manifest: x1cManifest });
    expect(
      checkMachineAction({
        entry,
        componentId: 'controller',
        action: 'run.pause',
        caller: 'person',
        attended: false,
        now: Date.parse('2026-09-24T02:00:01.000Z'),
      }),
    ).toMatchObject({ status: 'unavailable', code: 'MACHINE_ACTION_PRECONDITION_FAILED' });
  });
});
