import { describe, expect, it } from 'vitest';

import { machineManifestFixture } from '#machines/machine-manifest.fixture.js';
import { fffProcessOf, parseMachineManifest } from '#machines/machine-manifest.js';

const [light, pause] = machineManifestFixture.actions;
const fff = fffProcessOf(machineManifestFixture);

describe('parseMachineManifest', () => {
  it('round-trips a manifest through a structured clone and freezes the result', () => {
    const parsed = parseMachineManifest(structuredClone(machineManifestFixture));
    expect(parsed).toEqual(machineManifestFixture);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(fffProcessOf(parsed)?.slicing.presets.map(({ id }) => id)).toEqual(['fast', 'standard', 'fine']);
  });

  it('admits accepted file extensions and a stop remedy in the halt recovery', () => {
    const { jobs, stop } = machineManifestFixture;
    if (jobs.type !== 'supported') {
      throw new Error('expected a job-capable fixture');
    }
    const parsed = parseMachineManifest({
      ...machineManifestFixture,
      jobs: { ...jobs, accepts: jobs.accepts.map((accepted) => ({ ...accepted, extensions: ['.gcode', '.nc'] })) },
      stop: { ...stop, recovery: [{ type: 'stop', consequence: 'Home the machine afterwards.' }] },
    });
    expect(parsed.jobs.type === 'supported' && parsed.jobs.accepts[0]?.extensions).toEqual(['.gcode', '.nc']);
    expect(parsed.stop.recovery).toEqual([{ type: 'stop', consequence: 'Home the machine afterwards.' }]);
  });

  it.each(['gcode', '.GCODE', '.g code'])('refuses the accepted extension %j', (extension) => {
    const { jobs } = machineManifestFixture;
    if (jobs.type !== 'supported') {
      throw new Error('expected a job-capable fixture');
    }
    expect(() =>
      parseMachineManifest({
        ...machineManifestFixture,
        jobs: { ...jobs, accepts: jobs.accepts.map((accepted) => ({ ...accepted, extensions: [extension] })) },
      }),
    ).toThrow();
  });

  it.each([
    ['an unknown top-level key', { ...machineManifestFixture, colour: 'red' }],
    [
      'a stop remedy without its consequence',
      { ...machineManifestFixture, stop: { ...machineManifestFixture.stop, recovery: [{ type: 'stop' }] } },
    ],
    ['a version other than 3', { ...machineManifestFixture, version: 2 }],
    ['an action on an unknown component', { ...machineManifestFixture, actions: [{ ...light, componentId: 'laser' }] }],
    ['the same action twice on one component', { ...machineManifestFixture, actions: [pause, pause] }],
    ['an action with an unknown effect', { ...machineManifestFixture, actions: [{ ...light, effects: ['magic'] }] }],
    [
      'an interlock that is not an interlock component',
      { ...machineManifestFixture, actions: [{ ...light, safety: { ...light?.safety, interlocks: ['motion'] } }] },
    ],
    [
      'a motion component moving an undeclared axis',
      {
        ...machineManifestFixture,
        components: machineManifestFixture.components.map((component) =>
          component.kind === 'motion' ? { ...component, axes: ['x', 'q'] } : component,
        ),
      },
    ],
    [
      'two slicing presets',
      {
        ...machineManifestFixture,
        processes: [{ ...fff, slicing: { ...fff?.slicing, presets: fff?.slicing.presets.slice(0, 2) } }],
      },
    ],
    [
      'two services under one name',
      {
        ...machineManifestFixture,
        connection: {
          ...machineManifestFixture.connection,
          services: [
            { id: 'mqtt', port: 8883, required: true },
            { id: 'mqtt', port: 8884, required: false },
          ],
        },
      },
    ],
    [
      'a hold admissible during a run',
      {
        ...machineManifestFixture,
        holds: machineManifestFixture.holds.map((hold) => ({ ...hold, when: ['active'] })),
      },
    ],
    [
      'an observation group neither standard nor namespaced',
      {
        ...machineManifestFixture,
        observations: [{ group: 'positions', label: 'Positions', staleAfter: 1000, delivery: 'latest' }],
      },
    ],
  ])('refuses %s', (_label, candidate) => {
    expect(() => parseMachineManifest(candidate)).toThrow();
  });
});
