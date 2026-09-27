import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import type { SpatialBounds } from '@taucad/spatial';
import { maxSectionCuts, resolveSectionPlaneFlip } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut, SectionPlane } from '#components/geometry/graphics/section-cuts.js';
import {
  createSectionDragSteps,
  createSectionHandles,
  createSectionHandlesWarmup,
  resolveSectionDragParameter,
  resolveSectionDragPatch,
} from '#components/geometry/graphics/three/controls/section-handles.js';
import type { SectionHandle } from '#components/geometry/graphics/three/controls/section-handles.js';
import { createSectionPlanePicker } from '#components/geometry/graphics/three/controls/section-plane-picker.js';
import type { SectionPlanePicker } from '#components/geometry/graphics/three/controls/section-plane-picker.js';
import { ensureSelectorLabelAtlasReady } from '#components/geometry/graphics/three/controls/selector-label-atlas.js';
import { SceneOverlay } from '#components/geometry/graphics/three/scene-overlay.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { createRafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
import {
  useCameraRig,
  useCameraSelector,
  useGraphics,
  useGraphicsSelector,
  useRenderFrame,
} from '#hooks/use-graphics.js';

/**
 * After the grid and axes overlay (2) and before the view cube and plane picker (3): the handles draw over the
 * model, after a depth clear, and under the cube.
 */
const sectionHandlesPriority = 2.5;

/** Pixels a press travels before it drags. */
const dragThreshold = 3;

const areBoundsEqual = (left: SpatialBounds, right: SpatialBounds): boolean =>
  left.min.every((value, index) => value === right.min[index]) &&
  left.max.every((value, index) => value === right.max[index]);

/** What a drag must keep to land: its cut, and that cut's kind and plane or axis. */
const cutStructure = (cut: SectionCut): string =>
  `${cut.id}:${cut.kind}:${cut.kind === 'plane' ? cut.plane : cut.axis}`;

type Drag = {
  readonly handle: SectionHandle;
  /** The cut as it was at the press; each step is resolved from it. */
  readonly cut: SectionCut;
  /** Render units: where the handle stood at the press. */
  readonly anchor: THREE.Vector3;
  /**
   * The drag parameter at the press, or else at the first step that has one. An arrow pointing at the camera has
   * none under the press, and every later ray meets its axis at the camera, so a start of zero would put the plane
   * there.
   */
  startParameter: number | undefined;
};

type Press = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
  readonly tile?: SectionPlane;
  readonly drag?: Drag;
  /** Lifts the hover suppression and gives the camera controls back. */
  readonly release: () => void;
};

type Picked = Readonly<{ tile?: SectionPlane; handle?: SectionHandle }>;

type SectionHandlesProperties = Readonly<{
  /** Drawn beside the view cube by its render loop; picked here. Omitted without a view cube. */
  planePicker?: SectionPlanePicker;
}>;

/**
 * The section cuts' in-scene handles and the plane picker's pointer input.
 *
 * A press on a handle or tile is the handles' own: it is stopped at the canvas, so camera controls, Measure and the
 * model's pointer events never see it, and its click is swallowed. While it is held, the camera controls are
 * disabled and the model's hover is suppressed. Cut changes reach the handles through a direct actor subscription,
 * so a drag step renders no React.
 */
