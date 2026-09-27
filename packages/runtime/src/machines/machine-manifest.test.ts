import { describe, expect, it } from 'vitest';

import { machineManifestFixture } from '#machines/machine-manifest.fixture.js';
import { parseMachineManifest } from '#machines/machine-manifest.js';

describe('parseMachineManifest', () => {
  it('round-trips a manifest through a structured clone and freezes the result', () => {
    const parsed = parseMachineManifest(structuredClone(machineManifestFixture));
    expect(parsed).toEqual(machineManifestFixture);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.slicing.presets.map(({ id }) => id)).toEqual(['fast', 'standard', 'fine']);
  });

  it.each([
    ['an unknown top-level key', { ...machineManifestFixture, colour: 'red' }],
    ['an unknown nested key', { ...machineManifestFixture, camera: { stills: false, stream: false, zoom: 2 } }],
    [
      'a zero build volume',
      {
        ...machineManifestFixture,
        geometry: { ...machineManifestFixture.geometry, buildVolume: { x: 0, y: 200, z: 200 } },
      },
    ],
    [
      'a speed profile above 400 percent',
      { ...machineManifestFixture, speedProfiles: [{ id: 'warp', label: 'Warp', percent: 500 }] },
    ],
    [
      'an action without a qualification',
      { ...machineManifestFixture, actions: [{ id: 'light.set', label: 'Light', effect: 'none' }] },
    ],
    [
      'an action with an unknown effect class',
      {
        ...machineManifestFixture,
        actions: [{ id: 'light.set', label: 'Light', effect: 'magic', qualification: 'designed' }],
      },
    ],
    [
      'two slicing presets',
      {
        ...machineManifestFixture,
        slicing: { ...machineManifestFixture.slicing, presets: machineManifestFixture.slicing.presets.slice(0, 2) },
      },
    ],
    [
      'an infill above 100 percent',
      {
        ...machineManifestFixture,
        slicing: {
          ...machineManifestFixture.slicing,
          recommended: { ...machineManifestFixture.slicing.recommended, infillPercent: 101 },
        },
      },
    ],
    ['a version other than 1', { ...machineManifestFixture, version: 2 }],
  ])('refuses %s', (_label, candidate) => {
    expect(() => parseMachineManifest(candidate)).toThrow();
  });
});
