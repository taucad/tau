import {
  fffProcessOf,
  isUnattendedAction,
  parseMachineManifest,
  standardMachineActions,
} from '@taucad/runtime/machine';
import { describe, expect, it } from 'vitest';

import { bambuA1MiniMachine, bambuMachine } from '#bambu.machine.js';
import {
  bambuA1MiniManifest,
  bambuA1MiniSubmissionConfiguration,
  bambuA1MiniTestingProfile,
  bambuDefinitions,
  bambuServicePort,
  bambuSubmissionConfiguration,
  bambuX1cHardwareProfile,
  bambuX1cManifest,
  bambuX1cTestingProfile,
} from '#bambu.manifest.js';
import { bambuAddressOf } from '#bambu.settings.js';
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
      .filter((action) => isUnattendedAction(kindOf(action.componentId), action, bambuX1cManifest.processes))
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

  it('should declare the services a binding pins under the ids the host reads, and no ftp probe', () => {
    // The ceremony probes and pins these; saved access codes are keyed by the ids. Uploads reuse the MQTT pin.
    expect(bambuMachine().manifest.connection.services).toEqual([
      { id: 'mqtt', port: 8883, required: true },
      { id: 'camera', port: 322, required: false },
    ]);
    expect(bambuA1MiniMachine().manifest.connection.services).toEqual([
      { id: 'mqtt', port: 8883, required: true },
      { id: 'camera', port: 6000, required: false },
    ]);
  });

  it('should read a service port from the manifest and refuse one it does not declare', () => {
    expect(bambuServicePort(bambuA1MiniManifest, 'camera')).toBe(6000);
    expect(() => bambuServicePort({ connection: { ...bambuX1cManifest.connection, services: [] } }, 'mqtt')).toThrow(
      expect.objectContaining({ code: 'BAMBU_SERVICE_UNDECLARED' }),
    );
  });
});

const manifests = [
  ['X1C', bambuX1cManifest, bambuSubmissionConfiguration],
  ['A1 mini', bambuA1MiniManifest, bambuA1MiniSubmissionConfiguration],
] as const;
const rank = { agent: 0, 'approved-agent': 1, person: 2 } as const;
const families: Readonly<Record<string, Readonly<{ authority: keyof typeof rank; attended: boolean }>>> =
  standardMachineActions;
/** A vendor action has no family; it may never sit at the unattended `agent` floor. */
const vendorFloor = { authority: 'approved-agent', attended: false } as const;

describe.each(manifests)('the %s manifest', (name, manifest, submission) => {
  it('should hold every action at or above its family floor, and a vendor action above an agent', () => {
    const kindOf = (componentId: string): string =>
      manifest.components.find(({ id }) => id === componentId)?.kind ?? '';
    for (const action of manifest.actions) {
      const family = families[action.id] ?? vendorFloor;
      const floor = isUnattendedAction(kindOf(action.componentId), action, manifest.processes)
        ? 0
        : rank[family.authority];
      expect(rank[action.safety.authority], `${action.componentId}:${action.id}`).toBeGreaterThanOrEqual(floor);
      expect(action.safety.attended || !family.attended, `${action.componentId}:${action.id}`).toBe(true);
    }
  });

  it('should keep every calibration for a person who need not stand at the printer', () => {
    const calibrations = manifest.actions.filter(
      ({ id }) => id.startsWith('material.calibration.') || id === 'bambu.printer.calibrate',
    );
    expect(calibrations.map(({ id }) => id)).toEqual([
      'material.calibration.select',
      'material.calibration.save',
      'material.calibration.delete',
      'material.calibration.run',
      'bambu.printer.calibrate',
    ]);
    for (const { safety } of calibrations) {
      expect(safety).toEqual({ authority: 'person', attended: false, interlocks: [] });
    }
  });

  it('should accept only pressure-advance runs until Tau can write a flow-ratio result to the slicer preset', async () => {
    const run = bambuDefinitions[name].actions.find(({ id }) => id === 'material.calibration.run');
    const parameters = { nozzleId: 'nozzle-0.4', slots: [{ unitId: 'ams-a', slotId: 'a1' }] };
    expect(await run?.schema['~standard'].validate({ ...parameters, method: 'pressure-advance' })).not.toHaveProperty(
      'issues',
    );
    expect(await run?.schema['~standard'].validate({ ...parameters, method: 'flow-ratio' })).toHaveProperty('issues');
  });

  it('should halt on stop with the heaters off and ask for the plate to be cleared', () => {
    expect(manifest.stop).toEqual({
      motion: 'halts',
      spindle: 'none',
      heaters: 'off',
      position: 'kept',
      recovery: [{ type: 'person', instruction: 'Remove the unfinished print from the build plate.' }],
    });
  });

  it('should name only declared components as a profile’s attachments, and only firmware its evidence ran on', () => {
    const components = new Set(manifest.components.map(({ id }) => id));
    for (const profile of manifest.qualifications) {
      expect(profile.attachments.every((attachment) => components.has(attachment))).toBe(true);
      for (const firmware of profile.firmware) {
        expect(profile.evidence, profile.id).toContain(firmware);
      }
    }
  });

  it('should accept only tray numbers its material system declares', () => {
    const filament = manifest.components.find(({ kind }) => kind === 'material-system');
    const declared = new Set(
      filament?.kind === 'material-system'
        ? filament.units.flatMap(({ id, slots }) => slots.map((slot) => `${id}/${slot.id}`))
        : [],
    );
    const base = {
      expectedBedType: 'textured-pei',
      expectedFilamentDiameter: 1.75,
      expectedModel: name,
      expectedNozzleDiameter: 0.4,
    };
    const accepted = Array.from({ length: 300 }, (_, slot) => slot).filter(
      (slot) =>
        submission.schema.safeParse({ ...base, amsMapping: [slot], expectedMaterials: [{ slot, materialId: 'PLA' }] })
          .success,
    );
    expect(accepted.length).toBeGreaterThan(1);
    for (const slot of accepted) {
      const { unitId, slotId } = bambuAddressOf(slot);
      expect(declared.has(`${unitId}/${slotId}`), String(slot)).toBe(true);
    }
  });
});

describe('the A1 mini Testing profile', () => {
  it('should not claim the AMS lite it was proven without', () => {
    expect(bambuA1MiniManifest.qualifications.find(({ id }) => id === bambuA1MiniTestingProfile)?.attachments).toEqual([
      'camera',
    ]);
  });
});
