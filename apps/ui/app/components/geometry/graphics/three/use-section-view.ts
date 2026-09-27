import { useMemo } from 'react';
import type * as THREE from 'three';
import type { RenderFrame } from '@taucad/spatial';
import { toThreeRenderPlane } from '@taucad/three/spatial';
import { useGraphicsSelector, useRenderFrame } from '#hooks/use-graphics.js';
import type { GraphicsContext } from '#machines/graphics.machine.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { resolveSectionViewPlane } from '#components/geometry/graphics/section-view-plane.js';

export type SectionViewState = {
  /** The computed clipping plane for the active section view. */
  readonly plane: THREE.Plane;
  /** Whether the section view is currently active and has a selected plane. */
  readonly isActive: boolean;
  /** The ID of the selected section view plane, if any. */
  readonly selectedId: string | undefined;
  /** Whether clipping lines are enabled. */
  readonly enableLines: boolean;
  /** Whether the clipping mesh (solid surface) is enabled. */
  readonly enableMesh: boolean;
  /**
   * Striped-diagonal spacing for BVH contour fill materials (derived from zoom-aware grid sizing).
   * Same plane units as `striped-material` frequency.
   */
  readonly stripeFrequency: number;
  /**
   * Within-stripe modulation width paired with {@link stripeFrequency}.
   */
  readonly stripeWidth: number;
};

/** The graphics context fields the section clipping plane is resolved from. */
export type SectionViewPlaneContext = Pick<
  GraphicsContext,
  | 'selectedSectionViewId'
  | 'availableSectionViews'
  | 'sectionViewPivot'
  | 'sectionViewRotation'
  | 'sectionViewDirection'
>;

const unselectedPlane = { pointMeters: [0, 0, 0], normal: [0, 0, 1] } as const;

/** The render-space clipping plane of the selected section view, or the XY plane when none is selected. */
export function resolveSectionViewRenderPlane(context: SectionViewPlaneContext, renderFrame: RenderFrame): THREE.Plane {
  const selectedPlane = context.selectedSectionViewId
    ? context.availableSectionViews.find((candidate) => candidate.id === context.selectedSectionViewId)
    : undefined;
  if (!selectedPlane) {
    return toThreeRenderPlane({ renderFrame, plane: unselectedPlane });
  }

  const resolved = resolveSectionViewPlane({
    baseNormal: selectedPlane.normal,
    pivot: context.sectionViewPivot,
    rotation: context.sectionViewRotation,
    direction: context.sectionViewDirection,
  });
  return toThreeRenderPlane({
    renderFrame,
    plane: { pointMeters: resolved.point, normal: resolved.normal },
  });
}

/**
 * The clipping a model raycast must respect, resolved from the graphics context when the raycast runs.
 * Callers read the context then instead of selecting the plane, so a section drag step re-renders none of them.
 */
export function resolveSectionViewRaycastClip(
  context: SectionViewPlaneContext & Pick<GraphicsContext, 'isSectionViewActive' | 'enableClippingMesh'>,
  renderFrame: RenderFrame,
): RaycastClipState | undefined {
  if (!context.isSectionViewActive || !context.selectedSectionViewId || !context.enableClippingMesh) {
    return undefined;
  }

  return { enabled: true, planes: [resolveSectionViewRenderPlane(context, renderFrame)] };
}

/**
 * Whether a section cut is shown and whether it cuts meshes, without the plane: a caller re-renders only
 * when these flags change, not on every drag step.
 */
export function useSectionViewFlags(): Pick<SectionViewState, 'isActive' | 'enableMesh'> {
  const isActive = useGraphicsSelector((state) =>
    Boolean(state.context.isSectionViewActive && state.context.selectedSectionViewId),
  );
  const enableMesh = useGraphicsSelector((state) => state.context.enableClippingMesh);
  return { isActive, enableMesh };
}

/**
 * Reads section view state from the graphics context and computes the derived THREE.Plane
 * plus stripe parameters for tinted contour-cap materials.
 */
export function useSectionView(): SectionViewState {
  const renderFrame = useRenderFrame();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const selectedSectionViewId = useGraphicsSelector((state) => state.context.selectedSectionViewId);
  const sectionViewRotation = useGraphicsSelector((state) => state.context.sectionViewRotation);
  const sectionViewDirection = useGraphicsSelector((state) => state.context.sectionViewDirection);
  const sectionViewPivot = useGraphicsSelector((state) => state.context.sectionViewPivot);
  const availableSectionViews = useGraphicsSelector((state) => state.context.availableSectionViews);
  const enableClippingLines = useGraphicsSelector((state) => state.context.enableClippingLines);
  const enableClippingMesh = useGraphicsSelector((state) => state.context.enableClippingMesh);
  const gridSizesComputed = useGraphicsSelector((state) => state.context.gridSizesComputed);

  // A new plane per step is the step itself: its consumers key it by value or read it once per commit.
  const plane = useMemo(
    () =>
      resolveSectionViewRenderPlane(
        { selectedSectionViewId, availableSectionViews, sectionViewPivot, sectionViewRotation, sectionViewDirection },
        renderFrame,
      ),
    [
      selectedSectionViewId,
      sectionViewPivot,
      sectionViewRotation,
      sectionViewDirection,
      availableSectionViews,
      renderFrame,
    ],
  );

  const { stripeFrequency, stripeWidth } = useMemo(() => {
    const stripeSpacing = gridSizesComputed.largeSize / renderFrame.metersPerRenderUnit / 10;
    return {
      stripeFrequency: stripeSpacing,
      stripeWidth: stripeSpacing * 0.2,
    };
  }, [gridSizesComputed.largeSize, renderFrame.metersPerRenderUnit]);

  return {
    plane,
    isActive: Boolean(isSectionViewActive && selectedSectionViewId),
    selectedId: selectedSectionViewId,
    enableLines: enableClippingLines,
    enableMesh: enableClippingMesh,
    stripeFrequency,
    stripeWidth,
  };
}
