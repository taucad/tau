/* oxlint-disable max-lines -- one session closure owns the link, its report and every facet. */
/**
 * One connected Carvera: polls its status over the framed protocol, reports it component by component, sends
 * declared actions, holds a jog, uploads and plays programs, and halts on stop.
 *
 * @module
 */

import { createHash } from 'node:crypto';

import {
  checkMachineActionAtSend,
  machineManifestOf,
  standardMachineActions,
  standardMachineHolds,
} from '@taucad/runtime/machine';
import type {
  ComponentObservation,
  MachineActionConfirmation,
  MachineActivity,
  MachineActivityStep,
  MachineAlert,
  MachineAvailability,
  MachineCheck,
  MachineClock,
  MachineCommandReceipt,
  MachineComponentValue,
  MachineConnectionRuntime,
  MachineFailure,
  MachineFailureCode,
  MachineHoldCapability,
  MachineJobCapability,
  MachineManifestDefinition,
  MachineNetworkStream,
  MachineObservation,
  MachinePreparation,
  MachineProviderActionInput,
  MachineProviderJobInput,
  MachineReport,
  MachineRun,
  MachineSession,
  MachineState,
  MachineStatus,
} from '@taucad/runtime/machine';
import { createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { z } from 'zod';

import { summarizeCarveraProgram } from '#carvera.gcode.js';
import type { CarveraProgram } from '#carvera.gcode.js';
import {
  carveraFeedOverrideSchema,
  carveraProbeSchema,
  carveraRackTools,
  carveraSpindleOverrideSchema,
  carveraSpindleSchema,
  carveraSubmissionConfiguration,
  carveraToolSchema,
  carveraWorkOffsetSelectSchema,
  carveraWorkOffsetSetSchema,
  carveraWorkOffsets,
} from '#carvera.manifest.js';
import type { CarveraSubmission } from '#carvera.manifest.js';
import {
  carveraCommand,
  carveraFrameType,
  carveraHalt,
  carveraRealtime,
  carveraText,
  carveraUploadPacketSize,
  createCarveraFrameDecoder,
  encodeCarveraFrame,
  escapeCarveraPath,
  parseCarveraDiagnose,
  parseCarveraStatus,
} from '#carvera.protocol.js';
import type { CarveraDiagnose, CarveraFrame, CarveraPosition, CarveraStatus } from '#carvera.protocol.js';

/** What a session needs from its host. @internal */
export type CarveraSessionInput = Readonly<{
  id: string;
  name: string;
  manifest: MachineManifestDefinition;
  clock: MachineClock;
  /** Open the command stream; called again to reconnect after a restart or a dropped link. */
  open: (signal: AbortSignal) => Promise<MachineNetworkStream>;
  readArtifact: MachineConnectionRuntime['readArtifact'];
  log?: MachineConnectionRuntime['log'];
  /** Milliseconds between status polls; the stock controller polls every 300. */
  pollInterval?: number;
  /** Milliseconds to wait for the first status before deciding another app holds the machine. */
  firstStatusWait?: number;
  /**
   * An endpoint a person entered, as `address:port`, that nothing has yet shown to be a Carvera; set only while
   * binding. The first open must get a status from it; otherwise connecting fails, so nothing is bound and nothing
   * dials it again. Reconnecting a bound machine leaves it unset, so silence there reads as another app holding it.
   */
  unprovenEndpoint?: string;
}>;

type Axis = 'x' | 'y' | 'z';
const axisIds: readonly Axis[] = ['x', 'y', 'z'];
const isAxis = (value: string): value is Axis => (axisIds as readonly string[]).includes(value);
const maximumProgramBytes = 32 * 1024 * 1024;
/** Milliseconds an ended run and a finished activity stay in the report. */
const endedRetention = 600_000;
const activityRetention = 30_000;
/** Milliseconds a held jog's segment lasts at full feed: half the declared bound. */
const jogSegment = 150;
/** Milliseconds a start waits for the machine to show the run, refuse the file or halt. */
const startWait = 3000;

/** How many operations a session remembers for repeats and confirmation, oldest forgotten first. */
const retainedOperations = 256;

/**
 * Receipts and confirmations by operation id, forgetting the oldest past {@link retainedOperations}.
 * ponytail: the host escalates anything still unproven after its 180-second window anyway, so a forgotten operation
 * reads `pending` there.
 */
class RecentOperations<Value> extends Map<string, Value> {
  public override set(operationId: string, value: Value): this {
    super.set(operationId, value);
    if (this.size > retainedOperations) {
      const [oldest = ''] = this.keys();
      this.delete(oldest);
    }
    return this;
  }
}

/** What the machine did with a `play`. */
type StartAnswer = Readonly<{ type: 'started' } | { type: 'refused'; message: string } | { type: 'silent' }>;

type Procedure = {
  activityId: string;
  kind: string;
  label: string;
  componentId: string;
  operationId?: string;
  runId?: string;
  steps: Array<{ id: string; label: string; actor: 'machine' | 'person'; phase?: number }>;
  index: number;
  state: MachineActivity['state'];
  started: number;
  busySeen: boolean;
  endedAt?: number;
  message?: string;
  /** Finished when this holds, beside the generic "back to Idle". */
  done?: (status: CarveraStatus) => boolean;
};

type RunTrack = {
  runId: string;
  origin: 'tau' | 'external';
  name?: string;
  lines?: number;
  startedAt: string;
  /** Who paused it from Tau, while it stays paused. */
  pausedBy?: 'person' | 'agent';
  endedBy?: 'cancel' | 'stop';
};

type Upload = {
  bytes: Uint8Array<ArrayBuffer>;
  md5: string;
  resolve: (outcome: 'done' | 'refused') => void;
  reject: (error: Error) => void;
  watchdog?: ReturnType<typeof setTimeout>;
};

/**
 * A failure as the Grbl and Bambu providers throw one: a person-readable message, the code on `code`.
 * @param message - What a person reads.
 * @returns The error to throw.
 */
const unavailable = (message: string): Error & Readonly<{ code: MachineFailureCode }> => {
  const code: MachineFailureCode = 'MACHINE_UNAVAILABLE';
  return Object.assign(new Error(message), { code });
};

/* eslint-disable @typescript-eslint/naming-convention -- keyed by the controller's own state words. */
const statusOf: Readonly<Record<CarveraStatus['state'], MachineStatus>> = {
  Idle: 'ready',
  Run: 'active',
  Home: 'active',
  Wait: 'active',
  Hold: 'held',
  Pause: 'held',
  Tool: 'held',
  Alarm: 'alarm',
  Sleep: 'asleep',
};
/* eslint-enable @typescript-eslint/naming-convention -- the state table ends. */

const machineActor: 'machine' | 'person' = 'machine';

const failure = (code: MachineFailure['code'], message: string): MachineFailure => ({ code, message });

const celsius = (value: number) => {
  const result = createQuantity({
    value,
    unit: 'Cel',
    kind: quantityKinds.temperature,
    space: 'point',
    semanticMode: 'declared-only',
  });
  if (result.status !== 'success') {
    throw new TypeError('CARVERA_INVALID_TEMPERATURE');
  }
  // A report is JSON: absent metadata must be missing, not undefined (a temperature carries no reference).
  const { assumptions, kind, representation, space, unit } = result.value;
  return Object.freeze({
    unit,
    ...(kind ? { kind } : {}),
    space,
    assumptions,
    value,
    ...(representation ? { representation } : {}),
  }) as Quantity;
};

const round = (value: number): number => Math.round(value * 1000) / 1000;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

/**
 * Connect one session. Resolves once the machine answers, or once it is clear another app holds it.
 * @internal
 * @param input - The host services and the stream opener.
 * @returns The facets of the connected machine, which reconnects by itself after a restart or a dropped link.
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one session closure owns the link, the report and the facets
export const connectCarveraSession = async (input: CarveraSessionInput): Promise<MachineSession<CarveraSubmission>> => {
  const { manifest, clock } = input;
  const pollInterval = input.pollInterval ?? 250;
  const firstStatusWait = input.firstStatusWait ?? 3000;
  const sessionLifetime = new AbortController();
  const serialized = machineManifestOf(manifest, carveraSubmissionConfiguration.manifest);
  const travel = Object.fromEntries(
    serialized.axes.map((axis) => [axis.id, axis.travel ?? { min: -Infinity, max: Infinity }]),
  );
  const now = (): number => Date.parse(clock.now());
  const iso = (): string => clock.now();

  let stream: MachineNetworkStream | undefined;
  let connection: MachineReport['connection'] = 'disconnected';
  let status: CarveraStatus | undefined;
  let statusAt = iso();
  let diagnose: CarveraDiagnose | undefined;
  let diagnoseAt = iso();
  let firmware = 'unknown';
  let workOffset = 'G54';
  const offsets = new Map<string, CarveraPosition>();
  let trust: 'homed' | 'kept' | 'lost' | 'unknown' = 'unknown';
  const toolLengths = new Map<number, number>();
  let run: RunTrack | undefined;
  let ended: MachineRun | undefined;
  let endedAt = 0;
  let externalRuns = 0;
  let toolWaits = 0;
  /**
   * Tau's start until its run shows. One the machine did not show within {@link startWait} stays, so a run that appears
   * later is still Tau's, until the machine is seen idle without a run, halts or the link drops.
   */
  let pendingStart:
    | { runId: string; name: string; lines: number; procedure?: Procedure; unconfirmed?: true }
    | undefined;
  /** Drop a start the machine never showed, and end its before-program activity as unknown. */
  const forgetUnconfirmedStart = (): void => {
    const procedure = pendingStart?.unconfirmed === true ? pendingStart.procedure : undefined;
    if (pendingStart?.unconfirmed !== true) {
      return;
    }
    pendingStart = undefined;
    if (procedure?.state === 'in-progress') {
      procedure.state = 'unknown';
      procedure.message = 'The machine did not show the run starting.';
      procedure.endedAt = now();
    }
  };
  const procedures: Procedure[] = [];
  const receipts = new RecentOperations<MachineCommandReceipt>();
  /**
   * Tau's timed spindle run, queued whole on the machine (`M3`, `G4 P<duration>`, `M5`) so it ends there even if Tau
   * goes away; over once a report shows the machine idle after it was busy (or two seconds on), a halt, or Stop.
   */
  let timedSpindle: { sentAt: number; seenBusy: boolean } | undefined;
  const expectations = new RecentOperations<() => MachineActionConfirmation>();
  let upload: Upload | undefined;
  let holding = false;
  const textWaiters = new Set<(line: string) => void>();
  const statusWaiters = new Set<() => void>();
  const watchers = new Set<() => void>();
  let tick = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let activityCount = 0;
  let opening = false;
  let restarting = false;

  /**
   * The status now; read through a call because callbacks assign it.
   * @returns The latest status, if any arrived on this link.
   */
  const latestStatus = (): CarveraStatus | undefined => status;

  const changed = (): void => {
    for (const watcher of watchers) {
      watcher();
    }
    watchers.clear();
  };

  const log = (level: 'debug' | 'error' | 'info' | 'warning', message: string): void => {
    // async-iife: bootstrap -- a log line never holds up the machine.
    void (async () => {
      try {
        await input.log?.({ level, message });
      } catch {
        // Logging is best effort.
      }
    })();
  };

  const write = async (bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
    if (stream === undefined) {
      throw unavailable('The Carvera is not connected.');
    }
    await stream.write(bytes);
  };
  const send = async (...lines: string[]): Promise<void> => {
    // Lines go out one after another, in order.
    await write(new Uint8Array(lines.flatMap((line) => [...carveraCommand(line)])));
  };

  // ───────────────────────────── Incoming ─────────────────────────────

  const procedureFinished = (procedure: Procedure, next: CarveraStatus): void => {
    if (procedure.state !== 'in-progress') {
      return;
    }
    if (next.state === 'Alarm') {
      procedure.state = 'failed';
      procedure.endedAt = now();
      procedure.message = next.halt === undefined ? 'The machine halted.' : carveraHalt(next.halt).label;
      return;
    }
    if (next.state !== 'Idle' || next.atc !== undefined) {
      procedure.busySeen = true;
    }
    if (next.atc !== undefined) {
      const at = procedure.steps.findIndex((step, index) => index >= procedure.index && step.phase === next.atc);
      if (at !== -1) {
        procedure.index = at;
      }
    }
    const idle = next.state === 'Idle' && next.atc === undefined;
    // A procedure ends only after the machine was seen at it, so an earlier idle report never settles it.
    const finished =
      procedure.done === undefined
        ? idle && (procedure.busySeen || now() - procedure.started > 2000)
        : procedure.busySeen && procedure.done(next);
    if (finished) {
      procedure.state = 'succeeded';
      procedure.index = procedure.steps.length;
      procedure.endedAt = now();
    }
  };

  // oxlint-disable-next-line eslint/complexity -- one status updates trust, tools, the run and every activity
  const onStatus = (next: CarveraStatus): void => {
    const previous = status;
    status = next;
    statusAt = iso();
    if (next.state === 'Alarm') {
      trust = trust === 'unknown' ? 'unknown' : 'lost';
      restarting = false;
    } else if (previous?.state === 'Home' && next.state !== 'Home') {
      trust = 'homed';
      restarting = false;
    } else if (restarting && next.state === 'Idle' && next.halt === undefined) {
      // The machine homes as it starts, and a failed homing would have left it in alarm: back at Idle, it homed.
      trust = 'homed';
      restarting = false;
    }
    if (next.tool.active >= 0 && next.atc === undefined && next.state !== 'Alarm') {
      toolLengths.set(next.tool.active, next.tool.lengthOffset);
    }
    if (next.state === 'Tool' && previous?.state !== 'Tool') {
      toolWaits += 1;
    }
    if (timedSpindle !== undefined) {
      const isOver = timedSpindle.seenBusy || now() - timedSpindle.sentAt > 2000;
      if (next.state === 'Alarm' || (next.state === 'Idle' && isOver)) {
        timedSpindle = undefined;
      } else if (next.state !== 'Idle') {
        timedSpindle.seenBusy = true;
      }
    }
    if (
      pendingStart?.unconfirmed === true &&
      next.playing === undefined &&
      ((next.state === 'Idle' && next.atc === undefined) || next.state === 'Alarm')
    ) {
      forgetUnconfirmedStart();
    }
    if (next.playing !== undefined && run === undefined) {
      const startedAt = new Date(now() - next.playing.elapsed * 1000).toISOString();
      if (pendingStart === undefined) {
        externalRuns += 1;
        run = {
          runId: `external-${String(externalRuns)}-${String(now())}`,
          origin: 'external',
          startedAt,
        };
      } else {
        run = {
          runId: pendingStart.runId,
          origin: 'tau',
          name: pendingStart.name,
          lines: pendingStart.lines,
          startedAt,
        };
        pendingStart = undefined;
      }
    } else if (next.playing === undefined && run !== undefined) {
      // Stock firmware never reports the end of a job: the run simply disappears. Read to its end with no halt and
      // not ended from Tau, it completed. ponytail: `P:`'s line is not compared with the program's line count, which
      // skips blank lines; the percentage alone marks the end. Compare lines too if a firmware reports 99 % early.
      const finished = (previous?.playing?.percent ?? 0) >= 99;
      const outcome: MachineRun['state'] =
        run.endedBy === undefined
          ? next.state === 'Alarm' || next.halt !== undefined
            ? 'failed'
            : finished
              ? 'completed'
              : 'unknown'
          : 'cancelled';
      ended = {
        ...runOf(run, previous),
        state: outcome,
        endedAt: iso(),
      };
      endedAt = now();
      run = undefined;
    }
    for (const procedure of procedures) {
      procedureFinished(procedure, next);
    }
    // Each waiter hears one report; one that wants the next adds itself again.
    const waiting = [...statusWaiters];
    statusWaiters.clear();
    for (const waiter of waiting) {
      waiter();
    }
    changed();
  };

  const onText = (text: string): void => {
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const offset = /^\[(G5[4-9]):([-\d.]+),([-\d.]+),([-\d.]+)/u.exec(trimmed);
      if (offset !== null) {
        offsets.set(offset[1]!, { x: Number(offset[2]), y: Number(offset[3]), z: Number(offset[4]) });
      } else if (trimmed.startsWith('[G')) {
        workOffset = /\bG5[4-9]\b/u.exec(trimmed)?.[0] ?? workOffset;
      }
      const version = /version\s*[=:]\s*(\S+)/iu.exec(trimmed)?.[1];
      if (version !== undefined) {
        firmware = version;
      }
      for (const waiter of textWaiters) {
        waiter(trimmed);
      }
    }
  };

  const onFile = async (frame: CarveraFrame): Promise<void> => {
    const current = upload;
    if (current === undefined) {
      return;
    }
    clearTimeout(current.watchdog);
    current.watchdog = setTimeout(() => {
      current.reject(new Error('CARVERA_UPLOAD_SILENT'));
    }, 30_000);
    const packets = Math.max(1, Math.ceil(current.bytes.length / carveraUploadPacketSize));
    if (frame.type === carveraFrameType.fileMd5) {
      await write(encodeCarveraFrame(carveraFrameType.fileMd5, new TextEncoder().encode(current.md5)));
    } else if (frame.type === carveraFrameType.fileView) {
      const view = new Uint8Array(6);
      new DataView(view.buffer).setUint32(0, packets);
      new DataView(view.buffer).setUint16(4, carveraUploadPacketSize);
      await write(encodeCarveraFrame(carveraFrameType.fileView, view));
    } else if (frame.type === carveraFrameType.fileData && frame.payload.length >= 4) {
      const sequence = new DataView(frame.payload.buffer, frame.payload.byteOffset).getUint32(0);
      if (sequence < 1 || sequence > packets) {
        return;
      }
      const chunk = current.bytes.subarray(
        (sequence - 1) * carveraUploadPacketSize,
        sequence * carveraUploadPacketSize,
      );
      const packet = new Uint8Array(4 + chunk.length);
      new DataView(packet.buffer).setUint32(0, sequence);
      packet.set(chunk, 4);
      await write(encodeCarveraFrame(carveraFrameType.fileData, packet));
    } else if (frame.type === carveraFrameType.fileEnd) {
      clearTimeout(current.watchdog);
      current.resolve('done');
    } else if (frame.type === carveraFrameType.fileCancel) {
      clearTimeout(current.watchdog);
      current.resolve('refused');
    }
  };

  const onFrame = async (frame: CarveraFrame): Promise<void> => {
    switch (frame.type) {
      case carveraFrameType.status: {
        const parsed = parseCarveraStatus(carveraText(frame.payload));
        if (parsed !== undefined) {
          onStatus(parsed);
        }
        return;
      }
      case carveraFrameType.diagnose: {
        const parsed = parseCarveraDiagnose(carveraText(frame.payload));
        if (parsed !== undefined) {
          diagnose = parsed;
          diagnoseAt = iso();
          changed();
        }
        return;
      }
      case carveraFrameType.text: {
        onText(carveraText(frame.payload));
        return;
      }
      default: {
        try {
          await onFile(frame);
        } catch (error) {
          upload?.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  };

  // ───────────────────────────── The link ─────────────────────────────

  const dropped = (from: MachineNetworkStream): void => {
    if (stream !== from) {
      return;
    }
    stream = undefined;
    upload?.reject(new Error('CARVERA_LINK_LOST'));
    forgetUnconfirmedStart();
    if (sessionLifetime.signal.aborted || opening) {
      return;
    }
    connection = connection === 'occupied' ? 'occupied' : 'disconnected';
    log('warning', 'The Carvera link dropped; reconnecting.');
    changed();
    scheduleReconnect(2000);
  };

  const read = async (from: MachineNetworkStream): Promise<void> => {
    const decoder = createCarveraFrameDecoder();
    try {
      for await (const chunk of from.readable) {
        for (const frame of decoder.push(chunk)) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- frames are handled in the order they arrived.
          await onFrame(frame);
        }
      }
    } catch {
      // A broken link ends like a closed one.
    }
    for (const waiter of statusWaiters) {
      waiter();
    }
    dropped(from);
  };

  /**
   * Open the link once.
   * @returns The connection it ended in.
   */
  const open = async (): Promise<MachineReport['connection']> => {
    opening = true;
    try {
      await openOnce();
      return connection;
    } finally {
      opening = false;
    }
  };

  const openOnce = async (): Promise<void> => {
    let opened: MachineNetworkStream;
    try {
      opened = await input.open(sessionLifetime.signal);
    } catch (error) {
      connection = status === undefined ? 'unreachable' : 'disconnected';
      log('warning', `The Carvera did not accept the link: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    stream = opened;
    status = undefined;
    const answered = new Promise<void>((resolve) => {
      statusWaiters.add(resolve);
      setTimeout(resolve, firstStatusWait);
    });
    void read(opened);
    // A Carvera speaks only when asked, so the status request goes first; it is the least an unproven endpoint is
    // sent (its type byte is still a realtime byte to a Grbl). The commands wait until a status shows a Carvera.
    try {
      await write(carveraRealtime('?'));
    } catch {
      // The stream ending answers below.
    }
    await answered;
    if (latestStatus() !== undefined) {
      try {
        await send('version', '$G', '$#', 'diagnose');
      } catch {
        // A dropped link is the reader's to handle.
      }
    }
    if (latestStatus() === undefined) {
      // One client at a time: a machine that takes the socket but never answers, or drops it, serves another app.
      connection = 'occupied';
      if (stream === opened) {
        stream = undefined;
        await opened.close().catch(() => undefined);
      }
      changed();
      return;
    }
    connection = 'connected';
    changed();
  };

  const scheduleReconnect = (reconnectDelay: number): void => {
    if (reconnectTimer !== undefined || sessionLifetime.signal.aborted) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      // async-iife: bootstrap -- the timer owns the attempt and schedules the next one itself.
      void (async () => {
        const reached = await open();
        if (reached !== 'connected') {
          scheduleReconnect(reached === 'occupied' ? 5000 : 2000);
        }
      })();
    }, reconnectDelay);
  };

  const pollOnce = async (): Promise<void> => {
    if (stream === undefined || upload !== undefined) {
      return;
    }
    tick += 1;
    await write(carveraRealtime('?'));
    if (tick % 4 === 0) {
      await send('diagnose');
    }
    if (tick % 8 === 2) {
      await send('$G');
    }
    if (tick % 8 === 6) {
      await send('$#');
    }
  };

  // ───────────────────────────── The report ─────────────────────────────

  const origin = (current: CarveraStatus): CarveraPosition => ({
    x: round(current.machine.x - current.work.x),
    y: round(current.machine.y - current.work.y),
    z: round(current.machine.z - current.work.z),
  });

  const runOf = (track: RunTrack, current: CarveraStatus | undefined): MachineRun => {
    const playing = current?.playing;
    const stage =
      track.endedBy === 'cancel'
        ? 'Running the queued moves, then stopping the spindle'
        : current?.state === 'Wait'
          ? 'Finishing queued moves before pausing'
          : playing?.line === 0
            ? 'Before the program'
            : undefined;
    const state: MachineRun['state'] =
      current?.state === 'Pause'
        ? 'paused'
        : current?.state === 'Wait' || track.endedBy === 'cancel'
          ? 'finishing'
          : 'running';
    return {
      runId: track.runId,
      origin: track.origin,
      delivery: 'stored',
      state,
      ...(state === 'paused'
        ? {
            paused:
              track.pausedBy === undefined
                ? { by: 'program', reason: 'Paused by the program or at the machine' }
                : { by: track.pausedBy, reason: 'Paused from Tau' },
          }
        : {}),
      ...(track.name === undefined ? {} : { program: { name: track.name } }),
      startedAt: track.startedAt,
      progress: {
        basis: 'queued',
        ...(playing === undefined
          ? {}
          : { fraction: Math.min(1, Math.max(0, playing.percent / 100)), elapsed: playing.elapsed * 1000 }),
        counters:
          playing === undefined
            ? []
            : [
                {
                  id: 'line',
                  label: 'Line',
                  current: playing.line,
                  ...(track.lines === undefined ? {} : { total: track.lines }),
                },
              ],
      },
      ...(stage === undefined ? {} : { stage }),
    };
  };

  const machineState = (): MachineState => {
    if (status === undefined || connection !== 'connected') {
      return {
        status: 'unknown',
        reason: connection === 'occupied' ? 'Another app holds the machine.' : 'Not connected.',
      };
    }
    const reason =
      status.state === 'Alarm'
        ? status.halt === undefined
          ? 'Halted'
          : `${carveraHalt(status.halt).label} (halt ${String(status.halt)})`
        : status.state === 'Wait'
          ? 'Finishing queued moves before pausing'
          : status.state === 'Tool'
            ? 'Waiting for a person to fit the tool'
            : status.state === 'Sleep'
              ? 'Asleep'
              : undefined;
    return { status: statusOf[status.state], native: status.state, ...(reason === undefined ? {} : { reason }) };
  };

  // oxlint-disable-next-line eslint/complexity -- one observation per component, each with its own unknown case
  const components = (): readonly ComponentObservation[] => {
    const value =
      (componentId: string, group: string, at: string) =>
      (known: MachineComponentValue | undefined, why: string): ComponentObservation =>
        known === undefined
          ? { componentId, group, receivedAt: at, knowledge: 'unknown', reason: why }
          : { componentId, group, receivedAt: at, knowledge: 'known', value: known };
    const current = connection === 'connected' ? status : undefined;
    const sensed = connection === 'connected' ? diagnose : undefined;
    const noStatus = 'The machine has not reported its status.';
    const noDiagnose = 'The machine has not reported its sensors.';
    const rows = [0, ...Array.from({ length: carveraRackTools }, (_, index) => index + 1)].map((number) => {
      const length = toolLengths.get(number);
      return {
        number,
        pocket: number,
        ...(number === 0 ? { description: 'Wireless probe' } : {}),
        ...(length === undefined ? {} : { lengthOffset: round(length) }),
        measured: length !== undefined,
      };
    });
    const offset = current === undefined ? undefined : origin(current);
    return [
      value(
        'controller',
        'state',
        statusAt,
      )(
        current === undefined
          ? undefined
          : {
              kind: 'readings',
              values: [
                { id: 'firmware', label: 'Firmware', value: firmware },
                { id: 'levelling', label: 'Levelling map', value: current.levelling !== undefined },
                ...(current.levelling === undefined
                  ? []
                  : [
                      {
                        id: 'levelling-deviation',
                        label: 'Largest levelling correction (mm)',
                        value: current.levelling,
                      },
                    ]),
              ],
            },
        noStatus,
      ),
      value(
        'motion',
        'position',
        statusAt,
      )(
        current === undefined || offset === undefined
          ? undefined
          : {
              kind: 'motion',
              homed: Object.fromEntries(axisIds.map((axis) => [axis, trust === 'homed' || trust === 'kept'])),
              trust,
              position: {
                machine: { x: round(current.machine.x), y: round(current.machine.y), z: round(current.machine.z) },
                work: { x: round(current.work.x), y: round(current.work.y), z: round(current.work.z) },
              },
              workOffset: {
                id: workOffset,
                revision: `${workOffset}:${String(offset.x)},${String(offset.y)},${String(offset.z)}`,
                origin: { ...offset },
              },
              mode: 'normal',
              feed: current.feed.current,
              limits: [...(sensed?.limits ?? [])],
            },
        noStatus,
      ),
      value(
        'spindle',
        'state',
        statusAt,
      )(
        current?.spindle === undefined
          ? undefined
          : {
              kind: 'spindle',
              mode: current.spindle.current > 0 ? 'clockwise' : 'off',
              commanded: current.spindle.target,
              actual: current.spindle.current,
            },
        noStatus,
      ),
      value(
        'spindle',
        'temperature',
        statusAt,
      )(
        current?.spindle === undefined
          ? undefined
          : {
              kind: 'readings',
              values: [
                { id: 'temperature', label: 'Spindle temperature', value: celsius(current.spindle.temperature) },
              ],
            },
        noStatus,
      ),
      value(
        'tools',
        'tools',
        statusAt,
      )(
        current === undefined
          ? undefined
          : {
              kind: 'tools',
              ...(current.tool.active >= 0 ? { current: current.tool.active } : {}),
              table: {
                revision: `T${String(current.tool.active)}|${rows.map((row) => `${String(row.number)}:${String(row.lengthOffset ?? '-')}`).join(',')}`,
                capacity: carveraRackTools + 1,
                rows,
              },
            },
        noStatus,
      ),
      value(
        'probe',
        'inputs',
        statusAt,
      )(
        current === undefined
          ? undefined
          : {
              kind: 'probe',
              triggered: sensed?.probeTriggered ?? false,
              connected: current.probeVolts !== undefined && current.probeVolts > 0,
              ...(current.probeVolts === undefined
                ? {}
                : {
                    battery: Math.round(Math.min(100, Math.max(0, ((current.probeVolts - 3.3) / (4.2 - 3.3)) * 100))),
                  }),
            },
        noStatus,
      ),
      value(
        'tool-setter',
        'inputs',
        diagnoseAt,
      )(
        sensed === undefined ? undefined : { kind: 'probe', triggered: sensed.toolSetterTriggered, connected: true },
        noDiagnose,
      ),
      value(
        'cover',
        'inputs',
        diagnoseAt,
      )(
        sensed === undefined ? undefined : { kind: 'interlock', state: sensed.coverClosed ? 'safe' : 'unsafe' },
        noDiagnose,
      ),
      value(
        'estop',
        'inputs',
        diagnoseAt,
      )(
        sensed === undefined
          ? undefined
          : { kind: 'interlock', state: sensed.estopPressed || current?.halt === 13 ? 'unsafe' : 'safe' },
        noDiagnose,
      ),
      value(
        'light',
        'accessories',
        diagnoseAt,
      )(sensed === undefined ? undefined : { kind: 'switch', on: sensed.light }, noDiagnose),
      value(
        'vacuum',
        'accessories',
        diagnoseAt,
      )(sensed === undefined ? undefined : { kind: 'switch', on: sensed.vacuum }, noDiagnose),
      value(
        'air',
        'accessories',
        diagnoseAt,
      )(sensed === undefined ? undefined : { kind: 'switch', on: sensed.air }, noDiagnose),
      value(
        'feed-override',
        'state',
        statusAt,
      )(current === undefined ? undefined : { kind: 'level', ratio: current.feed.override / 100 }, noStatus),
      value(
        'spindle-override',
        'state',
        statusAt,
      )(
        current?.spindle === undefined ? undefined : { kind: 'level', ratio: current.spindle.override / 100 },
        noStatus,
      ),
    ];
  };

  const observedActivities = (): readonly MachineActivity[] => {
    const current = status;
    if (current === undefined || connection !== 'connected') {
      return [];
    }
    const tauBusy = procedures.some((procedure) => procedure.state === 'in-progress');
    const observed: MachineActivity[] = [];
    if (current.state === 'Home' && !tauBusy) {
      observed.push({
        activityId: 'homing-observed',
        componentId: 'motion',
        kind: 'homing',
        label: 'Homing',
        state: 'in-progress',
        steps: [{ id: 'home', label: 'Find the home switches', actor: 'machine', state: 'active' }],
      });
    }
    if (current.state === 'Tool') {
      observed.push({
        activityId: `tool-wait-${String(toolWaits)}`,
        componentId: 'tools',
        kind: 'tool-change',
        label: current.tool.target === undefined ? 'Fit the next tool' : `Fit T${String(current.tool.target)}`,
        ...(run === undefined ? {} : { runId: run.runId }),
        state: 'needs-person',
        steps: [
          { id: 'fit', label: 'Fit the tool in the spindle', actor: 'person', state: 'active' },
          { id: 'measure', label: 'Measure it', actor: 'machine', state: 'todo' },
        ],
        awaiting: {
          kind: 'confirmation',
          promptId: `tool-wait-${String(toolWaits)}`,
          label: 'Is the tool fitted?',
          answers: [{ id: 'fitted', label: 'Tool is fitted', role: 'confirm' }],
          effects: ['motion'],
          safety: { authority: 'person', attended: true, interlocks: [] },
        },
      });
    }
    if (current.atc !== undefined && current.playing !== undefined && current.playing.line > 0 && !tauBusy) {
      observed.push({
        activityId: `tool-change-run-${String(current.playing.line)}`,
        componentId: 'tools',
        kind: 'tool-change',
        label: 'Tool change in the program',
        ...(run === undefined ? {} : { runId: run.runId }),
        state: 'in-progress',
        steps: [
          {
            id: 'drop',
            label: 'Drop the tool in its pocket',
            actor: 'machine',
            state: current.atc === 1 ? 'active' : 'done',
          },
          {
            id: 'pick',
            label: 'Pick up the next tool',
            actor: 'machine',
            state: current.atc === 2 ? 'active' : current.atc === 1 ? 'todo' : 'done',
          },
          { id: 'measure', label: 'Measure it', actor: 'machine', state: current.atc === 3 ? 'active' : 'todo' },
        ],
      });
    }
    return observed;
  };

  const activities = (): readonly MachineActivity[] => {
    const cutoff = now() - activityRetention;
    for (let index = procedures.length - 1; index >= 0; index -= 1) {
      const endedTime = procedures[index]?.endedAt;
      if (endedTime !== undefined && endedTime < cutoff) {
        procedures.splice(index, 1);
      }
    }
    const tau = procedures.slice(-8).map((procedure): MachineActivity => {
      const steps = procedure.steps.map(
        (step, index): MachineActivityStep => ({
          id: step.id,
          label: step.label,
          actor: step.actor,
          state:
            index < procedure.index
              ? 'done'
              : index === procedure.index && procedure.state === 'in-progress'
                ? 'active'
                : procedure.state === 'succeeded'
                  ? 'done'
                  : 'todo',
        }),
      );
      return {
        activityId: procedure.activityId,
        componentId: procedure.componentId,
        kind: procedure.kind,
        label: procedure.label,
        ...(procedure.runId === undefined ? {} : { runId: procedure.runId }),
        ...(procedure.operationId === undefined ? {} : { operationId: procedure.operationId }),
        state: procedure.state,
        steps,
        progress: Math.min(1, procedure.index / Math.max(1, procedure.steps.length)),
        ...(procedure.message === undefined ? {} : { message: procedure.message }),
      };
    });
    return [...tau, ...observedActivities()].slice(0, 16);
  };

  const alerts = (): readonly MachineAlert[] => {
    const list: MachineAlert[] = [];
    if (connection === 'occupied') {
      list.push({
        code: 'occupied',
        severity: 'warning',
        message: 'Another app is connected to this Carvera. It serves one app at a time.',
        blocks: 'everything',
        remedies: [
          {
            type: 'person',
            instruction: 'Close the Carvera Controller or Makera Studio, then wait for Tau to reconnect.',
          },
        ],
      });
    }
    const current = connection === 'connected' ? status : undefined;
    if (current?.model.model !== undefined && current.model.model !== 1) {
      list.push({
        code: 'model',
        severity: 'serious',
        message: 'This provider supports the Carvera C1; this machine reports another model.',
        blocks: 'everything',
      });
    }
    if (current?.halt !== undefined) {
      const halt = carveraHalt(current.halt);
      const remedies: MachineAlert['remedies'] = [
        ...(halt.person === undefined ? [] : [{ type: 'person', instruction: halt.person } as const]),
        ...(halt.recovery === 'unlock'
          ? [
              { type: 'action', componentId: 'controller', action: 'controller.unlock' } as const,
              { type: 'action', componentId: 'motion', action: 'motion.home' } as const,
            ]
          : halt.recovery === 'home'
            ? [{ type: 'action', componentId: 'motion', action: 'motion.home' } as const]
            : halt.recovery === 'reset'
              ? [
                  {
                    type: 'person',
                    instruction: 'Restart the machine: hold the main button down. It homes when it starts.',
                  } as const,
                ]
              : [{ type: 'person', instruction: 'Switch the machine off, wait, and switch it on again.' } as const]),
      ];
      list.push({
        code: `H${String(current.halt)}`,
        severity: halt.recovery === 'power-cycle' ? 'fatal' : 'serious',
        message: halt.label,
        blocks: halt.recovery === 'unlock' || halt.recovery === 'home' ? 'motion' : 'everything',
        remedies,
      });
    }
    if (current?.playing !== undefined && diagnose?.coverClosed === false) {
      list.push({
        code: 'cover-open',
        severity: 'warning',
        message: 'The cover is open and the job keeps running: this machine does not stop on an open cover.',
        blocks: 'nothing',
        remedies: [{ type: 'person', instruction: 'Close the cover, or press Stop.' }],
      });
    }
    return list;
  };

  const availability = (): readonly MachineAvailability[] => {
    const current = status;
    if (current === undefined || connection !== 'connected') {
      return [];
    }
    // oxlint-disable-next-line eslint/complexity -- one ordered list of machine-specific blockers
    const blocked = (componentId: string, id: string): MachineAvailability | undefined => {
      if (
        componentId === 'probe' &&
        id === 'probe.run' &&
        !(current.probeVolts !== undefined && current.probeVolts > 0)
      ) {
        return {
          componentId,
          id,
          state: 'unavailable',
          ...failure('MACHINE_ACTION_PRECONDITION_FAILED', 'The wireless probe is not responding.'),
          remedy: { type: 'action', componentId: 'probe', action: 'makera.probe.pair' },
        };
      }
      // The firmware takes no command mid-dwell short of a halt, so the run cannot be switched off early.
      if (id === 'spindle.set' && timedSpindle !== undefined) {
        return {
          componentId,
          id,
          state: 'unavailable',
          ...failure('MACHINE_ACTION_BUSY', 'The spindle is on a timed run and stops by itself when the time is up.'),
          remedy: {
            type: 'stop',
            consequence: 'The Carvera halts and loses its position, so unlock and home it after.',
          },
        };
      }
      if ((id === 'spindle.set' || id === 'tool.measure') && current.tool.active < 1) {
        return {
          componentId,
          id,
          state: 'unavailable',
          ...failure('MACHINE_ACTION_PRECONDITION_FAILED', 'No cutter is in the spindle.'),
          remedy: { type: 'action', componentId: 'tools', action: 'tool.change' },
        };
      }
      if (id === 'controller.unlock' && current.halt !== undefined && carveraHalt(current.halt).recovery !== 'unlock') {
        return {
          componentId,
          id,
          state: 'unavailable',
          ...failure(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            `${carveraHalt(current.halt).label}: unlocking does not clear it.`,
          ),
          remedy: { type: 'person', instruction: 'Restart the machine at its main button, or switch it off and on.' },
        };
      }
      if (id === 'run.resume' && current.state === 'Pause' && (current.spindle?.current ?? 0) === 0) {
        return {
          componentId,
          id,
          state: 'unavailable',
          ...failure(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            'The spindle has stopped; resuming would drive a still cutter into the stock.',
          ),
          remedy: { type: 'person', instruction: 'Start the spindle at the machine before resuming.' },
        };
      }
      if (id === 'run.pause' && current.state === 'Wait') {
        return { componentId, id, state: 'unavailable', ...failure('MACHINE_ACTION_BUSY', 'Already pausing.') };
      }
      if (id === 'interaction.respond' && current.state !== 'Tool') {
        return {
          componentId,
          id,
          state: 'unavailable',
          ...failure('MACHINE_ACTION_PROMPT_STALE', 'Nothing is waiting for an answer.'),
        };
      }
      if (upload !== undefined) {
        return { componentId, id, state: 'unavailable', ...failure('MACHINE_ACTION_BUSY', 'A program is uploading.') };
      }
      return undefined;
    };
    return [...manifest.actions, ...manifest.holds].map(
      (definition) =>
        blocked(definition.componentId, definition.id) ?? {
          componentId: definition.componentId,
          id: definition.id,
          state: 'available',
        },
    );
  };

  const report = (): MachineReport => {
    if (ended !== undefined && now() - endedAt > endedRetention) {
      ended = undefined;
    }
    const current = connection === 'connected' ? status : undefined;
    const checks: MachineCheck[] = [];
    if (current !== undefined) {
      checks.push({
        id: 'homed',
        label: 'Homed',
        state: trust === 'homed' || trust === 'kept' ? 'passed' : 'blocked',
        source: 'observed',
        ...(trust === 'homed' || trust === 'kept'
          ? {}
          : { remedy: { type: 'action', componentId: 'motion', action: 'motion.home' } as const }),
      });
    }
    return {
      connection,
      observedAt: iso(),
      state: machineState(),
      ...(run === undefined ? (ended === undefined ? {} : { run: ended }) : { run: runOf(run, current) }),
      components: components(),
      activities: activities(),
      checks,
      availability: availability(),
      alerts: alerts(),
    };
  };

  // ───────────────────────────── Actions ─────────────────────────────

  const accepted = (
    extra: Readonly<{ activityId?: string; runId?: string; transferId?: string }> = {},
  ): MachineCommandReceipt => ({
    status: 'accepted',
    observedAt: iso(),
    ...extra,
  });
  const rejected = (code: string, message: string): MachineCommandReceipt => ({
    status: 'rejected',
    code,
    message,
    observedAt: iso(),
  });

  const latch = (check: () => MachineActionConfirmation): (() => MachineActionConfirmation) => {
    let settled: MachineActionConfirmation | undefined;
    return () => {
      if (settled === undefined) {
        const answer = check();
        settled = answer.status === 'pending' ? undefined : answer;
      }
      return settled ?? { status: 'pending' };
    };
  };
  const when = (holds: (current: CarveraStatus) => boolean): (() => MachineActionConfirmation) =>
    latch(() => (status !== undefined && holds(status) ? { status: 'confirmed' } : { status: 'pending' }));
  const halted = (): MachineActionConfirmation => ({
    status: 'refuted',
    code: 'MACHINE_ACTION_PROVIDER_REJECTED',
    message: 'The machine halted.',
  });

  const startProcedure = (
    procedure: Omit<Procedure, 'activityId' | 'index' | 'state' | 'started' | 'busySeen'>,
  ): Procedure => {
    activityCount += 1;
    const created: Procedure = {
      ...procedure,
      activityId: `${procedure.kind}-${String(activityCount)}`,
      index: 0,
      state: 'in-progress',
      started: now(),
      busySeen: false,
    };
    procedures.push(created);
    return created;
  };
  const byProcedure = (procedure: Procedure): (() => MachineActionConfirmation) =>
    latch(() =>
      procedure.state === 'succeeded'
        ? { status: 'confirmed' }
        : procedure.state === 'failed'
          ? { status: 'refuted', code: 'MACHINE_ACTION_PROVIDER_REJECTED', message: procedure.message ?? 'It failed.' }
          : { status: 'pending' },
    );

  const inTravel = (target: Readonly<Partial<Record<string, number>>>): boolean =>
    Object.entries(target).every(([axis, value]) => {
      const limits = travel[axis];
      return value !== undefined && limits !== undefined && value >= limits.min && value <= limits.max;
    });

  const word = (axis: string, value: number): string => `${axis.toUpperCase()}${value.toFixed(3)}`;

  type Plan = Readonly<{
    lines: readonly string[];
    confirm: () => MachineActionConfirmation;
    procedure?: Procedure;
    after?(): void;
  }>;

  // oxlint-disable-next-line eslint/complexity -- one switch over the declared actions
  const plan = (action: MachineProviderActionInput, current: CarveraStatus): Plan | MachineCommandReceipt => {
    /**
     * The action's parameters through its schema. A mismatch throws, and `apply` refuses it as invalid.
     * @param schema - The schema the action declares.
     * @returns The parsed parameters.
     */
    const parametersOf = <Schema extends z.ZodType>(schema: Schema): z.output<Schema> =>
      schema.parse(action.parameters);
    /**
     * Switch an accessory and read `diagnose` back for the confirmation.
     * @param key - The accessory, as `diagnose` reports it.
     * @param onCode - The M-code that turns it on.
     * @param offCode - The M-code that turns it off.
     * @returns The lines to send and how the reports confirm them.
     */
    const switchPlan = (key: 'light' | 'vacuum' | 'air', onCode: string, offCode: string): Plan => {
      const wanted = parametersOf(standardMachineActions['switch.set'].schema).on;
      return {
        lines: [wanted ? onCode : offCode, 'diagnose'],
        confirm: latch(() => (diagnose?.[key] === wanted ? { status: 'confirmed' } : { status: 'pending' })),
      };
    };
    switch (`${action.componentId}:${action.action}`) {
      case 'controller:run.pause': {
        return {
          lines: ['suspend'],
          after: () => {
            if (run !== undefined) {
              run.pausedBy = action.requestedBy.kind === 'agent' ? 'agent' : 'person';
            }
          },
          confirm: latch(() =>
            status?.playing === undefined
              ? { status: 'refuted', code: 'MACHINE_ACTION_STALE_RUN', message: 'The run ended.' }
              : status.state === 'Pause' || status.state === 'Wait'
                ? { status: 'confirmed' }
                : { status: 'pending' },
          ),
        };
      }
      case 'controller:run.resume': {
        return {
          lines: ['resume'],
          after: () => {
            if (run !== undefined) {
              delete run.pausedBy;
            }
          },
          confirm: latch(() =>
            status?.playing === undefined
              ? { status: 'refuted', code: 'MACHINE_ACTION_STALE_RUN', message: 'The run ended.' }
              : status.state === 'Run'
                ? { status: 'confirmed' }
                : { status: 'pending' },
          ),
        };
      }
      case 'controller:run.cancel': {
        return {
          lines: ['abort'],
          after: () => {
            if (run !== undefined) {
              run.endedBy = 'cancel';
            }
          },
          confirm: when((next) => next.playing === undefined),
        };
      }
      case 'controller:controller.unlock': {
        return { lines: ['$X'], confirm: when((next) => next.state !== 'Alarm') };
      }
      case 'controller:controller.wake': {
        // The machine restarts and homes; until it has, where it is is not known.
        return {
          lines: ['reset'],
          after: () => {
            trust = 'unknown';
            restarting = true;
          },
          confirm: when((next) => next.state !== 'Sleep'),
        };
      }
      case 'motion:motion.home': {
        const procedure = startProcedure({
          kind: 'homing',
          label: 'Homing',
          componentId: 'motion',
          operationId: action.operationId,
          steps: [
            { id: 'home', label: 'Find the home switches', actor: 'machine' },
            { id: 'back-off', label: 'Back off the switches', actor: 'machine' },
          ],
          done: (next) => next.state === 'Idle' && trust === 'homed',
        });
        return { lines: ['$H'], procedure, confirm: byProcedure(procedure) };
      }
      case 'motion:motion.jog': {
        const { axis, distance, feed } = parametersOf(standardMachineActions['motion.jog'].schema);
        if (!isAxis(axis)) {
          return rejected('MACHINE_ACTION_PARAMETERS_INVALID', `This machine has no ${axis.toUpperCase()} axis.`);
        }
        const target = current.machine[axis] + distance;
        if (!inTravel({ [axis]: target })) {
          return rejected('MACHINE_ACTION_PRECONDITION_FAILED', 'That jog leaves the travel.');
        }
        // Smoothieware's `$J` jogs relative to where the tool is.
        return {
          lines: [`$J ${word(axis, distance)} F${String(Math.round(feed))}`],
          confirm: latch(() =>
            status?.state === 'Alarm'
              ? halted()
              : status?.state === 'Idle' && near(status.machine[axis], target)
                ? { status: 'confirmed' }
                : { status: 'pending' },
          ),
        };
      }
      case 'motion:motion.move': {
        const { frame, position, feed } = parametersOf(standardMachineActions['motion.move'].schema);
        const entries = Object.entries(position);
        const axes = entries.flatMap(([axis, value]) => (isAxis(axis) ? [[axis, value] as const] : []));
        if (axes.length === 0 || axes.length !== entries.length) {
          return rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Give X, Y or Z.');
        }
        const shift = origin(current);
        const target = axes.map(([axis, value]) => [axis, frame === 'machine' ? value : value + shift[axis]] as const);
        if (!inTravel(Object.fromEntries(target))) {
          return rejected('MACHINE_ACTION_PRECONDITION_FAILED', 'That position is outside the travel.');
        }
        const words = axes.map(([axis, value]) => word(axis, value)).join(' ');
        return {
          lines: [
            `${frame === 'machine' ? 'G53 ' : 'G90 '}${feed === undefined ? 'G0' : 'G1'} ${words}${feed === undefined ? '' : ` F${String(Math.round(feed))}`}`,
          ],
          confirm: latch(() => {
            const seen = status;
            return seen?.state === 'Alarm'
              ? halted()
              : seen?.state === 'Idle' && target.every(([axis, value]) => near(seen.machine[axis], value))
                ? { status: 'confirmed' }
                : { status: 'pending' };
          }),
        };
      }
      case 'motion:work-offset.select': {
        const { offset } = parametersOf(carveraWorkOffsetSelectSchema);
        return {
          lines: [offset, '$G'],
          confirm: latch(() =>
            workOffset === offset && status?.state !== 'Alarm' ? { status: 'confirmed' } : { status: 'pending' },
          ),
        };
      }
      case 'motion:work-offset.set': {
        const { offset, position } = parametersOf(carveraWorkOffsetSetSchema);
        const entries = axisIds.flatMap((axis) => {
          const value = position[axis];
          return value === undefined ? [] : [[axis, value] as const];
        });
        if (entries.length === 0) {
          return rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Give X, Y or Z.');
        }
        const index = carveraWorkOffsets.indexOf(offset) + 1;
        const before = JSON.stringify(offsets.get(offset));
        return {
          lines: [`G10 L20 P${String(index)} ${entries.map(([axis, value]) => word(axis, value)).join(' ')}`, '$#'],
          confirm: latch(() => {
            const seen = status;
            return (workOffset === offset &&
              seen !== undefined &&
              entries.every(([axis, value]) => near(seen.work[axis], value))) ||
              JSON.stringify(offsets.get(offset)) !== before
              ? { status: 'confirmed' }
              : { status: 'pending' };
          }),
        };
      }
      case 'probe:probe.run': {
        const { cycle } = parametersOf(carveraProbeSchema);
        const previous = current.tool.active;
        const back = previous >= 1 ? [`M6 T${String(previous)}`] : [];
        // ponytail: corner uses the firmware's `M495.3` cycle with its defaults; the bore cycle's `M480.2` subcode is
        // read from the firmware's M480.1–.10 family and must be confirmed on hardware.
        const cycleLines =
          cycle === 'z-surface'
            ? ['G91 G38.2 Z-30 F150', 'G90', 'G10 L20 P0 Z0', 'G53 G0 Z-3']
            : cycle === 'corner'
              ? ['M495.3', 'G53 G0 Z-3']
              : ['M480.2', 'G53 G0 Z-3'];
        const procedure = startProcedure({
          kind: 'probing',
          label:
            cycle === 'z-surface'
              ? 'Probing the stock top'
              : cycle === 'corner'
                ? 'Probing the stock corner'
                : 'Probing the bore centre',
          componentId: 'probe',
          operationId: action.operationId,
          steps: [
            ...(previous === 0
              ? []
              : [{ id: 'pick-probe', label: 'Pick up the probe (T0)', actor: machineActor, phase: 2 }]),
            { id: 'probe', label: 'Touch off', actor: 'machine' },
            ...(back.length === 0
              ? []
              : [
                  {
                    id: 'put-back',
                    label: `Put T${String(previous)} back in the spindle`,
                    actor: machineActor,
                    phase: 2,
                  },
                ]),
          ],
          done: (next) =>
            next.state === 'Idle' && next.atc === undefined && next.tool.active === (back.length === 0 ? 0 : previous),
        });
        return {
          lines: [...(previous === 0 ? [] : ['M6 T0']), ...cycleLines, ...back],
          procedure,
          confirm: byProcedure(procedure),
        };
      }
      case 'tools:tool.change': {
        const { tool } = parametersOf(carveraToolSchema);
        const previous = current.tool.active;
        const procedure = startProcedure({
          kind: 'tool-change',
          label: `Changing to T${String(tool)}`,
          componentId: 'tools',
          operationId: action.operationId,
          steps: [
            ...(previous >= 0
              ? [{ id: 'drop', label: `Drop T${String(previous)} in its pocket`, actor: machineActor, phase: 1 }]
              : []),
            { id: 'pick', label: `Pick up T${String(tool)}`, actor: 'machine', phase: 2 },
            { id: 'measure', label: 'Measure it on the tool setter', actor: 'machine', phase: 3 },
          ],
          done: (next) => next.state === 'Idle' && next.atc === undefined && next.tool.active === tool,
        });
        return { lines: [`M6 T${String(tool)}`], procedure, confirm: byProcedure(procedure) };
      }
      case 'tool-setter:tool.measure': {
        const procedure = startProcedure({
          kind: 'tool-measure',
          label: `Measuring T${String(current.tool.active)}`,
          componentId: 'tool-setter',
          operationId: action.operationId,
          steps: [
            { id: 'move', label: 'Move over the tool setter', actor: 'machine' },
            { id: 'touch', label: 'Touch off', actor: 'machine', phase: 3 },
          ],
        });
        return { lines: ['M491'], procedure, confirm: byProcedure(procedure) };
      }
      case 'spindle:spindle.set': {
        const spindle = parametersOf(carveraSpindleSchema);
        if (spindle.mode === 'off') {
          return { lines: ['M5'], confirm: when((next) => (next.spindle?.current ?? 0) === 0) };
        }
        const speed = Math.round(spindle.speed);
        const seconds = spindle.duration;
        // The stop is queued behind the dwell, so the spindle stops by itself even if Tau loses the machine (R18).
        return {
          lines: [`M3 S${String(speed)}`, `G4 P${seconds.toFixed(1)}`, 'M5'],
          after: () => {
            timedSpindle = { sentAt: now(), seenBusy: false };
          },
          confirm: when((next) => (next.spindle?.current ?? 0) > 0),
        };
      }
      case 'light:switch.set': {
        return switchPlan('light', 'M821', 'M822');
      }
      case 'vacuum:switch.set': {
        return switchPlan('vacuum', 'M801 S100', 'M802');
      }
      case 'air:switch.set': {
        return switchPlan('air', 'M7', 'M9');
      }
      case 'feed-override:level.set':
      case 'spindle-override:level.set': {
        const feed = action.componentId === 'feed-override';
        const percent = Math.round(
          parametersOf(feed ? carveraFeedOverrideSchema : carveraSpindleOverrideSchema).ratio * 100,
        );
        return {
          lines: [`${feed ? 'M220' : 'M223'} S${String(percent)}`],
          confirm: when(
            (next) => Math.abs((feed ? next.feed.override : (next.spindle?.override ?? -1)) - percent) <= 1,
          ),
        };
      }
      case 'controller:interaction.respond': {
        if (current.state !== 'Tool') {
          return rejected('MACHINE_ACTION_PROMPT_STALE', 'Nothing is waiting for an answer.');
        }
        const { promptId, answer } = parametersOf(standardMachineActions['interaction.respond'].schema);
        if (promptId !== `tool-wait-${String(toolWaits)}` || answer !== 'fitted') {
          return rejected('MACHINE_ACTION_PROMPT_STALE', 'That question is no longer asked.');
        }
        return { lines: ['M490.2'], confirm: when((next) => next.state !== 'Tool') };
      }
      case 'motion:makera.levelling.clear': {
        return { lines: ['M370'], confirm: when((next) => next.levelling === undefined) };
      }
      default: {
        return rejected('MACHINE_ACTION_UNDECLARED', `${action.componentId} does not declare ${action.action}.`);
      }
    }
  };

  /**
   * Wait for the machine to answer a `play`: the run appears, the machine refuses the file in text or halts, or it
   * says nothing within {@link startWait}.
   * @param runId - The run the start names.
   * @param signal - Ends the wait as silent.
   * @returns What the machine did.
   */
  const startAnswer = async (runId: string, signal: AbortSignal): Promise<StartAnswer> =>
    new Promise((resolve) => {
      const finish = (answer: StartAnswer): void => {
        textWaiters.delete(onLine);
        statusWaiters.delete(onReport);
        clearTimeout(timer);
        signal.removeEventListener('abort', silent);
        resolve(answer);
      };
      const onLine = (line: string): void => {
        if (/File not found|Currently printing/iu.test(line)) {
          finish({ type: 'refused', message: `The machine refused the program: ${line}` });
        }
      };
      const onReport = (): void => {
        const current = status;
        if (run?.runId === runId || ended?.runId === runId) {
          finish({ type: 'started' });
        } else if (current?.state === 'Alarm') {
          finish({
            type: 'refused',
            message: current.halt === undefined ? 'The machine halted.' : carveraHalt(current.halt).label,
          });
        } else {
          // Status waiters are called once; listen for the next report.
          statusWaiters.add(onReport);
        }
      };
      const silent = (): void => {
        finish({ type: 'silent' });
      };
      const timer = setTimeout(silent, startWait);
      textWaiters.add(onLine);
      statusWaiters.add(onReport);
      signal.addEventListener('abort', silent, { once: true });
      if (signal.aborted) {
        silent();
      }
    });

  /**
   * The host's own admission check, repeated over this session's latest report at the moment of sending: connection,
   * declaration, availability, state, run, freshness, homing and interlocks. Qualification, authority and attendance
   * were the host's to decide and pass here.
   * @param target - The control, which list it is in, and the run the caller saw.
   * @returns The refusal, or undefined to send.
   */
  const admission = (
    target: Readonly<{
      componentId: string;
      action: string;
      kind: 'action' | 'hold';
      // oxlint-disable-next-line typescript/no-restricted-types -- null is the caller's statement that it saw no run.
      expectedRunId: string | null;
    }>,
  ): MachineFailure | undefined => {
    const refused = checkMachineActionAtSend({
      name: 'The Carvera',
      capabilities: serialized,
      report: report(),
      observations: serialized.observations,
      ...target,
      now: now(),
    });
    return refused === undefined ? undefined : failure(refused.code, refused.message);
  };

  const interlocked = (interlocks: readonly string[]): string | undefined =>
    interlocks.find((interlock) =>
      interlock === 'cover'
        ? diagnose?.coverClosed !== true
        : interlock === 'estop'
          ? diagnose === undefined || diagnose.estopPressed
          : false,
    );

  const waitForText = async (pattern: RegExp, signal: AbortSignal, waitLimit: number): Promise<string | undefined> =>
    new Promise((resolve) => {
      const finish = (line: string | undefined): void => {
        textWaiters.delete(listener);
        clearTimeout(timer);
        signal.removeEventListener('abort', aborted);
        resolve(line);
      };
      const listener = (line: string): void => {
        if (pattern.test(line)) {
          finish(line);
        }
      };
      const aborted = (): void => {
        finish(undefined);
      };
      const timer = setTimeout(aborted, waitLimit);
      textWaiters.add(listener);
      signal.addEventListener('abort', aborted, { once: true });
    });

  // oxlint-disable-next-line eslint/complexity -- the admission checks repeated at the moment of sending, in order
  const apply = async (action: MachineProviderActionInput): Promise<MachineCommandReceipt> => {
    const previous = receipts.get(action.operationId);
    if (previous !== undefined) {
      return previous;
    }
    const current = status;
    const settle = (receipt: MachineCommandReceipt): MachineCommandReceipt => {
      receipts.set(action.operationId, receipt);
      changed();
      return receipt;
    };
    const refusal = admission({ ...action, kind: 'action' });
    if (refusal !== undefined) {
      return settle(rejected(refusal.code, refusal.message));
    }
    if (current === undefined || stream === undefined) {
      return settle(rejected('MACHINE_UNAVAILABLE', 'The Carvera is not connected.'));
    }
    if (action.action === 'makera.probe.pair') {
      try {
        const reply = waitForText(/PAIR (?:SUCCESS|FAIL)/iu, action.signal, 15_000);
        await send('M471');
        const line = await reply;
        return settle(
          line === undefined
            ? { status: 'unknown', reason: 'The machine did not say whether the probe paired.', observedAt: iso() }
            : /SUCCESS/iu.test(line)
              ? accepted()
              : rejected(
                  'MACHINE_ACTION_PROVIDER_REJECTED',
                  'The probe did not pair. Hold it near the spindle and try again.',
                ),
        );
      } catch {
        return settle({ status: 'unknown', reason: 'The link dropped while pairing.', observedAt: iso() });
      }
    }
    let planned: Plan | MachineCommandReceipt;
    try {
      planned = plan(action, current);
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        throw error;
      }
      return settle(rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Some values are not valid for this control.'));
    }
    if ('status' in planned) {
      return settle(planned);
    }
    try {
      await send(...planned.lines);
    } catch {
      if (planned.procedure !== undefined) {
        planned.procedure.state = 'unknown';
      }
      return settle({ status: 'unknown', reason: 'The link dropped while sending.', observedAt: iso() });
    }
    planned.after?.();
    expectations.set(action.operationId, planned.confirm);
    log('info', `Sent ${action.componentId} ${action.action}.`);
    return settle(accepted(planned.procedure === undefined ? {} : { activityId: planned.procedure.activityId }));
  };

  // ───────────────────────────── Holds ─────────────────────────────

  const holdsFacet: MachineHoldCapability = {
    type: 'supported',
    async begin(hold) {
      const parsed = standardMachineHolds['motion.jog'].schema.safeParse(hold.parameters);
      if (!parsed.success) {
        return failure('MACHINE_ACTION_PARAMETERS_INVALID', 'Some values are not valid for this control.');
      }
      const { axis, direction } = parsed.data;
      const refusal = admission({
        componentId: hold.componentId,
        action: hold.hold,
        kind: 'hold',
        expectedRunId: null,
      });
      if (refusal !== undefined) {
        return refusal;
      }
      const current = status;
      if (current === undefined || stream === undefined) {
        return failure('MACHINE_UNAVAILABLE', 'The Carvera is not connected.');
      }
      if (current.playing !== undefined || holding) {
        return failure('MACHINE_ACTION_PRECONDITION_FAILED', 'The machine must be idle to jog.');
      }
      const limits = travel[axis];
      if (!isAxis(axis) || limits === undefined) {
        return failure('MACHINE_ACTION_PARAMETERS_INVALID', `This machine has no ${axis.toUpperCase()} axis.`);
      }
      const feed = Math.min(parsed.data.feed, 3000);
      const segment = (feed / 60_000) * jogSegment;
      let target = current.machine[axis];
      let released = false;
      holding = true;
      const next = async (): Promise<void> => {
        const reported = status?.machine[axis];
        if (released || reported === undefined || Math.abs(target - reported) > segment / 2) {
          return;
        }
        const goal = Math.min(limits.max, Math.max(limits.min, target + direction * segment));
        if (Math.abs(goal - target) < 0.001) {
          return;
        }
        await send(`$J ${word(axis, goal - target)} F${String(Math.round(feed))}`);
        target = goal;
      };
      try {
        await next();
      } catch {
        holding = false;
        return failure('MACHINE_UNAVAILABLE', 'The link dropped.');
      }
      return {
        async extend() {
          await write(carveraRealtime('?'));
          await next();
        },
        async release() {
          released = true;
          holding = false;
          // Nothing more is sent; what is queued ends by itself within one segment and a half.
          return accepted();
        },
      };
    },
  };

  // ───────────────────────────── Jobs ─────────────────────────────

  const readProgram = async (job: MachineProviderJobInput<CarveraSubmission>): Promise<Uint8Array<ArrayBuffer>> => {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let length = 0;
    for await (const chunk of input.readArtifact({
      artifact: job.artifact,
      maximumBytes: maximumProgramBytes,
      signal: job.signal,
    })) {
      chunks.push(chunk);
      length += chunk.length;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  };

  const remoteNameOf = (job: MachineProviderJobInput<CarveraSubmission>): string => {
    const base = (job.artifact.path.split('/').at(-1) ?? 'program')
      .replace(/\.[^.]*$/u, '')
      .replaceAll(/[^A-Za-z0-9_-]/gu, '_')
      .slice(0, 48);
    const digest = String(job.artifact.digest).replace(/^.*:/u, '').slice(0, 8);
    return `/sd/gcodes/${base || 'program'}-${digest}.nc`;
  };

  // oxlint-disable-next-line eslint/complexity -- one ordered list of start checks
  const checksFor = (program: CarveraProgram, configuration: CarveraSubmission): MachineCheck[] => {
    const current = connection === 'connected' ? status : undefined;
    const checks: MachineCheck[] = [];
    const add = (check: MachineCheck): void => {
      checks.push(check);
    };
    add({
      id: 'idle',
      label: 'The machine is idle',
      state:
        current === undefined
          ? 'unknown'
          : current.state === 'Idle' && current.playing === undefined
            ? 'passed'
            : 'blocked',
      source: 'observed',
      ...(current === undefined ? {} : { detail: `The machine is ${current.state}.` }),
    });
    add({
      id: 'homed',
      label: 'Homed since it started',
      state: trust === 'homed' || trust === 'kept' ? 'passed' : 'blocked',
      source: 'observed',
      detail: 'The machine refuses to play a program before homing.',
      ...(trust === 'homed' || trust === 'kept'
        ? {}
        : { remedy: { type: 'action', componentId: 'motion', action: 'motion.home' } as const }),
    });
    add({
      id: 'cover',
      label: 'Cover closed',
      state: diagnose === undefined ? 'unknown' : diagnose.coverClosed ? 'passed' : 'blocked',
      source: 'observed',
      detail: 'This machine does not stop on an open cover, so Tau starts only with it closed.',
      ...(diagnose?.coverClosed === true
        ? {}
        : { remedy: { type: 'person', instruction: 'Close the enclosure cover.' } as const }),
    });
    add({
      id: 'estop',
      label: 'Emergency stop released',
      state: diagnose === undefined ? 'unknown' : diagnose.estopPressed ? 'blocked' : 'passed',
      source: 'observed',
      ...(diagnose?.estopPressed === true
        ? { remedy: { type: 'person', instruction: 'Twist the emergency stop to release it.' } as const }
        : {}),
    });
    const outside = program.tools.filter((tool) => tool < 0 || tool > carveraRackTools);
    add({
      id: 'rack',
      label: 'Every tool is in the rack',
      state: outside.length > 0 ? 'blocked' : 'passed',
      source: 'computed',
      detail:
        outside.length > 0
          ? `The changer holds T1–T${String(carveraRackTools)}; the program asks for ${outside.map((tool) => `T${String(tool)}`).join(', ')}.`
          : program.tools.length === 0
            ? 'The program changes no tools; it runs with the tool in the spindle.'
            : `The program uses ${program.tools.map((tool) => `T${String(tool)}`).join(', ')}. Which cutter sits in each pocket is your word.`,
    });
    add({
      id: 'line-length',
      label: 'Every line fits the machine',
      state: program.longLines.length === 0 ? 'passed' : 'blocked',
      source: 'computed',
      ...(program.longLines.length === 0
        ? {}
        : {
            detail: `The machine silently skips lines over 128 characters: line ${program.longLines.slice(0, 5).join(', ')}.`,
          }),
    });
    const offset = offsets.get(configuration.workOffset);
    const { x: xExtent, y: yExtent } = program.extents;
    const xy = xExtent === undefined || yExtent === undefined ? undefined : { x: xExtent, y: yExtent };
    if (offset === undefined || xy === undefined) {
      add({
        id: 'travel',
        label: 'The program stays inside the travel',
        state: 'unknown',
        source: 'computed',
        detail:
          offset === undefined
            ? `${configuration.workOffset} has not been read from the machine yet.`
            : 'The program has no X/Y moves.',
      });
    } else {
      const reach = (axis: 'x' | 'y'): Readonly<{ min: number; max: number }> => ({
        min: xy[axis].min + offset[axis],
        max: xy[axis].max + offset[axis],
      });
      const fits = (['x', 'y'] as const).every(
        (axis) => inTravel({ [axis]: reach(axis).min }) && inTravel({ [axis]: reach(axis).max }),
      );
      add({
        id: 'travel',
        label: 'The program stays inside the travel',
        state: fits ? 'passed' : 'blocked',
        source: 'computed',
        detail: fits
          ? `In ${configuration.workOffset}, X and Y stay inside the machine's soft limits. Z depends on each tool's length.`
          : `In ${configuration.workOffset}, the program reaches past the soft limits; the machine would halt.`,
        ...(fits ? {} : { remedy: { type: 'action', componentId: 'motion', action: 'work-offset.set' } as const }),
      });
    }
    if (configuration.probeZ || configuration.level.enabled) {
      const connected = current?.probeVolts !== undefined && current.probeVolts > 0;
      add({
        id: 'probe',
        label: 'The wireless probe answers',
        state: current === undefined ? 'unknown' : connected ? 'passed' : 'blocked',
        source: 'observed',
        ...(connected
          ? {}
          : { remedy: { type: 'action', componentId: 'probe', action: 'makera.probe.pair' } as const }),
      });
    }
    return checks;
  };

  const jobsFacet: MachineJobCapability<CarveraSubmission> = {
    type: 'supported',
    delivery: 'stored',
    async completeConfiguration({ configuration }) {
      // Of the start form, only the work offset is the machine's to say: the one it uses now. The rest have defaults.
      const given =
        typeof configuration === 'object' && configuration !== null && !Array.isArray(configuration)
          ? configuration
          : {};
      return { workOffset, ...given };
    },
    async prepare(job): Promise<MachinePreparation> {
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await readProgram(job);
      } catch {
        return {
          status: 'refused',
          code: 'MACHINE_JOB_UNSUPPORTED',
          message: 'The program could not be read.',
          observedAt: iso(),
        };
      }
      const program = summarizeCarveraProgram(new TextDecoder().decode(bytes));
      if (program.lines === 0) {
        return {
          status: 'refused',
          code: 'MACHINE_JOB_UNSUPPORTED',
          message: 'The program is empty.',
          observedAt: iso(),
        };
      }
      const checks = checksFor(program, job.configuration);
      const name = job.artifact.path.split('/').at(-1) ?? 'program';
      const { x, y } = program.extents;
      const firstTool = program.tools.find((tool) => tool >= 1);
      const offset = offsets.get(job.configuration.workOffset);
      return {
        status: checks.some((check) => check.state === 'blocked') ? 'blocked' : 'ready',
        program: {
          name,
          estimatedDuration: program.estimatedDuration,
          facts: {
            process: 'milling',
            lines: program.lines,
            extents: program.extents,
            tools: program.tools.map((number) => ({ number })),
            ...(program.spindleSpeed === undefined ? {} : { spindleSpeed: program.spindleSpeed }),
            ...(program.maximumFeed === undefined ? {} : { maximumFeed: program.maximumFeed }),
            workOffsets: program.workOffsets,
            uses: program.uses,
          },
        },
        checks,
        setup: {
          workOffset: job.configuration.workOffset,
          origin: offset === undefined ? null : { x: offset.x, y: offset.y, z: offset.z },
        },
        remoteName: remoteNameOf(job),
        parser: { id: 'carvera.gcode', version: '1' },
        providerData: {
          lines: program.lines,
          ...(x === undefined || y === undefined
            ? {}
            : { bounds: { xmin: round(x.min), ymin: round(y.min), xmax: round(x.max), ymax: round(y.max) } }),
          ...(firstTool === undefined ? {} : { firstTool }),
        },
        observedAt: iso(),
      };
    },
    async transfer(job) {
      const previous = receipts.get(job.operationId);
      if (previous !== undefined) {
        return previous;
      }
      const settle = (receipt: MachineCommandReceipt): MachineCommandReceipt => {
        receipts.set(job.operationId, receipt);
        changed();
        return receipt;
      };
      if (job.remoteName !== remoteNameOf(job)) {
        return settle(rejected('MACHINE_TRANSFER_NAME_MISMATCH', 'That file name was not prepared for this program.'));
      }
      if (connection !== 'connected' || status === undefined || stream === undefined) {
        return settle(rejected('MACHINE_UNAVAILABLE', 'The Carvera is not connected.'));
      }
      if (status.state !== 'Idle' || status.playing !== undefined || upload !== undefined) {
        return settle(rejected('MACHINE_ACTION_BUSY', 'The machine takes a program only while idle.'));
      }
      const bytes = await readProgram(job);
      const md5 = createHash('md5').update(bytes).digest('hex');
      let started: Upload | undefined;
      const outcome = await new Promise<'done' | 'refused' | Error>((resolve) => {
        started = {
          bytes,
          md5,
          resolve,
          reject: resolve,
          watchdog: setTimeout(() => {
            resolve(new Error('CARVERA_UPLOAD_SILENT'));
          }, 30_000),
        };
        upload = started;
        send(`upload ${escapeCarveraPath(job.remoteName)}`).catch((error: unknown) => {
          resolve(error instanceof Error ? error : new Error(String(error)));
        });
      });
      clearTimeout(started?.watchdog);
      upload = undefined;
      if (outcome instanceof Error) {
        return settle({
          status: 'unknown',
          reason: 'The upload stopped part way; the file on the machine may be incomplete.',
          observedAt: iso(),
        });
      }
      if (outcome === 'refused') {
        return settle(
          rejected('MACHINE_TRANSFER_REFUSED', 'The machine refused the upload, or the bytes arrived damaged.'),
        );
      }
      // The machine stores the MD5 we sent beside the file; reading it back proves the bytes it holds.
      const reply = waitForText(/\b[0-9a-f]{32}\b/iu, job.signal, 10_000);
      await send(`md5sum ${escapeCarveraPath(job.remoteName)}`).catch(() => undefined);
      const line = await reply;
      const held = line === undefined ? undefined : /\b([0-9a-f]{32})\b/iu.exec(line)?.[1]?.toLowerCase();
      if (held === undefined) {
        return settle({
          status: 'unknown',
          reason: 'The machine did not report the uploaded file’s MD5.',
          observedAt: iso(),
        });
      }
      if (held !== md5) {
        return settle(rejected('MACHINE_TRANSFER_CORRUPT', 'The file on the machine differs from the program.'));
      }
      return settle(accepted({ transferId: `${job.remoteName}@${md5}` }));
    },
    // oxlint-disable-next-line eslint/complexity -- start checks, then the Config and Run lines
    async start(job) {
      const previous = receipts.get(job.operationId);
      if (previous !== undefined) {
        return previous;
      }
      const settle = (receipt: MachineCommandReceipt): MachineCommandReceipt => {
        receipts.set(job.operationId, receipt);
        changed();
        return receipt;
      };
      if (job.remoteName !== remoteNameOf(job)) {
        return settle(rejected('MACHINE_JOB_NAME_MISMATCH', 'That file name was not prepared for this program.'));
      }
      const current = status;
      if (connection !== 'connected' || current === undefined || stream === undefined) {
        return settle(rejected('MACHINE_UNAVAILABLE', 'The Carvera is not connected.'));
      }
      if (current.state !== 'Idle' || current.playing !== undefined || upload !== undefined) {
        return settle(rejected('MACHINE_ACTION_BUSY', 'The machine is busy.'));
      }
      const blocker = interlocked(['cover', 'estop']);
      if (blocker !== undefined) {
        return settle(
          rejected(
            'MACHINE_ACTION_INTERLOCK',
            `The ${blocker === 'cover' ? 'cover is open' : 'emergency stop is pressed'}.`,
          ),
        );
      }
      if (trust !== 'homed' && trust !== 'kept') {
        return settle(
          rejected('MACHINE_ACTION_PRECONDITION_FAILED', 'Home first: the machine refuses to play before homing.'),
        );
      }
      const data = (job.providerData ?? {}) as Readonly<{
        lines?: number;
        bounds?: Readonly<{ xmin: number; ymin: number; xmax: number; ymax: number }>;
        firstTool?: number;
      }>;
      const options = job.configuration;
      const { bounds } = data;
      const probing = options.probeZ || options.level.enabled;
      const automation =
        bounds !== undefined && (options.scanMargin || probing)
          ? [
              `M495 X${bounds.xmin.toFixed(3)} Y${bounds.ymin.toFixed(3)}`,
              ...(options.scanMargin ? [` C${bounds.xmax.toFixed(3)} D${bounds.ymax.toFixed(3)}`] : []),
              ...(options.probeZ ? [' O5 F5'] : []),
              ...(options.level.enabled
                ? [
                    ` A${(bounds.xmax - bounds.xmin).toFixed(3)} B${(bounds.ymax - bounds.ymin).toFixed(3)} I${String(options.level.columns)} J${String(options.level.rows)} H${options.level.lift.toFixed(1)}`,
                  ]
                : []),
            ].join('')
          : undefined;
      const returnTool = current.tool.active >= 1 ? current.tool.active : data.firstTool;
      const lines = [
        `buffer ${options.workOffset}`,
        ...(automation === undefined ? [] : [`buffer ${automation}`]),
        ...(automation !== undefined && probing && returnTool !== undefined
          ? [`buffer M6 T${String(returnTool)}`]
          : []),
        `play ${escapeCarveraPath(job.remoteName)}`,
      ];
      const runId = `tau-${job.operationId}`;
      const procedure =
        automation === undefined
          ? undefined
          : startProcedure({
              kind: 'before-program',
              label: 'Before the program',
              componentId: 'controller',
              operationId: job.operationId,
              runId,
              steps: [
                ...(options.scanMargin
                  ? [{ id: 'margin', label: 'Trace the outline (watch it)', actor: machineActor, phase: 4 }]
                  : []),
                ...(probing ? [{ id: 'pick-probe', label: 'Pick up the probe', actor: machineActor, phase: 2 }] : []),
                ...(options.probeZ
                  ? [{ id: 'probe-z', label: 'Probe the stock top', actor: machineActor, phase: 5 }]
                  : []),
                ...(options.level.enabled
                  ? [{ id: 'level', label: 'Level the surface', actor: machineActor, phase: 6 }]
                  : []),
                ...(probing && returnTool !== undefined
                  ? [
                      {
                        id: 'return-tool',
                        label: `Put T${String(returnTool)} back in the spindle`,
                        actor: machineActor,
                        phase: 2,
                      },
                    ]
                  : []),
              ],
              // The file waits while the machine runs these; its first line marks the end.
              done: (next) => (next.playing?.line ?? 0) > 0,
            });
      const pending: NonNullable<typeof pendingStart> = {
        runId,
        name: job.remoteName.split('/').at(-1) ?? job.remoteName,
        lines: data.lines ?? 0,
        ...(procedure === undefined ? {} : { procedure }),
      };
      pendingStart = pending;
      // Listen before sending: the machine refuses a `play` only in text, or halts with 15 when not homed.
      const listening = new AbortController();
      const answer = startAnswer(runId, AbortSignal.any([job.signal, listening.signal]));
      /**
       * Forget the start, so the next run that appears is not taken for Tau's.
       * @param state - What the before-program activity became.
       * @param message - Why.
       */
      const abandon = (state: 'failed' | 'unknown', message: string): void => {
        if (pendingStart?.runId === runId) {
          pendingStart = undefined;
        }
        if (procedure?.state === 'in-progress') {
          procedure.state = state;
          procedure.message = message;
          procedure.endedAt = now();
        }
      };
      try {
        await send(...lines);
      } catch {
        listening.abort();
        await answer;
        abandon('unknown', 'The link dropped while starting.');
        return settle({ status: 'unknown', reason: 'The link dropped while starting.', runId, observedAt: iso() });
      }
      const outcome = await answer;
      if (outcome.type === 'refused') {
        abandon('failed', outcome.message);
        return settle(rejected('MACHINE_JOB_START_REFUSED', outcome.message));
      }
      if (outcome.type === 'silent') {
        // Not refused: a run that shows later is still this one, until the machine is seen idle without it.
        const reason = 'The machine did not show the run starting.';
        // The run may have shown, and taken the start, while the answer was awaited.
        if (pendingStart === pending) {
          pending.unconfirmed = true;
        }
        return settle({ status: 'unknown', reason, runId, observedAt: iso() });
      }
      log('info', `Started ${job.remoteName}.`);
      return settle(accepted({ runId, ...(procedure === undefined ? {} : { activityId: procedure.activityId }) }));
    },
  };

  // ───────────────────────────── Session ─────────────────────────────

  const reached = await open();
  if (reached !== 'connected' && input.unprovenEndpoint !== undefined) {
    sessionLifetime.abort();
    throw unavailable(
      `No Carvera answered at ${input.unprovenEndpoint}. Check the address, and that no other app holds the machine.`,
    );
  }
  if (reached === 'unreachable') {
    sessionLifetime.abort();
    throw unavailable('The Carvera did not answer. Check it is on and on this network.');
  }
  if (reached !== 'connected') {
    scheduleReconnect(5000);
  }
  const poll = setInterval(() => {
    // async-iife: bootstrap -- a failed poll is a dropped link, which the reader already handles.
    void (async () => {
      try {
        await pollOnce();
      } catch {
        // The link dropped.
      }
    })();
  }, pollInterval);

  const shutDown = async (): Promise<void> => {
    if (sessionLifetime.signal.aborted) {
      return;
    }
    sessionLifetime.abort();
    clearInterval(poll);
    clearTimeout(reconnectTimer);
    const open = stream;
    stream = undefined;
    connection = 'disconnected';
    changed();
    await open?.close().catch(() => undefined);
  };

  return {
    async getDescriptor() {
      const installed = serialized;
      return {
        id: input.id,
        name: input.name,
        vendor: 'Makera',
        model: status?.model.model === 2 ? 'Carvera Air' : 'Carvera C1',
        firmware,
        capabilities: {
          connection: installed.connection,
          axes: installed.axes,
          components: installed.components,
          processes: installed.processes,
          actions: installed.actions,
          holds: installed.holds,
          jobs: installed.jobs,
          stop: installed.stop,
        },
      };
    },
    async getSnapshot() {
      return report();
    },
    async *observe({ signal }): AsyncIterable<MachineObservation> {
      yield { type: 'snapshot', snapshot: report() };
      const ended = (): boolean => signal.aborted || sessionLifetime.signal.aborted;
      while (!ended()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one report per change, in order.
        await new Promise<void>((resolve) => {
          const wake = (): void => {
            watchers.delete(wake);
            signal.removeEventListener('abort', wake);
            sessionLifetime.signal.removeEventListener('abort', wake);
            resolve();
          };
          watchers.add(wake);
          signal.addEventListener('abort', wake, { once: true });
          sessionLifetime.signal.addEventListener('abort', wake, { once: true });
        });
        if (ended()) {
          return;
        }
        yield { type: 'snapshot', snapshot: report() };
      }
    },
    async stop({ operationId }) {
      const previous = receipts.get(operationId);
      if (previous !== undefined) {
        return previous;
      }
      if (stream === undefined) {
        const receipt: MachineCommandReceipt = {
          status: 'unknown',
          reason: 'The Carvera is not connected.',
          observedAt: iso(),
        };
        receipts.set(operationId, receipt);
        return receipt;
      }
      if (run !== undefined) {
        run.endedBy = 'stop';
      }
      upload?.reject(new Error('CARVERA_STOPPED'));
      timedSpindle = undefined;
      try {
        // The realtime halt: motion stops at once and the machine needs unlocking and homing.
        await write(carveraRealtime('\u0018'));
      } catch {
        const receipt: MachineCommandReceipt = {
          status: 'unknown',
          reason: 'The link dropped while stopping.',
          observedAt: iso(),
        };
        receipts.set(operationId, receipt);
        return receipt;
      }
      for (const procedure of procedures) {
        if (procedure.state === 'in-progress') {
          procedure.state = 'failed';
          procedure.message = 'Stopped from Tau.';
          procedure.endedAt = now();
        }
      }
      const receipt = accepted();
      receipts.set(operationId, receipt);
      changed();
      return receipt;
    },
    actions: {
      type: 'supported',
      apply,
      confirm(action) {
        // An operation this session never sent stays pending: the host escalates it for a person to reconcile.
        return expectations.get(action.operationId)?.() ?? { status: 'pending' };
      },
    },
    holds: holdsFacet,
    jobs: jobsFacet,
    stillCapture: { type: 'unsupported' },
    async reconcile({ operationId, kind }) {
      const receipt = receipts.get(operationId);
      if (receipt !== undefined) {
        return receipt;
      }
      if (kind === 'start' && (run?.runId === `tau-${operationId}` || ended?.runId === `tau-${operationId}`)) {
        return accepted({ runId: `tau-${operationId}` });
      }
      return { status: 'unknown', reason: 'This session holds no record of that operation.', observedAt: iso() };
    },
    close: shutDown,
    dispose: shutDown,
  };
};
