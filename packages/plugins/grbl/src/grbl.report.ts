/**
 * The report a Grbl session gives: state, components, run, activities, checks, availability and alerts, read from the
 * controller's latest status report and what the session itself is doing.
 *
 * @module
 */

import type {
  ComponentObservation,
  MachineAlert,
  MachineAvailability,
  MachineCheck,
  MachineFailureCode,
  MachineObservation,
  MachineRemedy,
  MachineReport,
  MachineRun,
  MachineStatus,
} from '@taucad/runtime/machine';

import { grblSimulatorLidAction } from '#grbl.manifest.js';
import { grblAlarm, grblErrorSentence } from '#grbl.protocol.js';
import type { GrblController } from '#grbl.session.js';

/** Actions a timed router run leaves available: realtime bytes and answers, which never queue behind its dwell. */
const realtimeActions = new Set([
  'run.pause',
  'run.resume',
  'run.cancel',
  'level.set',
  'option.set',
  'interaction.respond',
  'spindle.set',
  grblSimulatorLidAction,
]);

/* eslint-disable @typescript-eslint/naming-convention -- Grbl's own state words. */
const statusWords: Readonly<Record<string, MachineStatus>> = {
  Idle: 'ready',
  Run: 'active',
  Jog: 'active',
  Home: 'active',
  Check: 'active',
  Tool: 'held',
  Hold: 'held',
  Door: 'held',
  Alarm: 'alarm',
  Sleep: 'asleep',
};
/* eslint-enable @typescript-eslint/naming-convention -- Back to the house style. */
const grblReference = 'https://github.com/gnea/grbl/blob/master/doc/markdown/interface.md';

/**
 * The normalized state.
 * @param controller - The live connection.
 * @returns The status, the controller's own word for it, and why.
 */
const stateOf = (controller: GrblController): MachineReport['state'] => {
  if (controller.status === undefined) {
    return { status: 'unknown', reason: 'Waiting for the controller to report.' };
  }
  if (controller.activity?.view.kind === 'homing' && controller.isBusy) {
    return { status: 'active', reason: 'Homing', native: 'Home' };
  }
  const { native } = controller.status;
  if (controller.alarm !== undefined) {
    // A critical alarm stops Grbl answering `?`, so the alarm line is the last word until a reset.
    return { status: 'alarm', native: 'Alarm', reason: grblAlarm(controller.alarm).sentence };
  }
  if (controller.run?.state === 'paused' && controller.run.paused !== undefined) {
    return {
      status: 'held',
      native,
      ...(controller.run.paused.reason === undefined ? {} : { reason: controller.run.paused.reason }),
    };
  }
  const status = statusWords[controller.status.state] ?? 'unknown';
  if (status === 'alarm') {
    return { status, native, reason: 'Homing is required after the controller restarted.' };
  }
  return { status, native };
};

const observation = (
  controller: GrblController,
  key: Readonly<{ componentId: string; group: string }>,
  value: ComponentObservation | undefined,
): ComponentObservation => {
  return (
    value ?? {
      ...key,
      receivedAt: controller.reportedAt ?? controller.now(),
      knowledge: 'unknown',
      reason: 'The controller has not reported this yet.',
    }
  );
};

/**
 * The component observations from the latest report.
 * @param controller - The live connection.
 * @returns The observation of every declared component group.
 */
// oxlint-disable-next-line eslint/complexity -- One observation per declared component.
const components = (controller: GrblController): ComponentObservation[] => {
  const receivedAt = controller.reportedAt ?? controller.now();
  const known = (
    componentId: string,
    group: string,
    value: Extract<ComponentObservation, { knowledge: 'known' }>['value'],
  ): ComponentObservation => ({
    componentId,
    group,
    receivedAt,
    knowledge: 'known',
    value,
  });
  const { machine } = controller;
  const { status } = controller;
  const { accessories } = controller;
  return [
    known('controller', 'state', {
      kind: 'readings',
      values: [
        { id: 'firmware', label: 'Firmware', value: controller.firmware },
        ...(status?.buffer === undefined
          ? []
          : [{ id: 'planner', label: 'Planner blocks free', value: status.buffer.blocks }]),
      ],
    }),
    observation(
      controller,
      { componentId: 'motion', group: 'position' },
      machine === undefined
        ? undefined
        : known('motion', 'position', {
            kind: 'motion',
            homed: { x: controller.homed, y: controller.homed, z: controller.homed },
            trust: controller.trust,
            position: {
              machine: { ...machine },
              work: {
                x: machine.x - controller.workOrigin.x,
                y: machine.y - controller.workOrigin.y,
                z: machine.z - controller.workOrigin.z,
              },
            },
            workOffset: {
              id: controller.workOffset,
              revision: `r${String(controller.offsetRevision)}`,
              origin: { ...controller.workOrigin },
            },
            mode: 'normal',
            feed: (status?.feed ?? 0) * controller.scale,
            limits: [...(status?.pins ?? '')].filter((pin) => 'XYZ'.includes(pin)).map((pin) => pin.toLowerCase()),
          }),
    ),
    observation(
      controller,
      { componentId: 'router', group: 'accessories' },
      accessories === undefined
        ? undefined
        : known('router', 'accessories', {
            kind: 'spindle',
            mode: accessories.includes('S') ? 'clockwise' : accessories.includes('C') ? 'counterclockwise' : 'off',
            commanded: accessories.includes('S') || accessories.includes('C') ? (status?.spindle ?? 0) : 0,
          }),
    ),
    observation(
      controller,
      { componentId: 'dust', group: 'accessories' },
      accessories === undefined
        ? undefined
        : known('dust', 'accessories', { kind: 'switch', on: accessories.includes('F') }),
    ),
    observation(
      controller,
      { componentId: 'feed-override', group: 'state' },
      controller.overrides === undefined
        ? undefined
        : known('feed-override', 'state', { kind: 'level', ratio: controller.overrides.feed / 100 }),
    ),
    observation(
      controller,
      { componentId: 'rapid-override', group: 'state' },
      controller.overrides === undefined
        ? undefined
        : known('rapid-override', 'state', { kind: 'option', option: String(controller.overrides.rapid) }),
    ),
    known('tools', 'tools', {
      kind: 'tools',
      ...(controller.tool === undefined ? {} : { current: controller.tool }),
      table: {
        revision: `t${String(controller.tool ?? 0)}`,
        rows: controller.tool === undefined ? [] : [{ number: controller.tool, measured: false }],
      },
    }),
    // ponytail: a wired plate is always connected; Grbl reports only whether it touches (`Pn:P`).
    observation(
      controller,
      { componentId: 'touch-plate', group: 'inputs' },
      status === undefined
        ? undefined
        : known('touch-plate', 'inputs', {
            kind: 'probe',
            triggered: status.pins?.includes('P') === true,
            connected: true,
          }),
    ),
  ];
};

/**
 * The run as surfaces show it.
 * @param controller - The live connection.
 * @returns The run, or undefined before the first job.
 */
const runOf = (controller: GrblController): MachineRun | undefined => {
  const { run } = controller;
  if (run === undefined) {
    return undefined;
  }
  return {
    runId: run.runId,
    origin: 'tau',
    delivery: 'streamed',
    state: run.state,
    ...(run.paused === undefined ? {} : { paused: run.paused }),
    program: { name: run.name },
    ...(run.startedAt === undefined ? {} : { startedAt: run.startedAt }),
    ...(run.endedAt === undefined ? {} : { endedAt: run.endedAt }),
    progress: {
      basis: 'queued',
      fraction: run.total === 0 ? 1 : Math.min(1, run.acknowledged / run.total),
      ...(run.startedAt === undefined ? {} : { elapsed: Date.parse(controller.now()) - Date.parse(run.startedAt) }),
      counters: [{ id: 'lines', label: 'Lines', current: run.acknowledged, total: run.total }],
    },
    ...(run.stage === undefined ? {} : { stage: run.stage }),
  };
};

/**
 * Active diagnostics with what clears them.
 * @param controller - The live connection.
 * @returns The alerts.
 */
const alerts = (controller: GrblController): MachineAlert[] => {
  const alerts: MachineAlert[] = [];
  if (controller.alarm !== undefined) {
    const alarm = grblAlarm(controller.alarm);
    alerts.push({
      code: `ALARM:${String(controller.alarm)}`,
      severity: alarm.isCritical ? 'fatal' : 'serious',
      message: alarm.sentence,
      reference: grblReference,
      blocks: 'motion',
      remedies:
        alarm.position === 'lost' && controller.isHomingEnabled
          ? [
              { type: 'action', componentId: 'motion', action: 'motion.home' },
              { type: 'action', componentId: 'controller', action: 'controller.unlock' },
            ]
          : [{ type: 'action', componentId: 'controller', action: 'controller.unlock' }],
    });
  } else if (controller.isHomingEnabled && controller.isHomingRequired && controller.status?.state === 'Alarm') {
    alerts.push({
      code: 'homing-required',
      severity: 'warning',
      message: 'The controller restarted when Tau opened its port, so it does not know where it is.',
      blocks: 'motion',
      remedies: [
        { type: 'action', componentId: 'motion', action: 'motion.home' },
        { type: 'action', componentId: 'controller', action: 'controller.unlock' },
      ],
    });
  }
  if (controller.streamError !== undefined && controller.run?.state === 'paused') {
    alerts.push({
      code: `error:${String(controller.streamError.code)}`,
      severity: 'serious',
      message: `Line ${String(controller.streamError.line)}: ${grblErrorSentence(controller.streamError.code)}`,
      reference: grblReference,
      blocks: 'run',
      remedies: [
        { type: 'action', componentId: 'controller', action: 'run.resume' },
        { type: 'action', componentId: 'controller', action: 'run.cancel' },
      ],
    });
  }
  return alerts;
};

/**
 * Machine-level facts a start depends on.
 * @param controller - The live connection.
 * @returns The checks.
 */
export const grblChecks = (controller: GrblController): MachineCheck[] => {
  const isTrusted = controller.trust === 'homed' || controller.trust === 'kept';
  const position: MachineCheck = isTrusted
    ? { id: 'position', label: 'The machine knows where it is', state: 'passed', source: 'observed' }
    : controller.isHomingEnabled
      ? {
          id: 'position',
          label: 'The machine knows where it is',
          state: 'blocked',
          source: 'observed',
          detail: 'Home the machine first.',
          remedy: { type: 'action', componentId: 'motion', action: 'motion.home' },
        }
      : {
          id: 'position',
          label: 'The machine knows where it is',
          state: 'unknown',
          source: 'observed',
          detail: 'Without homing switches the job runs from the work zero you set.',
        };
  return [
    position,
    {
      id: 'alarm',
      label: 'No alarm',
      state: controller.status?.state === 'Alarm' ? 'blocked' : 'passed',
      source: 'observed',
      ...(controller.status?.state === 'Alarm'
        ? { remedy: { type: 'action', componentId: 'controller', action: 'controller.unlock' } as const }
        : {}),
    },
  ];
};

/**
 * The provider's own answer for every declared action and hold.
 * @param controller - The live connection.
 * @returns One answer per declared action and hold.
 */
const availability = (controller: GrblController): MachineAvailability[] => {
  const busy = controller.isBusy
    ? `Finish ${controller.activity?.view.label.toLowerCase() ?? 'the procedure'} first.`
    : undefined;
  const timed = controller.isRouterTimed ? 'The router is on a timed run. Switch it off first.' : undefined;
  const isTouching = controller.status?.pins?.includes('P') === true;
  const declared = [...controller.actions, ...controller.options.manifest.holds];
  return declared.map((descriptor): MachineAvailability => {
    const key = { componentId: descriptor.componentId, id: descriptor.id };
    const unavailable = (code: MachineFailureCode, message: string, remedy?: MachineRemedy): MachineAvailability => ({
      ...key,
      state: 'unavailable',
      code,
      message,
      ...(remedy === undefined ? {} : { remedy }),
    });
    if (descriptor.id === 'interaction.respond') {
      return controller.activity?.view.awaiting === undefined
        ? unavailable('MACHINE_ACTION_PRECONDITION_FAILED', 'Nothing is waiting for an answer.')
        : { ...key, state: 'available' };
    }
    const isProcedure = descriptor.effects.some(
      (effect) => effect === 'motion' || effect === 'spindle' || effect === 'coordinates',
    );
    if (
      busy !== undefined &&
      isProcedure &&
      !descriptor.id.startsWith('run.') &&
      descriptor.id !== grblSimulatorLidAction
    ) {
      return unavailable('MACHINE_ACTION_BUSY', busy);
    }
    if (timed !== undefined && !realtimeActions.has(descriptor.id)) {
      return unavailable('MACHINE_ACTION_BUSY', timed);
    }
    if (descriptor.id === 'probe.run' && isTouching) {
      return unavailable('MACHINE_ACTION_PRECONDITION_FAILED', 'The bit already touches the plate.', {
        type: 'person',
        instruction: 'Lift the bit off the plate, or check the magnet is not shorting the plate.',
      });
    }
    return { ...key, state: 'available' };
  });
};

/**
 * The whole report.
 * @param controller - The live connection.
 * @returns What the controller reports now, normalized.
 */
export const grblReport = (controller: GrblController): MachineReport => {
  const run = runOf(controller);
  return {
    connection: controller.isConnected ? 'connected' : 'disconnected',
    observedAt: controller.reportedAt ?? controller.now(),
    state: stateOf(controller),
    ...(run === undefined ? {} : { run }),
    components: components(controller),
    activities: controller.activity === undefined ? [] : [controller.activity.view],
    checks: grblChecks(controller),
    availability: availability(controller),
    alerts: alerts(controller),
  };
};

/**
 * A snapshot first and whenever more than component groups moved; otherwise only the groups that moved, with their
 * new `receivedAt`, which is what keeps them fresh. Undefined when nothing moved.
 * @internal
 * @param previous - The report observed last, if any.
 * @param report - The report now.
 * @returns The observation to yield, or undefined.
 */
export const grblObservation = (
  previous: MachineReport | undefined,
  report: MachineReport,
): MachineObservation | undefined => {
  if (previous === undefined) {
    return { type: 'snapshot', snapshot: report };
  }
  const { components, observedAt, ...rest } = report;
  const { components: before, observedAt: _before, ...previousRest } = previous;
  if (JSON.stringify(rest) !== JSON.stringify(previousRest)) {
    return { type: 'snapshot', snapshot: report };
  }
  const seen = new Set(before.map((observation) => JSON.stringify(observation)));
  const moved = components.filter((observation) => !seen.has(JSON.stringify(observation)));
  return moved.length === 0 ? undefined : { type: 'changed', observedAt, components: moved };
};
