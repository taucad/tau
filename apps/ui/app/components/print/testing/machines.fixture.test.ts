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
  it('admit four v3 manifests whose entries a person can check actions against', () => {
    for (const manifest of [x1cManifest, a1MiniManifest, routerManifest, carveraManifest]) {
      expect(manifest.version).toBe(3);
    }
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
