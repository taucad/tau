import { describe, expect, it } from 'vitest';

import {
  bambuCalibrationRun,
  bambuCalibrationSave,
  bambuCalibrationSelect,
  bambuLoad,
  bambuMaterialClear,
  bambuMaterialSetting,
  bambuUnload,
} from '#bambu.commands.js';
import type { BambuRequest, BambuWireForm } from '#bambu.commands.js';
import { bambuAddressOf, bambuSlotOf } from '#bambu.settings.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */

const material = {
  materialType: 'PLA',
  color: '#ff8800ff',
  profileId: 'GFL99',
  settingId: '',
  nozzleMinimum: 190,
  nozzleMaximum: 230,
};
const filament = {
  filamentId: 'GFL99',
  settingId: '',
  nozzleTemperature: 220,
  bedTemperature: 55,
  maximumVolumetricSpeed: 12,
  flowRatio: 0.98,
};

/** Every builder whose tray address depends on the slot, with where the address sits in its payload. */
const builders: ReadonlyArray<
  readonly [name: string, build: (slot: number, form: BambuWireForm) => BambuRequest, filaments: boolean]
> = [
  ['load', (slot, form) => bambuLoad('30001', { slot, form, currentTemperature: 210, targetTemperature: 220 }), false],
  ['unload', (slot, form) => bambuUnload('30001', { slot, form, temperature: 220 }), false],
  ['setting', (slot, form) => bambuMaterialSetting('30001', { slot, form, material }), false],
  ['clear', (slot, form) => bambuMaterialClear('30001', { slot, form }), false],
  [
    'select',
    (slot, form) => bambuCalibrationSelect('30001', { slot, form, index: 3, filamentId: 'GFL99', nozzleDiameter: 0.4 }),
    false,
  ],
  [
    'save',
    (slot, form) =>
      bambuCalibrationSave('30001', {
        slot,
        form,
        filamentId: 'GFL99',
        settingId: '',
        name: 'PLA',
        pressureAdvance: 0.0245,
        coefficient: '1.4',
        nozzleDiameter: 0.4,
      }),
    true,
  ],
  [
    'pressure advance',
    (slot, form) =>
      bambuCalibrationRun('30001', {
        method: 'pressure-advance',
        form,
        nozzleDiameter: 0.4,
        filaments: [{ ...filament, slot }],
      }),
    true,
  ],
  [
    'flow ratio',
    (slot, form) =>
      bambuCalibrationRun('30001', {
        method: 'flow-ratio',
        form,
        nozzleDiameter: 0.4,
        filaments: [{ ...filament, slot }],
      }),
    true,
  ],
];

/** The address fields of a request: the body, or its first filament. */
const addressOf = (request: BambuRequest, filaments: boolean): Readonly<Record<string, unknown>> => {
  const body = request.payload['print'] as Readonly<Record<string, unknown>>;
  return filaments ? (body['filaments'] as ReadonlyArray<Readonly<Record<string, unknown>>>)[0]! : body;
};

/**
 * The external spool's address per command and form, as lane bambu-material-calibration F3 and testing program
 * rows T6, T10, T16 and T17 record them (Bambu Studio is (a) throughout).
 */
const externalForms: Readonly<Record<string, Readonly<Record<BambuWireForm, Readonly<Record<string, number>>>>>> = {
  load: {
    a: { ams_id: 254, target: 254, slot_id: 0, curr_temp: 210, tar_temp: 220 },
    b: { ams_id: 255, target: 255, slot_id: 0, curr_temp: 210, tar_temp: 220 },
    c: { ams_id: 255, slot_id: 254, target: 254, curr_temp: -1, tar_temp: -1 },
  },
  unload: {
    a: { ams_id: 255, target: 255, slot_id: 255 },
    b: { ams_id: 255, target: 255, slot_id: 255 },
    c: { ams_id: 255, target: 255, slot_id: 255 },
  },
  setting: {
    a: { ams_id: 255, tray_id: 254, slot_id: 0 },
    b: { ams_id: 255, tray_id: 0, slot_id: 0 },
    c: { ams_id: 254, tray_id: 254, slot_id: 0 },
  },
  clear: {
    a: { ams_id: 255, tray_id: 254, slot_id: 0 },
    b: { ams_id: 255, tray_id: 0, slot_id: 0 },
    c: { ams_id: 254, tray_id: 254, slot_id: 0 },
  },
  ...Object.fromEntries(
    ['select', 'save', 'pressure advance', 'flow ratio'].map((name) => [
      name,
      {
        a: { tray_id: 255, ams_id: 255, slot_id: 0 },
        b: { tray_id: 254, ams_id: 254, slot_id: 0 },
        c: { tray_id: 255, ams_id: 255, slot_id: 0 },
      },
    ]),
  ),
};

