import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine } from 'xstate';
import type { CameraView } from '#camera-domain.js';
import { cameraMachine, selectCameraProjection } from '#camera.machine.js';

it('preserves the complete camera.machine type contracts', () => {
  expectTypeOf(cameraMachine).toExtend<AnyStateMachine>();
  expectTypeOf<CameraView>().toHaveProperty('perspectiveZoom').toEqualTypeOf<number>();
  expectTypeOf(selectCameraProjection).returns.toEqualTypeOf<
    { readonly kind: 'orthographic' } | { readonly kind: 'perspective'; readonly verticalFieldOfView: number }
  >();
});
