/**
 * One connected Grbl 1.1 controller behind the machine session ABI (version 2): it polls status reports, streams
 * lines by character counting, runs the person-assisted procedures Grbl has no notion of (touch-plate probing, bit
 * changes) and keeps feeding a job for as long as it runs.
 *
 * Stop follows UGS: feed hold, wait until the machine has stopped, then reset, so the position is kept. A reset
 * while moving loses it (alarm 3).
 *
 * @module
 */

import { checkMachineActionAtSend, standardMachineActions, standardMachineHolds } from '@taucad/runtime/machine';
import type {
  MachineActionConfirmation,
  MachineActivity,
  MachineActivityStep,
  MachineArtifactReference,
  MachineCheck,
  MachineCommandReceipt,
  MachineConnectionRuntime,
  MachineFailure,
  MachineFailureCode,
  MachineManifest,
  MachineNetworkStream,
  MachinePreparation,
  MachinePromptAnswer,
  MachineProviderActionInput,
  MachineProviderDescriptor,
  MachineProviderHold,
  MachineProviderHoldInput,
  MachineReport,
  MachineRun,
  MachineSession,
} from '@taucad/runtime/machine';
import type { z } from 'zod';

import { grblActionSchemas, grblTravel, grblWorkOffsets, longMillMaximumRate } from '#grbl.manifest.js';
import type { GrblTravel } from '#grbl.manifest.js';
import { grblProgramChecks, readGrblProgram } from '#grbl.program.js';
import { grblChecks, grblObservation, grblReport } from '#grbl.report.js';
import { startGrblRun } from '#grbl.stream.js';
import {
  GrblCharacterCounter,
  createGrblLineSplitter,
  grblAlarm,
  grblErrorSentence,
  grblFeedOverrideBytes,
  grblRapidOverrides,
  grblRealtime,
  parseGrblLine,
} from '#grbl.protocol.js';
import type { GrblMessage, GrblStatus } from '#grbl.protocol.js';

/** One work coordinate system Grbl stores. @internal */
export type GrblWorkOffset = (typeof grblWorkOffsets)[number];

/** The start form: only what the program cannot say. @internal */
export type GrblSubmission = Readonly<{ workOffset: GrblWorkOffset; toolChange: 'pause' | 'refuse' }>;

/** What opening a session needs. @internal */
export type GrblSessionOptions = Readonly<{
  /** The opened serial port, or the simulator's in-memory duplex. */
  stream: MachineNetworkStream;
  runtime: Pick<MachineConnectionRuntime, 'clock' | 'log' | 'readArtifact'>;
  /** The serializable manifest the descriptor reports as installed. */
  manifest: MachineManifest;
  id: string;
  name: string;
  /** Milliseconds between `?` polls. Grbl 1.1 on an Uno answers at most about five per second. */
  pollInterval?: number;
  /** Milliseconds to wait for the controller to answer after the port opens; an Uno takes about two to boot. */
  bootTimeout?: number;
  /** The simulator's lid buttons; absent on hardware. */
  lid?: (button: 'start' | 'hold' | 'reset') => void;
  signal: AbortSignal;
}>;

/** A line's reply, or why none will come. @internal */
export type GrblReply =
  | Readonly<{ type: 'ok' }>
  | Readonly<{ type: 'error'; code: number }>
  | Readonly<{ type: 'reset' | 'closed' }>;
type Axis = 'x' | 'y' | 'z';
const axes: readonly Axis[] = ['x', 'y', 'z'];
type Position = Record<Axis, number>;
type Trust = 'homed' | 'kept' | 'lost' | 'unknown';

type Activity = {
  view: MachineActivity;
  answer?: (answer: string) => void;
  promptCount: number;
  answered: Set<string>;
};

/** A job the session is streaming. @internal */
export type GrblRun = {
  runId: string;
  name: string;
  total: number;
  acknowledged: number;
  state: MachineRun['state'];
  paused?: NonNullable<MachineRun['paused']>;
  startedAt?: string;
  endedAt?: string;
  stage?: string;
  abort: AbortController;
  /** Whether the controller has shown the feed hold the start loads under. */
  hasHeld?: boolean;
  /** Resolves when a paused stream may continue; replaced on every pause. */
  gate?: Readonly<{ promise: Promise<void>; open: () => void }>;
};

const maximumArtifactBytes = 32 * 1024 * 1024;
/** How many operations a session remembers for repeats and confirmation, oldest forgotten first. */
const retainedOperations = 256;
const probeFeed = 75;
const probeTravel = 50;
const parkZ = -5;
/** Without homing switches machine Z means nothing: park this far above the work zero, the plate plus room for a longer bit. */
const parkWorkZ = 35;

const toPosition = (values: readonly number[], scale: number): Position => ({
  x: (values[0] ?? 0) * scale,
  y: (values[1] ?? 0) * scale,
  z: (values[2] ?? 0) * scale,
});

const format = (value: number): string => String(Math.round(value * 1000) / 1000);

const isAxis = (value: string): value is Axis => (axes as readonly string[]).includes(value);

/**
 * G-code axis words for the axes a partial position names.
 * @param position - Millimetres per named axis.
 * @returns Such as `X10Y0`.
 */
const axisWords = (position: Readonly<Partial<Position>>): string =>
  axes
    .flatMap((axis) => {
      const value = position[axis];
      return value === undefined ? [] : [`${axis.toUpperCase()}${format(value)}`];
    })
    .join('');

/**
 * Parse parameters with the schema the host validated them with.
 * @param schema - The action's schema.
 * @param parameters - What arrived.
 * @returns The parsed parameters, or undefined when they do not fit.
 */
const parse = <Schema extends z.ZodType>(schema: Schema, parameters: unknown): z.output<Schema> | undefined => {
  const result = schema.safeParse(parameters ?? {});
  return result.success ? result.data : undefined;
};

/**
 * The live connection: state from reports, the line queue, and every procedure.
 * @internal
 */
export class GrblController {
  public firmware = 'Grbl';
  public status?: GrblStatus;
  public machine?: Position;
  public workOrigin: Position = { x: 0, y: 0, z: 0 };
  public trust: Trust = 'unknown';
  public homed = false;
  public alarm?: number;
  public isHomingRequired = false;
  public isConnected = true;
  public workOffset: GrblWorkOffset = 'G54';
  public offsetRevision = 0;
  public offsets: Partial<Record<string, Position>> = {};
  public tool?: number;
  public overrides?: GrblStatus['overrides'];
  public accessories?: string;
  public activity?: Activity;
  public run?: GrblRun;
  public streamError?: Readonly<{ code: number; line: number }>;
  public reportSequence = 0;
  /**
   * Whether the router is on a timed run: its `G4` dwell holds the controller's line queue until the `M5` behind it.
   * Every line-sending action is busy meanwhile, so the reset that ends it early flushes nothing else.
   */
  public isRouterTimed = false;
  public reportedAt?: string;
  public readonly settings = new Map<number, number>();
  public readonly options: GrblSessionOptions;

