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

import type {
  MachineActionConfirmation,
  MachineActivity,
  MachineActivityStep,
  MachineArtifactReference,
  MachineCheck,
  MachineCommandReceipt,
  MachineConnectionRuntime,
  MachineFailureCode,
  MachineManifest,
  MachineNetworkStream,
  MachinePreparation,
  MachinePromptAnswer,
  MachineProviderActionInput,
  MachineProviderHold,
  MachineProviderHoldInput,
  MachineReport,
  MachineRun,
  MachineSession,
} from '@taucad/runtime/machine';

import { grblWorkOffsets, longMillMaximumRate, longMillTravel } from '#grbl.manifest.js';
import { grblProgramChecks, readGrblProgram } from '#grbl.program.js';
import { grblChecks, grblReport } from '#grbl.report.js';
import {
  GrblCharacterCounter,
  cleanGcodeLine,
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

type Reply =
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

type Run = {
  runId: string;
  name: string;
  total: number;
  acknowledged: number;
  state: MachineRun['state'];
  paused?: NonNullable<MachineRun['paused']>;
  startedAt?: string;
  startedAtMs?: number;
  endedAt?: string;
  stage?: string;
  abort: AbortController;
  /** Whether the controller has shown the feed hold the start loads under. */
  hasHeld?: boolean;
  /** Resolves when a paused stream may continue; replaced on every pause. */
  gate?: Readonly<{ promise: Promise<void>; open: () => void }>;
};

const maximumArtifactBytes = 32 * 1024 * 1024;
const probeFeed = 75;
const probeTravel = 50;
const parkZ = -5;
/** Without homing switches machine Z means nothing: park this far above the work zero, the plate plus room for a longer bit. */
const parkWorkZ = 35;

const isAborted = (run: Readonly<{ abort: AbortController }>): boolean => run.abort.signal.aborted;

const gate = (): NonNullable<Run['gate']> => {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

const toPosition = (values: readonly number[] | undefined, scale: number): Position | undefined =>
  values === undefined
    ? undefined
    : { x: (values[0] ?? 0) * scale, y: (values[1] ?? 0) * scale, z: (values[2] ?? 0) * scale };

const format = (value: number): string => String(Math.round(value * 1000) / 1000);

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
  public run?: Run;
  public streamError?: Readonly<{ code: number; line: number }>;
  public reportSequence = 0;
  public reportedAt?: string;
  public readonly settings = new Map<number, number>();
  public readonly options: GrblSessionOptions;

  private readonly counter = new GrblCharacterCounter();
  private readonly queue: Array<{ line: string; resolve: (reply: Reply) => void; sent: () => void }> = [];
  private readonly inFlight: Array<(reply: Reply) => void> = [];
  private readonly listeners = new Set<() => void>();
  private readonly confirmations = new Map<string, () => MachineActionConfirmation>();
  private readonly receipts = new Map<string, MachineCommandReceipt>();
  private lastProbe?: Readonly<{ position: Position; isSuccess: boolean }>;
  private dwellUntil = 0;
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
   * Whether `$22` homing is on. A stock LongMill has no homing switches: it works from the work zero a person sets.
   * @returns True when the controller can home.
   */
  public get isHomingEnabled(): boolean {
    return this.settings.get(22) === 1;
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
      throw new Error('No Grbl controller answered on this port.');
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
  public transmit(line: string): Readonly<{ sent: Promise<void>; reply: Promise<Reply> }> {
    let markSent = (): void => undefined;
    const sent = new Promise<void>((resolve) => {
      markSent = resolve;
    });
    const reply = new Promise<Reply>((resolve) => {
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
  public async send(line: string): Promise<Reply> {
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
   * @returns Whether the change finished.
   */
  public async toolChange(tool: number, context: Readonly<{ runId?: string; operationId?: string }>): Promise<boolean> {
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

  /**
   * Start feeding a program under a feed hold; the person's Play press starts the motion.
   * @param input - The run id, the program lines and the start form.
   * @returns Once the controller took the first block.
   */
  public async startRun(
    input: Readonly<{ runId: string; name: string; text: string; submission: GrblSubmission }>,
  ): Promise<MachineCommandReceipt> {
    const lines = input.text
      .split(/\r?\n/u)
      .map((raw, index) => ({ number: index + 1, text: cleanGcodeLine(raw) }))
      .filter((line) => line.text.length > 0);
    const run: Run = {
      runId: input.runId,
      name: input.name,
      total: lines.length,
      acknowledged: 0,
      state: 'starting',
      stage: 'Waiting for Play on the controller',
      abort: new AbortController(),
    };
    this.run = run;
    this.streamError = undefined;
    // Hold first: lines fill the planner but nothing moves until a person presses Play at the machine.
    this.realtime(grblRealtime.feedHold);
    const first = await this.send(input.submission.workOffset);
    if (first.type !== 'ok') {
      this.endRun('failed', first.type === 'error' ? grblErrorSentence(first.code) : 'The controller reset.');
      return {
        status: 'rejected',
        code: 'MACHINE_ACTION_PROVIDER_REJECTED',
        message: 'The controller refused the work offset.',
        observedAt: this.now(),
      };
    }
    void this.feedOrFail(run, lines);
    return { status: 'accepted', runId: run.runId, observedAt: this.now() };
  }

  /**
   * The whole report.
   * @returns What the controller reports now, normalized.
   */
  public snapshot(): MachineReport {
    return grblReport(this);
  }

  /**
   * Whether the latest report shows an action's effect.
   * @param operationId - The caller-retained id the action was applied with.
   * @returns The confirmation.
   */
  public confirm(operationId: string): MachineActionConfirmation {
    return this.confirmations.get(operationId)?.() ?? { status: 'confirmed' };
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
   * Apply one admitted action. Sends once.
   * @param input - The admitted action.
   * @returns The receipt.
   */
  // oxlint-disable-next-line eslint/complexity, max-lines-per-function -- One dispatch over the declared actions.
  public async apply(input: MachineProviderActionInput): Promise<MachineCommandReceipt> {
    const parameters = (input.parameters ?? {}) as Readonly<Record<string, unknown>>;
    const { operationId } = input;
    const { run } = this;
    const isRunLive = run !== undefined && ['starting', 'running', 'paused', 'finishing'].includes(run.state);
    const key = `${input.componentId}:${input.action}`;
    if (key.startsWith('controller:run.') && (!isRunLive || run.runId !== input.expectedRunId)) {
      return this.remember(
        operationId,
        this.rejected('MACHINE_ACTION_STALE_RUN', 'The run you saw has ended or changed.'),
      );
    }
    switch (key) {
      case 'controller:run.pause': {
        this.realtime(grblRealtime.feedHold);
        run!.paused = { by: 'person', reason: 'Paused from Tau' };
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
        run!.paused = undefined;
        if (run!.gate !== undefined) {
          run!.state = 'running';
          run!.gate.open();
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
          isSettled
            ? this.accepted()
            : {
                status: 'unknown',
                reason: 'The machine did not settle before the reset; home it before the next job.',
                observedAt: this.now(),
              },
          this.after(() => this.run?.state === 'cancelled'),
        );
      }
      case 'controller:controller.unlock': {
        const reply = await this.send('$X');
        return this.remember(
          operationId,
          this.replied(reply),
          this.after(() => this.status?.state !== 'Alarm'),
        );
      }
      case 'controller:interaction.respond': {
        const { activity } = this;
        const awaiting = activity?.view.awaiting;
        if (
          activity === undefined ||
          activity.view.activityId !== parameters['activityId'] ||
          awaiting?.kind !== 'confirmation'
        ) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PROMPT_STALE', 'Nothing is waiting for that answer.'),
          );
        }
        if (awaiting.promptId !== parameters['promptId']) {
          const code = activity.answered.has(String(parameters['promptId']))
            ? 'MACHINE_ACTION_PROMPT_CONSUMED'
            : 'MACHINE_ACTION_PROMPT_STALE';
          return this.remember(
            operationId,
            this.rejected(code, 'That question has already been answered or replaced.'),
          );
        }
        const answer = String(parameters['answer']);
        if (!awaiting.answers.some((candidate) => candidate.id === answer)) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'That is not one of the answers.'),
          );
        }
        activity.answered.add(awaiting.promptId);
        activity.answer?.(answer);
        return this.remember(operationId, this.accepted({ activityId: activity.view.activityId }));
      }
      case 'controller:grbl-simulator.lid.press': {
        const button = parameters['button'] as 'start' | 'hold' | 'reset';
        if (this.options.lid === undefined) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_UNSUPPORTED', 'Only the simulator has these buttons.'),
          );
        }
        this.options.lid(button);
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
        const axis = String(parameters['axis']).toLowerCase();
        if (!axes.includes(axis as Axis)) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', `The LongMill has no ${axis.toUpperCase()} axis.`),
          );
        }
        const feed = Math.min(Number(parameters['feed']), longMillMaximumRate);
        const reply = await this.send(
          `$J=G91G21${axis.toUpperCase()}${format(Number(parameters['distance']))}F${format(feed)}`,
        );
        return this.remember(
          operationId,
          this.replied(reply),
          this.after(() => this.status?.state === 'Idle'),
        );
      }
      case 'motion:motion.move': {
        const position = parameters['position'] as Partial<Position>;
        const isMachine = parameters['frame'] === 'machine';
        const target: Partial<Position> = { ...this.machine };
        for (const axis of axes) {
          const value = position[axis];
          if (value !== undefined) {
            target[axis] = isMachine ? value : value + this.workOrigin[axis];
          }
        }
        const outside = axes.find((axis) => {
          const value = target[axis];
          return (
            value !== undefined &&
            position[axis] !== undefined &&
            (value < longMillTravel[axis].min || value > longMillTravel[axis].max)
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
        const words = axes
          .filter((axis) => position[axis] !== undefined)
          .map((axis) => `${axis.toUpperCase()}${format(position[axis]!)}`);
        const { feed } = parameters;
        const motion = feed === undefined ? 'G0' : `G1F${format(Math.min(Number(feed), longMillMaximumRate))}`;
        const reply = await this.send(`G90G21${isMachine ? 'G53' : ''}${motion}${words.join('')}`);
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
        const offset = parameters['offset'] as GrblWorkOffset;
        const reply = await this.send(offset);
        await this.send('$G');
        return this.remember(operationId, this.replied(reply), () =>
          this.workOffset === offset ? { status: 'confirmed' } : { status: 'pending' },
        );
      }
      case 'motion:work-offset.set': {
        const offset = parameters['offset'] as GrblWorkOffset;
        const position = parameters['position'] as Partial<Position>;
        const { machine } = this;
        const words = axes
          .filter((axis) => position[axis] !== undefined)
          .map((axis) => `${axis.toUpperCase()}${format(position[axis]!)}`);
        if (words.length === 0 || machine === undefined) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Name at least one axis.'),
          );
        }
        const reply = await this.send(`G10L20P${String(grblWorkOffsets.indexOf(offset) + 1)}${words.join('')}`);
        this.offsetRevision += 1;
        await this.send('$#');
        return this.remember(operationId, this.replied(reply), () =>
          axes.every(
            (axis) =>
              position[axis] === undefined ||
              Math.abs((this.offsets[offset]?.[axis] ?? Number.NaN) - (machine[axis] - position[axis])) < 0.002,
          )
            ? { status: 'confirmed' }
            : { status: 'pending' },
        );
      }
      case 'touch-plate:probe.run': {
        const thickness = Number(parameters['plateThickness'] ?? 15);
        void this.probeActivity(thickness, operationId);
        const { activityId } = this.activity!.view;
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
        void this.toolChange(Number(parameters['tool']), { operationId });
        return this.remember(operationId, this.accepted({ activityId: this.activity!.view.activityId }));
      }
      case 'router:spindle.set': {
        if (parameters['mode'] === 'off') {
          if (this.dwellUntil > Date.now()) {
            // The timed run's dwell holds the line queue; a reset at rest drops the relay and keeps the position.
            this.dwellUntil = 0;
            this.realtime(grblRealtime.reset);
            return this.remember(operationId, this.accepted());
          }
          return this.remember(operationId, this.replied(await this.send('M5')));
        }
        // The relay switches on and the dwell and M5 are queued behind it, so the router stops by itself even when
        // Tau goes away. A feed hold during the dwell suspends it with the router still on.
        const seconds = Number(parameters['duration']);
        const reply = await this.send('M3');
        if (reply.type === 'ok') {
          this.dwellUntil = Date.now() + seconds * 1000;
          void this.send(`G4P${format(seconds)}`);
          void this.send('M5');
        }
        return this.remember(operationId, this.replied(reply));
      }
      case 'dust:switch.set': {
        const isOn = parameters['on'] === true;
        if (isRunLive) {
          if (this.accessories?.includes('F') !== isOn) {
            this.realtime(grblRealtime.floodToggle);
          }
          return this.remember(operationId, this.accepted());
        }
        return this.remember(operationId, this.replied(await this.send(isOn ? 'M8' : 'M9')));
      }
      case 'feed-override:level.set': {
        const target = Math.round(Number(parameters['ratio']) * 100);
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
        const option = String(parameters['option']);
        const byte = grblRapidOverrides[option];
        if (byte === undefined) {
          return this.remember(
            operationId,
            this.rejected('MACHINE_ACTION_PARAMETERS_INVALID', 'Rapids run at 100, 50 or 25 %.'),
          );
        }
        this.realtime(byte);
        return this.remember(
          operationId,
          this.accepted(),
          this.after(() => String(this.overrides?.rapid) === option),
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
  public beginJog(
    input: MachineProviderHoldInput,
    bound: number,
  ): MachineProviderHold | Readonly<{ code: MachineFailureCode; message: string }> {
    const parameters = input.parameters as Readonly<{ axis: string; direction: 1 | -1; feed: number }>;
    const axis = parameters.axis.toLowerCase() as Axis;
    if (!axes.includes(axis)) {
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
    const extend = async (): Promise<void> => {
      const now = Date.now();
      if (isReleased || isInFlight || Math.max(0, queuedUntil - now) + segment > bound) {
        return;
      }
      const next = (this.machine?.[axis] ?? 0) + 2 * distance;
      if (isTrusted && (next < longMillTravel[axis].min || next > longMillTravel[axis].max)) {
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
      }),
    );
    const isRunLive = this.run !== undefined && ['starting', 'running', 'paused', 'finishing'].includes(this.run.state);
    checks.push({
      id: 'idle',
      label: 'No other job is running',
      state: isRunLive ? 'blocked' : 'passed',
      source: 'observed',
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
      remoteName: name,
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
    if (this.status?.state !== 'Idle' || this.isBusy) {
      return this.remember(
        input.operationId,
        this.rejected('MACHINE_ACTION_PRECONDITION_FAILED', 'The machine must be idle to load a job.'),
      );
    }
    const text = await this.readText(input.artifact, input.signal);
    const name = input.artifact.path.split('/').at(-1) ?? input.artifact.path;
    const receipt = await this.startRun({
      runId: `run-${input.operationId}`,
      name,
      text,
      submission: input.submission,
    });
    return this.remember(input.operationId, receipt);
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
    while (this.queue[0] !== undefined && this.counter.fits(this.queue[0].line)) {
      const next = this.queue.shift()!;
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
    this.counter.clear();
    for (const resolve of this.inFlight.splice(0)) {
      resolve({ type: reason });
    }
    for (const item of this.queue.splice(0)) {
      item.sent();
      item.resolve({ type: reason });
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
        this.dwellUntil = 0;
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
          if ((grblWorkOffsets as readonly string[]).includes(word)) {
            this.selectOffset(word as GrblWorkOffset);
          }
          if (/^T\d+$/u.test(word) && Number(word.slice(1)) > 0) {
            this.tool ??= Number(word.slice(1));
          }
        }
        break;
      }
      case 'probe': {
        this.lastProbe = { position: toPosition(message.position, this.scale)!, isSuccess: message.isSuccess };
        break;
      }
      case 'offset': {
        const position = toPosition(message.values, this.scale);
        if (position !== undefined) {
          this.offsets[message.name] = position;
        }
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
      const origin = toPosition(status.workOffset, scale)!;
      if (axes.some((axis) => Math.abs(origin[axis] - this.workOrigin[axis]) > 1e-6)) {
        this.offsetRevision += 1;
      }
      this.workOrigin = origin;
    }
    const machine = toPosition(status.machine, scale);
    const work = toPosition(status.work, scale);
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
        run.startedAtMs ??= Date.now();
      } else if (status.state === 'Hold' && run.state === 'running' && previous?.state !== 'Hold') {
        run.state = 'paused';
        run.paused ??= { by: 'person', reason: 'Feed hold' };
      }
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
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

  private async probeActivity(thickness: number, operationId: string): Promise<void> {
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

  private endRun(state: 'completed' | 'cancelled' | 'failed', reason?: string): void {
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

  private pauseRun(run: Run, paused: NonNullable<Run['paused']>): void {
    run.state = 'paused';
    run.paused = paused;
    run.stage = undefined;
    run.gate = gate();
    this.notify();
  }

  private async feedOrFail(run: Run, lines: ReadonlyArray<Readonly<{ number: number; text: string }>>): Promise<void> {
    try {
      await this.feed(run, lines);
    } catch (error) {
      void this.options.runtime.log({ level: 'error', message: `Grbl stream failed: ${String(error)}` });
      this.endRun('failed', 'Tau stopped feeding the program.');
      this.notify();
    }
  }

  private async feed(run: Run, lines: ReadonlyArray<Readonly<{ number: number; text: string }>>): Promise<void> {
    const replies: Array<Promise<Reply>> = [];
    let hasMotion = false;
    for (const line of lines) {
      if (run.abort.signal.aborted) {
        return;
      }
      if (run.gate !== undefined) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- the stream waits while the run is paused.
        await run.gate.promise;
        run.gate = undefined;
      }
      let { text } = line;
      if (run.state === 'starting' && /M0?[3478](?!\d)/u.test(text)) {
        // A held controller still switches its relays: keep the router and the dust collector off until Play.
        // oxlint-disable-next-line eslint/no-await-in-loop -- the stream waits for the person at the machine.
        await this.waitFor(() => run.state !== 'starting' || run.abort.signal.aborted, 7 * 24 * 3_600_000);
      }
      if (/M0?6(?!\d)/u.test(text) && !hasMotion) {
        // The first bit was fitted before the start; the person vouched for it.
        this.tool = Number(/T(\d+)/u.exec(text)?.[1] ?? this.tool ?? 0);
        text = text.replace(/M0?6(?!\d)/u, '');
      }
      if (/M0?6(?!\d)/u.test(text)) {
        // Grbl rejects M6 (error 20): drain the planner, then a person changes the bit.
        // oxlint-disable-next-line eslint/no-await-in-loop -- the change happens between two program lines.
        await Promise.all(replies);
        // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
        await this.drained(run);
        const tool = Number(/T(\d+)/u.exec(text)?.[1] ?? this.tool ?? 0);
        this.pauseRun(run, { by: 'program', reason: `Tool change: fit bit T${String(tool)}` });
        // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
        const isChanged = await this.toolChange(tool, { runId: run.runId });
        if (!isChanged) {
          if (!isAborted(run)) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
            await this.halt();
          }
          return;
        }
        run.state = 'running';
        run.paused = undefined;
        run.gate = undefined;
        this.notify();
        text = text.replace(/M0?6(?!\d)/u, '');
      }
      if (text.replace(/T\d+/u, '').length === 0) {
        run.acknowledged += 1;
        continue;
      }
      hasMotion ||= /[XYZ]-?[\d.]/u.test(text);
      const { sent, reply } = this.transmit(text);
      replies.push(this.programReply(run, line.number, reply));
      // oxlint-disable-next-line eslint/no-await-in-loop -- character counting sends a line only when it fits.
      await sent;
    }
    await Promise.all(replies);
    await this.drained(run);
    if (!run.abort.signal.aborted) {
      this.endRun('completed');
      this.notify();
    }
  }

  private async programReply(run: Run, line: number, reply: Promise<Reply>): Promise<Reply> {
    const answer = await reply;
    this.onProgramReply(run, line, answer);
    return answer;
  }

  /**
   * Wait until a report taken after every reply so far shows the planner empty, after Play.
   * @param run - The run being fed.
   */
  private async drained(run: Run): Promise<void> {
    const sequence = this.reportSequence;
    await this.waitFor(
      () =>
        run.abort.signal.aborted ||
        (run.state === 'running' && this.reportSequence > sequence && this.status?.state === 'Idle'),
      7 * 24 * 3_600_000,
    );
  }

  private onProgramReply(run: Run, line: number, reply: Reply): void {
    if (reply.type === 'ok') {
      run.acknowledged += 1;
    } else if (reply.type === 'error' && this.run === run && this.streamError === undefined) {
      // Grbl drops the bad line and keeps running the next ones: hold now and let a person decide.
      run.acknowledged += 1;
      this.realtime(grblRealtime.feedHold);
      this.streamError = { code: reply.code, line };
      this.pauseRun(run, { by: 'machine', reason: `Line ${String(line)}: ${grblErrorSentence(reply.code)}` });
    }
    this.notify();
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
    return receipt;
  }

  private accepted(extra: Readonly<{ activityId?: string; runId?: string }> = {}): MachineCommandReceipt {
    return { status: 'accepted', observedAt: this.now(), ...extra };
  }

  private rejected(code: MachineFailureCode, message: string): MachineCommandReceipt {
    return { status: 'rejected', code, message, observedAt: this.now() };
  }

  private replied(reply: Reply): MachineCommandReceipt {
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
      return {
        id: options.id,
        name: options.name,
        vendor: manifest.identity.vendor,
        model: manifest.identity.model,
        firmware: controller.firmware,
        capabilities: {
          connection: manifest.connection,
          axes: manifest.axes,
          components: manifest.components,
          processes: manifest.processes,
          actions: controller.actions,
          holds: manifest.holds,
          jobs: manifest.jobs,
          stop: manifest.stop,
        },
      };
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
      try {
        while (!signal.aborted) {
          if (!isDirty) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- observations follow the controller one at a time.
            await changed();
            wake = undefined;
            continue;
          }
          isDirty = false;
          yield { type: 'snapshot', snapshot: controller.snapshot() };
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
