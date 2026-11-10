import { expectTypeOf } from 'vitest';
import type { AnyStateMachine, EventFromLogic } from 'xstate';
import type { CameraView } from '#camera-domain.js';
import { cameraIgnoredEvents, cameraMachine, selectCameraProjection } from '#camera.machine.js';
import type { CameraMachineEvent } from '#camera.machine.js';

type MachineEvent = EventFromLogic<typeof cameraMachine>;

expectTypeOf(cameraMachine).toExtend<AnyStateMachine>();
expectTypeOf<CameraView>().toHaveProperty('perspectiveZoom').toEqualTypeOf<number>();
expectTypeOf(selectCameraProjection).returns.toEqualTypeOf<
  { readonly kind: 'orthographic' } | { readonly kind: 'perspective'; readonly verticalFieldOfView: number }
>();

// The exported alphabet is exactly the machine's events (mutual extension: the schema map rebuilds payloads).
expectTypeOf<MachineEvent['type']>().toEqualTypeOf<CameraMachineEvent['type']>();
expectTypeOf<CameraMachineEvent>().toExtend<MachineEvent>();
expectTypeOf<MachineEvent>().toExtend<CameraMachineEvent>();
expectTypeOf(cameraIgnoredEvents).toEqualTypeOf<ReadonlyArray<readonly [state: string, eventType: string]>>();

// @ts-expect-error an event outside the alphabet is not a camera event
const bogus: CameraMachineEvent = { type: 'bogus' };
// @ts-expect-error `setVerticalFieldOfView` requires its payload
const missingPayload: CameraMachineEvent = { type: 'setVerticalFieldOfView' };
void bogus;
void missingPayload;