  private readonly counter = new GrblCharacterCounter();
  private readonly queue: Array<{ line: string; resolve: (reply: GrblReply) => void; sent: () => void }> = [];
  private readonly inFlight: Array<(reply: GrblReply) => void> = [];
  private readonly listeners = new Set<() => void>();
  private readonly confirmations = new Map<string, () => MachineActionConfirmation>();
  private readonly receipts = new Map<string, MachineCommandReceipt>();
  private lastProbe?: Readonly<{ position: Position; isSuccess: boolean }>;
  private activityCount = 0;
  private poll?: ReturnType<typeof setInterval>;

  public constructor(input: GrblSessionOptions) {
    this.options = input;
  }

  /**
   * Millimetres per reported unit: `$13=1` reports inches.
   * @returns The factor.
   */
  public get scale(): number {
    return this.settings.get(13) === 1 ? 25.4 : 1;
  }

  /**
   * Whether `$22` homing is on: bit 0, on Grbl 1.1 (`0`/`1`) and on grblHAL, where `$22` is a bitfield (`79`). A stock
   * LongMill has no homing switches: it works from the work zero a person sets.
   * @returns True when the controller can home.
   */
  public get isHomingEnabled(): boolean {
    return (this.settings.get(22) ?? 0) % 2 === 1;
  }

  /**
   * The travel the controller reports.
   * @returns Each axis's range from `$130`–`$132`, millimetres.
   */
  public get travel(): GrblTravel {
    return grblTravel(this.settings);
  }

  /**
   * The declared actions this controller has: `motion.home` only with homing on.
   * @returns The installed actions.
   */
  public get actions(): GrblSessionOptions['manifest']['actions'] {
    return this.isHomingEnabled
      ? this.options.manifest.actions
      : this.options.manifest.actions.filter((action) => action.id !== 'motion.home');
  }

  /**
   * The current instant from the host clock.
   * @returns An ISO 8601 instant.
   */
  public now(): string {
    return this.options.runtime.clock.now();
  }

  /** Read lines until the stream ends, then wait for the controller to answer. */
  public async open(): Promise<void> {
    void this.read();
    this.poll = setInterval(() => {
      this.realtime(grblRealtime.status);
    }, this.pollInterval);
    const answered = await this.waitFor(() => this.status !== undefined, this.options.bootTimeout ?? 3000);
    if (!answered) {
      await this.close();
      throw Object.assign(new Error('No Grbl controller answered on this port.'), {
        code: 'MACHINE_UNAVAILABLE' satisfies MachineFailureCode,
      });
    }
    await this.refresh();
  }

  /** Read settings, offsets and the parser state back from the controller. */
  public async refresh(): Promise<void> {
    await this.send('$$');
    await this.send('$#');
    await this.send('$G');
  }

  /**
   * Send one realtime byte ahead of anything queued.
   * @param byte - The byte.
   */
  public realtime(byte: number): void {
    this.write(Uint8Array.of(byte));
  }

  /**
   * Queue one line; it goes out as soon as it fits the controller's serial buffer.
   * @param line - The line without its newline.
   * @returns When it was sent, and its reply.
   */
  public transmit(line: string): Readonly<{ sent: Promise<void>; reply: Promise<GrblReply> }> {
    let markSent = (): void => undefined;
    const sent = new Promise<void>((resolve) => {
      markSent = resolve;
    });
    const reply = new Promise<GrblReply>((resolve) => {
      if (!this.isConnected) {
        resolve({ type: 'closed' });
        markSent();
        return;
      }
      this.queue.push({ line, resolve, sent: markSent });
      this.pump();
    });
    return { sent, reply };
  }

  /**
   * Send one line and wait for its reply.
   * @param line - The line without its newline.
   * @returns `ok`, the error, or why no reply will come.
   */
  public async send(line: string): Promise<GrblReply> {
    return this.transmit(line).reply;
  }

  /**
   * Wait until a condition holds after a report or message, or a time passes.
   * @param condition - Read after every update.
   * @param waitLimit - How long to wait. Milliseconds.
   * @returns Whether the condition held.
   */
  public async waitFor(condition: () => boolean, waitLimit: number): Promise<boolean> {
    if (condition()) {
      return true;
    }
    return new Promise((resolve) => {
      const done = (value: boolean): void => {
        clearTimeout(timer);
        this.listeners.delete(check);
        resolve(value);
      };
      const check = (): void => {
        if (condition()) {
          done(true);
        } else if (!this.isConnected) {
          done(false);
        }
      };
      const timer = setTimeout(() => {
        done(false);
      }, waitLimit);
      this.listeners.add(check);
    });
  }

  /**
   * Subscribe to every update.
   * @param listener - Called after each report or message.
   * @returns Unsubscribe.
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stop polling and close the port. */
  public async close(): Promise<void> {
    clearInterval(this.poll);
    this.run?.abort.abort();
    this.isConnected = false;
    this.flush('closed');
    await this.options.stream.close();
  }

  /**
   * Feed hold, wait for the machine to stop, then reset: the position is kept and the relays drop.
   * @returns Whether the machine settled before the reset.
   */
  public async halt(): Promise<boolean> {
    this.run?.abort.abort();
    this.realtime(grblRealtime.feedHold);
    const isSettled = await this.settle();
    const sequence = this.reportSequence;
    this.realtime(grblRealtime.reset);
    await this.waitFor(() => this.reportSequence > sequence + 1, this.pollInterval * 10);
    if (isSettled && (this.trust === 'homed' || this.trust === 'kept')) {
      this.trust = 'kept';
    }
    this.endRun('cancelled');
    this.finishActivity('failed', 'Stopped.');
    this.notify();
    return isSettled;
  }

  /**
   * Whether a procedure is running or waiting for a person.
   * @returns True while one is.
   */
  public get isBusy(): boolean {
    const state = this.activity?.view.state;
    return state === 'in-progress' || state === 'needs-person';
  }

  /**
   * Probe Z down onto the touch plate and set the active work offset's Z zero to the plate's top less its thickness.
   * @param thickness - Plate thickness. Millimetres.
   * @returns Why it failed, or undefined.
   */
  public async probeZ(thickness: number): Promise<string | undefined> {
    this.lastProbe = undefined;
    const reply = await this.send(`G91G38.2Z-${String(probeTravel)}F${String(probeFeed)}`);
    await this.send('G90');
    const probe = this.lastProbe as Readonly<{ position: Position; isSuccess: boolean }> | undefined;
    if (reply.type !== 'ok' || probe === undefined || !probe.isSuccess) {
      return this.alarm === undefined ? 'The probe did not touch the plate.' : grblAlarm(this.alarm).sentence;
    }
    const index = grblWorkOffsets.indexOf(this.workOffset) + 1;
    await this.send(`G10L2P${String(index)}Z${format(probe.position.z - thickness)}`);
    await this.send('G91G0Z5');
    await this.send('G90');
    await this.send('$#');
    this.offsetRevision += 1;
    return undefined;
  }

