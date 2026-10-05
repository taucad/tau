import { fffProcessOf, isUnattendedAction, parseMachineManifest } from '@taucad/runtime/machine';
import { describe, expect, it } from 'vitest';

import { bambuA1MiniMachine, bambuMachine } from '#bambu.machine.js';
import {
  bambuA1MiniManifest,
  bambuA1MiniTestingProfile,
  bambuX1cHardwareProfile,
  bambuX1cManifest,
  bambuX1cTestingProfile,
} from '#bambu.manifest.js';
import { bambuA1MiniSimulatorMachine, bambuSimulatorMachine } from '#bambu.simulator.js';

const actionIds = (manifest: typeof bambuX1cManifest): string[] =>
  manifest.actions.map(({ componentId, id }) => `${componentId}:${id}`);

describe('bambuX1cManifest', () => {
  it('should parse after a structured clone and carry the X1C FFF process', () => {
    expect(parseMachineManifest(structuredClone(bambuX1cManifest))).toEqual(bambuX1cManifest);
    const fff = fffProcessOf(bambuX1cManifest);
    expect(fff?.geometry).toMatchObject({ buildVolume: { x: 256, y: 256, z: 256 }, bedMotion: 'z' });
    expect(fff?.bed.plates.map(({ id }) => id)).toEqual(['cool', 'engineering', 'high-temperature', 'textured-pei']);
    expect(fff?.speedProfiles.map(({ id, percent }) => `${id}:${String(percent)}`)).toEqual([
      'silent:50',
      'standard:100',
      'sport:124',
      'ludicrous:166',
    ]);
    expect(fff?.slicing.presets.map(({ id, layerHeight }) => [id, layerHeight.value])).toEqual([
      ['fast', 0.28],
      ['standard', 0.2],
      ['fine', 0.12],
    ]);
  });

  it('should declare every action once, with the run actions, light, fans, homing and jog hardware-qualified and the rest designed', () => {
    const ids = actionIds(bambuX1cManifest);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'chamber-light:switch.set',
      'speed:option.set',
      'controller:run.pause',
      'controller:run.resume',
      'controller:run.cancel',
      'part-fan:level.set',
      'aux-fan:level.set',
      'chamber-fan:level.set',
      'filament:material.load',
      'filament:material.unload',
      'filament:material.set',
      'filament:material.clear',
      'filament:material.calibration.select',
      'filament:material.calibration.save',
      'filament:material.calibration.delete',
      'filament:material.calibration.run',
      'filament:interaction.respond',
      'filament:bambu.ams.read-tag',
      'filament:bambu.filament.abort',
      'motion:motion.home',
      'motion:motion.jog',
      'controller:bambu.printer.calibrate',
    ]);
    const qualified = Object.fromEntries(
      bambuX1cManifest.actions
        .filter(({ qualification }) => qualification.status === 'qualified')
        .map(({ id, qualification }) => [id, qualification.status === 'qualified' ? qualification.profileId : '']),
    );
    expect(qualified).toEqual({
      'switch.set': bambuX1cTestingProfile,
      'run.pause': bambuX1cHardwareProfile,
      'run.resume': bambuX1cHardwareProfile,
      'run.cancel': bambuX1cHardwareProfile,
      'level.set': bambuX1cTestingProfile,
      'motion.home': bambuX1cTestingProfile,
      'motion.jog': bambuX1cTestingProfile,
    });
    expect(
      bambuX1cManifest.actions
        .filter(({ id }) => id === 'level.set')
        .map(({ label, qualification }) => [label, qualification.status]),
    ).toEqual([
      ['Part fan', 'qualified'],
      ['Auxiliary fan', 'qualified'],
      ['Chamber fan', 'qualified'],
    ]);
    expect(bambuX1cManifest.qualifications.map(({ id }) => id)).toEqual([
      bambuX1cHardwareProfile,
      bambuX1cTestingProfile,
    ]);
  });

  it('should let an agent switch the light, change the speed and pause, and nothing that moves material', () => {
    const kindOf = (componentId: string): string =>
      bambuX1cManifest.components.find(({ id }) => id === componentId)?.kind ?? 'unknown';
    const unattended = bambuX1cManifest.actions
      .filter((action) => isUnattendedAction(kindOf(action.componentId), action))
      .map(({ id }) => id);
    expect(unattended).toContain('switch.set');
    expect(unattended).toContain('option.set');
    expect(unattended).toContain('run.pause');
    expect(unattended).not.toContain('material.load');
    expect(unattended).not.toContain('motion.jog');
  });

  it.each([
    ['X1C', bambuX1cManifest],
    ['A1 mini', bambuA1MiniManifest],
  ])('should keep printer calibration on the %s for a person without asking for their presence', (_name, manifest) => {
    const calibrate = manifest.actions.find(({ id }) => id === 'bambu.printer.calibrate');
    expect(calibrate?.safety).toEqual({ authority: 'person', attended: false, interlocks: [] });
  });

  it('should take stored jobs started remotely after the plate is attested clear', () => {
    expect(bambuX1cManifest.jobs).toMatchObject({
      type: 'supported',
      delivery: 'stored',
      start: 'remote',
      attestations: [{ id: 'work-area-clear' }],
    });
    expect(bambuX1cManifest.observations.map(({ group }) => group)).toEqual([
      'state',
      'temperature',
      'accessories',
      'material',
      'position',
    ]);
  });
});

