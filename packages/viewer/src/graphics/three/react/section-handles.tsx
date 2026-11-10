import { useFrame, useThree } from '@react-three/fiber';
import { useActorRef } from '@xstate/react';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EventManager } from '@react-three/fiber';
import type { RenderFrame } from '@taucad/spatial';
import { createSectionHandles } from '#graphics/three/controls/section-handles.js';
import type { SectionHandles as SectionHandlesDrawing } from '#graphics/three/controls/section-handles.js';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import { SceneOverlay } from '#graphics/three/scene-overlay.jsx';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { useCameraRig, useGraphics, useGraphicsSelector, useRenderFrameRetarget } from '#hooks/use-graphics.jsx';
import { createSectionInputAdapter } from '#machines/section-input.adapter.js';
import { sectionInputMachine } from '#machines/section-input.machine.js';

/**
 * After the grid and axes overlay (2) and before the view cube and plane picker (3): the handles draw over the
 * model, after a depth clear, and under the cube.
 */
const sectionHandlesPriority = 2.5;

/** A stable number per host object, so the section input restarts only when one of its host objects is replaced. */
const hostIds = new WeakMap<WeakKey, number>();
let nextHostId = 0;
const hostId = (host: WeakKey | undefined): number => {
  if (host === undefined) {
    return 0;
  }
  let id = hostIds.get(host);
  if (id === undefined) {
    nextHostId++;
    id = nextHostId;
    hostIds.set(host, id);
  }
  return id;
};

type SectionHandlesProperties = Readonly<{
  /** Drawn beside the view cube by its render loop; picked here. Omitted without a view cube. */
  planePicker?: SectionPlanePicker;
}>;

type SectionInputProperties = Readonly<{
  surface: HTMLElement;
  canvas: HTMLElement;
  handles: SectionHandlesDrawing;
  planePicker?: SectionPlanePicker;
}>;

/**
 * The section input for one surface: its gesture machine and the DOM adapter it invokes, built around the surface,
 * the drawing and the picker. It is keyed by those, so it starts once per surface; the cuts, the bounds and the render
 * frame reach the adapter as they change and never restart it, so none of them ends a drag.
 */
function SectionInput({ surface, canvas, handles, planePicker }: SectionInputProperties): ReactNode {
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
            handles,
            planePicker,
            graphics,
            cameraRig,
          }),
        },
      }),
    [cameraRig, canvas, get, graphics, handles, invalidate, planePicker, surface],
  );
  const sectionInput = useActorRef(logic);
  const retarget = useCallback(
    (renderFrame: RenderFrame): void => {
      sectionInput.send({ type: 'renderFrameChanged', renderFrame });
    },
    [sectionInput],
  );
  useRenderFrameRetarget(retarget);
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
  // StrictMode's second effect pass builds a new one, which the section input then starts around.
  const [handles, setHandles] = useState<SectionHandlesDrawing>();
  useLayoutEffect(() => {
    const drawing = createSectionHandles({ backend });
    // oxlint-disable-next-line react/set-state-in-effect -- The effect owns allocation and StrictMode-safe teardown of this external resource.
    setHandles(drawing);
    return () => {
      drawing.dispose();
    };
  }, [backend]);

  useFrame((state) => {
    if (isActive) {
      handles?.layout(state.camera, state.size.height);
    }
  });

  if (!handles) {
    return null;
  }

  const inputKey = [surface, canvas, handles, planePicker, graphics, cameraRig, get, invalidate]
    .map((host) => hostId(host))
    .join(':');

  return (
    <>
      <SectionInput key={inputKey} surface={surface} canvas={canvas} handles={handles} planePicker={planePicker} />
      <SceneOverlay shouldClearDepth overlayActive={isActive} renderPriority={sectionHandlesPriority}>
        {isActive ? <primitive object={handles.root} /> : null}
      </SceneOverlay>
    </>
  );
}
