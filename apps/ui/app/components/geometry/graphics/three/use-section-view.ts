import { useMemo } from 'react';
import type * as THREE from 'three';
import { toThreeRenderPlane } from '@taucad/three/spatial';
import { useGraphicsSelector, useRenderFrame } from '#hooks/use-graphics.js';
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

export function createSectionViewRaycastClipState(
  sectionView: Pick<SectionViewState, 'enableMesh' | 'isActive' | 'plane'>,
): RaycastClipState | undefined {
  if (!sectionView.isActive || !sectionView.enableMesh) {
    return undefined;
  }

  return {
    enabled: true,
    planes: [sectionView.plane],
  };
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

  // Compute the clipping plane from the selected section view configuration
  const plane = useMemo(() => {
    if (!selectedSectionViewId) {
      return toThreeRenderPlane({
        renderFrame,
        plane: { pointMeters: [0, 0, 0], normal: [0, 0, 1] },
      });
    }

    const selectedPlane = availableSectionViews.find((p) => p.id === selectedSectionViewId);
    if (!selectedPlane) {
      return toThreeRenderPlane({
        renderFrame,
        plane: { pointMeters: [0, 0, 0], normal: [0, 0, 1] },
      });
    }

    const resolved = resolveSectionViewPlane({
      baseNormal: selectedPlane.normal,
      pivot: sectionViewPivot,
      rotation: sectionViewRotation,
      direction: sectionViewDirection,
    });
    return toThreeRenderPlane({
      renderFrame,
      plane: { pointMeters: resolved.point, normal: resolved.normal },
    });
  }, [
    selectedSectionViewId,
    sectionViewPivot,
    sectionViewRotation,
    sectionViewDirection,
    availableSectionViews,
    renderFrame,
  ]);

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
