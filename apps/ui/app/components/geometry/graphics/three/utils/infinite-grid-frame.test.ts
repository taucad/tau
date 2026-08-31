// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RenderFrame } from '@taucad/spatial';
import {
  infiniteGridFadeEndRatio,
  infiniteGridFadeEndVisibleSpans,
  infiniteGridFadeStartRatio,
  infiniteGridProxyDistanceVisibleSpans,
  resolveInfiniteGridFrame,
} from '#components/geometry/graphics/three/utils/infinite-grid-frame.js';

const physicalUvAt = ({
  coordinateMeters,
  originMeters,
  metersPerRenderUnit,
  spacingMeters,
  phase,
}: {
  readonly coordinateMeters: number;
  readonly originMeters: number;
  readonly metersPerRenderUnit: number;
  readonly spacingMeters: number;
  readonly phase: number;
}): number => (coordinateMeters - originMeters) / metersPerRenderUnit / (spacingMeters / metersPerRenderUnit) + phase;

describe('resolveInfiniteGridFrame', () => {
  it('keeps physical grid phase invariant across origin-only rebases and 1000x render rescaling', () => {
    const frames: readonly RenderFrame[] = [
      { anchorFrameId: 'tau:root', originMeters: [10.25, -20.75, 30.5], metersPerRenderUnit: 0.001 },
      { anchorFrameId: 'tau:root', originMeters: [9.75, -21.25, 30.5], metersPerRenderUnit: 0.001 },
      { anchorFrameId: 'tau:root', originMeters: [9.75, -21.25, 30.5], metersPerRenderUnit: 1 },
    ];

    const resolved = frames.map((renderFrame) =>
      resolveInfiniteGridFrame({
        axes: 'xyz',
        cameraVisibleSpanMeters: 4,
        largeSizeMeters: 2,
        renderFrame,
        smallSizeMeters: 0.5,
      }),
    );

    const smallUvs = resolved.map(({ smallPhase }, index) =>
      physicalUvAt({
        coordinateMeters: 12.125,
        originMeters: frames[index]!.originMeters[0],
        metersPerRenderUnit: frames[index]!.metersPerRenderUnit,
        spacingMeters: 0.5,
        phase: smallPhase[0],
      }),
    );

    expect(smallUvs.map((value) => value - Math.floor(value))).toEqual([0.25, 0.25, 0.25]);
    expect(resolved.map(({ gridDistance }) => gridDistance)).toEqual([80_000, 80_000, 80]);
    expect(resolved.map(({ planeOffset }) => planeOffset)).toEqual([-30_500, -30_500, -30.5]);
  });

  it.each([
    ['xyz', -3000],
    ['xzy', -2000],
    ['zyx', -1000],
  ] as const)('places the physical zero plane only on the %s normal axis', (axes, planeOffset) => {
    expect(
      resolveInfiniteGridFrame({
        axes,
        cameraVisibleSpanMeters: 1,
        largeSizeMeters: 1,
        renderFrame: {
          anchorFrameId: 'tau:root',
          originMeters: [1, 2, 3],
          metersPerRenderUnit: 0.001,
        },
        smallSizeMeters: 0.1,
      }).planeOffset,
    ).toBe(planeOffset);
  });

  it('expands the retained camera-local proxy and its radial fade with the visible physical span', () => {
    const near = resolveInfiniteGridFrame({
      axes: 'xyz',
      cameraVisibleSpanMeters: 1,
      largeSizeMeters: 1,
      renderFrame: { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
      smallSizeMeters: 0.1,
    });
    const far = resolveInfiniteGridFrame({
      axes: 'xyz',
      cameraVisibleSpanMeters: 100,
      largeSizeMeters: 1,
      renderFrame: { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
      smallSizeMeters: 0.1,
    });

    expect(far.gridDistance / near.gridDistance).toBe(100);
    // The material's restored 0.05..0.2 radial band therefore fades from one
    // to four visible spans, matching the pre-migration camera-relative look.
    expect(infiniteGridProxyDistanceVisibleSpans).toBe(20);
    expect(infiniteGridFadeStartRatio).toBe(0.05);
    expect(infiniteGridFadeEndRatio).toBe(0.2);
    expect(infiniteGridFadeEndVisibleSpans).toBe(infiniteGridProxyDistanceVisibleSpans * infiniteGridFadeEndRatio);
    expect(near.gridDistance * infiniteGridFadeStartRatio).toBe(1);
    expect(near.gridDistance * infiniteGridFadeEndRatio).toBe(infiniteGridFadeEndVisibleSpans);
    expect(far.gridDistance * infiniteGridFadeStartRatio).toBe(100);
    expect(far.gridDistance * infiniteGridFadeEndRatio).toBe(400);
    expect(near).not.toHaveProperty('proxyHalfExtent');
  });
});
