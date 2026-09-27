import { useMemo } from 'react';
import type { RenderFrame } from '@taucad/spatial';
import { useGraphicsSelector, useRenderFrame } from '#hooks/use-graphics.js';
import type { GraphicsContext } from '#machines/graphics.machine.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { resolveSectionPieces, toRenderSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCutSet } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

/**
 * The clipping a model raycast must respect: the committed cut list's pieces in the render frame while Section is on,
 * the ones the clip draws, so a raycast agrees with the drawing while the caps certify a newer list. Callers resolve
 * it from the graphics context when the raycast runs instead of selecting it, so a section drag step re-renders none
 * of them.
 */
export function resolveSectionViewRaycastClip(
  context: Pick<GraphicsContext, 'isSectionViewActive' | 'committedSectionCuts'>,
  renderFrame: RenderFrame,
): RaycastClipState | undefined {
  if (!context.isSectionViewActive || context.committedSectionCuts.length === 0) {
    return undefined;
  }

  return {
    enabled: true,
    pieces: toRenderSectionPieces(resolveSectionPieces(context.committedSectionCuts), renderFrame),
  };
}

const noSectionPieces: readonly SectionPiece[] = [];
const noSectionCutSet: SectionCutSet = { cuts: [], pieces: noSectionPieces };

/**
 * The pieces the clip removes: the committed cut list's, in the render frame, while Section is on, and one empty list
 * while it is off. They change only when the caps certify another list, so the clip, the caps and raycasts agree.
 */
export function useSectionPieces(): readonly SectionPiece[] {
  const renderFrame = useRenderFrame();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const committedSectionCuts = useGraphicsSelector((state) => state.context.committedSectionCuts);
  return useMemo(
    () =>
      isSectionViewActive && committedSectionCuts.length > 0
        ? toRenderSectionPieces(resolveSectionPieces(committedSectionCuts), renderFrame)
        : noSectionPieces,
    [committedSectionCuts, isSectionViewActive, renderFrame],
  );
}

/**
 * The live cut list and its pieces in the render frame, for the caps to certify, while Section is on; one empty set
 * while it is off. A cut edit gives a new set, and an unrelated context change keeps the same one.
 */
export function useLiveSectionCutSet(): SectionCutSet {
  const renderFrame = useRenderFrame();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const sectionCuts = useGraphicsSelector((state) => state.context.sectionCuts);
  return useMemo(
    () =>
      isSectionViewActive
        ? { cuts: sectionCuts, pieces: toRenderSectionPieces(resolveSectionPieces(sectionCuts), renderFrame) }
        : noSectionCutSet,
    [isSectionViewActive, renderFrame, sectionCuts],
  );
}

/**
 * Whether Section is on, so the model prepares the topology its caps are sliced from: a caller re-renders only when
 * Section turns on or off, not on a cut edit. Every shown cut cuts meshes, so `enableMesh` equals `isActive`.
 */
export function useSectionViewFlags(): Readonly<{ isActive: boolean; enableMesh: boolean }> {
  const isActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  return { isActive, enableMesh: isActive };
}

/** Striped-diagonal spacing and stripe width of the cap material, in render units, from the zoom-aware grid. */
export function useSectionStripes(): Readonly<{ stripeFrequency: number; stripeWidth: number }> {
  const renderFrame = useRenderFrame();
  const largeGridSize = useGraphicsSelector((state) => state.context.gridSizesComputed.largeSize);
  return useMemo(() => {
    const stripeSpacing = largeGridSize / renderFrame.metersPerRenderUnit / 10;
    return { stripeFrequency: stripeSpacing, stripeWidth: stripeSpacing * 0.2 };
  }, [largeGridSize, renderFrame.metersPerRenderUnit]);
}
