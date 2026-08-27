import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';
import type { CameraView } from '#camera-domain.js';
import { cameraMachine, selectCameraProjection, selectCameraView } from '#camera.machine.js';

expectTypeOf(cameraMachine).toExtend<AnyStateMachine>();
expectTypeOf(selectCameraView).returns.toEqualTypeOf<CameraView>();
expectTypeOf<CameraView>().toHaveProperty('perspectiveZoom').toEqualTypeOf<number>();
expectTypeOf(selectCameraProjection).returns.toEqualTypeOf<
  { readonly kind: 'orthographic' } | { readonly kind: 'perspective'; readonly verticalFieldOfView: number }
>();
