import { simulatedCameraJpeg } from '#bambu.simulator-image.js';
import { bambuSettingsConfiguration } from '#bambu.settings.js';
import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineClock,
  MachineCommandReceipt,
  MachineConnectionRuntime,
  MachineDescriptor,
  MachineFanSnapshot,
  MachineRunSnapshot,
  MachineSession,
  MachineSnapshot,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
} from '@taucad/runtime/machine';
import { quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { z } from 'zod';

import { bambuAcceptedContainers, bambuSubmissionConfiguration } from '#bambu.machine.js';
import { bambuX1cManifest } from '#bambu.manifest.js';
import {
  bambuQuantity,
  bambuRemoteName,
  bambuStage,
  parseBambuStatusPayload,
  parseBambuStill,
} from '#bambu.protocol.js';

/** Deterministic fault switches accepted by the simulator. @internal */
export type BambuSimulatorFault =
  | 'approval-required-not-honored'
  | 'camera-unavailable'
  | 'certificate-changed'
  | 'partial-transfer'
  | 'protected-mode'
  | 'reply-lost-after-accept'
  | 'storage-damaged'
  | 'storage-full'
  | 'timeout'
  | 'wrong-credential';

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
  fans: Readonly<Record<keyof MachineFanSnapshot, FanChanges>>;
}>;

/** Socket-free simulator handle used by protocol, host, UI, and tool conformance. @internal */
export type BambuSimulator = Readonly<{
  session: MachineSession<
    Readonly<{
      amsMapping: readonly number[];
      bedLeveling: boolean;
      expectedBedType: string;
      expectedFilamentDiameter: number;
      expectedMaterials: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>;
      expectedModel: 'X1C';
      expectedNozzleDiameter: number;
      flowCalibration: boolean;
      timelapse: boolean;
    }>
  >;
  reconnect(): void;
  /** Remote names the simulator holds after an accepted upload; a start never adds one. */
  uploadedNames(): readonly string[];
  /** Every physical write in order: `upload:<remoteName>`, `start:<operationId>`, `<command>:<operationId>`. */
  writes(): readonly string[];
}>;

/** One started run on the simulator's own clock. */
type SimulatedRun = {
  readonly id: string;
  readonly file: string;
  readonly plate: BambuSimulatedPlate;
  /** Simulated seconds at which the start was accepted. */
  readonly startedAt: number;
  /** Simulated seconds the heaters need to reach the plate's set points before the first move. */
  readonly preheat: number;
  /** Simulated seconds spent paused so far. */
  pausedFor: number;
  /** Simulated seconds at which the current pause began. */
  pausedAt?: number;
};

const nozzle = bambuQuantity({
  value: 0.4,
  unit: 'mm',
  kind: quantityKinds.diameter,
  space: 'linear',
});
const celsius = (value: number): Quantity =>
  bambuQuantity({ value: Math.round(value * 10) / 10, unit: 'Cel', kind: quantityKinds.temperature, space: 'point' });