  /**
   * Park, have a person fit the next bit, probe Z again, and have them switch the router back on.
   * @param tool - The bit's tool number.
   * @param context - The run that asked for it, if any, and the operation that started it.
   * @returns The procedure, begun, and whether the change finished.
   */
  public toolChange(
    tool: number,
    context: Readonly<{ runId?: string; operationId?: string }>,
  ): Readonly<{ activity: Activity; done: Promise<boolean> }> {
    const isRouterOn = this.accessories?.includes('S') === true;
    const activity = this.beginActivity({
      kind: 'tool-change',
      label: `Changing to bit T${String(tool)}`,
      componentId: 'tools',
      ...context,
      steps: [
        ['Park and stop the router', 'machine'],
        [`Fit bit T${String(tool)}, attach the magnet and set the plate under it`, 'person'],
        ['Probe Z with the plate', 'machine'],
        ['Remove the plate and the magnet', 'person'],
      ],
    });
    return { activity, done: this.changeTool(activity, tool, isRouterOn) };
  }

  /**
   * Whether the latest report shows an action's effect. An operation this session never sent is `pending`: the host
   * escalates it for a person to reconcile, since this session cannot tell.
   * @param operationId - The caller-retained id the action was applied with.
   * @returns The confirmation.
   */
  public confirm(operationId: string): MachineActionConfirmation {
    return this.confirmations.get(operationId)?.() ?? { status: 'pending' };
  }

  /**
   * The descriptor the session reports.
   * @returns Identity, firmware and installed capabilities, with `motion.home` only while homing is on.
   */
  public descriptor(): MachineProviderDescriptor {
    const { manifest } = this.options;
    return {
      id: this.options.id,
      name: this.options.name,
      vendor: manifest.identity.vendor,
      model: manifest.identity.displayName,
      firmware: this.firmware,
      capabilities: {
        connection: manifest.connection,
        // The travel the controller enforces, from `$130`–`$132`, not the manifest's LongMill defaults.
        axes: manifest.axes.map((axis) => {
          const travel: Readonly<Record<string, GrblTravel['x'] | undefined>> = this.travel;
          const range = travel[axis.id];
          return range === undefined ? axis : { ...axis, travel: range };
        }),
        components: manifest.components,
        processes: manifest.processes,
        actions: this.actions,
        holds: manifest.holds,
        jobs: manifest.jobs,
        stop: manifest.stop,
      },
    };
  }

  /** Tell every listener the state changed. */
  public notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * End the live run, if any, and release its stream.
   * @param state - How it ended.
   * @param reason - The stage sentence surfaces show.
   */
  public endRun(state: 'completed' | 'cancelled' | 'failed', reason?: string): void {
    const { run } = this;
    if (run === undefined || ['completed', 'cancelled', 'failed', 'unknown'].includes(run.state)) {
      return;
    }
    run.state = state;
    run.endedAt = this.now();
    run.stage = reason;
    run.paused = undefined;
    run.abort.abort();
    run.gate?.open();
  }

  /**
   * The whole report.
   * @returns What the controller reports now, normalized.
   */
  public snapshot(): MachineReport {
    return grblReport(this);
  }

  /**
   * A receipt seen before, for reconciliation.
   * @param operationId - The caller-retained id the effect was sent with.
   * @returns The receipt, or undefined.
   */
  public receipt(operationId: string): MachineCommandReceipt | undefined {
    return this.receipts.get(operationId);
  }

