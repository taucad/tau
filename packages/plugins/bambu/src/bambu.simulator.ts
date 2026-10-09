/**
 * The simulated Bambu printers: a virtual X1C or A1 mini that answers the real MQTT JSON requests with the reports
 * and replies a printer sends, driving the same session code the LAN provider runs. Runs print their plate's layers
 * on the injected clock; filament changes walk Bambu Studio's steps and ask the external-spool question; calibration
 * runs measure and report results; Developer Mode off drops every write as recent firmware does.
 *
 * @module
 */

/* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */

import { defineConfiguration } from '@taucad/runtime/configuration';
import type {
  MachineArtifactReference,
  MachineClock,
  MachineConnectionRuntime,
  MachineDiscoveryEvent,
  MachineSession,
} from '@taucad/runtime/machine';
import { defineMachine, machineManifestOf } from '@taucad/runtime/machine';
import { z } from 'zod';

import type { BambuPreparedArtifact } from '#bambu.archive.js';
import { bambuExternalSpoolFields } from '#bambu.commands.js';
import type { BambuExternalSpoolCommand, BambuWireForm } from '#bambu.commands.js';
import { bambuDefinitions, bambuSimulatedDefinition, bambuSubmissionConfigurations } from '#bambu.manifest.js';
import type { BambuModel } from '#bambu.protocol.js';
import { BambuProtocolError, bambuExternalSpoolSlot, bambuModels, parseBambuStill } from '#bambu.protocol.js';
import { openBambuSession } from '#bambu.session.js';
import type { BambuLink, BambuSubmission } from '#bambu.session.js';
import { bambuSettingsConfiguration } from '#bambu.settings.js';

/** Deterministic fault switches accepted by the simulator. @internal */
export type BambuSimulatorFault =
  /** Answer every write with success and apply none of them: only the reports can tell. */
  | 'ack-but-ignore'
  | 'approval-required-not-honored'
  | 'camera-unavailable'
  | 'certificate-changed'
  | 'partial-transfer'
  /** Acknowledge the first pause and keep printing; later pauses apply. */
  | 'pause-ignored-once'
  /** Report no `plate_type`, as a printer that cannot tell which plate is on its bed. */
  | 'plate-unreported'
  | 'protected-mode'
  /** Send no report after a write, as a P1 or a busy X1C lags its acknowledgements; the next push shows it. */
  | 'push-lag'
  | 'reply-lost-after-accept'
  /** Answer "fail" to a profile write and apply it anyway, as an X1C does (bambuddy notes). */
  | 'replies-lie'
  | 'storage-full'
  | 'timeout'
  | 'wrong-credential';

/** The simulated fans. */
type SimulatedFan = 'part' | 'auxiliary' | 'chamber';

const layerMarker = /^\s*(?:(?:LAYER_CHANGE|CHANGE_LAYER)\s*$|LAYER\s+\d+\s+Z)/u;
/** `M106 P<n>` fan index: 0 and 1 cool the part, 2 is the auxiliary fan, 3 the chamber fan. */
const fanIndexes = ['part', 'part', 'auxiliary', 'chamber'] as const;

/** Fan speed changes as `[seconds of program time, percent]`, in program order. */
type FanChanges = ReadonlyArray<readonly [number, number]>;

/** One plate as the simulator runs it: layer timing, heater set points and fan changes. @internal */
export type BambuSimulatedPlate = Readonly<{
  /** Seconds of program time at which each layer starts; the first layer starts at zero. */
  layerStarts: readonly number[];
  /** Seconds of program time from the first move to the last. */
  duration: number;
  /** Degrees Celsius; zero leaves the heater off. */
  nozzleTarget: number;
  /** Degrees Celsius; zero leaves the heater off. */
  bedTarget: number;
  /** Each fan's speed changes over program time. */
  fans: Readonly<Record<SimulatedFan, FanChanges>>;
}>;

/**
 * The plate a simulator without a host artifact reader runs: 150 layers of PLA over fifteen minutes.
 *
 * ponytail: socket-free fixtures upload placeholder artifacts that carry no plate; a host passes its
 * artifact reader and the uploaded plate runs instead.
 */
const referencePlate: BambuSimulatedPlate = Object.freeze({
  layerStarts: Object.freeze(Array.from({ length: 150 }, (_, layer) => layer * 6)),
  duration: 900,
  nozzleTarget: 220,
  bedTarget: 55,
  fans: Object.freeze({
    part: Object.freeze([
      [0, 0],
      [6, 100],
    ] as const),
    auxiliary: [],
    chamber: [],
  }),
});

/**
 * Read one plate's layer timing, heater set points and fan changes from its G-code.
 *
 * ponytail: mirrors the trapezoid timing of `@taucad/slicer`'s `parseGcode` (every move starts and stops at
 * rest, X1C default accelerations, `M204` and `M220` honoured) so a simulated run keeps pace with the slice
 * summary and the printer viewer; the slicer's tests import this package, so it cannot be imported here.
 * Arcs count as their chord and moves before homing count from the origin. Share one G-code timing core
 * when arc-fitted plates must agree to the second.
 *
 * @internal
 * @param gcode - Plate G-code text.
 * @returns The plate as the simulator runs it.
 */