export function SectionHandles({ planePicker }: SectionHandlesProperties): ReactNode {
  const graphicsActor = useGraphics();
  const cameraRig = useCameraRig();
  const renderFrame = useRenderFrame();
  const backend = useThreeGraphicsBackend();
  const isActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const bounds = useCameraSelector((state) => state.context.view.bounds, areBoundsEqual);
  const gl = useThree((state) => state.gl);
  const canvas = gl.domElement;
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const handles = useMemo(() => createSectionHandles({ backend }), [backend]);
  const hasPlanePicker = planePicker !== undefined;

  useEffect(
    () => () => {
      handles.dispose();
    },
    [handles],
  );

  // Every program the handles and the picker draw is compiled once, before Section is first on, and kept compiled by
  // warm-up copies, so the drawings built when Section turns on or the selection changes link none. The copies are
  // this effect's own: a material disposed while it compiles breaks WebGL's readiness check, so they are disposed
  // only once the warm-up has settled.
  useLayoutEffect(() => {
    const handlesWarmup = createSectionHandlesWarmup({ backend });
    const pickerWarmup = hasPlanePicker ? createSectionPlanePicker() : undefined;
    const warmups = [
      { scene: handlesWarmup.root, camera: cameraRig.perspectiveCamera },
      { scene: handlesWarmup.root, camera: cameraRig.orthographicCamera },
      ...(pickerWarmup ? [{ scene: pickerWarmup.scene, camera: pickerWarmup.camera }] : []),
    ];
    for (const { scene } of warmups) {
      scene.traverse((object) => {
        // WebGPU's `compileAsync` skips what the last frame's frustum culled.
        object.frustumCulled = false;
      });
    }
    const dispose = (): void => {
      handlesWarmup.dispose();
      pickerWarmup?.dispose();
    };
    const warmup = { isCancelled: false, isSettled: false };
    // async-iife: bootstrap — a layout effect cannot await; teardown before the warm-up settles defers the disposal.
    void (async () => {
      try {
        await Promise.all(warmups.map(async ({ scene, camera }) => gl.compileAsync(scene, camera)));
      } catch (error) {
        console.error('Section handles pipeline warm-up failed', error);
      }
      warmup.isSettled = true;
      if (warmup.isCancelled) {
        dispose();
      } else {
        invalidate();
      }
    })();
    return () => {
      warmup.isCancelled = true;
      if (warmup.isSettled) {
        dispose();
      }
    };
  }, [backend, cameraRig, gl, hasPlanePicker, invalidate]);

  useEffect(() => {
    if (!planePicker) {
      return undefined;
    }
    const cancellation = { cancelled: false };
    // async-iife: bootstrap — React effects cannot be async; the tile labels redraw once the web font settles,
    // and teardown simply suppresses the repaint.
    void (async () => {
      await ensureSelectorLabelAtlasReady();
      if (!cancellation.cancelled) {
        invalidate();
      }
    })();
    return () => {
      cancellation.cancelled = true;
    };
  }, [invalidate, planePicker]);

  useFrame((state) => {
    if (isActive) {
      handles.layout(state.camera, state.size.height);
    }
  });

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const steps = createSectionDragSteps();
    const listeners = new AbortController();
    let hovered: SectionHandle | undefined;
    let hoveredTile: SectionPlane | undefined;
    let press: Press | undefined;
    // Whether the latest press was ours, so its click (and a double click) is swallowed. Reset by every press, so
    // a press that ends without a click never swallows the next one.
    let isPressOwned = false;
    let synced: Readonly<{ cuts: readonly SectionCut[]; selectedId?: string; hoveredId?: string }> | undefined;

    const readContext = (): ReturnType<typeof graphicsActor.getSnapshot>['context'] =>
      graphicsActor.getSnapshot().context;

    /** At the cut limit a tile can only move the selected plane cut; with none selected the picker is inert. */
    const isPickerLive = (): boolean => {
      const { sectionCuts, selectedSectionCutId } = readContext();
      return (
        sectionCuts.length < maxSectionCuts ||
        sectionCuts.some((cut) => cut.id === selectedSectionCutId && cut.kind === 'plane')
      );
    };

    const setCursor = (): void => {
      canvas.classList.remove('cursor-action', 'cursor-grab', 'cursor-grabbing');
      if (press?.drag) {
        canvas.classList.add('cursor-grabbing');
      } else if (
        (press?.tile !== undefined && isPickerLive()) ||
        hoveredTile !== undefined ||
        hovered?.target.kind === 'select'
      ) {
        canvas.classList.add('cursor-action');
      } else if (hovered) {
        canvas.classList.add('cursor-grab');
      }
    };

    const paint = (): void => {
      const { sectionCuts, selectedSectionCutId, hoveredSectionCutId } = readContext();
      const selected = sectionCuts.find((cut) => cut.id === selectedSectionCutId);
      handles.paint({ hovered, active: press?.drag?.handle, hoveredCutId: hoveredSectionCutId });
      planePicker?.paint({
        current: selected?.kind === 'plane' ? selected.plane : undefined,
        hovered: hoveredTile,
        active: press?.tile,
        isDimmed: !isPickerLive(),
      });
      setCursor();
      invalidate();
    };

    const pointerRay = (x: number, y: number): THREE.Ray => {
      const { camera, size } = get();
      pointer.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray;
    };

    /**
     * The tile or handle under a canvas point: the picker first, then the nearest handle. A dimmed picker still owns
     * its tiles, so a press on one reaches neither Measure, the camera nor the model; it does nothing with it.
     */
    const pickAt = (x: number, y: number): Picked => {
      const tile = planePicker?.pick(x, y);
      if (tile) {
        return { tile };
      }
      pointerRay(x, y);
      handles.root.updateMatrixWorld(true);
      const hit = raycaster.intersectObjects(
        handles.handles.flatMap((handle) => handle.hits),
        false,
      )[0]?.object;
      return { handle: hit ? handles.handles.find((handle) => handle.hits.includes(hit)) : undefined };
    };

    const setHover = ({ tile, handle }: Picked): void => {
      if (tile === hoveredTile && handle === hovered) {
        return;
      }
      const previousCutId = hovered?.target.cutId;
      hovered = handle;
      hoveredTile = tile;
      if (handle?.target.cutId !== previousCutId) {
        // Linked with the cut's chip.
        graphicsActor.send({ type: 'hoverSectionCut', payload: handle?.target.cutId });
      }
      paint();
    };

    // Hover picks run once per frame, the latest pointer winning (graphics policy §10).
    const hoverPicks = createRafCoalescer((point: Readonly<{ x: number; y: number }>) => {
      if (!press) {
        const picked = pickAt(point.x, point.y);
        // A dimmed picker takes no hover.
        setHover(picked.tile === undefined || isPickerLive() ? picked : {});
      }
    });

    const hold = (): (() => void) => {
      graphicsActor.send({
        type: 'beginViewerModelHoverSuppression',
        reason: 'sectionViewTransform',
        source: 'viewer',
      });
      const { controls } = get();
      const heldControls = controls && 'enabled' in controls && controls.enabled === true ? controls : undefined;
      if (heldControls) {
        heldControls.enabled = false;
      }
      return () => {
        if (heldControls) {
          heldControls.enabled = true;
        }
        graphicsActor.send({
          type: 'endViewerModelHoverSuppression',
          reason: 'sectionViewTransform',
          source: 'viewer',
        });
      };
    };

    const endPress = (): void => {
      const ended = press;
      if (!ended) {
        return;
      }
      press = undefined;
      ended.release();
      if (canvas.hasPointerCapture(ended.pointerId)) {
        canvas.releasePointerCapture(ended.pointerId);
      }
      paint();
    };

    const applyDrag = (drag: Drag, x: number, y: number): void => {
      const parameter = resolveSectionDragParameter({
        ray: pointerRay(x, y),
        cut: drag.cut,
        anchor: drag.anchor,
        renderFrame,
      });
      if (parameter === undefined) {
        return;
      }
      drag.startParameter ??= parameter;
      const { geometryCenter, geometryRadius } = readContext();
      const patch = resolveSectionDragPatch({
        kind: drag.handle.target.kind,
        cut: drag.cut,
        startParameter: drag.startParameter,
        parameter,
        metersPerRenderUnit: renderFrame.metersPerRenderUnit,
        bounds: { center: geometryCenter, radius: geometryRadius },
      });
      if (patch) {
        graphicsActor.send({ type: 'updateSectionCut', payload: { id: drag.cut.id, patch } });
      }
    };

    const handlePointerDown = (event: PointerEvent): void => {
      isPressOwned = false;
      if (event.button !== 0 || press) {
        return;
      }
      const { tile, handle } = pickAt(event.offsetX, event.offsetY);
      const cut = handle && readContext().sectionCuts.find((candidate) => candidate.id === handle.target.cutId);
      if (!tile && !cut) {
        return;
      }
      // The press is the handles': camera controls, Measure and the model's pointer events never see it.
      event.stopPropagation();
      event.preventDefault();
      isPressOwned = true;
      hoverPicks.cancel();
      canvas.setPointerCapture(event.pointerId);
      // Only the selected cut has drag handles, so a press on one leaves the selection; a press on an unselected
      // revolution's fan selects it and drags nothing.
      const isSelect = handle?.target.kind === 'select';
      if (isSelect && cut) {
        graphicsActor.send({ type: 'selectSectionCut', payload: cut.id });
      }
      const drag =
        handle && cut && !isSelect
          ? {
              handle,
              cut,
              anchor: handle.anchor.clone(),
              startParameter: resolveSectionDragParameter({
                ray: pointerRay(event.offsetX, event.offsetY),
                cut,
                anchor: handle.anchor,
                renderFrame,
              }),
            }
          : undefined;
      press = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        tile,
        drag,
        release: drag === undefined && tile === undefined ? () => undefined : hold(),
      };
      paint();
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (press?.pointerId === event.pointerId) {
        event.stopPropagation();
        if (!press.moved) {
          press.moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > dragThreshold;
        }
        const { drag } = press;
        const { offsetX, offsetY } = event;
        if (drag && press.moved) {
          steps.schedule(() => {
            applyDrag(drag, offsetX, offsetY);
          });
        }
        return;
      }
      // Hover picks wait while a button is held: another tool owns that gesture.
      if (event.buttons === 0) {
        hoverPicks.schedule({ x: event.offsetX, y: event.offsetY });
      }
    };

    const handlePointerUp = (event: PointerEvent): void => {
      if (press?.pointerId !== event.pointerId) {
        return;
      }
      event.stopPropagation();
      if (!press.moved) {
        press.moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > dragThreshold;
      }
      const { drag, tile, moved } = press;
      if (drag && moved) {
        // The release is the drag's last step; it lands now, not on the next frame.
        steps.schedule(() => {
          applyDrag(drag, event.offsetX, event.offsetY);
        });
      }
      steps.flush();
      endPress();
      if (!tile || moved || !isPickerLive()) {
        return;
      }
      // A click on a tile moves the selected plane cut to its plane, through the centre, or adds that plane. Either
      // way the plane is new to its cut, so it removes the side facing the camera.
      const { sectionCuts, selectedSectionCutId } = readContext();
      const selected = sectionCuts.find((cut) => cut.id === selectedSectionCutId);
      const viewDirection = cameraRig.actorRef.getSnapshot().context.view.direction;
      if (selected?.kind !== 'plane') {
        graphicsActor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: tile, viewDirection } });
      } else if (selected.plane !== tile) {
        graphicsActor.send({
          type: 'updateSectionCut',
          payload: { id: selected.id, patch: { plane: tile, isFlipped: resolveSectionPlaneFlip(tile, viewDirection) } },
        });
      }
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      if (press?.pointerId === event.pointerId) {
        steps.flush();
        endPress();
      }
    };

    const handlePointerLeave = (): void => {
      hoverPicks.cancel();
      if (!press) {
        setHover({});
      }
    };

    // Measure follows `mousemove`, which a stopped `pointermove` does not stop.
    const handleMouseMove = (event: MouseEvent): void => {
      if (press) {
        event.stopPropagation();
      }
    };

    const handleClick = (event: MouseEvent): void => {
      if (isPressOwned) {
        event.stopPropagation();
      }
    };

    const sync = (): void => {
      const { sectionCuts, selectedSectionCutId, hoveredSectionCutId } = readContext();
      const drag = press?.drag;
      const dragged = drag && sectionCuts.find((cut) => cut.id === drag.cut.id);
      if (
        drag &&
        (selectedSectionCutId !== drag.cut.id || !dragged || cutStructure(dragged) !== cutStructure(drag.cut))
      ) {
        // A step dragged on a cut that went away, changed its plane or axis or lost the selection must not land.
        steps.cancel();
        endPress();
      }
      if (
        synced?.cuts === sectionCuts &&
        synced.selectedId === selectedSectionCutId &&
        synced.hoveredId === hoveredSectionCutId
      ) {
        return;
      }
      synced = { cuts: sectionCuts, selectedId: selectedSectionCutId, hoveredId: hoveredSectionCutId };
      handles.update({ cuts: sectionCuts, selectedId: selectedSectionCutId, bounds, renderFrame });
      if (hovered && !handles.handles.includes(hovered)) {
        hovered = undefined;
      }
      if (!isPickerLive()) {
        hoveredTile = undefined;
      }
      paint();
    };

    const { signal } = listeners;
    canvas.addEventListener('pointerdown', handlePointerDown, { signal });
    canvas.addEventListener('pointermove', handlePointerMove, { signal });
    canvas.addEventListener('pointerup', handlePointerUp, { signal });
    canvas.addEventListener('pointercancel', handlePointerCancel, { signal });
    canvas.addEventListener('lostpointercapture', handlePointerCancel, { signal });
    canvas.addEventListener('pointerleave', handlePointerLeave, { signal });
    canvas.addEventListener('mousemove', handleMouseMove, { signal });
    canvas.addEventListener('click', handleClick, { signal });
    canvas.addEventListener('dblclick', handleClick, { signal });
    sync();
    const subscription = graphicsActor.subscribe(sync);

    return () => {
      subscription.unsubscribe();
      listeners.abort();
      hoverPicks.cancel();
      steps.cancel();
      endPress();
      if (hovered) {
        graphicsActor.send({ type: 'hoverSectionCut', payload: undefined });
      }
      hovered = undefined;
      hoveredTile = undefined;
      setCursor();
    };
  }, [bounds, cameraRig, canvas, get, graphicsActor, handles, invalidate, isActive, planePicker, renderFrame]);

  return (
    <SceneOverlay shouldClearDepth overlayActive={isActive} renderPriority={sectionHandlesPriority}>
      {isActive ? <primitive object={handles.root} /> : null}
    </SceneOverlay>
  );
}