  /**
   * Apply one admitted action. Repeats admission against this session's own report first, then sends once.
   * @param input - The admitted action.
   * @returns The receipt.
   */
  // oxlint-disable-next-line eslint/complexity, max-lines-per-function -- One dispatch over the declared actions.
  public async apply(input: MachineProviderActionInput): Promise<MachineCommandReceipt> {
    const { operationId } = input;
    // An operation already answered is answered again, never re-sent.
    const known = this.receipts.get(operationId);
    if (known !== undefined) {
      return known;
    }
    const refusal = this.admit(input.componentId, input.action, 'action', input.expectedRunId);
    if (refusal !== undefined) {
      return this.remember(operationId, this.rejected(refusal.code, refusal.message));
    }
    const { run } = this;
    const isRunLive = run !== undefined && ['starting', 'running', 'paused', 'finishing'].includes(run.state);
    const key = `${input.componentId}:${input.action}`;
    if (key.startsWith('controller:run.')) {
      return run === undefined || !isRunLive || run.runId !== input.expectedRunId
        ? this.remember(operationId, this.rejected('MACHINE_ACTION_STALE_RUN', 'The run you saw has ended or changed.'))
        : this.applyToRun(key, run, input);
    }
    const invalid = (): MachineCommandReceipt =>
      this.remember(
        operationId,
        this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Some values are not valid for this control.'),
      );
    switch (key) {
      case 'controller:controller.unlock': {
        const reply = await this.send('$X');
        return this.remember(
          operationId,
          this.replied(reply),
          this.after(() => this.status?.state !== 'Alarm'),
        );
      }
      case 'controller:interaction.respond': {
        const parameters = parse(standardMachineActions['interaction.respond'].schema, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const { activity } = this;
        const awaiting = activity?.view.awaiting;
        if (
          activity === undefined ||
          activity.view.activityId !== parameters.activityId ||
          awaiting?.kind !== 'confirmation'
        ) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PROMPT_STALE', 'Nothing is waiting for that answer.'),
          );
        }
        if (awaiting.promptId !== parameters.promptId) {
          const code = activity.answered.has(parameters.promptId)
            ? 'MACHINE_ACTION_PROMPT_CONSUMED'
            : 'MACHINE_ACTION_PROMPT_STALE';
          return this.remember(
            operationId,
            this.rejected(code, 'That question has already been answered or replaced.'),
          );
        }
        const { answer } = parameters;
        if (!awaiting.answers.some((candidate) => candidate.id === answer)) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'That is not one of the answers.'),
          );
        }
        const { promptId } = awaiting;
        activity.answered.add(promptId);
        activity.answer?.(answer);
        return this.remember(
          operationId,
          this.accepted({ activityId: activity.view.activityId }),
          this.after(
            () => activity.view.awaiting?.kind !== 'confirmation' || activity.view.awaiting.promptId !== promptId,
          ),
        );
      }
      case 'controller:grbl-simulator.lid.press': {
        const parameters = parse(grblActionSchemas.lid, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        if (this.options.lid === undefined) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_UNSUPPORTED', 'Only the simulator has these buttons.'),
          );
        }
        this.options.lid(parameters.button);
        return this.remember(operationId, this.accepted());
      }
      case 'motion:motion.home': {
        const activity = this.beginActivity({
          kind: 'homing',
          label: 'Homing',
          componentId: 'motion',
          operationId,
          steps: [['Home Z, then X and Y', 'machine']],
        });
        void this.homeCycle();
        return this.remember(
          operationId,
          this.accepted({ activityId: activity.view.activityId }),
          this.after(
            () => this.trust === 'homed',
            () => (activity.view.state === 'failed' ? (activity.view.message ?? 'Homing failed.') : undefined),
          ),
        );
      }
      case 'motion:motion.jog': {
        const parameters = parse(standardMachineActions['motion.jog'].schema, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const axis = parameters.axis.toLowerCase();
        if (!isAxis(axis)) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', `The LongMill has no ${axis.toUpperCase()} axis.`),
          );
        }
        const feed = Math.min(parameters.feed, longMillMaximumRate);
        const reply = await this.send(`$J=G91G21${axis.toUpperCase()}${format(parameters.distance)}F${format(feed)}`);
        return this.remember(
          operationId,
          this.replied(reply),
          this.after(() => this.status?.state === 'Idle'),
        );
      }
      case 'motion:motion.move': {
        const parameters = parse(grblActionSchemas.move, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const { position } = parameters;
        const isMachine = parameters.frame === 'machine';
        const target: Partial<Position> = { ...this.machine };
        for (const axis of axes) {
          const value = position[axis];
          if (value !== undefined) {
            target[axis] = isMachine ? value : value + this.workOrigin[axis];
          }
        }
        const { travel } = this;
        const outside = axes.find((axis) => {
          const value = target[axis];
          return (
            value !== undefined &&
            position[axis] !== undefined &&
            (value < travel[axis].min || value > travel[axis].max)
          );
        });
        if (outside !== undefined && (this.trust === 'homed' || this.trust === 'kept')) {
          return this.remember(
            operationId,
            this.rejected(
              'MACHINE_ACTION_PRECONDITION_FAILED',
              `That ${outside.toUpperCase()} position is outside the machine's travel.`,
            ),
          );
        }
        const { feed } = parameters;
        const motion = feed === undefined ? 'G0' : `G1F${format(Math.min(feed, longMillMaximumRate))}`;
        const reply = await this.send(`G90G21${isMachine ? 'G53' : ''}${motion}${axisWords(position)}`);
        return this.remember(
          operationId,
          this.replied(reply),
          this.after(
            () =>
              this.status?.state === 'Idle' &&
              axes.every(
                (axis) =>
                  target[axis] === undefined || Math.abs((this.machine?.[axis] ?? Number.NaN) - target[axis]) < 0.01,
              ),
          ),
        );
      }
      case 'motion:work-offset.select': {
        const parameters = parse(grblActionSchemas.offsetSelect, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const { offset } = parameters;
        const reply = await this.send(offset);
        await this.send('$G');
        return this.remember(operationId, this.replied(reply), () =>
          this.workOffset === offset ? { status: 'confirmed' } : { status: 'pending' },
        );
      }
      case 'motion:work-offset.set': {
        const parameters = parse(grblActionSchemas.offsetSet, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const { offset, position } = parameters;
        const { machine } = this;
        const words = axisWords(position);
        if (words.length === 0 || machine === undefined) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Name at least one axis.'),
          );
        }
        const reply = await this.send(`G10L20P${String(grblWorkOffsets.indexOf(offset) + 1)}${words}`);
        this.offsetRevision += 1;
        await this.send('$#');
        return this.remember(operationId, this.replied(reply), () =>
          axes.every((axis) => {
            const value = position[axis];
            return (
              value === undefined ||
              Math.abs((this.offsets[offset]?.[axis] ?? Number.NaN) - (machine[axis] - value)) < 0.002
            );
          })
            ? { status: 'confirmed' }
            : { status: 'pending' },
        );
      }
      case 'touch-plate:probe.run': {
        const parameters = parse(grblActionSchemas.probe, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const { activityId } = this.startProbing(parameters.plateThickness, operationId).view;
        return this.remember(operationId, this.accepted({ activityId }), () => {
          const view = this.activity?.view;
          if (view?.activityId !== activityId) {
            return {
              status: 'refuted',
              code: 'MACHINE_ACTION_ABORTED',
              message: 'Another procedure replaced the probing.',
            };
          }
          if (view.state === 'failed') {
            return {
              status: 'refuted',
              code: 'MACHINE_ACTION_PROVIDER_REJECTED',
              message: view.message ?? 'Probing failed.',
            };
          }
          return view.state === 'succeeded' ? { status: 'confirmed' } : { status: 'pending' };
        });
      }
      case 'tools:tool.change': {
        const parameters = parse(standardMachineActions['tool.change'].schema, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const { activity } = this.toolChange(parameters.tool, { operationId });
        return this.remember(operationId, this.accepted({ activityId: activity.view.activityId }));
      }
      case 'router:spindle.set': {
        const parameters = parse(grblActionSchemas.router, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        if (parameters.mode === 'off') {
          if (this.isRouterTimed) {
            // Only a reset ends the dwell early. Stop as `stop` does (hold, settle, reset) so the position is kept;
            // nothing else is queued behind the dwell, and the work offset the reset drops is selected again.
            const { workOffset } = this;
            const isSettled = await this.halt();
            if (this.workOffset !== workOffset) {
              await this.send(workOffset);
              await this.send('$G');
            }
            return this.remember(operationId, isSettled ? this.accepted() : this.unsettled());
          }
          return this.remember(operationId, this.replied(await this.send('M5')));
        }
        if (this.isRouterTimed) {
          return this.remember(operationId, this.rejected('MACHINE_ACTION_BUSY', 'The router is already on.'));
        }
        // M3, the dwell and M5 go out together, so the router stops by itself even when Tau or the link goes away
        // before M3 answers. A feed hold during the dwell suspends it with the router still on.
        return this.remember(operationId, this.replied(await this.timeRouter(parameters.duration)));
      }
      case 'dust:switch.set': {
        const parameters = parse(standardMachineActions['switch.set'].schema, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const isOn = parameters.on;
        if (isRunLive) {
          if (this.accessories?.includes('F') !== isOn) {
            this.realtime(grblRealtime.floodToggle);
          }
          return this.remember(operationId, this.accepted());
        }
        return this.remember(operationId, this.replied(await this.send(isOn ? 'M8' : 'M9')));
      }
      case 'feed-override:level.set': {
        const parameters = parse(grblActionSchemas.feedOverride, input.parameters);
        if (parameters === undefined) {
          return invalid();
        }
        const target = Math.round(parameters.ratio * 100);
        for (const byte of grblFeedOverrideBytes(this.overrides?.feed ?? 100, target)) {
          this.realtime(byte);
        }
        return this.remember(
          operationId,
          this.accepted(),
          this.after(() => this.overrides?.feed === target),
        );
      }
      case 'rapid-override:option.set': {
        const parameters = parse(grblActionSchemas.rapidOverride, input.parameters);
        const byte = parameters === undefined ? undefined : grblRapidOverrides[parameters.option];
        if (parameters === undefined || byte === undefined) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Rapids run at 100, 50 or 25 %.'),
          );
        }
        this.realtime(byte);
        return this.remember(
          operationId,
          this.accepted(),
          this.after(() => String(this.overrides?.rapid) === parameters.option),
        );
      }
      default: {
        return this.remember(
          operationId,
          this.rejected('MACHINE_ACTION_UNDECLARED', `${input.action} is not declared on ${input.componentId}.`),
        );
      }
    }
  }

  /**
   * Begin a held jog: one acknowledged `$J=` segment at a time, never more travel queued than the bound.
   * @param input - The admitted hold.
   * @param bound - The declared bound. Milliseconds.
   * @returns The hold, or why it cannot start.
   */
  public beginJog(input: MachineProviderHoldInput, bound: number): MachineProviderHold | MachineFailure {
    const refusal = this.admit(input.componentId, input.hold, 'hold', null);
    if (refusal !== undefined) {
      return refusal;
    }
    const parameters = parse(standardMachineHolds['motion.jog'].schema, input.parameters);
    if (parameters === undefined) {
      return { code: 'MACHINE_ACTION_PARAMETERS_INVALID', message: 'Some values are not valid for this control.' };
    }
    const axis = parameters.axis.toLowerCase();
    if (!isAxis(axis)) {
      return {
        code: 'MACHINE_ACTION_PARAMETERS_INVALID',
        message: `The LongMill has no ${parameters.axis.toUpperCase()} axis.`,
      };
    }
    if (this.status?.state !== 'Idle' || this.run?.state === 'running' || this.isBusy) {
      return { code: 'MACHINE_ACTION_BUSY', message: 'Jog only while the machine is idle.' };
    }
    const feed = Math.min(parameters.feed, longMillMaximumRate);
    // ponytail: half-bound segments keep the queued travel within the bound; acceleration is ignored, which at
    // 750 mm/s² adds at most a few tens of milliseconds.
    const segment = bound / 2;
    const distance = (feed / 60_000) * segment * parameters.direction;
    let queuedUntil = 0;
    let isInFlight = false;
    let isReleased = false;
    const isTrusted = this.trust === 'homed' || this.trust === 'kept';
    const { travel } = this;
    const extend = async (): Promise<void> => {
      const now = Date.now();
      if (isReleased || isInFlight || Math.max(0, queuedUntil - now) + segment > bound) {
        return;
      }
      const next = (this.machine?.[axis] ?? 0) + 2 * distance;
      if (isTrusted && (next < travel[axis].min || next > travel[axis].max)) {
        return;
      }
      isInFlight = true;
      queuedUntil = Math.max(now, queuedUntil) + segment;
      const reply = await this.send(`$J=G91G21${axis.toUpperCase()}${format(distance)}F${format(feed)}`);
      isInFlight = false;
      if (reply.type !== 'ok') {
        isReleased = true;
      }
    };
    void extend();
    return {
      extend,
      release: async () => {
        isReleased = true;
        this.realtime(grblRealtime.jogCancel);
        if (this.firmware.startsWith('GrblHAL')) {
          // On grblHAL the jog cancel also empties the input buffer: the lines in it are dropped without an answer.
          this.dropInFlight('reset');
        }
        return this.remember(
          input.operationId,
          this.accepted(),
          this.after(() => this.status?.state === 'Idle'),
        );
      },
    };
  }

  /**
   * Read and check a program against the machine as last reported.
   * @param artifact - The program.
   * @param submission - The start form.
   * @param signal - Cancels the read.
   * @returns The preparation.
   */
  // oxlint-disable-next-line eslint/complexity -- One check per fact the start depends on.
  public async prepare(
    artifact: MachineArtifactReference,
    submission: GrblSubmission,
    signal: AbortSignal,
  ): Promise<MachinePreparation> {
    const name = artifact.path.split('/').at(-1) ?? artifact.path;
    const program = readGrblProgram(await this.readText(artifact, signal), name);
    const checks: MachineCheck[] = [...grblChecks(this)];
    const origin = this.offsets[submission.workOffset];
    const isTrusted = this.trust === 'homed' || this.trust === 'kept';
    checks.push(
      ...grblProgramChecks({
        program,
        toolChange: submission.toolChange,
        workOffset: submission.workOffset,
        origin: isTrusted ? origin : undefined,
        canHome: this.isHomingEnabled,
        travel: this.travel,
      }),
    );
    const isRunLive = this.run !== undefined && ['starting', 'running', 'paused', 'finishing'].includes(this.run.state);
    checks.push({
      id: 'idle',
      label: 'No other job is running',
      state: isRunLive || this.isRouterTimed ? 'blocked' : 'passed',
      source: 'observed',
      ...(this.isRouterTimed ? { detail: 'The router is on a timed run. Switch it off first.' } : {}),
    });
    return {
      status: checks.some((check) => check.state === 'blocked') ? 'blocked' : 'ready',
      program: program.summary,
      checks,
      setup: {
        workOffset: submission.workOffset,
        origin: origin === undefined ? null : { ...origin },
        revision: `r${String(this.offsetRevision)}`,
        tool: this.tool ?? null,
      },
      parser: { id: 'grbl.gcode', version: '1' },
      providerData: { lines: program.summary.facts.lines },
      observedAt: this.now(),
    };
  }

  /**
   * Load a program and wait for Play at the machine.
   * @param input - The start operation, the program and the start form.
   * @returns The receipt.
   */
  public async start(
    input: Readonly<{
      operationId: string;
      artifact: MachineArtifactReference;
      submission: GrblSubmission;
      signal: AbortSignal;
    }>,
  ): Promise<MachineCommandReceipt> {
    if (this.run !== undefined && ['starting', 'running', 'paused', 'finishing'].includes(this.run.state)) {
      return this.remember(input.operationId, this.rejected('MACHINE_ACTION_RUN_ACTIVE', 'Another job is running.'));
    }
    // Grbl reports Idle during the dwell; the job's feed hold would suspend it with the router on and the M5 behind it.
    if (this.isRouterTimed) {
      return this.remember(
        input.operationId,
        this.rejected('MACHINE_ACTION_BUSY', 'The router is on a timed run. Switch it off first.'),
      );
    }
    if (this.status?.state !== 'Idle' || this.isBusy) {
      return this.remember(
        input.operationId,
        this.rejected('MACHINE_ACTION_PRECONDITION_FAILED', 'The machine must be idle to load a job.'),
      );
    }
    const text = await this.readText(input.artifact, input.signal);
    const name = input.artifact.path.split('/').at(-1) ?? input.artifact.path;
    const receipt = await startGrblRun(this, {
      runId: `run-${input.operationId}`,
      name,
      text,
      submission: input.submission,
    });
    return this.remember(input.operationId, receipt);
  }

  /**
   * Pause, resume or cancel the live run the caller saw.
   * @param key - `controller:run.<verb>`.
   * @param run - The live run.
   * @param input - The admitted action: its operation id and who asked.
   * @returns The receipt.
   */
  private async applyToRun(
    key: string,
    run: GrblRun,
    input: Pick<MachineProviderActionInput, 'operationId' | 'requestedBy'>,
  ): Promise<MachineCommandReceipt> {
    const { operationId } = input;
    switch (key) {
      case 'controller:run.pause': {
        this.realtime(grblRealtime.feedHold);
        run.paused = { by: input.requestedBy.kind === 'agent' ? 'agent' : 'person', reason: 'Paused from Tau' };
        return this.remember(
          operationId,
          this.accepted(),
          this.after(() => this.status?.state === 'Hold'),
        );
      }
      case 'controller:run.resume': {
        if (this.isBusy) {
          return this.remember(operationId, this.rejected('MACHINE_ACTION_BUSY', 'Finish the bit change first.'));
        }
        if (this.streamError !== undefined) {
          this.streamError = undefined;
        }
        run.paused = undefined;
        if (run.gate !== undefined) {
          run.state = 'running';
          run.gate.open();
        }
        this.realtime(grblRealtime.cycleStart);
        return this.remember(
          operationId,
          this.accepted(),
          this.after(() => this.status?.state === 'Run' || this.run?.state === 'completed'),
        );
      }
      case 'controller:run.cancel': {
        const isSettled = await this.halt();
        return this.remember(
          operationId,
          isSettled ? this.accepted() : this.unsettled(),
          this.after(() => this.run?.state === 'cancelled'),
        );
      }
      default: {
        return this.remember(operationId, this.rejected('MACHINE_ACTION_UNDECLARED', `${key} is not declared.`));
      }
    }
  }

  /**
   * Repeat admission at the moment of sending, over this session's own report: state, run fence, freshness, trust,
   * interlocks and the session's availability. Qualification, authority and attendance are the host's to admit.
   * @param componentId - The component it targets.
   * @param action - The action or hold id.
   * @param kind - An action or a hold.
   * @param expectedRunId - The run the caller saw, or null.
   * @returns Why it may not be sent, or undefined when it may.
   */
  // oxlint-disable-next-line eslint/max-params -- the four facts the pure check reads, in its order.
  private admit(
    componentId: string,
    action: string,
    kind: 'action' | 'hold',
    // oxlint-disable-next-line typescript/no-restricted-types -- null is the caller's statement that it saw no run.
    expectedRunId: string | null,
  ): MachineFailure | undefined {
    return checkMachineActionAtSend({
      name: this.options.name,
      capabilities: this.descriptor().capabilities,
      report: this.snapshot(),
      observations: this.options.manifest.observations,
      componentId,
      action,
      kind,
      expectedRunId,
      now: Date.parse(this.now()),
    });
  }

  private unsettled(): MachineCommandReceipt {
    return {
      status: 'unknown',
      reason: 'The machine did not settle before the reset; home it before the next job.',
      observedAt: this.now(),
    };
  }

  private get pollInterval(): number {
    return this.options.pollInterval ?? 200;
  }

  private async read(): Promise<void> {
    const split = createGrblLineSplitter();
    try {
      for await (const chunk of this.options.stream.readable) {
        for (const line of split(chunk)) {
          this.handle(parseGrblLine(line));
        }
      }
    } catch (error) {
      void this.options.runtime.log({ level: 'warning', message: `Grbl serial read ended: ${String(error)}` });
    }
    this.lost();
  }

  private lost(): void {
    this.isConnected = false;
    clearInterval(this.poll);
    this.flush('closed');
    if (this.run !== undefined && ['starting', 'running', 'paused', 'finishing'].includes(this.run.state)) {
      // Grbl does not notice a vanished host: what is buffered still runs, then the job stops mid-path.
      this.run.state = 'unknown';
      this.run.stage = 'The connection was lost while the job was being fed.';
      this.run.abort.abort();
    }
    this.notify();
  }

  private write(bytes: Uint8Array<ArrayBuffer>): void {
    if (this.isConnected) {
      void this.writeOrLose(bytes);
    }
  }

  private async writeOrLose(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    try {
      await this.options.stream.write(bytes);
    } catch {
      this.lost();
    }
  }

  private pump(): void {
    for (let next = this.queue[0]; next !== undefined && this.counter.fits(next.line); next = this.queue[0]) {
      this.queue.shift();
      this.counter.sent(next.line);
      this.inFlight.push(next.resolve);
      this.write(new TextEncoder().encode(`${next.line}\n`));
      next.sent();
    }
  }

  /**
   * A reset empties the controller's buffer and answers none of the lines in it; nothing queued is sent after.
   * @param reason - Why no reply will come.
   */
  private flush(reason: 'reset' | 'closed'): void {
    this.dropInFlight(reason);
    for (const item of this.queue.splice(0)) {
      item.sent();
      item.resolve({ type: reason });
    }
  }

  /**
   * Forget every line sent and not yet answered: the controller emptied its buffer and will answer none of them.
   * @param reason - Why no reply will come.
   */
  private dropInFlight(reason: 'reset' | 'closed'): void {
    this.counter.clear();
    for (const resolve of this.inFlight.splice(0)) {
      resolve({ type: reason });
    }
  }

  // oxlint-disable-next-line eslint/complexity -- One switch over the controller's message kinds.
  private handle(message: GrblMessage): void {
    switch (message.type) {
      case 'ok':
      case 'error': {
        this.counter.acknowledged();
        this.inFlight.shift()?.(message);
        this.pump();
        return;
      }
      case 'status': {
        this.report(message.status);
        break;
      }
      case 'alarm': {
        this.alarm = message.code;
        if (grblAlarm(message.code).position === 'lost') {
          this.trust = 'lost';
          this.homed = false;
        }
        this.endRun('failed', grblAlarm(message.code).sentence);
        this.finishActivity('failed', grblAlarm(message.code).sentence);
        break;
      }
      case 'welcome': {
        this.firmware = `${message.firmware} ${message.version}`;
        this.flush('reset');
        this.endRun('cancelled', 'The controller was reset.');
        this.finishActivity('failed', 'The controller was reset.');
        this.selectOffset('G54');
        break;
      }
      case 'message': {
        if (message.text.includes('Unlocked')) {
          this.alarm = undefined;
          this.isHomingRequired = false;
        }
        if (message.text.includes('to unlock')) {
          this.isHomingRequired = true;
        }
        break;
      }
      case 'parser': {
        for (const word of message.words) {
          const offset = grblWorkOffsets.find((candidate) => candidate === word);
          if (offset !== undefined) {
            this.selectOffset(offset);
          }
          if (/^T\d+$/u.test(word) && Number(word.slice(1)) > 0) {
            this.tool ??= Number(word.slice(1));
          }
        }
        break;
      }
      case 'probe': {
        this.lastProbe = { position: toPosition(message.position, this.scale), isSuccess: message.isSuccess };
        break;
      }
      case 'offset': {
        this.offsets[message.name] = toPosition(message.values, this.scale);
        break;
      }
      case 'setting': {
        this.settings.set(message.id, message.value);
        break;
      }
      default: {
        break;
      }
    }
    this.notify();
  }

  private selectOffset(offset: GrblWorkOffset): void {
    if (offset !== this.workOffset) {
      this.workOffset = offset;
      this.offsetRevision += 1;
    }
  }

  // oxlint-disable-next-line eslint/complexity -- Each status field updates one fact.
  private report(status: GrblStatus): void {
    const { scale } = this;
    const previous = this.status;
    if (status.workOffset !== undefined) {
      const origin = toPosition(status.workOffset, scale);
      if (axes.some((axis) => Math.abs(origin[axis] - this.workOrigin[axis]) > 1e-6)) {
        this.offsetRevision += 1;
      }
      this.workOrigin = origin;
    }
    const machine = status.machine === undefined ? undefined : toPosition(status.machine, scale);
    const work = status.work === undefined ? undefined : toPosition(status.work, scale);
    this.machine =
      machine ??
      (work === undefined
        ? this.machine
        : { x: work.x + this.workOrigin.x, y: work.y + this.workOrigin.y, z: work.z + this.workOrigin.z });
    if (status.overrides !== undefined) {
      this.overrides = status.overrides;
      this.accessories = status.accessories ?? '';
    }
    this.counter.learn(status);
    this.status = status;
    this.reportSequence += 1;
    this.reportedAt = this.now();
    if (status.state !== 'Alarm') {
      this.alarm = undefined;
      this.isHomingRequired = false;
    }
    const { run } = this;
    if (run !== undefined) {
      if (run.state === 'starting' && status.state === 'Hold') {
        run.hasHeld = true;
      }
      const isPlayed =
        run.state === 'starting' && run.hasHeld === true && (status.state === 'Run' || status.state === 'Idle');
      if (isPlayed || (status.state === 'Run' && run.state === 'paused' && run.paused?.by !== 'program')) {
        // Play on the lid, or a resume: the run is moving.
        run.state = 'running';
        run.paused = undefined;
        run.stage = undefined;
        run.startedAt ??= this.now();
      } else if (status.state === 'Hold' && run.state === 'running' && previous?.state !== 'Hold') {
        run.state = 'paused';
        run.paused ??= { by: 'person', reason: 'Feed hold' };
      }
    }
  }

  /**
   * Stopped means `Hold:0` or `Idle` with the same position in two reports in a row; give up after 50 reports.
   * @returns Whether the machine settled.
   */
  private async settle(): Promise<boolean> {
    let previous: Position | undefined;
    for (let count = 0; count < 50; count += 1) {
      const sequence = this.reportSequence;
      // oxlint-disable-next-line eslint/no-await-in-loop -- each report is compared with the one before it.
      const isReported = await this.waitFor(() => this.reportSequence > sequence, this.pollInterval * 4);
      if (!isReported) {
        return false;
      }
      const state = this.status?.native ?? '';
      const position = this.machine;
      const last = previous;
      const isStill =
        last !== undefined && position !== undefined && axes.every((axis) => position[axis] === last[axis]);
      if ((state === 'Hold:0' || state === 'Idle' || state === 'Alarm') && isStill) {
        return true;
      }
      previous = position;
    }
    return false;
  }

  private beginActivity(
    input: Readonly<{
      kind: string;
      label: string;
      componentId: string;
      runId?: string;
      operationId?: string;
      steps: ReadonlyArray<readonly [string, 'machine' | 'person']>;
    }>,
  ): Activity {
    this.activityCount += 1;
    const activity: Activity = {
      view: {
        activityId: `${input.kind}-${String(this.activityCount)}`,
        componentId: input.componentId,
        kind: input.kind,
        label: input.label,
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
        state: 'in-progress',
        steps: input.steps.map(([label, actor], index) => ({
          id: `step-${String(index + 1)}`,
          label,
          actor,
          state: index === 0 ? 'active' : 'todo',
        })),
        cancel: { componentId: 'controller', action: 'interaction.respond' },
      },
      promptCount: 0,
      answered: new Set(),
    };
    this.activity = activity;
    this.notify();
    return activity;
  }

  private advance(activity: Activity): void {
    const steps = [...activity.view.steps];
    const index = steps.findIndex((step) => step.state === 'active');
    if (index !== -1) {
      steps[index] = { ...steps[index]!, state: 'done' };
      const next = steps[index + 1];
      if (next !== undefined) {
        steps[index + 1] = { ...next, state: 'active' };
      }
    }
    activity.view = {
      ...activity.view,
      steps,
      state: steps[index + 1]?.actor === 'person' ? 'needs-person' : 'in-progress',
    };
    this.notify();
  }

  private async ask(activity: Activity, label: string, answers: readonly MachinePromptAnswer[]): Promise<string> {
    activity.promptCount += 1;
    const promptId = `${activity.view.activityId}-prompt-${String(activity.promptCount)}`;
    const answered = new Promise<string>((resolve) => {
      activity.answer = resolve;
    });
    activity.view = {
      ...activity.view,
      state: 'needs-person',
      awaiting: {
        kind: 'confirmation',
        promptId,
        label,
        answers,
        effects: ['motion'],
        safety: { authority: 'person', attended: true, interlocks: [] },
      },
    };
    this.notify();
    const answer = await answered;
    if (activity.view.state !== 'needs-person') {
      return 'cancel';
    }
    const { awaiting: _awaiting, ...rest } = activity.view;
    activity.view = { ...rest, state: 'in-progress' };
    activity.answer = undefined;
    this.notify();
    return answer;
  }

  private finishActivity(state: 'succeeded' | 'failed', message?: string): void {
    const { activity } = this;
    if (activity === undefined || (activity.view.state !== 'in-progress' && activity.view.state !== 'needs-person')) {
      return;
    }
    const { answer } = activity;
    activity.answer = undefined;
    const { awaiting: _awaiting, ...rest } = activity.view;
    activity.view = {
      ...rest,
      state,
      steps: rest.steps.map(
        (step): MachineActivityStep =>
          step.state === 'done' ? step : { ...step, state: state === 'succeeded' ? 'done' : 'skipped' },
      ),
      ...(message === undefined ? {} : { message }),
    };
    answer?.('cancel');
    this.notify();
  }

  private async changeTool(activity: Activity, tool: number, isRouterOn: boolean): Promise<boolean> {
    await this.send('M5');
    await this.send(this.isHomingEnabled ? `G53G0Z${String(parkZ)}` : `G90G0Z${String(parkWorkZ)}`);
    // Grbl answers a move once it is planned: dwell for nothing so the person is asked only once Z has stopped.
    await this.send('G4P0');
    this.advance(activity);
    const answer = await this.ask(
      activity,
      `Fit bit T${String(tool)}, then put the magnet on it and the plate under it.`,
      [
        { id: 'continue', label: 'Bit fitted, plate in place', role: 'confirm' },
        { id: 'cancel', label: 'Cancel', role: 'cancel' },
      ],
    );
    if (answer !== 'continue') {
      this.finishActivity('failed', 'Cancelled.');
      return false;
    }
    this.tool = tool;
    this.advance(activity);
    const failure = await this.probeZ(15);
    if (failure !== undefined) {
      this.finishActivity('failed', failure);
      return false;
    }
    this.advance(activity);
    const done = await this.ask(activity, 'Remove the plate and the magnet, and stand clear.', [
      { id: 'done', label: 'Done', role: 'confirm' },
    ]);
    if (done !== 'done') {
      return false;
    }
    if (isRouterOn) {
      // The relay restarts the router; give it time to reach speed before the program plunges.
      await this.send('M3');
      await this.send('G4P3');
    }
    this.finishActivity('succeeded');
    return true;
  }

  private startProbing(thickness: number, operationId: string): Activity {
    const activity = this.beginActivity({
      kind: 'probing',
      label: 'Probing Z with the touch plate',
      componentId: 'touch-plate',
      operationId,
      steps: [
        ['Attach the magnet to the bit and set the plate under it', 'person'],
        ['Probe down to the plate', 'machine'],
        ['Remove the plate and the magnet', 'person'],
      ],
    });
    void this.probing(activity, thickness);
    return activity;
  }

  private async probing(activity: Activity, thickness: number): Promise<void> {
    const answer = await this.ask(activity, 'Is the magnet on the bit and the plate under it?', [
      { id: 'continue', label: 'Plate is in place', role: 'confirm' },
      { id: 'cancel', label: 'Cancel', role: 'cancel' },
    ]);
    if (answer !== 'continue') {
      this.finishActivity('failed', 'Cancelled.');
      return;
    }
    this.advance(activity);
    const failure = await this.probeZ(thickness);
    if (failure !== undefined) {
      this.finishActivity('failed', failure);
      return;
    }
    this.advance(activity);
    await this.ask(activity, 'Remove the plate and the magnet.', [{ id: 'done', label: 'Done', role: 'confirm' }]);
    this.finishActivity('succeeded');
  }

  private remember(
    operationId: string,
    receipt: MachineCommandReceipt,
    confirm?: () => MachineActionConfirmation,
  ): MachineCommandReceipt {
    this.receipts.set(operationId, receipt);
    if (confirm !== undefined) {
      this.confirmations.set(operationId, confirm);
    }
    // ponytail: the oldest operation is forgotten past the limit; the host escalates anything still unproven after
    // its 180-second window anyway, so a forgotten one reads `pending` there.
    if (this.receipts.size > retainedOperations) {
      const [oldest = ''] = this.receipts.keys();
      this.receipts.delete(oldest);
      this.confirmations.delete(oldest);
    }
    return receipt;
  }

  private accepted(extra: Readonly<{ activityId?: string; runId?: string }> = {}): MachineCommandReceipt {
    return { status: 'accepted', observedAt: this.now(), ...extra };
  }

  private rejected(code: MachineFailureCode, message: string): MachineCommandReceipt {
    return { status: 'rejected', code, message, observedAt: this.now() };
  }

  private replied(reply: GrblReply): MachineCommandReceipt {
    if (reply.type === 'ok') {
      return this.accepted();
    }
    if (reply.type === 'error') {
      return this.rejected('MACHINE_ACTION_PROVIDER_REJECTED', grblErrorSentence(reply.code));
    }
    return {
      status: 'unknown',
      reason:
        reply.type === 'reset'
          ? 'The controller reset before it answered.'
          : 'The connection closed before the controller answered.',
      observedAt: this.now(),
    };
  }

  /**
   * A confirmation that holds once a report after now shows the condition.
   * @param condition - What the report must show.
   * @param refuted - Why the effect can no longer happen, when it cannot.
   * @returns The check the host runs after each observation.
   */
  private after(condition: () => boolean, refuted?: () => string | undefined): () => MachineActionConfirmation {
    const sequence = this.reportSequence;
    return () => {
      const refutation = refuted?.();
      if (refutation !== undefined) {
        return { status: 'refuted', code: 'MACHINE_ACTION_PROVIDER_REJECTED', message: refutation };
      }
      return this.reportSequence > sequence && condition() ? { status: 'confirmed' } : { status: 'pending' };
    };
  }

  /**
   * Run the router for a time: `M3`, a dwell and `M5` queued in the controller together. Busy until the `M5` answers,
   * or a reset drops it.
   * @param seconds - How long.
   * @returns The reply to `M3`.
   */
  private async timeRouter(seconds: number): Promise<GrblReply> {
    this.isRouterTimed = true;
    this.notify();
    const on = this.transmit('M3').reply;
    void this.transmit(`G4P${format(seconds)}`).reply;
    void this.routerOff();
    return on;
  }

  private async routerOff(): Promise<void> {
    await this.send('M5');
    this.isRouterTimed = false;
    this.notify();
  }

  private async homeCycle(): Promise<void> {
    const reply = await this.send('$H');
    if (reply.type === 'ok') {
      this.trust = 'homed';
      this.homed = true;
      this.alarm = undefined;
      this.isHomingRequired = false;
      this.offsetRevision += 1;
      this.finishActivity('succeeded');
    } else {
      this.trust = 'lost';
      this.finishActivity('failed', reply.type === 'error' ? grblErrorSentence(reply.code) : 'Homing did not finish.');
    }
  }

  private async readText(artifact: MachineArtifactReference, signal: AbortSignal): Promise<string> {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of this.options.runtime.readArtifact({
      artifact,
      maximumBytes: maximumArtifactBytes,
      signal,
    })) {
      chunks.push(chunk);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }
}

