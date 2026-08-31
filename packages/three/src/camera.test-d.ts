import { expectTypeOf } from 'vitest';
import type { OrthographicCamera, PerspectiveCamera } from 'three';
import type { ThreeCameraClipPlanePolicy } from '#camera.js';
import { createThreeCameraDriver, createThreeCameraRig } from '#camera.js';

expectTypeOf(createThreeCameraRig).returns.toHaveProperty('activeCamera');
expectTypeOf(createThreeCameraRig).returns.toHaveProperty('setClipPlanes');
expectTypeOf(createThreeCameraRig).returns.toHaveProperty('dispose');
expectTypeOf(createThreeCameraRig).returns.toHaveProperty('perspectiveCamera').toEqualTypeOf<PerspectiveCamera>();
expectTypeOf(createThreeCameraRig).returns.toHaveProperty('orthographicCamera').toEqualTypeOf<OrthographicCamera>();
expectTypeOf(createThreeCameraDriver).toBeFunction();
expectTypeOf<ThreeCameraClipPlanePolicy>().toEqualTypeOf<
  Readonly<{ farPaddingVerticalSpans: number; presentationPlaneOffsetMeters?: number }>
>();
