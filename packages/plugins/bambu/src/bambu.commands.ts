/**
 * Bambu LAN request payloads: one builder per command Tau sends, each returning the exact JSON object published on
 * `device/<serial>/request`. Field forms follow Bambu Studio (repos/BambuStudio @ 66e40547, DeviceManager.cpp,
 * DeviceCore/*Ctrl.cpp); where the clients disagree (the external spool, the clear form) the binding's wire form
 * selects the testing program's row variant (a), (b) or (c) through one table, {@link bambuExternalSpoolFields}.
 *
 * @module
 */

/* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */

import { bambuExternalSpoolSlot } from '#bambu.protocol.js';
import type { BambuMaterial } from '#bambu.protocol.js';

const unitLetters = 'abcd';

/**
 * Which variant of a command the clients disagree on to send, as the testing program numbers them: (a) is Bambu
 * Studio's form everywhere; (b) and (c) are the alternatives rows T6, T7, T10 and T17 try in turn. A letter names a
 * row variant, not a client: {@link bambuExternalSpoolFields} says which client each one is, per command.
 * @internal
 */
export type BambuWireForm = 'a' | 'b' | 'c';

/** The commands whose external-spool address the clients disagree on. @internal */
export type BambuExternalSpoolCommand = 'load' | 'unload' | 'setting' | 'calibration';

/**
 * The external spool's address fields, per command and wire form (lane bambu-material-calibration F3; testing
 * program rows T6, T10, T16, T17):
 *
 * | Command | (a) | (b) | (c) |
 * |---|---|---|---|
 * | `load` (`ams_change_filament`) | Studio 254/254/0 | OrcaSlicer 255/255/0 | bambuddy 255, slot 254, target 254 |
 * | `unload` (`ams_change_filament`) | 255, target 255, slot 255 | the same (no client differs) | the same |
 * | `setting` (`ams_filament_setting`, clear) | Studio 255/254/0 | probe 255/0/0 (a P1S refused it) | 254/254/0 |
 * | `calibration` (`extrusion_cali_sel`, `_set`, `extrusion_cali`, `flowrate_cali`) | Studio 255/255/0 | bambuddy 254/254/0 | Studio (a) |
 *
 * Studio's external id in every calibration command is its internal 255 (DevFilaSystem.cpp:354-397, CalibUtils.cpp:259).
 * @internal
 */
export const bambuExternalSpoolFields: Readonly<
  Record<BambuExternalSpoolCommand, Readonly<Record<BambuWireForm, Readonly<Record<string, number>>>>>