/**
 * Open one Grbl session over an opened stream.
 * @internal
 * @param options - The stream, the host services and the manifest.
 * @returns The session, once the controller has answered and its settings are read.
 */
export const openGrblSession = async (
  options: GrblSessionOptions,
): Promise<MachineSession<GrblSubmission> & Readonly<{ controller: GrblController }>> => {
  const controller = new GrblController(options);
  await controller.open();
  const { manifest } = options;
  const holdBound = manifest.holds.find((hold) => hold.id === 'motion.jog')?.bound ?? 150;
  return {
    controller,
    async getDescriptor() {
      return controller.descriptor();
    },
    async getSnapshot() {
      return controller.snapshot();
    },
    async *observe({ signal }) {
      let isDirty = true;
      let wake: (() => void) | undefined;
      const unsubscribe = controller.subscribe(() => {
        isDirty = true;
        wake?.();
      });
      const onAbort = (): void => wake?.();
      const changed = async (): Promise<void> =>
        new Promise<void>((resolve) => {
          wake = resolve;
        });
      signal.addEventListener('abort', onAbort);
      let previous: MachineReport | undefined;
      try {
        while (!signal.aborted) {
          if (!isDirty) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- observations follow the controller one at a time.
            await changed();
            wake = undefined;
            continue;
          }
          isDirty = false;
          const report = controller.snapshot();
          const observation = grblObservation(previous, report);
          previous = report;
          if (observation !== undefined) {
            yield observation;
          }
          if (!controller.isConnected) {
            return;
          }
        }
      } finally {
        unsubscribe();
        signal.removeEventListener('abort', onAbort);
      }
    },
    async stop({ operationId }) {
      const isSettled = await controller.halt();
      return isSettled
        ? { status: 'accepted', observedAt: controller.now() }
        : {
            status: 'unknown',
            reason: `The machine did not settle before the reset (${operationId}); home it before the next job.`,
            observedAt: controller.now(),
          };
    },
    actions: {
      type: 'supported',
      apply: async (input) => controller.apply(input),
      confirm: (input) => controller.confirm(input.operationId),
    },
    holds: {
      type: 'supported',
      async begin(input) {
        const hold = controller.beginJog(input, holdBound);
        return 'extend' in hold ? hold : { code: hold.code, message: hold.message };
      },
    },
    jobs: {
      type: 'supported',
      delivery: 'streamed',
      // Of the start form, only the work offset is the machine's to say: the one it uses now. The rest have defaults.
      completeConfiguration: async ({ configuration }) => ({
        workOffset: controller.workOffset,
        ...(typeof configuration === 'object' && configuration !== null && !Array.isArray(configuration)
          ? configuration
          : {}),
      }),
      prepare: async (input) => controller.prepare(input.artifact, input.configuration, input.signal),
      start: async (input) =>
        controller.start({
          operationId: input.operationId,
          artifact: input.artifact,
          submission: input.configuration,
          signal: input.signal,
        }),
    },
    stillCapture: { type: 'unsupported' },
    async reconcile({ operationId }) {
      return (
        controller.receipt(operationId) ?? {
          status: 'unknown',
          reason: 'This session has no record of that operation.',
          observedAt: controller.now(),
        }
      );
    },
    close: async () => controller.close(),
    dispose: async () => controller.close(),
  };
};
