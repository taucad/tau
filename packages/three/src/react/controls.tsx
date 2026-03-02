/* eslint-disable react/require-default-props -- defaultProps is deprecated; optional props have no defaults */
import { OrbitControls } from '@react-three/drei';
import React from 'react';
import type * as THREE from 'three';
import { ViewportGizmoCube } from '#react/viewport-gizmo.js';
import { SectionViewControls } from '#react/section-view-controls.js';
import { MeasureTool } from '#react/measure-tool.js';
import type { PlaneSelectorId } from '#react/section-view-controls.js';
import { useSectionViewStore, useViewerStore } from '#react/stores/store-context.js';

type ControlsProperties = {
  /**
   * @description Whether to enable the gizmo for the viewport.
   */
  readonly enableGizmo: boolean;
  /**
   * @description Whether to enable damping for the camera.
   */
  readonly enableDamping: boolean;
  /**
   * @description Whether to enable zooming for the camera.
   */
  readonly enableZoom: boolean;
  /**
   * @description Whether to enable panning for the camera.
   */
  readonly enablePan: boolean;
  /**
   * @description The speed of the camera zoom.
   */
  readonly zoomSpeed: number;
  /**
   * A container element or selector to append the gizmo to.
   */
  readonly gizmoContainer?: HTMLElement | string;
  /**
   * Key used to invalidate cached meshes when geometry changes.
   */
  readonly geometryKey?: string;
};

export const Controls = React.memo(function ({
  enableGizmo,
  enableDamping,
  enableZoom,
  enablePan,
  zoomSpeed,
  gizmoContainer,
  geometryKey,
}: ControlsProperties): React.JSX.Element {
  const isActive = useSectionViewStore((s) => s.isActive);
  const selectedPlaneId = useSectionViewStore((s) => s.selectedPlaneId);
  const rotation = useSectionViewStore((s) => s.rotation);
  const pivot = useSectionViewStore((s) => s.pivot);
  const availablePlanes = useSectionViewStore((s) => s.availableSectionViews);
  const planeName = useSectionViewStore((s) => s.planeName);
  const hoveredSectionViewId = useSectionViewStore((s) => s.hoveredSectionViewId) as PlaneSelectorId | undefined;
  const upDirection = useViewerStore((s) => s.upDirection);

  const selectPlane = useSectionViewStore((s) => s.selectPlane);
  const setDirection = useSectionViewStore((s) => s.setDirection);
  const setRotation = useSectionViewStore((s) => s.setRotation);
  const setPivot = useSectionViewStore((s) => s.setPivot);
  const setHoveredSectionView = useSectionViewStore((s) => s.setHoveredSectionView);

  const handleSelectPlane = (planeId: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy'): void => {
    const id = planeId.toLowerCase() as 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy';
    const isInverse = id === 'yx' || id === 'zx' || id === 'zy';
    const base: 'xy' | 'xz' | 'yz' = ((): 'xy' | 'xz' | 'yz' => {
      if (id === 'xy' || id === 'yx') {
        return 'xy';
      }

      if (id === 'xz' || id === 'zx') {
        return 'xz';
      }

      return 'yz';
    })();
    const newDir: 1 | -1 = isInverse ? -1 : 1;
    selectPlane(base);
    setDirection(newDir);
  };

  const handleSetRotation = (eulerRotation: THREE.Euler): void => {
    setRotation([eulerRotation.x, eulerRotation.y, eulerRotation.z]);
  };

  const handleSetPivot = (value: [number, number, number]): void => {
    setPivot(value);
  };

  const handleHover = (planeId: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy' | undefined): void => {
    setHoveredSectionView(planeId);
  };

  return (
    <>
      <OrbitControls
        makeDefault
        zoomSpeed={zoomSpeed}
        enablePan={enablePan}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
      />
      <MeasureTool geometryKey={geometryKey} />
      <SectionViewControls
        isActive={isActive}
        selectedPlaneId={selectedPlaneId}
        availablePlanes={availablePlanes}
        rotation={rotation}
        pivot={pivot}
        planeName={planeName}
        hoveredSectionViewId={hoveredSectionViewId}
        upDirection={upDirection}
        onSelectPlane={handleSelectPlane}
        onHover={handleHover}
        onSetRotation={handleSetRotation}
        onSetPivot={handleSetPivot}
      />
      {enableGizmo ? <ViewportGizmoCube container={gizmoContainer} dependencies={[upDirection]} /> : null}
    </>
  );
});