> = {
  load: {
    a: { ams_id: 254, target: 254, slot_id: 0 },
    b: { ams_id: 255, target: 255, slot_id: 0 },
    c: { ams_id: 255, slot_id: 254, target: 254 },
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
  calibration: {
    a: { tray_id: 255, ams_id: 255, slot_id: 0 },
    b: { tray_id: 254, ams_id: 254, slot_id: 0 },
    c: { tray_id: 255, ams_id: 255, slot_id: 0 },
  },
};

/** The label a person reads for a slot: `AMS A2`, `External spool`. @internal */
export const bambuSlotLabel = (slot: number): string =>
  slot === bambuExternalSpoolSlot
    ? 'External spool'
    : `AMS ${(unitLetters[Math.floor(slot / 4)] ?? 'a').toUpperCase()}${String((slot % 4) + 1)}`;

/** `ams_id`, `slot_id` and `tray_id` of an AMS tray. */
const amsFields = (slot: number) => ({ ams_id: Math.floor(slot / 4), slot_id: slot % 4 });

/**
 * The nozzle diameter as the calibration commands spell it: "0.2", "0.4", "0.6" or "0.8", else "0"
 * (DeviceManager.cpp:289).
 * @param diameter - Millimetres.
 * @returns The wire string.
 * @internal
 */
export const bambuNozzleDiameter = (diameter: number): string => {
  const text = diameter.toFixed(1);
  return ['0.2', '0.4', '0.6', '0.8'].includes(text) ? text : '0';
};

/**
 * The calibration table's nozzle id: `H` + flow type (`S` standard, `H` high flow) + `00-` + diameter. The X1C and the
 * A1 mini ship the standard flow nozzle (DevNozzleSystem.cpp:690).
 * @param diameter - Millimetres.
 * @returns The nozzle id, such as `HS00-0.4`.
 * @internal
 */
export const bambuNozzleId = (diameter: number): string => `HS00-${bambuNozzleDiameter(diameter)}`;

/** One published request with its correlation id. @internal */
export type BambuRequest = Readonly<{ command: string; sequence: string; payload: Readonly<Record<string, unknown>> }>;

const print = (command: string, sequence: string, fields: Readonly<Record<string, unknown>> = {}): BambuRequest => ({
  command,
  sequence,
  payload: { print: { command, sequence_id: sequence, ...fields } },
});

/** `pushing.pushall`: ask for the whole state. A read; answered without Developer Mode. @internal */
export const bambuPushAll = '{"pushing":{"sequence_id":"0","command":"pushall","version":1,"push_target":1}}';
/** `info.get_version`: firmware and serial. A read. @internal */
export const bambuGetVersion = '{"info":{"sequence_id":"0","command":"get_version"}}';

/** `system.ledctrl` on `chamber_light` (DevLampCtrl.cpp:36, its default timings). @internal */
export const bambuChamberLight = (sequence: string, on: boolean): BambuRequest => ({
  command: 'ledctrl',
  sequence,
  payload: {
    system: {
      command: 'ledctrl',
      sequence_id: sequence,
      led_node: 'chamber_light',
      led_mode: on ? 'on' : 'off',
      led_on_time: 500,
      led_off_time: 500,
      loop_times: 1,
      interval_time: 1000,
    },
  },
});

/** Speed profiles in the order `print_speed` numbers them, from 1. @internal */
export const bambuSpeedProfiles = ['silent', 'standard', 'sport', 'ludicrous'] as const;

/** `print.print_speed` with `param` "1"–"4" (DeviceManager.cpp:1838). @internal */
export const bambuPrintSpeed = (sequence: string, option: (typeof bambuSpeedProfiles)[number]): BambuRequest =>
  print('print_speed', sequence, { param: String(bambuSpeedProfiles.indexOf(option) + 1) });

/** `print.pause`, `print.resume` or `print.stop` with an empty `param` (DeviceManager.cpp:1430-1460). @internal */
export const bambuRunCommand = (sequence: string, command: 'pause' | 'resume' | 'stop'): BambuRequest =>
  print(command, sequence, { param: '' });

/** One G-code line, as Bambu Studio's `publish_gcode` sends it. @internal */
export const bambuGcodeLine = (sequence: string, gcode: string): BambuRequest =>
  print('gcode_line', sequence, { param: gcode });

/** Fan indexes `M106 P<n>` takes: 1 part cooling, 2 auxiliary, 3 chamber (DevFan.cpp:61). @internal */
export const bambuFanIndexes = { 'part-fan': 1, 'aux-fan': 2, 'chamber-fan': 3 } as const;

/** `M106 P<n> S<0–255>` (DevFan.cpp:63). @internal */
export const bambuFanLevel = (sequence: string, fan: keyof typeof bambuFanIndexes, ratio: number): BambuRequest =>
  bambuGcodeLine(sequence, `M106 P${String(bambuFanIndexes[fan])} S${String(Math.round(ratio * 255))} \n`);

/** `G28`, idle homing (DevAxisCtrl.cpp:19). @internal */
export const bambuHome = (sequence: string): BambuRequest => bambuGcodeLine(sequence, 'G28 \n');

/**
 * One relative move inside the soft limits, in machine coordinates (DevAxisCtrl.cpp:43, without Bambu Studio's
 * screen-direction inversion for bed slingers: the distance is already the axis's own).
 * @internal
 */
export const bambuJog = (
  sequence: string,
  { axis, distance, feed }: Readonly<{ axis: 'x' | 'y' | 'z'; distance: number; feed: number }>,
): BambuRequest =>
  bambuGcodeLine(
    sequence,
    `M211 S \nM211 X1 Y1 Z1\nM1002 push_ref_mode\nG91 \nG1 ${axis.toUpperCase()}${distance.toFixed(1)} F${String(Math.round(feed))}\nM1002 pop_ref_mode\nM211 R\n`,
  );

/** Degrees Celsius Bambu Studio heats to when a tray names no range (DeviceManager.hpp:692). */
const defaultChangeTemperature = 210;

/**
 * The temperature a filament change heats to for one tray: the middle of its range, as Bambu Studio sends it.
 * @param material - The tray, when it has one.
 * @returns Degrees Celsius.
 * @internal
 */
export const bambuChangeTemperature = (material: BambuMaterial | undefined): number =>
  material?.nozzleMinimum !== undefined && material.nozzleMaximum !== undefined
    ? Math.round((material.nozzleMinimum + material.nozzleMaximum) / 2)
    : defaultChangeTemperature;

/**
 * `print.ams_change_filament` loading one tray (DeviceManager.cpp:1639). The external spool's form is the row T17
 * variant ({@link bambuExternalSpoolFields}); bambuddy's (c) also sends temperatures −1.
 * @internal
 */
export const bambuLoad = (
  sequence: string,
  input: Readonly<{ slot: number; form: BambuWireForm; currentTemperature: number; targetTemperature: number }>,
): BambuRequest => {
  const temperatures = { curr_temp: input.currentTemperature, tar_temp: input.targetTemperature };
  if (input.slot !== bambuExternalSpoolSlot) {
    return print('ams_change_filament', sequence, { ...temperatures, ...amsFields(input.slot), target: input.slot });
  }
  return print('ams_change_filament', sequence, {
    ...(input.form === 'c' ? { curr_temp: -1, tar_temp: -1 } : temperatures),
    ...bambuExternalSpoolFields.load[input.form],
  });
};

/** `print.ams_change_filament` unloading: target and slot 255 (DeviceManager.cpp:1639; StatusPanel.cpp:5038). @internal */
export const bambuUnload = (
  sequence: string,
  input: Readonly<{ slot: number; form: BambuWireForm; temperature: number }>,
): BambuRequest =>
  print('ams_change_filament', sequence, {
    curr_temp: input.temperature,
    tar_temp: input.temperature,
    ...(input.slot === bambuExternalSpoolSlot
      ? bambuExternalSpoolFields.unload[input.form]
      : { ams_id: Math.floor(input.slot / 4), target: 255, slot_id: 255 }),
  });

/** `print.ams_control`: `done` and `resume` answer a filament-change question, `abort` abandons the change. @internal */
export const bambuAmsControl = (sequence: string, parameter: 'done' | 'resume' | 'abort'): BambuRequest =>
  print('ams_control', sequence, { param: parameter });

const settingAddress = (slot: number, form: BambuWireForm) =>
  slot === bambuExternalSpoolSlot ? bambuExternalSpoolFields.setting[form] : { ...amsFields(slot), tray_id: slot % 4 };

/** `tray_id`/`ams_id`/`slot_id` of a tray in the calibration commands. */
const calibrationAddress = (slot: number, form: BambuWireForm) =>
  slot === bambuExternalSpoolSlot ? bambuExternalSpoolFields.calibration[form] : { tray_id: slot, ...amsFields(slot) };

/** A tray's identity as `material.set` writes it. @internal */
export type BambuMaterialSetting = Readonly<{
  materialType: string;
  /** `#RRGGBBAA`. */
  color: string;
  profileId: string;
  settingId: string;
  /** Degrees Celsius. */
  nozzleMinimum: number;
  /** Degrees Celsius. */
  nozzleMaximum: number;
}>;

/**
 * `print.ams_filament_setting` (DeviceManager.cpp:1704). The colour goes upper case: a P1S stores a lower-case colour
 * as zeros (bambuddy notes).
 * @internal
 */
export const bambuMaterialSetting = (
  sequence: string,
  input: Readonly<{ slot: number; form: BambuWireForm; material: BambuMaterialSetting }>,
): BambuRequest =>
  print('ams_filament_setting', sequence, {
    ...settingAddress(input.slot, input.form),
    tray_info_idx: input.material.profileId,
    setting_id: input.material.settingId,
    tray_color: input.material.color.replace('#', '').toUpperCase(),
    nozzle_temp_min: Math.round(input.material.nozzleMinimum),
    nozzle_temp_max: Math.round(input.material.nozzleMaximum),
    tray_type: input.material.materialType,
  });

/**
 * Clearing a tray's identity, row T7: (a) Bambu Studio's reset (AMSMaterialsSetting.cpp:614-650), (b) and (c)
 * bambuddy's (colour `00000000`, `tray_sub_brands` empty, no `setting_id`). Bambu Studio also unbinds the
 * calibration with a second command; Tau sends that only as `material.calibration.select`.
 * @internal
 */
export const bambuMaterialClear = (
  sequence: string,
  input: Readonly<{ slot: number; form: BambuWireForm }>,
): BambuRequest =>
  print(
    'ams_filament_setting',
    sequence,
    input.form === 'a'
      ? {
          ...settingAddress(input.slot, input.form),
          tray_info_idx: '',
          setting_id: '',
          tray_color: 'FFFFFF00',
          nozzle_temp_min: 0,
          nozzle_temp_max: 0,
          tray_type: '',
        }
      : {
          ...settingAddress(input.slot, input.form),
          tray_info_idx: '',
          tray_type: '',
          tray_sub_brands: '',
          tray_color: '00000000',
          nozzle_temp_min: 0,
          nozzle_temp_max: 0,
        },
  );

/**
 * `print.extrusion_cali_sel` binding a profile, −1 for the default (DeviceManager.cpp:2061). The external spool is
 * row T10 ({@link bambuExternalSpoolFields} `calibration`).
 * @internal
 */
export const bambuCalibrationSelect = (
  sequence: string,
  input: Readonly<{ slot: number; form: BambuWireForm; index: number; filamentId: string; nozzleDiameter: number }>,
): BambuRequest =>
  print('extrusion_cali_sel', sequence, {
    ...calibrationAddress(input.slot, input.form),
    cali_idx: input.index,
    filament_id: input.filamentId,
    nozzle_diameter: bambuNozzleDiameter(input.nozzleDiameter),
  });

/** One row `extrusion_cali_set` writes. @internal */
export type BambuCalibrationWrite = Readonly<{
  /** The tray measured, or 0 for a manual row as Bambu Studio sends it. */
  slot: number;
  filamentId: string;
  settingId: string;
  name: string;
  pressureAdvance: number;
  /** `n_coef`: "0.0" for a manual row. */
  coefficient: string;
  nozzleDiameter: number;
}>;

/**
 * `print.extrusion_cali_set` creating one row (no `cali_idx`) (DeviceManager.cpp:1971; row T9). `k_value` is spelt as
 * Studio's `std::to_string` spells it, six decimals.
 * @internal
 */
export const bambuCalibrationSave = (
  sequence: string,
  row: BambuCalibrationWrite & Readonly<{ form: BambuWireForm }>,
): BambuRequest =>
  print('extrusion_cali_set', sequence, {
    nozzle_diameter: bambuNozzleDiameter(row.nozzleDiameter),
    filaments: [
      {
        ...calibrationAddress(row.slot, row.form),
        extruder_id: 0,
        nozzle_id: bambuNozzleId(row.nozzleDiameter),
        nozzle_diameter: bambuNozzleDiameter(row.nozzleDiameter),
        filament_id: row.filamentId,
        setting_id: row.settingId,
        name: row.name,
        k_value: row.pressureAdvance.toFixed(6),
        n_coef: row.coefficient,
      },
    ],
  });

/** `print.extrusion_cali_del` (DeviceManager.cpp:2012; row T12). @internal */
export const bambuCalibrationDelete = (
  sequence: string,
  input: Readonly<{ index: number; filamentId: string; nozzleDiameter: number }>,
): BambuRequest =>
  print('extrusion_cali_del', sequence, {
    extruder_id: 0,
    nozzle_id: bambuNozzleId(input.nozzleDiameter),
    filament_id: input.filamentId,
    cali_idx: input.index,
    nozzle_diameter: bambuNozzleDiameter(input.nozzleDiameter),
  });

/** `print.extrusion_cali_get` for the whole table (DeviceManager.cpp:2030; row T2). A read. @internal */
export const bambuCalibrationTableRequest = (sequence: string, nozzleDiameter: number): BambuRequest =>
  print('extrusion_cali_get', sequence, { filament_id: '', nozzle_diameter: bambuNozzleDiameter(nozzleDiameter) });

/** `extrusion_cali_get_result` or `flowrate_get_result` (rows T3, T4). Reads. @internal */
export const bambuCalibrationResultRequest = (
  sequence: string,
  method: 'pressure-advance' | 'flow-ratio',
  nozzleDiameter: number,
): BambuRequest =>
  print(method === 'pressure-advance' ? 'extrusion_cali_get_result' : 'flowrate_get_result', sequence, {
    nozzle_diameter: bambuNozzleDiameter(nozzleDiameter),
  });

/** What a calibration run needs of each tray: Bambu Studio fills these from the filament preset. @internal */
export type BambuCalibrationFilament = Readonly<{
  slot: number;
  filamentId: string;
  settingId: string;
  /** Degrees Celsius. */
  nozzleTemperature: number;
  /** Degrees Celsius. */
  bedTemperature: number;
  /** Cubic millimetres per second. */
  maximumVolumetricSpeed: number;
  /** The filament preset's flow ratio, the starting point a flow-ratio run measures from. */
  flowRatio: number;
}>;

/**
 * `print.extrusion_cali` with `mode` 0 (automatic pressure advance; DeviceManager.cpp:1930, row T19) or
 * `print.flowrate_cali` (X1 automatic flow ratio; DeviceManager.cpp:2080, row T20).
 * @internal
 */
export const bambuCalibrationRun = (
  sequence: string,
  input: Readonly<{
    method: 'pressure-advance' | 'flow-ratio';
    form: BambuWireForm;
    nozzleDiameter: number;
    filaments: readonly BambuCalibrationFilament[];
  }>,
): BambuRequest => {
  const diameter = bambuNozzleDiameter(input.nozzleDiameter);
  if (input.method === 'flow-ratio') {
    return print('flowrate_cali', sequence, {
      tray_id: calibrationAddress(input.filaments[0]?.slot ?? 0, input.form)['tray_id'],
      nozzle_diameter: diameter,
      filaments: input.filaments.map((filament) => ({
        ...calibrationAddress(filament.slot, input.form),
        bed_temp: filament.bedTemperature,
        filament_id: filament.filamentId,
        setting_id: filament.settingId,
        nozzle_temp: filament.nozzleTemperature,
        // Studio sends the preset's ratio through `std::to_string` (DeviceManager.cpp:2099).
        def_flow_ratio: filament.flowRatio.toFixed(6),
        max_volumetric_speed: String(filament.maximumVolumetricSpeed),
        extruder_id: 0,
      })),
    });
  }
  return print('extrusion_cali', sequence, {
    nozzle_diameter: diameter,
    mode: 0,
    filaments: input.filaments.map((filament) => ({
      ...calibrationAddress(filament.slot, input.form),
      extruder_id: 0,
      bed_temp: filament.bedTemperature,
      filament_id: filament.filamentId,
      setting_id: filament.settingId,
      nozzle_temp: filament.nozzleTemperature,
      nozzle_id: bambuNozzleId(input.nozzleDiameter),
      nozzle_diameter: diameter,
      max_volumetric_speed: String(filament.maximumVolumetricSpeed),
    })),
  });
};

/**
 * Re-reading a spool tag: `ams_get_rfid` where the printer speaks the new AMS protocol (`flag3` bit 9), else the
 * legacy `gcode_line M620 R<tray>` (StatusPanel.cpp:5375-5398; row T14).
 * @internal
 */
export const bambuReadTag = (sequence: string, input: Readonly<{ slot: number; newProtocol: boolean }>): BambuRequest =>
  input.newProtocol
    ? print('ams_get_rfid', sequence, amsFields(input.slot))
    : bambuGcodeLine(sequence, `M620 R${String(input.slot)}\n`);

/** The printer's own calibration routines, as `print.calibration` bits (DeviceManager.cpp:1906; row T23). @internal */
export const bambuPrinterRoutines = { lidar: 0, 'bed-levelling': 1, vibration: 2, 'motor-noise': 3 } as const;

/** `print.calibration` with the routines' bit mask. @internal */
export const bambuPrinterCalibration = (
  sequence: string,
  routines: ReadonlyArray<keyof typeof bambuPrinterRoutines>,
): BambuRequest =>
  print('calibration', sequence, {
    option: [...new Set(routines)].reduce((mask, routine) => mask + 2 ** bambuPrinterRoutines[routine], 0),
  });

/* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */

/**
 * Generic filament preset values a calibration run needs, from Bambu Studio's `Generic <type>` profiles
 * (resources/profiles/BBL/filament): nozzle °C, textured-plate bed °C, maximum volumetric speed mm³/s and flow ratio
 * (`filament_flow_ratio`; TPU and PA inherit the common 1).
 *
 * ponytail: Tau keeps no slicer preset per tray, so a run uses the generic values for the tray's type, clamped to the
 * tray's own nozzle range. Pass the preset's values when the slicer's presets reach the provider.
 * @internal
 */
export const bambuGenericPresets: Readonly<Record<string, readonly [number, number, number, number]>> = {
  pla: [220, 55, 12, 0.98],
  petg: [255, 70, 12, 0.95],
  abs: [270, 90, 16, 0.95],
  asa: [260, 100, 12, 0.95],
  tpu: [240, 35, 3.2, 1],
  pa: [260, 100, 12, 1],
  pc: [280, 110, 16, 0.94],
};
