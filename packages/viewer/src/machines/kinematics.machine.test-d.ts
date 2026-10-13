import { expectTypeOf } from 'vitest';
import type { ActorRefFrom, AnyStateMachine, EventFromLogic } from 'xstate';
import { kinematicsMachine } from '#machines/kinematics.machine.js';
import type { KinematicsMachineEvent, KinematicsUnitState } from '#machines/kinematics.machine.js';

expectTypeOf(kinematicsMachine).toExtend<AnyStateMachine>();
// The viewer (L5) and end-to-end bridge code against exactly this event contract: the machine takes every
// exported event and no other.
expectTypeOf<EventFromLogic<typeof kinematicsMachine>['type']>().toEqualTypeOf<KinematicsMachineEvent['type']>();
declare const kinematics: ActorRefFrom<typeof kinematicsMachine>;
declare const event: KinematicsMachineEvent;
kinematics.send(event);
// Drag arming (shared with the viewer): the pane sends `setDragEnabled`, the viewer reads `dragEnabled`.
expectTypeOf<Extract<KinematicsMachineEvent, { type: 'setDragEnabled' }>>().toEqualTypeOf<{
  type: 'setDragEnabled';
  unitId: string;
  enabled: boolean;
}>();
// @ts-expect-error -- `enabled` is required
kinematics.send({ type: 'setDragEnabled', unitId: 'file:main.ts' });
expectTypeOf<KinematicsUnitState['dragEnabled']>().toEqualTypeOf<boolean>();