// oxlint-disable-next-line eslint/complexity -- one bounded pass over the closed motion, heater and fan subset.
export const readBambuSimulatedPlate = (gcode: string): BambuSimulatedPlate => {
  const position = [0, 0, 0];
  const acceleration = { print: 10_000, travel: 20_000, extruder: 5000 };
  const layerStarts: number[] = [];
  const fans: Record<SimulatedFan, Array<readonly [number, number]>> = {
    part: [],
    auxiliary: [],
    chamber: [],
  };
  let time = 0;
  let feedrate = 0;
  let feedScale = 1;
  let extruded = 0;
  let absolute = true;
  let relativeExtrusion = false;
  let nozzleTarget = 0;
  let bedTarget = 0;
  for (const line of gcode.split(/\r?\n/u)) {
    const commentStart = line.indexOf(';');
    if (commentStart !== -1 && layerMarker.test(line.slice(commentStart + 1))) {
      layerStarts.push(time);
    }
    const [command, ...tokens] = (commentStart === -1 ? line : line.slice(0, commentStart)).trim().split(/\s+/u);
    const words = new Map(
      tokens
        .map((token) => [token.charAt(0), Number.parseFloat(token.slice(1))] as const)
        .filter(([, value]) => Number.isFinite(value)),
    );
    switch (command) {
      case 'G0':
      case 'G1':
      case 'G2':
      case 'G3': {
        const target = [...position];
        for (const [axis, letter] of [...'XYZ'].entries()) {
          const word = words.get(letter);
          if (word !== undefined) {
            target[axis] = absolute ? word : position[axis]! + word;
          }
        }
        const extruderWord = words.get('E');
        const extrusion = extruderWord === undefined ? 0 : relativeExtrusion ? extruderWord : extruderWord - extruded;
        extruded += extrusion;
        feedrate = words.get('F') ?? feedrate;
        const length = Math.hypot(target[0]! - position[0]!, target[1]! - position[1]!, target[2]! - position[2]!);
        const distance = length === 0 ? Math.abs(extrusion) : length;
        const speed = Math.min((feedrate / 60) * feedScale, 500);
        const rate = length === 0 ? acceleration.extruder : extrusion > 0 ? acceleration.print : acceleration.travel;
        if (distance > 0 && speed > 0) {
          time += distance >= (speed * speed) / rate ? distance / speed + speed / rate : 2 * Math.sqrt(distance / rate);
        }
        position.splice(0, 3, ...target);
        break;
      }
      case 'G4': {
        const dwell = words.get('P');
        time += dwell === undefined ? (words.get('S') ?? 0) : dwell / 1000;
        break;
      }
      case 'G28': {
        const homed = [...'XYZ'].filter((letter) => words.has(letter));
        for (const [axis, letter] of [...'XYZ'].entries()) {
          if (homed.length === 0 || homed.includes(letter)) {
            position[axis] = 0;
          }
        }
        break;
      }
      case 'G90':
      case 'G91': {
        absolute = command === 'G90';
        break;
      }
      case 'G92': {
        for (const [axis, letter] of [...'XYZ'].entries()) {
          position[axis] = words.get(letter) ?? position[axis]!;
        }
        extruded = words.get('E') ?? extruded;
        break;
      }
      case 'M82':
      case 'M83': {
        relativeExtrusion = command === 'M83';
        break;
      }
      case 'M104':
      case 'M109': {
        nozzleTarget ||= words.get('S') ?? words.get('R') ?? 0;
        break;
      }
      case 'M140':
      case 'M190': {
        bedTarget ||= words.get('S') ?? words.get('R') ?? 0;
        break;
      }
      case 'M106': {
        const fan = fanIndexes[words.get('P') ?? 1];
        if (fan) {
          fans[fan].push([time, Math.round((Math.min(Math.max(words.get('S') ?? 255, 0), 255) / 255) * 100)]);
        }
        break;
      }
      case 'M107': {
        fans.part.push([time, 0]);
        break;
      }
      case 'M204': {
        const print = words.get('P') ?? words.get('S') ?? 0;
        const travel = words.get('T') ?? words.get('S') ?? 0;
        acceleration.print = print > 0 ? print : acceleration.print;
        acceleration.travel = travel > 0 ? travel : acceleration.travel;
        break;
      }
      case 'M220': {
        const percent = words.get('S') ?? 0;
        feedScale = percent > 0 ? percent / 100 : feedScale;
        break;
      }
      default: {
        break;
      }
    }
  }
  return Object.freeze({
    // Motion before the first marker (start sequence, purge) belongs to the first layer.
    layerStarts: Object.freeze([0, ...layerStarts.slice(1)]),
    duration: time,
    nozzleTarget,
    bedTarget,
    fans: Object.freeze(fans),
  });
};

/** One started run on the simulator's own clock. */
type SimulatedRun = {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly plate: BambuSimulatedPlate;
  /** Simulated seconds at which the start was accepted. */
  readonly startedAt: number;
  /** Simulated seconds the heaters need to reach the plate's set points before the first move. */
  readonly preheat: number;
  /** Simulated seconds spent paused so far. */
  pausedFor: number;
  /** Simulated seconds at which the current pause began, or the stop that ended the run. */
  pausedAt?: number;
};

/** One tray as the virtual printer holds it, in wire terms. */
type Tray = {
  type: string;
  idx: string;
  settingId: string;
  brand: string;
  /** `RRGGBBAA`. */
  color: string;
  min: number;
  max: number;
  tagUid: string;
  caliIdx: number;
  k: number;
  remain: number;
  present: boolean;
};

/** One step of a filament procedure: its `ams_status` step and how long it takes, or none while it waits for a person. */
type Step = Readonly<{ code: number; seconds?: number }>;
type Procedure = {
  kind: 'load' | 'unload' | 'read-tag';
  target: number;
  steps: readonly Step[];
  index: number;
  since: number;
};
type SimulatedCalibration = {
  kind: 'pressure-advance' | 'flow-ratio' | 'printer';
  startedAt: number;
  duration: number;
  startTime: number;
  filaments: ReadonlyArray<Readonly<Record<string, unknown>>>;
  ended: boolean;
  /** Ended by `print.stop`: the printer reports FAILED with "Printing was cancelled". */
  cancelled?: boolean;
};
type ProfileRow = {
  cali_idx: number;
  name: string;
  filament_id: string;
  setting_id: string;
  k_value: string;
  n_coef: string;
  nozzle_id: string;
  nozzle_diameter: string;
};

/** A wire field as text, or the fallback when it is not a string or a number. */
const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
/** `print_error` 0500-400E, "Printing was cancelled", which an X1C reports with FAILED after a stop. */
const cancelledError = 0x05_00_40_0e;
/** Degrees Celsius the enclosure settles to with its heaters off. */
const ambient = 25;
/** Degrees Celsius per simulated second while each heater heats and while it cools passively. */
const heaterRates = { nozzle: { rise: 5, fall: 1.5 }, bed: { rise: 0.5, fall: 0.1 } } as const;
/** Milliseconds between reports while idle or paused; inside the manifest's 30 s budgets. */
const steadyCadence = 10_000;
const fixedClock: MachineClock = Object.freeze({ now: () => '2026-09-14T00:00:00.000Z' });

/**
 * The serial a simulated printer reports.
 * @param model - The model it plays.
 * @returns `simulated-` and the model's manifest slug, such as `simulated-x1c`.
 */
const simulatedSerial = (model: BambuModel): string => `simulated-${bambuDefinitions[model].identity.model}`;
const untagged = '0000000000000000';
const unset = (present: boolean): Tray => ({
  type: '',
  idx: '',
  settingId: '',
  brand: '',
  color: '00000000',
  min: 0,
  max: 0,
  tagUid: untagged,
  caliIdx: -1,
  k: 0.02,
  remain: 0,
  present,
});
/** Seconds of each filament step the simulated printer takes. */
const stepSeconds = { heat: 4, check: 2, cut: 2, pull: 3, push: 4, purge: 4, insert: 5, tag: 3 } as const;

/**
 * Simulated seconds on the run's own clock: heating, then printing, with pauses left out.
 *
 * @param run - The started run.
 * @param at - Simulator time in seconds.
 * @returns Seconds the run has been active.
 */
