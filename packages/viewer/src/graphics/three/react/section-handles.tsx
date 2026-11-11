import { useFrame, useThree } from '@react-three/fiber';
import { useActorRef } from '@xstate/react';
import { useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EventManager } from '@react-three/fiber';
import { createSectionHandles } from '#graphics/three/controls/section-handles.js';
import type { SectionHandles as SectionHandlesDrawing } from '#graphics/three/controls/section-handles.js';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import { SceneOverlay } from '#graphics/three/scene-overlay.jsx';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { useCameraRig, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { createSectionInputAdapter } from '#machines/section-input.adapter.js';
import { sectionInputMachine } from '#machines/section-input.machine.js';

/**
 * After the grid and axes overlay (2) and before the view cube and plane picker (3): the handles draw over the
 * model, after a depth clear, and under the cube.
 */
const sectionHandlesPriority = 2.5;

type SectionHandlesProperties = Readonly<{
  /** Drawn beside the view cube by its render loop; picked here. Omitted without a view cube. */
  planePicker?: SectionPlanePicker;
}>;

/** The handles' drawing and whether it was disposed, which the section input checks before it draws again. */
type Drawing = Readonly<{ handles: SectionHandlesDrawing; isRetired: () => boolean }>;

type SectionInputProperties = Readonly<{
  surface: HTMLElement;
  canvas: HTMLElement;
  drawing: Drawing;
  planePicker?: SectionPlanePicker;
}>;

/**
 * The section input for one surface: its gesture machine and the DOM adapter it invokes, built around the surface,
 * the drawing and the picker. It restarts only when one of those is replaced; the cuts, the bounds and the render
 * frame reach the adapter through its own subscriptions and never restart it, so none of them ends a drag.
 */
function SectionInput({ surface, canvas, drawing, planePicker }: SectionInputProperties): ReactNode {
  const graphics = useGraphics();
  const cameraRig = useCameraRig();
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const logic = useMemo(
    () =>
      sectionInputMachine.provide({
        actors: {
          adapter: createSectionInputAdapter({
            surface,
            canvas,
            get,
            invalidate,
            handles: drawing.handles,
            isRetired: drawing.isRetired,
            planePicker,
            graphics,
            cameraRig,
          }),
        },
      }),
    [cameraRig, canvas, drawing, get, graphics, invalidate, planePicker, surface],
  );
  useActorRef(logic);
  return null;
}

/**
 * The section cuts' in-scene handles and the plane picker's pointer input.
 *
 * The drawing is laid out each frame; the pointer belongs to the section input, a gesture machine
 * (`idle → hovering → pressed → dragging`) that invokes one DOM adapter per surface. The adapter listens where R3F
 * does, on its event source (`events.connected`) or else the canvas, as the camera controls, Measure and kinematics
 * do, in the capture phase, so a press on a handle or tile is the handles' own whatever order the other tools were
 * added in. Cut changes reach the adapter through its own subscription, so a drag step renders no React, and no effect
 * here sends, subscribes or times.
 */
export function SectionHandles({ planePicker }: SectionHandlesProperties): ReactNode {
  const backend = useThreeGraphicsBackend();
  const graphics = useGraphics();
  const cameraRig = useCameraRig();
  const isActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const gl = useThree((state) => state.gl);
  const canvas = gl.domElement;
  // R3F binds pointer events to `eventSource` when given one (the chat viewer's region div, which covers the canvas).
  const connected = useThree((state) => (state.events as EventManager<HTMLElement>).connected);
  const surface: HTMLElement = connected ?? canvas;
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  // The drawing is an external Three resource: one per backend, disposed when it is replaced or the handles unmount.
  // StrictMode's second effect pass builds a new one, which the section input then starts around. A section input
  // stops a microtask after its unmount, so it checks `isRetired` before it draws into a disposed drawing.
  const [drawing, setDrawing] = useState<Drawing>();
  useLayoutEffect(() => {
    const handles = createSectionHandles({ backend });
    const life = { retired: false };
    // oxlint-disable-next-line react/set-state-in-effect -- The effect owns allocation and StrictMode-safe teardown of this external resource.
    setDrawing({ handles, isRetired: () => life.retired });
    return () => {
      life.retired = true;
      handles.dispose();
    };
  }, [backend]);
  const handles = drawing?.handles;

  useFrame((state) => {
    if (isActive) {
      handles?.layout(state.camera, state.size.height);
    }
  });

  // The section input restarts when a host object it is built around is replaced: a new generation keys it afresh.
  const hostObjects = [surface, canvas, drawing, planePicker, graphics, cameraRig, get, invalidate] as const;
  const [hosts, setHosts] = useState({ objects: hostObjects, generation: 0 });
  if (hostObjects.some((object, index) => object !== hosts.objects[index])) {
    setHosts({ objects: hostObjects, generation: hosts.generation + 1 });
  }

  if (!drawing) {
    return null;
  }

  return (
    <>
      <SectionInput
        key={hosts.generation}
        surface={surface}
        canvas={canvas}
        drawing={drawing}
        planePicker={planePicker}
      />
      <SceneOverlay shouldClearDepth overlayActive={isActive} renderPriority={sectionHandlesPriority}>
        {isActive ? <primitive object={drawing.handles.root} /> : null}
      </SceneOverlay>
    </>
  );
}
