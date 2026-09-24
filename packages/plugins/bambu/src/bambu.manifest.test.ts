import { parseMachineManifest } from '@taucad/runtime/machine';
import { describe, expect, it } from 'vitest';

import { bambuX1cManifest } from '#bambu.manifest.js';
import { bambuMachine } from '#bambu.machine.js';
import { bambuSimulatorMachine } from '#bambu.simulator.js';

describe('bambuX1cManifest', () => {
  it('round-trips through a structured clone and carries the X1C geometry', () => {
    expect(parseMachineManifest(structuredClone(bambuX1cManifest))).toEqual(bambuX1cManifest);
    expect(bambuX1cManifest.geometry).toMatchObject({
      buildVolume: { x: 256, y: 256, z: 256 },
      enclosure: { outer: { x: 389, y: 389, z: 457 }, enclosed: true, doors: ['front', 'top'] },
      kinematics: 'corexy',
      bedMotion: 'z',
      origin: 'front-left',
      materialSystemMount: 'top',
    });
    expect(bambuX1cManifest.bed.plates.map(({ id }) => id)).toEqual([
      'cool',
      'engineering',
      'high-temperature',
      'textured-pei',
    ]);
    expect(bambuX1cManifest.speedProfiles.map(({ id, percent }) => `${id}:${percent}`)).toEqual([
      'silent:50',
      'standard:100',
      'sport:124',
      'ludicrous:166',
    ]);
    expect(bambuX1cManifest.observations.map(({ group }) => group)).toEqual([
      'thermal',
      'run',
      'material',
      'fans',
      'light',
      'network',
      'storage',
    ]);
  });

  it('declares an effect and a qualification for every action, with only the exercised ones qualified', () => {
    const ids = bambuX1cManifest.actions.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of bambuX1cManifest.actions) {
      expect(action.effect, action.id).toMatch(/^(none|observe|thermal|motion|material|print|storage)$/u);
      expect(action.qualification, action.id).toMatch(/^(qualified|designed|unsupported)$/u);
    }
    expect(
      ids.filter((id) => bambuX1cManifest.actions.find((action) => action.id === id)?.qualification === 'qualified'),
    ).toEqual(['print.start', 'run.pause', 'run.resume', 'run.cancel', 'run.urgent-stop', 'camera.still']);
    expect(
      bambuX1cManifest.actions.filter(({ qualification }) => qualification === 'unsupported').map(({ id }) => id),
    ).toEqual(['calibration.run', 'storage.format']);
  });

  it('offers exactly the three slicing presets and the recommended PETG profile', () => {
    expect(bambuX1cManifest.slicing.presets).toHaveLength(3);
    expect(bambuX1cManifest.slicing.presets.map(({ id, layerHeight }) => [id, layerHeight.value])).toEqual([
      ['fast', 0.28],
      ['standard', 0.2],
      ['fine', 0.12],
    ]);
    expect(bambuX1cManifest.slicing.recommended).toEqual({
      layerHeight: { value: 0.2, unit: 'mm' },
      walls: 2,
      infillPercent: 15,
      nozzleTemperature: { value: 250, unit: 'Cel' },
      bedTemperature: { value: 70, unit: 'Cel' },
    });
  });

  it('is carried by both provider registrations, relabeled on the simulator', () => {
    const real = bambuMachine();
    const simulated = bambuSimulatorMachine();
    expect(real.manifest).toEqual(bambuX1cManifest);
    expect(simulated.id).toBe('bambu-simulator');
    expect(simulated.name).toBe('Simulated X1C');
    expect(simulated.manifest).toEqual({
      ...bambuX1cManifest,
      identity: { ...bambuX1cManifest.identity, displayName: 'Simulated X1C' },
    });
    expect(() => structuredClone(simulated)).not.toThrow();
  });
});