const runClock = (run: SimulatedRun, at: number): number => (run.pausedAt ?? at) - run.startedAt - run.pausedFor;

/**
 * Seconds of program time the run has printed.
 *
 * @param run - The started run.
 * @param at - Simulator time in seconds.
 * @returns Printed program seconds, capped at the plate's duration.
 */
const printed = (run: SimulatedRun, at: number): number =>
  Math.min(Math.max(runClock(run, at) - run.preheat, 0), run.plate.duration);

const fanSpeed = (changes: FanChanges, programTime: number): number =>
  changes.findLast(([time]) => time <= programTime)?.[1] ?? 0;

/** What a simulated pressure-advance run measures for a material type. */
const measuredK = (filamentId: string): string =>
  filamentId.startsWith('GFG')
    ? '0.042'
    : filamentId.startsWith('GFA') || filamentId.startsWith('GFL')
      ? '0.024'
      : '0.030';

/** Socket-free simulated printer and the session over it. @internal */
export type BambuSimulator = Readonly<{
  session: MachineSession<BambuSubmission>;
  /** Open another session over the same printer, as a reconnect does. */
  connect(): Promise<MachineSession<BambuSubmission>>;
  /** Send a status report now, on the simulator's clock. */
  push(): void;
  /** Turn Developer Mode on or off at the simulated printer. */
  setDeveloperMode(on: boolean): void;
  /** Remote names the printer holds after an accepted upload; a start never adds one. */
  uploadedNames(): readonly string[];
  /** Every physical write in order: `upload:<remoteName>`, then each write command's name. */
  writes(): readonly string[];
  /** Every request payload received, parsed, in order. */
  requests(): readonly unknown[];
}>;

/**
 * Create one deterministic simulated printer and open a session over it.
 *
 * @param input - Model, faults, clock, demo speed, the host artifact reader and whether reports arrive on a cadence.
 * @returns The simulator and its first session.
 * @internal
 */
