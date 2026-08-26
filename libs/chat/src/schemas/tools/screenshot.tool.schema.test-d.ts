import { describe, expectTypeOf, it } from 'vitest';
import type { CaptureImagesRpcSuccess } from '#schemas/rpc.schema.js';
import type { ScreenshotOutput, ScreenshotView } from '#schemas/tools/screenshot.tool.schema.js';

type CanonicalScreenshotView = 'isometric' | 'drawing' | 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';

describe('screenshot view contract', () => {
  it('should infer the canonical view union across tool and RPC results', () => {
    expectTypeOf<ScreenshotView>().toEqualTypeOf<CanonicalScreenshotView>();
    expectTypeOf<ScreenshotOutput['images'][number]['view']>().toEqualTypeOf<CanonicalScreenshotView>();
    expectTypeOf<CaptureImagesRpcSuccess['images'][number]['view']>().toEqualTypeOf<CanonicalScreenshotView>();
  });

  it('should reject the removed composite view', () => {
    expectTypeOf<'composite'>().not.toExtend<ScreenshotView>();
  });
});
