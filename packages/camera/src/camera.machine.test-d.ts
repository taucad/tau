import { expectTypeOf } from 'vitest';
import type { Actor, AnyStateMachine, EventFromLogic } from 'xstate';
import type { CameraView } from '#camera-domain.js';
import {
  cameraIgnoredEvents,
  cameraMachine,
  createCameraActor,
  selectCameraDriverSnapshot,
  selectCameraProjection,
} from '#camera.machine.js';
import type {
  CameraChange,
  CameraMachineEmitted,
  CameraMachineEvent,
  CameraMachineInput,
  CameraSource,
} from '#camera.machine.js';

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

// Provenance (charter D2, D20): the ten sources, and the change every driver snapshot carries.
expectTypeOf<CameraSource>().toEqualTypeOf<
  'input' | 'gizmo' | 'fit' | 'framing' | 'persisted' | 'focus' | 'viewport' | 'bounds' | 'up' | 'fov'
>();
expectTypeOf(selectCameraDriverSnapshot).returns.toHaveProperty('lastChange').toEqualTypeOf<CameraChange>();
expectTypeOf<CameraMachineEmitted['type']>().toEqualTypeOf<'viewChanged' | 'adoptionApplied' | 'adoptionDropped'>();
expectTypeOf<Extract<CameraMachineEmitted, { type: 'adoptionDropped' }>['reason']>().toEqualTypeOf<
  'dragging' | 'settling'
>();
expectTypeOf(createCameraActor).returns.toEqualTypeOf<Actor<typeof cameraMachine>>();
expectTypeOf(createCameraActor).parameter(0).toHaveProperty('input').toEqualTypeOf<CameraMachineInput>();

// A pose is observed from a drag source only, and `frameBounds` is a focus.
expectTypeOf<Extract<CameraMachineEvent, { type: 'poseObserved' }>['source']>().toEqualTypeOf<'input' | 'gizmo'>();
expectTypeOf<Extract<CameraMachineEvent, { type: 'frameGeometry' }>['source']>().toEqualTypeOf<'framing' | 'fit'>();
expectTypeOf<Extract<CameraMachineEvent, { type: 'frameBounds' }>['source']>().toEqualTypeOf<'focus'>();

// @ts-expect-error the home pose is gone (charter D9)
const saveHome: CameraMachineEvent = { type: 'saveHome' };
// @ts-expect-error the home pose is gone (charter D9)
const reset: CameraMachineEvent = { type: 'reset' };
void saveHome;
void reset;