// oxlint-disable-next-line eslint/complexity, eslint/max-statements -- one closure is the whole virtual printer.
export const createBambuSimulator = async (
  input: Readonly<{
    model?: BambuModel;
    faults?: readonly BambuSimulatorFault[];
    /** Clock the printer advances on; the default fixed instant keeps fixtures exact. */
    clock?: MachineClock;
    /** Simulated seconds per clock second, so a long print can be watched in minutes; defaults to 1. */
    speed?: number;
    /** Host artifact reader: with it an upload runs the plate it carries, without it the reference plate runs. */
    readArtifact?: MachineConnectionRuntime['readArtifact'];
    developerMode?: boolean;
    form?: BambuWireForm;
    /**
     * The external-spool forms the simulated printer applies; any other is acknowledged and ignored, the risk the
     * testing program names. Defaults to Bambu Studio's (a), the only form verified in source.
     */
    externalForms?: readonly BambuWireForm[];
    /** The firmware `get_version` reports; the simulation profile is proven on `simulator-2`. */
    firmware?: string;
    /** False plays firmware without the pressure-advance table: no `cali_version`. */
    calibrationTable?: boolean;
    /** Report on a timer, as a printer does; tests push by hand. */
    cadence?: boolean;
    /** Milliseconds the session waits for a reply; the session's own default, as on hardware, when omitted. */
    replyWindow?: number;
  }> = {},
): Promise<BambuSimulator> => {
  const { clock = fixedClock, speed = 1, readArtifact } = input;
  const model = input.model ?? 'X1C';
  const x1c = model === 'X1C';
  const facts = bambuModels[model];
  const serial = simulatedSerial(model);
  const faults = new Set(input.faults ?? []);
  const externalForms: ReadonlySet<BambuWireForm> = new Set(input.externalForms ?? ['a']);
  /** Whether a request addresses the external spool in a form this printer applies. */
  const appliesExternal = (command: BambuExternalSpoolCommand, body: Readonly<Record<string, unknown>>): boolean =>
    (['a', 'b', 'c'] as const).some(
      (form) =>
        externalForms.has(form) &&
        Object.entries(bambuExternalSpoolFields[command][form]).every(
          ([field, value]) => Number(body[field]) === value,
        ),
    );
  const uploaded = new Map<string, BambuSimulatedPlate>();
  const writeLog: string[] = [];
  const requestLog: unknown[] = [];
  const listeners = new Set<(bytes: Uint8Array<ArrayBuffer>) => void>();
  const origin = Date.parse(clock.now());
  const simulated = (observedAt: string): number => ((Date.parse(observedAt) - origin) / 1000) * speed;
  const encoder = new TextEncoder();
  let developerMode = input.developerMode ?? true;
  let refused = false;
  let sequence = 0;
  let light = true;
  let speedLevel = 2;
  const fanOverrides = new Map<SimulatedFan, number>();
  const heaters = { nozzle: { from: ambient, setPoint: 0, since: 0 }, bed: { from: ambient, setPoint: 0, since: 0 } };
  const trays = new Map<number, Tray>([
    [
      0,
      {
        ...unset(true),
        type: 'PLA',
        idx: 'GFA00',
        settingId: 'GFSA00',
        brand: 'PLA Basic',
        color: 'F2F2F2FF',
        min: 190,
        max: 230,
        tagUid: '8F3A21B7C0D45E61',
        caliIdx: 1,
        k: 0.02,
        remain: 87,
      },
    ],
    [
      1,
      {
        ...unset(true),
        type: 'PETG',
        idx: 'GFG99',
        settingId: 'GFSG99',
        color: '1E5AA8FF',
        min: 230,
        max: 260,
        remain: 0,
      },
    ],
    [2, unset(true)],
    [3, unset(false)],
    [bambuExternalSpoolSlot, unset(true)],
  ]);
  let trayNow = 0;
  let trayTarget = 0;
  let caliVersion = 3;
  let nextProfile = 3;
  const profiles: ProfileRow[] = [
    {
      cali_idx: 1,
      name: 'PLA Basic 0.4',
      filament_id: 'GFA00',
      setting_id: 'GFSA00',
      k_value: '0.020',
      n_coef: '1.400000',
      nozzle_id: 'HS00-0.4',
      nozzle_diameter: '0.4',
    },
    {
      cali_idx: 2,
      name: 'Generic PETG 0.4',
      filament_id: 'GFG99',
      setting_id: 'GFSG99',
      k_value: '0.038',
      n_coef: '1.400000',
      nozzle_id: 'HS00-0.4',
      nozzle_diameter: '0.4',
    },
  ];
  const results: Partial<Record<'pressure-advance' | 'flow-ratio', ReadonlyArray<Readonly<Record<string, unknown>>>>> =
    {};
  let procedure: Procedure | undefined;
  let calibration: SimulatedCalibration | undefined;
  let run: SimulatedRun | undefined;
  let finished: SimulatedRun | undefined;
  /** The finished run was stopped, not completed. */
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reading = (heater: keyof typeof heaters, at: number): number => {
    const { from, setPoint, since } = heaters[heater];
    const goal = Math.max(setPoint, ambient);
    const { rise, fall } = heaterRates[heater];
    return from < goal ? Math.min(goal, from + rise * (at - since)) : Math.max(goal, from - fall * (at - since));
  };
  const setHeater = (heater: keyof typeof heaters, setPoint: number, at: number): void => {
    heaters[heater] = { from: reading(heater, at), setPoint, since: at };
  };
  const trayOf = (slot: number): Tray => trays.get(slot) ?? unset(false);

  // ───────────── Time ─────────────

  const finishProcedure = (at: number): void => {
    if (procedure?.kind === 'load') {
      trayNow = procedure.target;
    }
    if (procedure?.kind === 'unload') {
      trayNow = 255;
      trayTarget = 255;
    }
    if (procedure?.kind !== 'read-tag') {
      setHeater('nozzle', 0, at);
    }
    procedure = undefined;
  };
  /** Bring runs, calibrations and filament steps up to `at`. */
  const advance = (at: number): void => {
    if (run && run.pausedAt === undefined) {
      const end = run.startedAt + run.pausedFor + run.preheat + run.plate.duration;
      if (at >= end) {
        setHeater('nozzle', 0, end);
        setHeater('bed', 0, end);
        finished = run;
        run = undefined;
      }
    }
    if (calibration && !calibration.ended && at >= calibration.startedAt + calibration.duration) {
      calibration.ended = true;
      setHeater('nozzle', 0, calibration.startedAt + calibration.duration);
      setHeater('bed', 0, calibration.startedAt + calibration.duration);
      if (calibration.kind !== 'printer') {
        results[calibration.kind] = calibration.filaments.map((filament) => ({
          tray_id: filament['tray_id'],
          ams_id: filament['ams_id'],
          slot_id: filament['slot_id'],
          extruder_id: 0,
          nozzle_id: 'HS00-0.4',
          nozzle_diameter: '0.4',
          filament_id: filament['filament_id'],
          setting_id: filament['setting_id'],
          ...(calibration?.kind === 'flow-ratio'
            ? { flow_ratio: '0.96' }
            : { k_value: measuredK(String(filament['filament_id'])), n_coef: '1.400000' }),
          confidence: 0,
        }));
      }
    }
    for (let current = procedure; current !== undefined; current = procedure) {
      const step = current.steps[current.index];
      if (step === undefined) {
        finishProcedure(at);
        break;
      }
      if (step.seconds === undefined || at - current.since < step.seconds) {
        break;
      }
      current.since += step.seconds;
      current.index += 1;
    }
  };

  // ───────────── Reports ─────────────

  const deliver = (message: unknown): void => {
    const bytes = encoder.encode(JSON.stringify(message));
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(bytes);
      }
    });
  };
  const level = (percent: number): string => String(Math.round((percent / 100) * 15));
  const trayJson = (id: number, tray: Tray) => ({
    id: String(id),
    tray_type: tray.type,
    tray_info_idx: tray.idx,
    setting_id: tray.settingId,
    tray_sub_brands: tray.brand,
    tray_color: tray.color,
    nozzle_temp_min: String(tray.min),
    nozzle_temp_max: String(tray.max),
    tag_uid: tray.tagUid,
    remain: tray.remain,
    cali_idx: tray.caliIdx,
    k: tray.k,
  });
  // oxlint-disable-next-line eslint/complexity -- one push carries the whole printer, as an X1C sends it.
  const statusBody = (at: number): Record<string, unknown> => {
    sequence += 1;
    const wobble = run ? ((sequence % 3) - 1) / 10 : 0;
    const bed = reading('bed', at);
    const programTime = run ? printed(run, at) : 0;
    const heating = run !== undefined && runClock(run, at) < run.preheat;
    const fan = (name: SimulatedFan): string =>
      String(fanOverrides.get(name) ?? level(run ? fanSpeed(run.plate.fans[name], programTime) : 0));
    const shown = run ?? finished;
    const calibrationTime = calibration ? Math.min(at - calibration.startedAt, calibration.duration) : 0;
    const stage = run
      ? run.pausedAt === undefined
        ? heating
          ? 2
          : 0
        : 16
      : calibration && !calibration.ended
        ? calibrationTime < 20
          ? 13
          : { 'pressure-advance': 8, 'flow-ratio': 19, printer: 1 }[calibration.kind]
        : procedure?.kind === 'load'
          ? 24
          : procedure?.kind === 'unload'
            ? 22
            : -1;
    const step = procedure?.steps[procedure.index];
    const exist = [0, 1, 2, 3].reduce((bits, slot) => bits + (trayOf(slot).present ? 2 ** slot : 0), 0);
    return {
      command: 'push_status',
      sequence_id: String(sequence),
      printer_type: facts.reportedNames[0],
      nozzle_diameter: '0.4',
      nozzle_type: x1c ? 'hardened_steel' : 'stainless_steel',
      nozzle_temper: Math.round((reading('nozzle', at) + wobble) * 10) / 10,
      nozzle_target_temper: heaters.nozzle.setPoint,
      bed_temper: Math.round((bed + wobble) * 10) / 10,
      bed_target_temper: heaters.bed.setPoint,
      ...(facts.chamber ? { chamber_temper: Math.round((ambient + (bed - ambient) / 3) * 10) / 10 } : {}),
      gcode_state: run
        ? run.pausedAt === undefined
          ? heating
            ? 'PREPARE'
            : 'RUNNING'
          : 'PAUSE'
        : calibration
          ? calibration.ended
            ? calibration.cancelled === true
              ? 'FAILED'
              : 'FINISH'
            : 'RUNNING'
          : finished
            ? cancelled
              ? 'FAILED'
              : 'FINISH'
            : 'IDLE',
      print_type: (run ?? finished) === undefined ? (calibration ? 'system' : 'idle') : 'local',
      gcode_file: calibration
        ? {
            'pressure-advance': '/usr/etc/print/extrusion_cali.gcode',
            'flow-ratio': '/usr/etc/print/flowrate_cali.gcode',
            printer: '/usr/etc/print/auto_cali_for_user.gcode',
          }[calibration.kind]
        : (shown?.file ?? ''),
      gcode_start_time: String(calibration?.startTime ?? (shown ? Math.floor(origin / 1000 + shown.startedAt) : 0)),
      subtask_name: calibration ? '' : (shown?.name ?? ''),
      subtask_id: calibration ? '0' : (shown?.id ?? '0'),
      mc_percent: run
        ? Math.floor((programTime / Math.max(run.plate.duration, 1)) * 100)
        : calibration
          ? Math.floor((calibrationTime / calibration.duration) * 100)
          : finished
            ? cancelled
              ? Math.floor((printed(finished, at) / Math.max(finished.plate.duration, 1)) * 100)
              : 100
            : 0,
      mc_remaining_time: run
        ? Math.ceil((Math.max(run.preheat - runClock(run, at), 0) + run.plate.duration - programTime) / 60)
        : calibration
          ? Math.ceil((calibration.duration - calibrationTime) / 60)
          : 0,
      layer_num: run
        ? heating
          ? 0
          : run.plate.layerStarts.findLastIndex((start) => start <= programTime) + 1
        : finished
          ? finished.plate.layerStarts.length
          : 0,
      total_layer_num: (run ?? finished)?.plate.layerStarts.length ?? 0,
      stg_cur: stage,
      spd_lvl: speedLevel,
      spd_mag: [50, 100, 124, 166][speedLevel - 1],
      cooling_fan_speed: fan('part'),
      ...(facts.chamber ? { big_fan1_speed: fan('auxiliary'), big_fan2_speed: fan('chamber') } : {}),
      ...(facts.chamber ? { lights_report: [{ node: 'chamber_light', mode: light ? 'on' : 'off' }] } : {}),
      ...(faults.has('plate-unreported') ? {} : { plate_type: 'textured_plate' }),
      wifi_signal: '-45dBm',
      sdcard: true,
      // An X1C with an AMS spool in the toolhead reports ASSIST (3), not IDLE, between procedures.
      ams_status: procedure
        ? procedure.kind === 'read-tag'
          ? 0x02_00
          : 0x01_00 + (step?.code ?? 0)
        : trayNow < 254
          ? 0x03_00
          : 0,
      ...(input.calibrationTable === false ? {} : { cali_version: caliVersion }),
      flag3: 0b1000,
      ...(x1c ? { fun: developerMode ? '0' : '20000000' } : {}),
      print_error: cancelled || calibration?.cancelled === true ? cancelledError : 0,
      hms: refused && !developerMode ? [{ attr: 0x05_00_05_00, code: 0x00_01_00_07 }] : [],
      ams: {
        tray_exist_bits: exist.toString(16),
        tray_now: String(trayNow),
        tray_tar: String(trayTarget),
        ams: [
          {
            id: '0',
            humidity: '4',
            // eslint-disable-next-line id-denylist -- Bambu's wire field name.
            temp: '24.0',
            tray: [0, 1, 2, 3].map((slot) => trayJson(slot, trayOf(slot))),
          },
        ],
      },
      vt_tray: trayJson(254, trayOf(bambuExternalSpoolSlot)),
    };
  };
  const push = (): void => {
    const at = simulated(clock.now());
    advance(at);
    deliver({ print: statusBody(at) });
  };
  const schedule = (): void => {
    clearTimeout(timer);
    if (!input.cadence || listeners.size === 0) {
      return;
    }
    const busy = procedure !== undefined || (calibration !== undefined && !calibration.ended);
    const active = run !== undefined && run.pausedAt === undefined;
    timer = setTimeout(
      () => {
        push();
        schedule();
      },
      busy ? 1000 : active ? Math.min(steadyCadence, Math.max(1000, 20_000 / speed)) : steadyCadence,
    );
    timer.unref();
  };

  // ───────────── Requests ─────────────

  const slotFrom = (body: Readonly<Record<string, unknown>>): number => {
    const amsId = Number(body['ams_id']);
    return amsId >= 254 || Number(body['target']) >= 254 ? bambuExternalSpoolSlot : amsId * 4 + Number(body['slot_id']);
  };
  const filamentSteps = (target: number): readonly Step[] => {
    const loaded = trayNow !== 255;
    const check = x1c ? [] : [{ code: 0x08, seconds: stepSeconds.check }];
    const swap =
      loaded || !x1c
        ? [
            { code: 0x03, seconds: stepSeconds.cut },
            { code: 0x04, seconds: stepSeconds.pull },
          ]
        : [];
    return target === bambuExternalSpoolSlot
      ? [
          { code: 0x02, seconds: stepSeconds.heat },
          ...check,
          ...swap,
          { code: 0x05, seconds: stepSeconds.insert },
          { code: 0x06 },
          { code: 0x07, seconds: stepSeconds.purge },
        ]
      : [
          { code: 0x02, seconds: stepSeconds.heat },
          ...check,
          ...swap,
          { code: 0x05, seconds: stepSeconds.push },
          { code: 0x07, seconds: stepSeconds.purge },
        ];
  };
  const busyWith = (): string | undefined =>
    run ? 'printer busy' : calibration && !calibration.ended ? 'printer busy' : procedure ? 'ams busy' : undefined;

  type Outcome = Readonly<{ fail?: string; extra?: Readonly<Record<string, unknown>> }>;
  // oxlint-disable-next-line eslint/complexity -- one dispatch over the commands Tau sends.
  const apply = (command: string, body: Readonly<Record<string, unknown>>, at: number): Outcome => {
    switch (command) {
      case 'ledctrl': {
        light = body['led_mode'] === 'on';
        return {};
      }
      case 'print_speed': {
        speedLevel = Math.min(Math.max(Number(body['param']), 1), 4);
        return {};
      }
      case 'pause': {
        if (!run) {
          return { fail: 'no print' };
        }
        if (faults.delete('pause-ignored-once')) {
          return {};
        }
        run.pausedAt ??= at;
        return {};
      }
      case 'resume': {
        if (run?.pausedAt !== undefined) {
          run.pausedFor += at - run.pausedAt;
          run.pausedAt = undefined;
        }
        return {};
      }
      case 'stop': {
        // An X1C ends a stopped print or calibration in FAILED with print_error 0500-400E, not IDLE. A filament load,
        // unload or tag read runs on: `stop` ends a print, and Bambu Studio ends a filament change with
        // `ams_control abort` instead (below).
        setHeater('nozzle', 0, at);
        setHeater('bed', 0, at);
        if (run) {
          run.pausedAt ??= at;
          finished = run;
          run = undefined;
          cancelled = true;
        }
        if (calibration && !calibration.ended) {
          calibration.ended = true;
          calibration.cancelled = true;
        }
        return {};
      }
      case 'gcode_line': {
        for (const line of String(body['param']).split('\n')) {
          const fan = /^M106 P(\d) S(\d+)/u.exec(line.trim());
          if (fan) {
            fanOverrides.set(
              fanIndexes[Number(fan[1])] ?? 'part',
              Math.round((Math.min(Number(fan[2]), 255) / 255) * 15),
            );
          }
          const tag = /^M620 R(\d+)/u.exec(line.trim());
          if (tag) {
            procedure = {
              kind: 'read-tag',
              target: Number(tag[1]),
              steps: [{ code: 0, seconds: stepSeconds.tag }],
              index: 0,
              since: at,
            };
          }
        }
        return {};
      }
      case 'ams_change_filament': {
        const busy = busyWith();
        if (busy !== undefined) {
          return { fail: busy };
        }
        // An unload targets 255 from slot 255; OrcaSlicer's external-spool load also targets 255, from slot 0.
        if (Number(body['target']) === 255 && Number(body['slot_id']) === 255) {
          if (trayNow === 255) {
            return { fail: 'no filament loaded' };
          }
          setHeater('nozzle', Number(body['tar_temp']) > 0 ? Number(body['tar_temp']) : 220, at);
          procedure = {
            kind: 'unload',
            target: 255,
            steps: [
              { code: 0x02, seconds: stepSeconds.heat },
              ...(x1c ? [] : [{ code: 0x08, seconds: stepSeconds.check }]),
              { code: 0x03, seconds: stepSeconds.cut },
              { code: 0x04, seconds: stepSeconds.pull },
            ],
            index: 0,
            since: at,
          };
          trayTarget = 255;
          return {};
        }
        const slot = slotFrom(body);
        if (slot === bambuExternalSpoolSlot && !appliesExternal('load', body)) {
          return {};
        }
        if (!trayOf(slot).present) {
          return { fail: 'slot empty' };
        }
        const tray = trayOf(slot);
        setHeater(
          'nozzle',
          Number(body['tar_temp']) > 0
            ? Number(body['tar_temp'])
            : tray.max > 0
              ? Math.round((tray.min + tray.max) / 2)
              : 220,
          at,
        );
        procedure = { kind: 'load', target: slot, steps: filamentSteps(slot), index: 0, since: at };
        trayTarget = slot;
        return {};
      }
      case 'ams_control': {
        const parameter = body['param'];
        if (parameter === 'abort') {
          if (procedure?.kind !== 'read-tag') {
            procedure = undefined;
            trayTarget = trayNow;
            setHeater('nozzle', 0, at);
          }
          return {};
        }
        const step = procedure?.steps[procedure.index];
        if (procedure === undefined || step?.seconds !== undefined) {
          return { fail: 'nothing to confirm' };
        }
        if (parameter === 'done') {
          procedure.index += 1;
        } else {
          procedure.index = procedure.steps.findIndex(({ code }) => code === 0x05);
        }
        procedure.since = at;
        return {};
      }
      case 'ams_filament_setting': {
        const slot =
          Number(body['ams_id']) >= 254 ? bambuExternalSpoolSlot : Number(body['ams_id']) * 4 + Number(body['slot_id']);
        if (slot === bambuExternalSpoolSlot && !appliesExternal('setting', body)) {
          return {};
        }
        const tray = trayOf(slot);
        const color = text(body['tray_color'], '');
        trays.set(slot, {
          ...tray,
          type: text(body['tray_type'], ''),
          idx: text(body['tray_info_idx'], ''),
          settingId: text(body['setting_id'], ''),
          brand: text(body['tray_sub_brands'], ''),
          // Some printers store a lower-case colour as zeros (bambuddy notes); the simulator does too.
          color: /[a-f]/u.test(color) ? '00000000' : color,
          min: Number(body['nozzle_temp_min'] ?? 0),
          max: Number(body['nozzle_temp_max'] ?? 0),
        });
        return {};
      }
      case 'extrusion_cali_sel': {
        const slot =
          Number(body['ams_id']) >= 254 || Number(body['tray_id']) >= 254
            ? bambuExternalSpoolSlot
            : Number(body['tray_id']);
        if (slot === bambuExternalSpoolSlot && !appliesExternal('calibration', body)) {
          return {};
        }
        const index = Number(body['cali_idx']);
        const row = profiles.find(({ cali_idx }) => cali_idx === index);
        trays.set(slot, { ...trayOf(slot), caliIdx: row ? index : -1, k: row ? Number(row.k_value) : 0.02 });
        return {};
      }
      case 'extrusion_cali_set': {
        for (const value of Array.isArray(body['filaments'])
          ? (body['filaments'] as Array<Record<string, unknown>>)
          : []) {
          const row: ProfileRow = {
            cali_idx: 0,
            name: String(value['name']),
            filament_id: String(value['filament_id']),
            setting_id: text(value['setting_id'], ''),
            k_value: String(value['k_value']),
            n_coef: text(value['n_coef'], '0.0'),
            nozzle_id: text(value['nozzle_id'], 'HS00-0.4'),
            nozzle_diameter: text(value['nozzle_diameter'], '0.4'),
          };
          // The firmware keeps one row per name for a filament and nozzle: a second save overwrites it.
          const existing = profiles.findIndex(
            (candidate) =>
              (value['cali_idx'] !== undefined && candidate.cali_idx === Number(value['cali_idx'])) ||
              (candidate.name === row.name && candidate.filament_id === row.filament_id),
          );
          if (existing === -1) {
            profiles.push({ ...row, cali_idx: (nextProfile += 1) });
          } else {
            profiles[existing] = { ...row, cali_idx: profiles[existing]!.cali_idx };
          }
        }
        caliVersion += 1;
        return faults.has('replies-lie') ? { fail: 'invalid tray_id' } : {};
      }
      case 'extrusion_cali_del': {
        const index = profiles.findIndex(({ cali_idx }) => cali_idx === Number(body['cali_idx']));
        if (index === -1) {
          return { fail: 'invalid cali_idx' };
        }
        profiles.splice(index, 1);
        for (const [slot, tray] of trays) {
          if (tray.caliIdx === Number(body['cali_idx'])) {
            trays.set(slot, { ...tray, caliIdx: -1, k: 0.02 });
          }
        }
        caliVersion += 1;
        return {};
      }
      case 'extrusion_cali_get': {
        const filament = text(body['filament_id'], '');
        return {
          extra: {
            nozzle_diameter: body['nozzle_diameter'],
            filaments: profiles.filter(({ filament_id }) => filament === '' || filament_id === filament),
          },
        };
      }
      case 'extrusion_cali_get_result':
      case 'flowrate_get_result': {
        return {
          extra: {
            nozzle_diameter: body['nozzle_diameter'],
            filaments: results[command === 'flowrate_get_result' ? 'flow-ratio' : 'pressure-advance'] ?? [],
          },
        };
      }
      case 'extrusion_cali':
      case 'flowrate_cali':
      case 'calibration': {
        const busy = busyWith();
        if (busy !== undefined) {
          return { fail: busy };
        }
        const filaments = Array.isArray(body['filaments']) ? (body['filaments'] as Array<Record<string, unknown>>) : [];
        if (
          filaments.some((filament) => Number(filament['ams_id']) >= 254 && !appliesExternal('calibration', filament))
        ) {
          return {};
        }
        const first = filaments[0];
        setHeater('nozzle', Number(first?.['nozzle_temp'] ?? 220), at);
        setHeater('bed', Number(first?.['bed_temp'] ?? 55), at);
        finished = undefined;
        cancelled = false;
        calibration = {
          kind:
            command === 'extrusion_cali' ? 'pressure-advance' : command === 'flowrate_cali' ? 'flow-ratio' : 'printer',
          startedAt: at,
          duration: command === 'calibration' ? 90 : 120,
          startTime: Math.floor(origin / 1000 + at),
          filaments,
          ended: false,
        };
        return {};
      }
      case 'ams_get_rfid': {
        procedure = {
          kind: 'read-tag',
          target: Number(body['ams_id']) * 4 + Number(body['slot_id']),
          steps: [{ code: 0, seconds: stepSeconds.tag }],
          index: 0,
          since: at,
        };
        return {};
      }
      case 'project_file': {
        const file = text(body['file'], '');
        const plate = uploaded.get(file);
        if (!plate) {
          return { fail: 'file not found' };
        }
        // The start sequence sets both heaters before waiting on either, so they heat together.
        const preheat = Math.max(
          Math.max(plate.nozzleTarget - reading('nozzle', at), 0) / heaterRates.nozzle.rise,
          Math.max(plate.bedTarget - reading('bed', at), 0) / heaterRates.bed.rise,
        );
        setHeater('nozzle', plate.nozzleTarget, at);
        setHeater('bed', plate.bedTarget, at);
        fanOverrides.clear();
        calibration = undefined;
        finished = undefined;
        cancelled = false;
        run = {
          id: String(body['subtask_id']),
          name: text(body['subtask_name'], file),
          file,
          plate,
          startedAt: at,
          preheat,
          pausedFor: 0,
        };
        return { extra: { subtask_id: run.id } };
      }
      default: {
        return { fail: 'unsupported command' };
      }
    }
  };

  const reads: ReadonlySet<string> = new Set([
    'extrusion_cali_get',
    'extrusion_cali_get_result',
    'flowrate_get_result',
  ]);
  const handle = (payload: string): void => {
    const root = JSON.parse(payload) as Record<string, Record<string, unknown> | undefined>;
    requestLog.push(root);
    if (root['pushing']?.['command'] === 'pushall') {
      push();
      return;
    }
    if (root['info']?.['command'] === 'get_version') {
      deliver({
        info: {
          command: 'get_version',
          sequence_id: '0',
          module: [
            {
              name: 'ota',
              sw_ver: input.firmware ?? 'simulator-2',
              hw_ver: 'OTA',
              sn: serial,
              project_name: facts.reportedNames[0],
            },
          ],
          result: 'success',
        },
      });
      return;
    }
    const family = root['print'] ? 'print' : 'system';
    const body = root[family] ?? {};
    const command = String(body['command']);
    const sequenceId = body['sequence_id'];
    const reply = (fields: Readonly<Record<string, unknown>>): void => {
      deliver({ [family]: { command, sequence_id: sequenceId, ...fields } });
    };
    if (!reads.has(command)) {
      // The tripwire proves a host never touches the device before an explicit approval.
      if (faults.has('approval-required-not-honored')) {
        writeLog.push(`unapproved-${command}`);
        throw new Error('BAMBU_SIMULATOR_UNAPPROVED_WRITE');
      }
      if (!developerMode) {
        // Firmware from 01.08.03.00 drops a write without Developer Mode, answers so, and raises HMS 0500-0500-0001-0007.
        // ponytail: recorded for X1-class firmware only (bambuddy notes); the A1 mini drops the same way here, unverified
        // on hardware (testing program T1). Gate on the model once the A1 mini is measured.
        refused = true;
        reply({ result: 'failed', reason: 'mqtt message verify failed' });
        push();
        return;
      }
      writeLog.push(command);
    }
    const at = simulated(clock.now());
    advance(at);
    const write = !reads.has(command);
    const outcome = write && faults.has('ack-but-ignore') ? {} : apply(command, body, at);
    if (!write || !faults.has('reply-lost-after-accept')) {
      reply(
        outcome.fail === undefined
          ? { result: 'success', reason: 'success', ...outcome.extra }
          : { result: 'fail', reason: outcome.fail },
      );
    }
    if (!write || !faults.has('push-lag')) {
      push();
    }
    schedule();
  };

  // ───────────── Sessions ─────────────

  const readPrepared = async (
    artifact: MachineArtifactReference,
    signal: AbortSignal,
  ): Promise<BambuPreparedArtifact> => {
    if (!readArtifact) {
      // ponytail: socket-free fixtures send placeholder artifacts; without a host reader the reference plate runs.
      return {
        bytes: new Uint8Array(0),
        digest: artifact.digest,
        length: artifact.length,
        parser: { id: 'tau.bambu.gcode-3mf', version: '1' },
        memberMd5: '0'.repeat(32),
        plate: new Uint8Array(0),
        // The reference plate is sliced for this printer, its 0.4 mm nozzle, the textured plate and tray 0's PLA.
        slice: {
          printerModel: facts.sliceName,
          nozzleDiameter: 0.4,
          bedType: 'Textured PEI Plate',
          filaments: [{ type: 'PLA', color: '#F2F2F2', diameter: 1.75, used: true }],
        },
      };
    }
    const { prepareBambuArtifact } = await import('#bambu.archive.js');
    return prepareBambuArtifact({ artifact, runtime: { readArtifact }, signal });
  };
  const manifest = machineManifestOf(
    bambuSimulatedDefinition(bambuDefinitions[model], model),
    bambuSubmissionConfigurations[model].manifest,
  );
  const connect = async (): Promise<MachineSession<BambuSubmission>> => {
    let open = true;
    let own: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
    const closeListeners = new Set<() => void>();
    const link: BambuLink = {
      async publish(payload) {
        if (!open) {
          throw new Error('BAMBU_SIMULATOR_CLOSED');
        }
        handle(payload);
      },
      subscribe(listener) {
        own = listener;
        listeners.add(listener);
        schedule();
      },
      onClose(listener) {
        closeListeners.add(listener);
      },
      connected: () => open,
      async close() {
        open = false;
        if (own) {
          listeners.delete(own);
        }
        schedule();
        for (const listener of closeListeners) {
          listener();
        }
      },
    };
    const session = await openBambuSession({
      model,
      serial,
      name: `Simulated ${model}`,
      link,
      clock,
      log: async () => undefined,
      signal: new AbortController().signal,
      manifest,
      form: input.form ?? 'a',
      // Deliberately unlike the LAN provider: the simulator runs any producer's slice, Tau's reference engine too.
      requireBambuStudio: false,
      readArtifact: readPrepared,
      async upload({ remoteName, artifact }) {
        writeLog.push(`upload:${remoteName}`);
        if (faults.has('approval-required-not-honored')) {
          throw new Error('BAMBU_SIMULATOR_UNAPPROVED_WRITE');
        }
        if (faults.has('storage-full')) {
          throw new BambuProtocolError('MACHINE_TRANSFER_STORAGE_FULL');
        }
        if (faults.has('partial-transfer')) {
          throw new BambuProtocolError('MACHINE_TRANSFER_PARTIAL');
        }
        uploaded.set(
          remoteName,
          artifact.plate.byteLength === 0
            ? referencePlate
            : readBambuSimulatedPlate(new TextDecoder().decode(artifact.plate)),
        );
        return artifact.length;
      },
      stillCapture: {
        type: 'supported',
        async capture() {
          if (faults.has('camera-unavailable')) {
            throw new Error('BAMBU_CAMERA_UNAVAILABLE');
          }
          return parseBambuStill(jpeg, clock.now());
        },
      },
      ...(input.replyWindow === undefined ? {} : { replyWindow: input.replyWindow }),
      openWindow: 2000,
    });
    const failure = (['certificate-changed', 'wrong-credential', 'protected-mode', 'timeout'] as const).find((fault) =>
      faults.has(fault),
    );
    if (failure === undefined) {
      return session;
    }
    const codes = {
      'certificate-changed': 'BAMBU_CERTIFICATE_CHANGED',
      'wrong-credential': 'BAMBU_AUTHENTICATION',
      'protected-mode': 'BAMBU_PROTECTED_MODE',
      timeout: 'BAMBU_TIMEOUT',
    } as const;
    return Object.freeze({
      ...session,
      async getDescriptor() {
        throw new Error(codes[failure]);
      },
    });
  };

  return Object.freeze({
    session: await connect(),
    connect,
    push,
    setDeveloperMode(on: boolean) {
      developerMode = on;
      refused = refused && !on;
      push();
    },
    uploadedNames: () => Object.freeze([...uploaded.keys()]),
    writes: () => Object.freeze([...writeLog]),
    requests: () => Object.freeze([...requestLog]),
  });
};

/* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */

const simulatorBindingConfiguration = defineConfiguration({
  id: 'bambu.simulator.binding',
  version: '2.1.0',
  schema: z.object({
    speed: z.number().min(1).max(3600).default(1).meta({
      title: 'Demo speed',
      description: 'Simulated seconds per real second, so a long print can be watched in minutes',
    }),
    developerMode: z.boolean().default(true).meta({
      title: 'Developer Mode',
      description: 'Off makes the simulated printer drop every command, as firmware from 01.08.03.00 does.',
    }),
    wireForm: z.enum(['a', 'b', 'c']).optional().meta({
      title: 'Command forms (testing)',
      description: 'Which form to send where the clients disagree (testing program rows T6, T7, T10, T17).',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** Each model's simulator provider id. */
const simulatorIds = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keyed by the model name.
  X1C: 'bambu-simulator',
  'A1 mini': 'bambu-a1-mini-simulator',
} as const satisfies Readonly<Record<BambuModel, string>>;

const simulatorParts = (model: BambuModel, input: Readonly<{ simulator?: BambuSimulator }>) => {
  const id = simulatorIds[model];
  return {
    id,
    name: `Simulated ${model}`,
    version: '2.0.0',
    protocolVersion: 2,
    vendor: 'Bambu Lab',
    manifest: bambuSimulatedDefinition(bambuDefinitions[model], model),
    bindingConfiguration: simulatorBindingConfiguration,
    settingsConfiguration: bambuSettingsConfiguration,
    async *discover(
      discoveryInput: Readonly<{ signal: AbortSignal }>,
      runtime: Readonly<{ clock: MachineClock }>,
    ): AsyncGenerator<MachineDiscoveryEvent> {
      discoveryInput.signal.throwIfAborted();
      const observedAt = runtime.clock.now();
      yield {
        type: 'found',
        candidate: {
          id,
          name: `Simulated ${model}`,
          endpoint: { transport: 'network', address: 'simulator.invalid', interface: 'simulator' },
          claimedIdentity: { serial: simulatedSerial(model), model },
          observedAt,
          expiresAt: new Date(Date.parse(observedAt) + 5 * 60_000).toISOString(),
        },
      };
    },
    // The product simulator runs on the host's wall clock and reads each upload's plate like the printer.
    async connect(
      connectInput: Readonly<{ configuration: z.output<typeof simulatorBindingConfiguration.schema> }>,
      runtime: MachineConnectionRuntime,
    ): Promise<MachineSession<BambuSubmission>> {
      if (input.simulator) {
        return input.simulator.connect();
      }
      const { speed, developerMode, wireForm } = connectInput.configuration;
      const simulator = await createBambuSimulator({
        model,
        clock: runtime.clock,
        speed,
        developerMode,
        ...(wireForm === undefined ? {} : { form: wireForm }),
        readArtifact: (read) => runtime.readArtifact(read),
        cadence: true,
      });
      return simulator.session;
    },
  } as const;
};

/**
 * Define a simulator provider around one explicit simulator, so a test can read its write ledger.
 *
 * @internal
 * @param input - Optional simulator every connection opens a session on; omitted means one fresh printer per connection.
 * @returns The `bambu-simulator` provider factory (or the A1 mini's).
 */
export const defineBambuSimulatorMachine = (
  input: Readonly<{ simulator?: BambuSimulator; model?: BambuModel }> = {},
): ReturnType<typeof defineMachine> =>
  // One factory per model: each submission form is its own type, and a model without one does not compile.
  (
    ({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- keyed by the model name.
      X1C: () =>
        defineMachine({ ...simulatorParts('X1C', input), submissionConfiguration: bambuSubmissionConfigurations.X1C }),
      'A1 mini': () =>
        defineMachine({
          ...simulatorParts('A1 mini', input),
          submissionConfiguration: bambuSubmissionConfigurations['A1 mini'],
        }),
    }) satisfies Readonly<Record<BambuModel, () => ReturnType<typeof defineMachine>>>
  )[input.model ?? 'X1C']();

/** Selectable, explicitly labelled simulated X1C provider; no sockets, no hardware. @public */
export const bambuSimulatorMachine = defineBambuSimulatorMachine();

/** Selectable, explicitly labelled simulated A1 mini provider; no sockets, no hardware. @public */
export const bambuA1MiniSimulatorMachine = defineBambuSimulatorMachine({ model: 'A1 mini' });