/** Exercise the real diagnostic decoder; the simulator never invents a separate display message. */
const storageFailure = parseBambuStatusPayload(new TextEncoder().encode('{"print":{"print_error":83902511}}')).alerts;
const simulatedSerial = 'simulated-x1c';
/** Degrees Celsius the enclosure settles to with its heaters off. */
const ambient = 25;
/** Degrees Celsius per simulated second while each heater heats and while it cools passively. */
const heaterRates = { nozzle: { rise: 5, fall: 1.5 }, bed: { rise: 0.5, fall: 0.1 } } as const;
/** Milliseconds between observations while paused, cooling or idle; inside the manifest's 15 s budgets. */
const steadyCadence = 10_000;
const fixedClock: MachineClock = Object.freeze({ now: () => '2026-09-14T00:00:00.000Z' });
const layerMarker = /^\s*(?:(?:LAYER_CHANGE|CHANGE_LAYER)\s*$|LAYER\s+\d+\s+Z)/u;
/** `M106 P<n>` fan index: 0 and 1 cool the part, 2 is the auxiliary fan, 3 the chamber fan. */
const fanIndexes = ['part', 'part', 'auxiliary', 'chamber'] as const;

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
  const fans: Record<keyof MachineFanSnapshot, Array<readonly [number, number]>> = {
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

const readPlate = async (
  input: Readonly<{
    artifact: MachineArtifactReference;
    readArtifact: MachineConnectionRuntime['readArtifact'];
    signal: AbortSignal;
  }>,
): Promise<BambuSimulatedPlate> => {
  const { prepareBambuArtifact } = await import('#bambu.archive.js');
  const { plate } = await prepareBambuArtifact({
    artifact: input.artifact,
    runtime: { readArtifact: input.readArtifact },
    signal: input.signal,
  });
  return readBambuSimulatedPlate(new TextDecoder().decode(plate));
};

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

const describeRun = (run: SimulatedRun, at: number): MachineRunSnapshot => {
  const { layerStarts, duration } = run.plate;
  const elapsed = runClock(run, at);
  const done = printed(run, at);
  const isHeating = elapsed < run.preheat;
  return {
    state: run.pausedAt === undefined ? (isHeating ? 'preparing' : 'printing') : 'paused',
    progress: duration > 0 ? Math.round((done / duration) * 10_000) / 100 : 0,
    remainingSeconds: Math.ceil(Math.max(run.preheat - elapsed, 0) + duration - done),
    file: run.file,
    // An X1C reports stage 2 (`stg_cur`) while its bed heats, and no stage once it prints.
    ...(isHeating
      ? { stage: bambuStage(2) }
      : { currentLayer: layerStarts.findLastIndex((start) => start <= done) + 1, totalLayers: layerStarts.length }),
    speedProfile: 'standard',
    speedPercent: 100,
  };
};

const describeFans = (run: SimulatedRun | undefined, at: number): MachineFanSnapshot => {
  if (!run) {
    return { part: 0, auxiliary: 0, chamber: 0 };
  }
  const programTime = printed(run, at);
  const { fans } = run.plate;
  return {
    part: fanSpeed(fans.part, programTime),
    auxiliary: fanSpeed(fans.auxiliary, programTime),
    chamber: fanSpeed(fans.chamber, programTime),
  };
};

/** Create one deterministic, socket-free X1C simulator for conformance, UI fixtures and the product.
 * A started run heats, prints its plate's layers over the plate's duration and finishes on `clock`;
 * pause freezes it, cancel and urgent stop end it, and observations arrive on a cadence inside the
 * manifest's freshness budgets.
 * @param input - Optional closed fault selection, clock, demo speed and host artifact reader.
 * @returns Deterministic simulator and its machine session.
 */
export const createBambuSimulator = (
  input: Readonly<{
    faults?: readonly BambuSimulatorFault[];
    /** Clock the run advances on; the default fixed instant keeps socket-free fixtures exact. */
    clock?: MachineClock;
    /** Simulated seconds per clock second, so a long print can be watched in minutes; defaults to 1. */
    speed?: number;
    /** Host artifact reader: with it an upload runs the plate it carries, without it the reference plate runs. */
    readArtifact?: MachineConnectionRuntime['readArtifact'];
  }> = {},
): BambuSimulator => {
  const { clock = fixedClock, speed = 1, readArtifact } = input;
  const faults = new Set(input.faults ?? []);
  const uploaded = new Map<string, BambuSimulatedPlate>();
  const writeLog: string[] = [];
  const commandResults = new Map<string, Readonly<{ command: string; receipt: MachineSubmissionReceipt }>>();
  const origin = Date.parse(clock.now());
  const simulated = (observedAt: string): number => ((Date.parse(observedAt) - origin) / 1000) * speed;
  // ponytail: the host journals every distinct observation into a capped log, so a run is sampled once per
  // 20 simulated seconds (between 1 s and the 10 s steady cadence of wall time) rather than as fast as it
  // changes. That bounds a print to about 360 journal events per simulated hour at any demo speed; sample
  // faster once the host keeps unchanged telemetry out of its journal.
  /** Milliseconds between observations while a run heats or prints. */
  const activeCadence = Math.min(steadyCadence, Math.max(1000, 20_000 / speed));
  const heaters = {
    nozzle: { from: ambient, setPoint: 0, since: 0 },
    bed: { from: ambient, setPoint: 0, since: 0 },
  };
  const reading = (heater: keyof typeof heaters, at: number): number => {
    const { from, setPoint, since } = heaters[heater];
    const goal = Math.max(setPoint, ambient);
    const { rise, fall } = heaterRates[heater];
    return from < goal ? Math.min(goal, from + rise * (at - since)) : Math.max(goal, from - fall * (at - since));
  };
  const setHeater = (heater: keyof typeof heaters, setPoint: number, at: number): void => {
    heaters[heater] = { from: reading(heater, at), setPoint, since: at };
  };
  let run: SimulatedRun | undefined;
  let finished: MachineRunSnapshot | undefined;
  let closed = false;
  let sample = 0;
  let wake: (() => void) | undefined;

  /**
   * Milliseconds until the next sample, or none while closed.
   *
   * @returns The delay, or `undefined` once the session is closed.
   */
  const sampleCadence = (): number | undefined => {
    if (closed) {
      return undefined;
    }
    return run && run.pausedAt === undefined ? activeCadence : steadyCadence;
  };
  const changed = (): void => {
    wake?.();
  };
  const rest = async (signal: AbortSignal, cadence?: number): Promise<void> =>
    new Promise<void>((resolve) => {
      let sampleTimer: ReturnType<typeof setTimeout> | undefined;
      const done = (): void => {
        clearTimeout(sampleTimer);
        signal.removeEventListener('abort', done);
        wake = undefined;
        resolve();
      };
      if (cadence !== undefined) {
        sampleTimer = setTimeout(done, cadence);
      }
      wake = done;
      signal.addEventListener('abort', done, { once: true });
    });
  /**
   * Complete a run whose plate has run out by `at`, from the exact moment it ended.
   *
   * @param at - Simulator time in seconds.
   */
  const settle = (at: number): void => {
    if (!run || run.pausedAt !== undefined) {
      return;
    }
    const end = run.startedAt + run.pausedFor + run.preheat + run.plate.duration;
    if (at < end) {
      return;
    }
    setHeater('nozzle', 0, end);
    setHeater('bed', 0, end);
    const layers = run.plate.layerStarts.length;
    finished = Object.freeze({
      state: 'succeeded',
      progress: 100,
      remainingSeconds: 0,
      file: run.file,
      currentLayer: layers,
      totalLayers: layers,
    });
    run = undefined;
  };
  const snapshot = (): MachineSnapshot => {
    const observedAt = clock.now();
    const at = simulated(observedAt);
    settle(at);
    // A working thermistor never reads perfectly still; the wobble also keeps every sample of a run distinct,
    // so a paused run is never deduplicated into staleness. A settled idle machine repeats itself and the
    // host keeps nothing new.
    const wobble = run ? ((sample % 3) - 1) / 10 : 0;
    const bed = reading('bed', at);
    return Object.freeze({
      connection: closed ? 'disconnected' : 'connected',
      readiness: run ? 'busy' : 'idle',
      ...(faults.has('storage-damaged') ? { alerts: storageFailure } : {}),
      ...(run ? { activeRunId: run.id } : {}),
      observedAt,
      setup: Object.freeze({
        toolId: 'nozzle-0.4',
        bedType: 'textured-pei',
        materials: Object.freeze([
          // As a Bambu printer reports `tray_type`.
          { slot: 0, state: 'loaded', materialId: 'PLA', profileId: 'GFA00' },
        ] satisfies MachineSnapshot['setup']['materials']),
      }),
      run: Object.freeze(run ? describeRun(run, at) : (finished ?? { state: 'idle' })),
      temperatures: Object.freeze({
        nozzle: celsius(reading('nozzle', at) + wobble),
        ...(heaters.nozzle.setPoint > 0 ? { nozzleTarget: celsius(heaters.nozzle.setPoint) } : {}),
        bed: celsius(bed + wobble),
        ...(heaters.bed.setPoint > 0 ? { bedTarget: celsius(heaters.bed.setPoint) } : {}),
        // The unheated chamber settles about a third of the way from the room to the bed.
        chamber: celsius(ambient + (bed - ambient) / 3 + wobble),
      }),
      fans: Object.freeze(describeFans(run, at)),
      lights: Object.freeze({ chamber: run ? 'on' : 'off' }),
    });
  };
  const guardApproval = (write: string): void => {
    // The tripwire proves a host never touches the device before an explicit approval.
    if (faults.has('approval-required-not-honored')) {
      writeLog.push(`unapproved-${write}`);
      throw new Error('BAMBU_SIMULATOR_UNAPPROVED_WRITE');
    }
  };
  const receipt = (operation: string, command: string, providerRunId?: string): MachineSubmissionReceipt => {
    const accepted: MachineSubmissionReceipt = Object.freeze({
      status: 'accepted',
      ...(providerRunId ? { providerRunId } : {}),
      observedAt: clock.now(),
    });
    commandResults.set(operation, Object.freeze({ command, receipt: accepted }));
    if (faults.has('reply-lost-after-accept')) {
      return Object.freeze({
        status: 'unknown',
        reason: 'reply-lost-after-possible-acceptance',
        observedAt: clock.now(),
      });
    }
    return accepted;
  };
  const descriptor: MachineDescriptor = Object.freeze({
    id: simulatedSerial,
    name: 'Simulated X1C',
    vendor: 'Bambu Lab',
    model: 'X1C',
    technology: 'additive.fff',
    firmware: 'simulator-1',
    accepts: bambuAcceptedContainers,
    operations: Object.freeze(['prepare', 'upload', 'submit', 'pause', 'resume', 'cancel', 'urgent-stop', 'still']),
    ratedEnvelope: Object.freeze({
      width: 0.256,
      depth: 0.256,
      height: 0.256,
      unit: 'm',
    }),
    printableEnvelope: Object.freeze({
      width: 0.256,
      depth: 0.256,
      height: 0.256,
      unit: 'm',
    }),
    tools: Object.freeze([
      Object.freeze({
        id: 'nozzle-0.4',
        kind: 'extruder',
        nozzleDiameter: nozzle,
      }),
    ]),
    materialSystem: Object.freeze({ kind: 'ams', slotCount: 4 }),
    bedTypes: Object.freeze(['cool', 'engineering', 'high-temperature', 'textured-pei']),
  });

  const session: BambuSimulator['session'] = Object.freeze({
    async getDescriptor() {
      if (faults.has('certificate-changed')) {
        throw new Error('BAMBU_CERTIFICATE_CHANGED');
      }
      if (faults.has('wrong-credential')) {
        throw new Error('BAMBU_AUTHENTICATION');
      }
      if (faults.has('protected-mode')) {
        throw new Error('BAMBU_PROTECTED_MODE');
      }
      if (faults.has('timeout')) {
        throw new Error('BAMBU_TIMEOUT');
      }
      return descriptor;
    },
    async getSnapshot() {
      return snapshot();
    },
    async *observe(input_) {
      while (!input_.signal.aborted) {
        if (!closed) {
          sample += 1;
          yield Object.freeze({ type: 'snapshot', snapshot: snapshot() });
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- the stream samples on a cadence until the next physical change or abort.
        await rest(input_.signal, sampleCadence());
      }
    },
    async preparePrint(input_) {
      if (input_.expectedMachineId !== simulatedSerial) {
        return Object.freeze({
          status: 'rejected',
          code: 'IDENTITY_MISMATCH',
          message: 'The prepared machine identity changed.',
          observedAt: clock.now(),
        });
      }
      return Object.freeze({
        status: 'ready',
        remoteName: bambuRemoteName(input_.operationId),
        digest: input_.artifact.digest,
        length: input_.artifact.length,
        parser: Object.freeze({ id: 'tau.bambu.gcode-3mf', version: '1' }),
        providerData: Object.freeze({
          memberMd5: '00000000000000000000000000000000',
        }),
        observedAt: clock.now(),
      });
    },
    async uploadPrint(input_): Promise<MachineTransferReceipt> {
      guardApproval(`upload:${input_.remoteName}`);
      if (faults.has('storage-full')) {
        return Object.freeze({
          status: 'rejected',
          code: 'STORAGE_FULL',
          message: 'Printer storage is full.',
          observedAt: clock.now(),
        });
      }
      if (faults.has('partial-transfer')) {
        return Object.freeze({
          status: 'rejected',
          code: 'TRANSFER_PARTIAL',
          message: 'Artifact transfer was incomplete and the temporary object was removed.',
          observedAt: clock.now(),
        });
      }
      let plate = referencePlate;
      if (readArtifact) {
        try {
          plate = await readPlate({ artifact: input_.artifact, readArtifact, signal: input_.signal });
        } catch {
          return Object.freeze({
            status: 'rejected',
            code: 'ARTIFACT_INVALID',
            message: 'The artifact failed bounded verification.',
            observedAt: clock.now(),
          });
        }
      }
      writeLog.push(`upload:${input_.remoteName}`);
      uploaded.set(input_.remoteName, plate);
      return Object.freeze({
        status: 'transferred',
        transferId: input_.remoteName,
        digest: input_.artifact.digest,
        length: input_.artifact.length,
        observedAt: clock.now(),
      });
    },
    async submit(input_) {
      guardApproval(`start:${input_.operationId}`);
      const plate = uploaded.get(input_.remoteName);
      if (!plate || input_.transferId !== input_.remoteName) {
        return Object.freeze({
          status: 'rejected',
          code: 'PREPARATION_MISSING',
          message: 'The prepared artifact is not present.',
          observedAt: clock.now(),
        });
      }
      writeLog.push(`start:${input_.operationId}`);
      const at = simulated(clock.now());
      settle(at);
      // The start sequence sets both heaters before waiting on either, so they heat together.
      const preheat = Math.max(
        Math.max(plate.nozzleTarget - reading('nozzle', at), 0) / heaterRates.nozzle.rise,
        Math.max(plate.bedTarget - reading('bed', at), 0) / heaterRates.bed.rise,
      );
      setHeater('nozzle', plate.nozzleTarget, at);
      setHeater('bed', plate.bedTarget, at);
      run = { id: input_.operationId, file: input_.remoteName, plate, startedAt: at, preheat, pausedFor: 0 };
      finished = undefined;
      changed();
      return receipt(input_.operationId, 'project_file', input_.operationId);
    },
    async control(input_): Promise<MachineCommandReceipt> {
      const at = simulated(clock.now());
      settle(at);
      if (input_.command !== 'urgent-stop' && input_.expectedProviderRunId !== run?.id) {
        return Object.freeze({
          status: 'rejected',
          code: 'STALE_RUN',
          message: 'Observed run changed.',
          observedAt: clock.now(),
        });
      }
      writeLog.push(`${input_.command}:${input_.operationId}`);
      // A stop clears the run, so the receipt names it from here.
      const controlled = run?.id;
      switch (input_.command) {
        case 'pause': {
          if (run) {
            run.pausedAt ??= at;
          }
          break;
        }
        case 'resume': {
          if (run?.pausedAt !== undefined) {
            run.pausedFor += at - run.pausedAt;
            run.pausedAt = undefined;
          }
          break;
        }
        case 'cancel':
        case 'urgent-stop': {
          setHeater('nozzle', 0, at);
          setHeater('bed', 0, at);
          run = undefined;
          finished = undefined;
          break;
        }
      }
      changed();
      const command = input_.command === 'cancel' || input_.command === 'urgent-stop' ? 'stop' : input_.command;
      return receipt(input_.operationId, command, controlled);
    },
    async reconcile(input_) {
      const stored = commandResults.get(input_.operationId);
      if (!stored || stored.command !== input_.command) {
        return Object.freeze({
          status: 'unknown',
          reason: 'no-correlated-provider-reply',
          observedAt: clock.now(),
        });
      }
      return stored.receipt;
    },
    stillCapture: faults.has('camera-unavailable')
      ? Object.freeze({
          type: 'supported',
          async capture() {
            throw new Error('BAMBU_CAMERA_UNAVAILABLE');
          },
        })
      : Object.freeze({
          type: 'supported',
          async capture() {
            return parseBambuStill(simulatedCameraJpeg, clock.now());
          },
        }),
    async close() {
      closed = true;
      changed();
    },
    async dispose() {
      closed = true;
      changed();
    },
  });

  return Object.freeze({
    session,
    reconnect() {
      closed = false;
      changed();
    },
    uploadedNames: () => Object.freeze([...uploaded.keys()]),
    writes: () => Object.freeze([...writeLog]),
  });
};

const simulatorBindingConfiguration = defineConfiguration({
  id: 'bambu.simulator.binding',
  version: '1.2.0',
  schema: z.object({
    faults: z
      .array(z.enum(['storage-damaged', 'camera-unavailable']))
      .max(2)
      .default([])
      .meta({
        title: 'Simulated faults',
        description: 'Reproduce storage or camera failures without connecting to a physical printer',
      }),
    logicalId: z.string().min(1).max(64),
    speed: z.number().min(1).max(3600).default(1).meta({
      title: 'Demo speed',
      description: 'Simulated seconds per real second, so a long print can be watched in minutes',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

const defineSimulator = (input: Readonly<{ simulator?: BambuSimulator }>) =>
  defineMachine({
    id: 'bambu-simulator',
    name: 'Simulated X1C',
    version: '1.0.0',
    protocolVersion: 1,
    vendor: 'Bambu Lab',
    technologies: ['additive.fff'],
    accepts: bambuAcceptedContainers,
    manifest: { ...bambuX1cManifest, identity: { ...bambuX1cManifest.identity, displayName: 'Simulated X1C' } },
    bindingConfiguration: simulatorBindingConfiguration,
    submissionConfiguration: bambuSubmissionConfiguration,
    settingsConfiguration: bambuSettingsConfiguration,
    async *discover(discoveryInput, runtime) {
      discoveryInput.signal.throwIfAborted();
      const observedAt = runtime.clock.now();
      yield {
        type: 'found',
        candidate: {
          id: 'bambu-simulator',
          name: 'Simulated X1C',
          endpoint: { address: 'simulator.invalid', interface: 'simulator' },
          claimedIdentity: { serial: simulatedSerial, model: 'X1C' },
          observedAt,
          expiresAt: new Date(Date.parse(observedAt) + 5 * 60_000).toISOString(),
        },
      };
    },
    // The product simulator runs on the host's wall clock and reads each upload's plate like the printer.
    async connect(connectInput, runtime) {
      return (
        input.simulator ??
        createBambuSimulator({
          clock: runtime.clock,
          speed: connectInput.configuration.speed,
          faults: connectInput.configuration.faults,
          readArtifact: (read) => runtime.readArtifact(read),
        })
      ).session;
    },
  });

/**
 * Define the simulator provider around one explicit simulator, so a test can read its write ledger.
 *
 * @internal
 * @param input - Optional simulator every connection returns; omitted means one fresh simulator per connection.
 * @returns The `bambu-simulator` provider factory.
 */
export const defineBambuSimulatorMachine = (
  input: Readonly<{ simulator?: BambuSimulator }> = {},
): ReturnType<typeof defineSimulator> => defineSimulator(input);

/** Selectable, explicitly labeled simulated X1C provider (blueprint D10); no sockets, no hardware. @public */
export const bambuSimulatorMachine = defineBambuSimulatorMachine();