/** AMS B2 (tray 5): `ams_change_filament` targets the flat tray, `ams_filament_setting` names the tray in its AMS. */
const amsB2: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  load: { ams_id: 1, slot_id: 1, target: 5 },
  unload: { ams_id: 1, target: 255, slot_id: 255 },
  setting: { ams_id: 1, slot_id: 1, tray_id: 1 },
  clear: { ams_id: 1, slot_id: 1, tray_id: 1 },
  select: { ams_id: 1, slot_id: 1, tray_id: 5 },
  save: { ams_id: 1, slot_id: 1, tray_id: 5 },
  'pressure advance': { ams_id: 1, slot_id: 1, tray_id: 5 },
  'flow ratio': { ams_id: 1, slot_id: 1, tray_id: 5 },
};

describe('Bambu command addressing', () => {
  it.each(builders)(
    'should address the external spool for %s in each form as the clients record it',
    (name, build, filaments) => {
      for (const form of ['a', 'b', 'c'] as const) {
        expect(addressOf(build(254, form), filaments), form).toMatchObject(externalForms[name]![form]);
      }
    },
  );

  it.each(builders)('should address AMS B2 for %s the same in every form', (name, build, filaments) => {
    for (const form of ['a', 'b', 'c'] as const) {
      expect(addressOf(build(5, form), filaments)).toMatchObject(amsB2[name]!);
    }
  });

  it('should spell a pressure advance and a flow ratio as Bambu Studio’s std::to_string does', () => {
    const save = bambuCalibrationSave('30001', {
      slot: 0,
      form: 'a',
      filamentId: 'GFL99',
      settingId: '',
      name: 'PLA',
      pressureAdvance: 0.0245,
      coefficient: '1.4',
      nozzleDiameter: 0.4,
    });
    expect(addressOf(save, true)).toMatchObject({ k_value: '0.024500' });
    const flow = bambuCalibrationRun('30001', {
      method: 'flow-ratio',
      form: 'a',
      nozzleDiameter: 0.4,
      filaments: [{ ...filament, slot: 0, flowRatio: 0.95 }],
    });
    expect(addressOf(flow, true)).toMatchObject({ def_flow_ratio: '0.950000' });
  });
});

describe('Bambu slot encoding', () => {
  it('should map every tray number to its address and back', () => {
    for (const slot of [...Array.from({ length: 16 }, (_, index) => index), 254]) {
      expect(bambuSlotOf(bambuAddressOf(slot))).toBe(slot);
    }
    expect(bambuAddressOf(254)).toEqual({ unitId: 'external', slotId: 'spool' });
    expect(bambuAddressOf(13)).toEqual({ unitId: 'ams-d', slotId: 'd2' });
  });

  it('should name no tray for an address no Bambu printer has, and refuse a tray number it lacks', () => {
    expect(bambuSlotOf({ unitId: 'ams-a', slotId: 'b1' })).toBeUndefined();
    expect(bambuSlotOf({ unitId: 'ams-e', slotId: 'e1' })).toBeUndefined();
    expect(bambuSlotOf({ unitId: 'external', slotId: 'a1' })).toBeUndefined();
    expect(() => bambuAddressOf(16)).toThrow(RangeError);
    expect(() => bambuAddressOf(255)).toThrow(RangeError);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */
