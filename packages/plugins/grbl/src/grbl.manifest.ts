/**
 * The Sienci Labs LongMill MK2 30×30 on its LongBoard controller (Arduino Uno, Grbl 1.1h), with the inductive homing
 * kit, a trim router and a dust collector on relays, and the 15 mm touch plate.
 *
 * Facts: lanes/grbl-router §3.14 and evidence/partB-machines.md B2 in the machine-actions research. Every value is a
 * published default; installed values differ, so the session reads `$$` back from the controller.
 *
 * @module
 */

import { quantity } from '@taucad/runtime/configuration/zod';
import { defineMachineAction, machineJogHold, standardMachineAction } from '@taucad/runtime/machine';
import type {
  MachineActionDefinition,
  MachineActionQualification,
  MachineManifestDefinition,
  MachineQualificationProfile,
  MachineStatus,
} from '@taucad/runtime/machine';
import { z } from 'zod';

/** Work coordinate systems Grbl 1.1 stores, in the order `G10 L20 P1`…`P6` numbers them. @internal */
export const grblWorkOffsets = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'] as const;

/** The LongMill MK2 30×30 travel after homing to front-left-top with the origin forced to zero. @internal */
export const longMillTravel = Object.freeze({
  x: { min: 0, max: 810 },
  y: { min: 0, max: 855 },
  z: { min: -120, max: 0 },
});

/** Machine travel per axis. Millimetres. @internal */
export type GrblTravel = Readonly<Record<'x' | 'y' | 'z', Readonly<{ min: number; max: number }>>>;

/**
 * The travel the controller's `$130`–`$132` give, homed to front-left-top with the origin forced to zero; the
 * LongMill MK2 30×30 defaults for any setting not read back yet.
 * @internal
 * @param settings - The `$$` settings as read back.
 * @returns Each axis's range, millimetres.
 */
export const grblTravel = (settings: ReadonlyMap<number, number>): GrblTravel => ({
  x: { min: 0, max: settings.get(130) ?? longMillTravel.x.max },
  y: { min: 0, max: settings.get(131) ?? longMillTravel.y.max },
  z: { min: -(settings.get(132) ?? -longMillTravel.z.min), max: 0 },
});

/** Fastest the LongMill moves (`$110`–`$112`). Millimetres per minute. @internal */
export const longMillMaximumRate = 4000;

/**
 * The one container a Grbl machine accepts: one G-code file. Grbl streams any text, so the extensions are the ones
 * Sienci's own sender opens for it (gSender 1.6.4 `FileControl/ButtonControlGroup.tsx:316`).
 * @internal
 */
export const grblAcceptedContainers: Extract<MachineManifestDefinition['jobs'], { type: 'supported' }>['accepts'] = [
  {
    contract: { id: 'tau.toolpath.gcode', version: 1 },
    mediaType: 'text/x.gcode',
    payloadSelection: 'single',
    requiredMembers: [],
    technology: 'subtractive.milling',
    extensions: ['.gcode', '.gc', '.nc', '.tap', '.cnc'],
  },
];

/** The simulation qualification profile every simulated action names. @internal */
export const grblSimulationProfile: MachineQualificationProfile = Object.freeze({
  id: 'grbl-simulation-2026-10',
  environment: 'simulation',
  model: 'LongMill MK2 30x30 (simulated LongBoard)',
  firmware: ['1.1h'],
  attachments: ['router', 'touch-plate', 'dust'],
  evidence: 'packages/plugins/grbl/src/grbl.session.test.ts against the virtual Grbl 1.1h controller.',
});

/** The simulator's lid buttons, so a person can press Play at a machine that is not there. @internal */
export const grblSimulatorLidAction = 'grbl-simulator.lid.press';

const idle: readonly MachineStatus[] = ['ready'];
const axisPosition = z
  .strictObject({
    x: z.number().optional().meta({ title: 'X' }),
    y: z.number().optional().meta({ title: 'Y' }),
    z: z.number().optional().meta({ title: 'Z' }),
  })
  .meta({ title: 'Position', description: 'Millimetres.' });
const offset = z.enum(grblWorkOffsets).meta({ title: 'Work offset' });

/** The touch plate's cycle: Z only. A provider narrows the family's schema, never widens it. */
const probeSchema = z.strictObject({
  cycle: z.enum(['z']).meta({ title: 'Cycle' }),
  plateThickness: z.number().min(0).max(50).default(15).meta({ title: 'Plate thickness', description: 'Millimetres.' }),
});

/** A relay router has one direction and no speed control: the dial on the router sets the speed. */
const routerSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('off') }),
  z.strictObject({
    mode: z.literal('clockwise'),
    duration: quantity({ unit: 's' }).positive().max(600).meta({ title: 'Stops by itself after' }),
  }),
]);

/**
 * The parameter schemas this manifest narrows from the standard families, and the simulator's own. The session parses
 * with these, so what it sends is exactly what the host validated.
 * @internal
 */
export const grblActionSchemas = {
  move: z.strictObject({
    frame: z.enum(['machine', 'work']).meta({ title: 'Coordinates' }),
    position: axisPosition,
    feed: quantity({ unit: 'mm/min' }).positive().max(longMillMaximumRate).optional().meta({ title: 'Feed' }),
  }),
  offsetSelect: z.strictObject({ offset }),
  offsetSet: z.strictObject({ offset, position: axisPosition }),
  probe: probeSchema,
  router: routerSchema,
  feedOverride: z.strictObject({
    ratio: quantity({ unit: '1' }).min(0.1).max(2).meta({ title: 'Feed', description: '1 is the programmed feed.' }),
  }),
  rapidOverride: z.strictObject({ option: z.enum(['100', '50', '25']).meta({ title: 'Rapids (%)' }) }),
  lid: z.strictObject({ button: z.enum(['start', 'hold', 'reset']).meta({ title: 'Button' }) }),
} as const;

/**
 * The LongMill manifest, with every action `designed` (or `qualified` under one profile, for the simulator).
 * @internal
 * @param qualification - What every action is qualified as.
 * @param extra - Further provider actions, such as the simulator's lid buttons.
 * @returns The authored manifest.
 */
export const longMillManifest = (
  qualification?: MachineActionQualification,
  extra: readonly MachineActionDefinition[] = [],
): MachineManifestDefinition => {
  const q = qualification === undefined ? {} : { qualification };
  return {
    version: 3,
    identity: {
      typeId: 'sienci.longmill-mk2-30x30',
      vendor: 'Sienci Labs',
      model: 'longmill-mk2-30x30',
      displayName: 'LongMill MK2 30×30',
      family: 'LongMill',
    },
    // A serial port has one owner, opening it resets an Uno, and Grbl cannot prove which machine it is.
    connection: { transport: 'serial', exclusive: true, opening: 'resets-controller', identity: 'claimed' },
    axes: [
      {
        id: 'x',
        label: 'X',
        kind: 'linear',
        unit: 'mm',
        travel: longMillTravel.x,
        carries: 'tool',
        ridesOn: 'y',
        reference: 'cycle',
      },
      {
        id: 'y',
        label: 'Y',
        kind: 'linear',
        unit: 'mm',
        travel: longMillTravel.y,
        carries: 'tool',
        reference: 'cycle',
      },
      {
        id: 'z',
        label: 'Z',
        kind: 'linear',
        unit: 'mm',
        travel: longMillTravel.z,
        carries: 'tool',
        ridesOn: 'x',
        reference: 'cycle',
      },
    ],
    components: [
      { id: 'controller', kind: 'controller', label: 'LongBoard' },
      { id: 'motion', kind: 'motion', label: 'Axes', axes: ['x', 'y', 'z'] },
      {
        id: 'router',
        kind: 'spindle',
        label: 'Router',
        control: 'switched',
        speed: { min: 10_000, max: 30_000 },
        directions: ['clockwise'],
      },
      {
        id: 'tools',
        kind: 'tools',
        label: 'Bit',
        change: 'manual',
        pockets: 0,
        measures: 'never',
        lengthReference: 'none',
      },
      { id: 'touch-plate', kind: 'probe', label: 'Touch plate', finds: 'work' },
      { id: 'dust', kind: 'extraction', label: 'Dust collector' },
      { id: 'feed-override', kind: 'override', label: 'Feed' },
      { id: 'rapid-override', kind: 'override', label: 'Rapids' },
    ],
    processes: [
      {
        type: 'milling',
        version: 1,
        simultaneousAxes: 3,
        features: ['arcs'],
        workOffsets: [...grblWorkOffsets],
        workArea: { x: 810, y: 855, z: 120 },
      },
    ],
    actions: [
      // Feed hold keeps the router turning in the cut, so an agent pausing a CNC run needs a person's approval.
      standardMachineAction({
        id: 'run.pause',
        componentId: 'controller',
        label: 'Feed hold',
        when: ['active'],
        safety: { authority: 'approved-agent' },
        consequence: 'Motion slows to a stop. The router keeps spinning in the cut.',
        outcome: {
          motion: 'decelerates',
          spindle: 'keeps-turning',
          heaters: 'none',
          position: 'kept',
          recovery: [{ type: 'action', componentId: 'controller', action: 'run.resume' }],
        },
        ...q,
      }),
      standardMachineAction({
        id: 'run.resume',
        componentId: 'controller',
        label: 'Resume',
        when: ['held'],
        safety: { authority: 'person', attended: true },
        consequence: 'Motion restarts where it stopped.',
        ...q,
      }),
      // Hold, wait until the machine has stopped, then reset: a reset while moving loses the position.
      standardMachineAction({
        id: 'run.cancel',
        componentId: 'controller',
        label: 'Stop job',
        when: ['active', 'held'],
        consequence: 'The job cannot be continued from here.',
        outcome: { motion: 'decelerates', spindle: 'stops', heaters: 'none', position: 'kept', recovery: [] },
        ...q,
      }),
      standardMachineAction({
        id: 'controller.unlock',
        componentId: 'controller',
        label: 'Unlock',
        when: ['alarm'],
        consequence: 'Clears the alarm without homing. The position may be wrong until the machine homes.',
        ...q,
      }),
      standardMachineAction({
        id: 'motion.home',
        componentId: 'motion',
        label: 'Home',
        when: ['ready', 'alarm'],
        ...q,
      }),
      standardMachineAction({
        id: 'motion.jog',
        componentId: 'motion',
        label: 'Jog',
        when: idle,
        requires: [{ componentId: 'motion', group: 'position' }],
        ...q,
      }),
      standardMachineAction({
        id: 'motion.move',
        componentId: 'motion',
        label: 'Go to',
        when: idle,
        requires: [{ componentId: 'motion', group: 'position' }],
        schema: grblActionSchemas.move,
        ...q,
      }),
      standardMachineAction({
        id: 'work-offset.select',
        componentId: 'motion',
        label: 'Use work offset',
        when: idle,
        schema: grblActionSchemas.offsetSelect,
        ...q,
      }),
      standardMachineAction({
        id: 'work-offset.set',
        componentId: 'motion',
        label: 'Set zero here',
        when: idle,
        requires: [{ componentId: 'motion', group: 'position' }],
        schema: grblActionSchemas.offsetSet,
        ...q,
      }),
      standardMachineAction({
        id: 'probe.run',
        componentId: 'touch-plate',
        label: 'Probe with the touch plate',
        when: idle,
        schema: grblActionSchemas.probe,
        consequence: 'The bit moves down until it touches the plate. Attach the magnet first; the router must be off.',
        requires: [{ componentId: 'touch-plate', group: 'inputs' }],
        ...q,
      }),
      standardMachineAction({
        id: 'tool.change',
        componentId: 'tools',
        label: 'Change bit',
        when: idle,
        consequence: 'The machine parks, a person changes the bit, then Z is probed again.',
        confirms: 'none',
        ...q,
      }),
      standardMachineAction({
        id: 'spindle.set',
        componentId: 'router',
        label: 'Router',
        when: idle,
        schema: grblActionSchemas.router,
        consequence: 'The relay switches the router; its own dial sets the speed.',
        confirms: 'acknowledgement',
        ...q,
      }),
      standardMachineAction({
        id: 'switch.set',
        componentId: 'dust',
        label: 'Dust collector',
        when: ['ready', 'active', 'held'],
        confirms: 'acknowledgement',
        ...q,
      }),
      standardMachineAction({
        id: 'level.set',
        componentId: 'feed-override',
        label: 'Feed override',
        when: ['active', 'held'],
        effects: ['motion'],
        schema: grblActionSchemas.feedOverride,
        ...q,
      }),
      standardMachineAction({
        id: 'option.set',
        componentId: 'rapid-override',
        label: 'Rapid override',
        when: ['active', 'held'],
        effects: ['motion'],
        schema: grblActionSchemas.rapidOverride,
        ...q,
      }),
      standardMachineAction({
        id: 'interaction.respond',
        componentId: 'controller',
        label: 'Continue',
        when: ['ready', 'held'],
        effects: ['motion', 'spindle'],
        safety: { attended: true },
        ...q,
      }),
      ...extra,
    ],
    // Grbl has no jog watchdog: the session sends segments of at most 150 ms of travel and cancels on release.
    holds: [machineJogHold({ componentId: 'motion', lease: 100, bound: 150, ...q })],
    jobs: {
      type: 'supported',
      accepts: grblAcceptedContainers,
      // Grbl stores nothing: Tau feeds every line for the whole job. It fills the buffer under a feed hold and the
      // person presses Play on the LongBoard's lid: on a machine with no interlock, that press is the proof of presence.
      delivery: 'streamed',
      start: 'at-machine',
      attestations: [
        { id: 'stock-clamped', label: 'The stock is clamped and nothing loose is on the bed' },
        { id: 'bit-installed', label: 'The bit in the router is the first one the program uses' },
        { id: 'plate-removed', label: 'The touch plate and its magnet are put away' },
        { id: 'router-on', label: 'The router is switched on at its own switch, dial set' },
        { id: 'protection-worn', label: 'Eye and hearing protection are on' },
        { id: 'work-area-clear', label: 'The previous part is removed and the bed is clear' },
      ],
      safety: { authority: 'person', attended: true, interlocks: [] },
    },
    // Feed hold, then a reset once motion has stopped: position is kept and the relays drop.
    stop: { motion: 'decelerates', spindle: 'stops', heaters: 'none', position: 'kept', recovery: [] },
    observations: [
      { group: 'state', label: 'State', staleAfter: 2000, delivery: 'retained' },
      { group: 'position', label: 'Position', staleAfter: 1000, delivery: 'latest' },
      { group: 'accessories', label: 'Router and dust collector', staleAfter: 2000, delivery: 'latest' },
      { group: 'tools', label: 'Bit', staleAfter: 3_600_000, delivery: 'retained' },
      { group: 'inputs', label: 'Inputs', staleAfter: 1000, delivery: 'latest' },
    ],
    qualifications: qualification?.status === 'qualified' ? [grblSimulationProfile] : [],
  };
};

/**
 * The simulator's lid buttons: Play (cycle start), Pause (feed hold) and Stop (reset), pressed at the virtual machine.
 * @internal
 * @param qualification - Its qualification.
 * @returns The action definition.
 */
export const grblSimulatorLid = (qualification: MachineActionQualification): MachineActionDefinition =>
  defineMachineAction(
    {
      componentId: 'controller',
      id: grblSimulatorLidAction,
      version: 1,
      label: 'Press a lid button (simulation)',
      description: 'What a person standing at the machine would press.',
      effects: ['run', 'motion'],
      scope: 'any',
      when: ['ready', 'active', 'held', 'alarm', 'unknown'],
      safety: { authority: 'person', attended: true, interlocks: [] },
      qualification,
      requires: [],
      confirms: 'acknowledgement',
    },
    grblActionSchemas.lid,
  );
