import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type { CaptureImagesRpcSuccess } from '#schemas/rpc.schema.js';
import type {
  ScreenshotOutput,
  ScreenshotAngle,
  ScreenshotSection,
  screenshotSectionSchema,
} from '#schemas/tools/screenshot.tool.schema.js';

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

describe('screenshot section in metres', () => {
  it('should give a parsed section a required offset in metres and no millimetre alias', () => {
    expectTypeOf<ScreenshotSection>().toEqualTypeOf<{
      plane: 'xy' | 'xz' | 'yz';
      offset: number;
      keep?: 'negative' | 'positive' | undefined;
    }>();
    const cutAt = (section: ScreenshotSection): number => section.offset;
    expectTypeOf(cutAt({ plane: 'xy', offset: 0.006 })).toEqualTypeOf<number>();
    expectTypeOf(cutAt({ plane: 'yz', offset: -0.0125, keep: 'negative' })).toEqualTypeOf<number>();

    // @ts-expect-error -- a parsed section carries offset alone; offsetMm is parsed away
    cutAt({ plane: 'xy', offsetMm: 6 });
    // @ts-expect-error -- offset is required once parsed
    cutAt({ plane: 'xy' });
    // @ts-expect-error -- offsetMm never reaches a consumer of the parsed section
    cutAt({ plane: 'xy', offset: 0.006, offsetMm: 6 });
  });

  it('should still accept the deprecated millimetre spelling as input', () => {
    expectTypeOf<{ plane: 'xy'; offsetMm: number }>().toExtend<z.input<typeof screenshotSectionSchema>>();
    expectTypeOf<{ plane: 'xy'; offset: number }>().toExtend<z.input<typeof screenshotSectionSchema>>();
  });
});
