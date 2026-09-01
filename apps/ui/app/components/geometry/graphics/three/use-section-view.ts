import { useMemo } from 'react';
import * as THREE from 'three';
import { useGraphicsSelector } from '#hooks/use-graphics.js';

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

const defaultPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

/**
 * Reads section view state from the graphics context and computes the derived THREE.Plane
 * plus stripe parameters for tinted contour-cap materials.
 */
export function useSectionView(): SectionViewState {
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
      return defaultPlane;
    }

    const selectedPlane = availableSectionViews.find((p) => p.id === selectedSectionViewId);
    if (!selectedPlane) {
      return defaultPlane;
    }

    const normal = new THREE.Vector3(...selectedPlane.normal);

    // Apply rotation to the normal if rotation is set
    const [rotX, rotY, rotZ] = sectionViewRotation;
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
      const euler = new THREE.Euler(rotX, rotY, rotZ);
      normal.applyEuler(euler);
    }

    // Apply direction after rotation
    normal.multiplyScalar(-sectionViewDirection);

    const constant = -normal.dot(new THREE.Vector3(...sectionViewPivot));

    return new THREE.Plane(normal, constant);
  }, [selectedSectionViewId, sectionViewPivot, sectionViewRotation, sectionViewDirection, availableSectionViews]);

  const { stripeFrequency, stripeWidth } = useMemo(() => {
    const stripeSpacing = gridSizesComputed.largeSize * 0.1;
    return {
      stripeFrequency: stripeSpacing,
      stripeWidth: stripeSpacing * 0.2,
    };
  }, [gridSizesComputed.largeSize]);

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
