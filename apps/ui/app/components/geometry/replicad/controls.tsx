import React, { useRef } from "react";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import Stage from "./stage";

const Controls = React.memo(
  React.forwardRef(function Controls(
    { hideGizmo, enableDamping }: { hideGizmo: boolean, enableDamping: boolean },
    controlsRef
  ) {
    return (
      <>
        <OrbitControls
          makeDefault
          ref={controlsRef}
          enableDamping={enableDamping}
        />
        {!hideGizmo && (
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport font="18px Inter var, HKGrotesk, sans-serif" />
          </GizmoHelper>
        )}
      </>
    );
  })
);

export type SceneProps = {
  hideGizmo: boolean;
  center: boolean;
  enableDamping: boolean;
  children: React.ReactNode;
}

export default React.memo(function Scene({
  hideGizmo,
  center,
  enableDamping = true,
  children,
}: SceneProps) {
  const controlsRef = useRef(null);

  return (
    <>
      <Controls
        hideGizmo={hideGizmo}
        ref={controlsRef}
        enableDamping={enableDamping}
      />
      <Stage controls={controlsRef} center={center}>
        {children}
      </Stage>
    </>
  );
});
