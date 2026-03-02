import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createStripedMaterial } from '#materials/striped-material.js';
import { useSectionViewStore, useViewerStore } from '#react/stores/store-context.js';

export type SectionViewResult = {
  readonly plane: THREE.Plane;
  readonly cappingMaterial: THREE.ShaderMaterial;
  readonly isActive: boolean;
  readonly selectedId: string | undefined;
  readonly enableLines: boolean;
  readonly enableMesh: boolean;
};

const defaultPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

/**
 * Reads section view state from the zustand stores and computes the derived
 * THREE.Plane and capping material. Fully self-contained -- no external refs
 * or props required.
 *
 * The capping material is automatically disposed when its dependencies change
 * and on unmount to prevent GPU resource leaks.
 */
export function useSectionView(): SectionViewResult {
  const isSectionViewActive = useSectionViewStore((s) => s.isActive);
  const selectedSectionViewId = useSectionViewStore((s) => s.selectedPlaneId);
  const sectionViewRotation = useSectionViewStore((s) => s.rotation);
  const sectionViewDirection = useSectionViewStore((s) => s.direction);
  const sectionViewPivot = useSectionViewStore((s) => s.pivot);
  const availableSectionViews = useSectionViewStore((s) => s.availableSectionViews);
  const enableClippingLines = useSectionViewStore((s) => s.enableLines);
  const enableClippingMesh = useSectionViewStore((s) => s.enableMesh);
  const gridSizes = useViewerStore((s) => s.gridSizes);

  const plane = useMemo(() => {
    if (!selectedSectionViewId) {
      return defaultPlane;
    }

    const selectedPlane = availableSectionViews.find((p) => p.id === selectedSectionViewId);
    if (!selectedPlane) {
      return defaultPlane;
    }

    const normal = new THREE.Vector3(...selectedPlane.normal);

    const [rotX, rotY, rotZ] = sectionViewRotation;
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
      const euler = new THREE.Euler(rotX, rotY, rotZ);
      normal.applyEuler(euler);
    }

    normal.multiplyScalar(-sectionViewDirection);

    const constant = -normal.dot(new THREE.Vector3(...sectionViewPivot));

    return new THREE.Plane(normal, constant);
  }, [selectedSectionViewId, sectionViewPivot, sectionViewRotation, sectionViewDirection, availableSectionViews]);

  const cappingMaterialRef = useRef<THREE.ShaderMaterial | undefined>(undefined);

  const cappingMaterial = useMemo(() => {
    cappingMaterialRef.current?.dispose();

    const stripeSpacing = gridSizes.largeSize * 0.1;
    const stripeWidth = stripeSpacing * 0.2;

    const material = createStripedMaterial({
      stripeFrequency: stripeSpacing,
      stripeWidth,
    });

    cappingMaterialRef.current = material;
    return material;
  }, [gridSizes.largeSize]);

  useEffect(() => {
    return () => {
      cappingMaterialRef.current?.dispose();
    };
  }, []);

  return {
    plane,
    cappingMaterial,
    isActive: Boolean(isSectionViewActive && selectedSectionViewId),
    selectedId: selectedSectionViewId,
    enableLines: enableClippingLines,
    enableMesh: enableClippingMesh,
  };
}
