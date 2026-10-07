import { describe, expectTypeOf, it } from 'vitest';
import type { CaptureImagesRpcSuccess } from '#schemas/rpc.schema.js';
import type { ScreenshotOutput, ScreenshotAngle } from '#schemas/tools/screenshot.tool.schema.js';

type CanonicalScreenshotAngle = 'isometric' | 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';

describe('screenshot view and camera contract', () => {
  it('keeps declared view IDs distinct from finite 3D camera angles', () => {
    expectTypeOf<ScreenshotAngle>().toEqualTypeOf<CanonicalScreenshotAngle>();
    expectTypeOf<ScreenshotOutput['images'][number]['view']>().toEqualTypeOf<string>();
    expectTypeOf<CaptureImagesRpcSuccess['images'][number]['angle']>().toEqualTypeOf<ScreenshotAngle | undefined>();
  });

  it('rejects drawing as a camera angle', () => {
    expectTypeOf<'drawing'>().not.toExtend<ScreenshotAngle>();
  });
});