describe('bambuA1MiniManifest', () => {
  it('should leave out what the A1 mini lacks and narrow its calibration to pressure advance', () => {
    expect(parseMachineManifest(structuredClone(bambuA1MiniManifest))).toEqual(bambuA1MiniManifest);
    const ids = actionIds(bambuA1MiniManifest);
    expect(ids).not.toContain('chamber-light:switch.set');
    expect(ids).not.toContain('aux-fan:level.set');
    expect(bambuA1MiniManifest.components.map(({ id }) => id)).not.toContain('chamber');
    expect(
      bambuA1MiniManifest.actions
        .filter(({ qualification }) => qualification.status === 'qualified')
        .map(({ componentId, id, qualification }) => [componentId, id, qualification]),
    ).toEqual([
      ['part-fan', 'level.set', { status: 'qualified', profileId: bambuA1MiniTestingProfile }],
      ['motion', 'motion.jog', { status: 'qualified', profileId: bambuA1MiniTestingProfile }],
    ]);
    expect(bambuA1MiniManifest.qualifications.map(({ id }) => id)).toEqual([bambuA1MiniTestingProfile]);
    expect(fffProcessOf(bambuA1MiniManifest)?.geometry.bedMotion).toBe('y');
  });
});

describe('provider registrations', () => {
  it('should carry the manifests, and the simulators qualify every action by simulation', () => {
    expect(bambuMachine().manifest).toEqual(bambuX1cManifest);
    expect(bambuA1MiniMachine().manifest).toEqual(bambuA1MiniManifest);
    for (const [factory, manifest, name] of [
      [bambuSimulatorMachine, bambuX1cManifest, 'Simulated X1C'],
      [bambuA1MiniSimulatorMachine, bambuA1MiniManifest, 'Simulated A1 mini'],
    ] as const) {
      const simulated = factory();
      expect(simulated.name).toBe(name);
      expect(simulated.manifest.identity.displayName).toBe(name);
      expect(actionIds(simulated.manifest)).toEqual(actionIds(manifest));
      expect(
        simulated.manifest.actions.every(
          ({ qualification }) => qualification.status === 'qualified' && qualification.profileId === 'simulation',
        ),
      ).toBe(true);
      expect(simulated.manifest.qualifications).toMatchObject([{ id: 'simulation', environment: 'simulation' }]);
      expect(() => structuredClone(simulated)).not.toThrow();
    }
  });
});
