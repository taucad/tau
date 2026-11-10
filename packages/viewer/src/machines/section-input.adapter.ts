/**
 * The section input's DOM adapter: one surface's pointer listeners and the host objects behind them.
 *
 * The section handles build it around their surface, drawing and plane picker and provide it to the
 * section input machine as `adapter`. Everything a host holds stays in this closure (D4): the surface and canvas,
 * R3F's root state (camera, size, camera controls), the drawing, the picker, the graphics actor and the camera rig. The
 * machine holds only plain facts about the gesture and answers each report with a command.
 *
 * @module
 */

import { fromRenderPoint, toRenderPoint } from '@taucad/spatial';
import type { RenderFrame, SpatialBounds, SpatialVector } from '@taucad/spatial';
import type { ThreeCameraRig } from '@taucad/three/camera';
import * as THREE from 'three';
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { capturePointer, releasePointer } from '@taucad/ui/utils/pointer-capture';
import { maxSectionCuts, resolveSectionPlaneFlip } from '#graphics/section-cuts.js';
import type { SectionCut, SectionPlane, SectionVector } from '#graphics/section-cuts.js';
import {
  createSectionDragSteps,
  resolveSectionDragParameter,
  resolveSectionDragPatch,
} from '#graphics/three/controls/section-handles.js';
import type { SectionHandle, SectionHandles, SectionHandleTarget } from '#graphics/three/controls/section-handles.js';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import { subscribeToMatcapLoad } from '#graphics/three/materials/matcap-material.js';
import { createRafCoalescer } from '#graphics/three/utils/raf-coalescer.js';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type {
  SectionInputAdapterLogic,
  SectionInputCommand,
  SectionInputEvent,
  SectionInputGesture,
} from '#machines/section-input.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type GraphicsSnapshot = SnapshotFrom<typeof graphicsMachine>;
type CameraSnapshot = SnapshotFrom<ThreeCameraRig['actorRef']>;

/** The part of R3F's root state the adapter reads, live: the camera and size of the latest frame and the controls. */
type SectionInputRoot = Readonly<{
  camera: THREE.Camera;
  size: Readonly<{ width: number; height: number }>;
  controls: unknown;
}>;

/**
 * The host objects one surface's adapter is built around.
 *
 * @public
 */
export type SectionInputHost = Readonly<{
  /** Where R3F takes pointer events: its event source (`events.connected`) or else the canvas. */
  surface: HTMLElement;
  canvas: HTMLElement;
  /** R3F's root state, read live. */
  get: () => SectionInputRoot;
  invalidate: () => void;
  handles: SectionHandles;
  /** Drawn beside the view cube by its render loop; picked here. Absent without a view cube. */
  planePicker?: SectionPlanePicker;
  graphics: GraphicsActorRef;
  cameraRig: ThreeCameraRig;
}>;

/** A drag in flight: the host side of a press on a drag handle. */
type Drag = {
  readonly handle: SectionHandle;
  /** The cut as it was at the press; each step is resolved from it. */
  readonly cut: SectionCut;
  /** Metres: where the handle stood at the press, so a render-frame rebase mid-drag keeps it where it was. */
  readonly anchorMeters: SpatialVector;
  /**
   * The drag parameter at the press, or else at the first step that has one, in metres along a plane's axis or in
   * degrees about a revolution's. An arrow pointing at the camera has none under the press, and every later ray meets
   * its axis at the camera, so a start of zero would put the plane there.
   */
  start: number | undefined;
};

/** The press the adapter holds the surface for. */
type Held = Readonly<{
  pointerId: number;
  drag?: Drag;
  /** Lifts the hover suppression and gives the camera controls back. */
  release: () => void;
}>;

type Picked = Readonly<{ tile?: SectionPlane; handle?: SectionHandle }>;

/** The graphics facts the drawing follows. */
type DrawingSource = Readonly<{
  cuts: readonly SectionCut[];
  selectedId: string | undefined;
  hoveredId: string | undefined;
  bounds: SpatialBounds;
  renderFrame: RenderFrame;
}>;

const areBoundsEqual = (left: SpatialBounds, right: SpatialBounds): boolean =>
  left.min.every((value, index) => value === right.min[index]) &&
  left.max.every((value, index) => value === right.max[index]);

/** The graphics snapshot the adapter starts from; later ones arrive through its subscription. */
const selectGraphicsSnapshot = (graphics: GraphicsActorRef): GraphicsSnapshot => graphics.getSnapshot();

/** The camera snapshot the adapter starts from; later ones arrive through its subscription. */
const selectCameraSnapshot = (cameraRig: ThreeCameraRig): CameraSnapshot => cameraRig.actorRef.getSnapshot();

const isTarget = (handle: SectionHandle, target: SectionHandleTarget | undefined): boolean =>
  handle.target.kind === target?.kind && handle.target.cutId === target.cutId;

/** A plane's drag parameter is a length in render units; a revolution's is an angle, the same in every frame. */
const isLengthParameter = (cut: SectionCut): boolean => cut.kind === 'plane';

/**
 * Builds the DOM adapter for one surface. While it runs it
 *
 * - takes a primary press on a handle or a plane-picker tile in the capture phase and stops it there, so the camera
 *   controls, Measure, kinematics and the model's pointer events never see it, whatever order they were added in, and
 *   swallows its click; a press on DOM laid over the canvas, such as the view cube, is not its own;
 * - while a press is held, disables the camera controls, suppresses the model's hover and captures the pointer;
 * - picks hover once per frame, the latest pointer winning (graphics policy §10);
 * - lands drag steps at most once per frame through {@link createSectionDragSteps}, and the release at once;
 * - keeps the drawing up to date with the graphics actor's cuts, the camera's bounds and the render frame, which never
 *   restarts it, so none of them ends a drag;
 * - paints the handles and the picker and sets the cursor for the gesture the section input reports.
 *
 * @param host - The surface and the host objects behind it.
 * @returns Callback logic to provide as the section input's `adapter`.
 * @public
 */
export const createSectionInputAdapter = (host: SectionInputHost): SectionInputAdapterLogic =>
  createCallbackLogic<SectionInputCommand, undefined>(({ sendBack, receive }) => {
    const { surface, canvas, get, invalidate, handles, planePicker, graphics, cameraRig } = host;
    const report = (event: SectionInputEvent): void => {
      sendBack(event);
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const viewDirection = new THREE.Vector3();
    const steps = createSectionDragSteps();
    const listeners = new AbortController();
    let graphicsContext = selectGraphicsSnapshot(graphics).context;
    let { bounds } = selectCameraSnapshot(cameraRig).context.view;
    let { renderFrame } = cameraRig;
    let gesture: SectionInputGesture = {};
    let held: Held | undefined;
    // Whether the latest press was ours, so its click (and a double click) is swallowed. Reset by every press, so
    // a press that ends without a click never swallows the next one.
    let isPressOwned = false;
    let drawn: DrawingSource | undefined;

    const isActive = (): boolean => graphicsContext.isSectionViewActive;

    /** At the cut limit a tile can only move the selected plane cut; with none selected the picker is inert. */
    const isPickerLive = (): boolean => {
      const { sectionCuts, selectedSectionCutId } = graphicsContext;
      return (
        sectionCuts.length < maxSectionCuts ||
        sectionCuts.some((cut) => cut.id === selectedSectionCutId && cut.kind === 'plane')
      );
    };

    const findHandle = (target: SectionHandleTarget | undefined): SectionHandle | undefined =>
      target ? handles.handles.find((handle) => isTarget(handle, target)) : undefined;

    const setCursor = (): void => {
      surface.classList.remove('cursor-action', 'cursor-grab', 'cursor-grabbing');
      const { press, hovered, hoveredTile } = gesture;
      if (held?.drag) {
        surface.classList.add('cursor-grabbing');
      } else if (
        (press?.tile !== undefined && isPickerLive()) ||
        hoveredTile !== undefined ||
        hovered?.kind === 'select'
      ) {
        surface.classList.add('cursor-action');
      } else if (hovered) {
        surface.classList.add('cursor-grab');
      }
    };

    const paint = (): void => {
      const { sectionCuts, selectedSectionCutId, hoveredSectionCutId } = graphicsContext;
      const selected = sectionCuts.find((cut) => cut.id === selectedSectionCutId);
      handles.paint({
        hovered: findHandle(gesture.hovered),
        active: held?.drag?.handle,
        hoveredCutId: hoveredSectionCutId,
      });
      planePicker?.paint({
        current: selected?.kind === 'plane' ? selected.plane : undefined,
        hovered: gesture.hoveredTile,
        active: gesture.press?.tile,
        isDimmed: !isPickerLive(),
      });
      setCursor();
      invalidate();
    };

    const pointerRay = (x: number, y: number): THREE.Ray => {
      const { camera, size } = get();
      pointer.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);
      setRaycasterFromCamera(raycaster, pointer, camera);
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

    const reportHover = ({ tile, handle }: Picked): void => {
      report({
        type: 'hoverPicked',
        ...(handle === undefined ? {} : { handle: handle.target }),
        ...(tile === undefined ? {} : { tile }),
      });
    };

    // Hover picks run once per frame, the latest pointer winning (graphics policy §10).
    const hoverPicks = createRafCoalescer((point: Readonly<{ x: number; y: number }>) => {
      if (!held && isActive()) {
        const picked = pickAt(point.x, point.y);
        // A dimmed picker takes no hover.
        reportHover(picked.tile === undefined || isPickerLive() ? picked : {});
      }
    });

    const hold = (): (() => void) => {
      graphics.send({ type: 'beginViewerModelHoverSuppression', reason: 'sectionViewTransform', source: 'viewer' });
      const { controls } = get();
      const heldControls =
        typeof controls === 'object' && controls !== null && 'enabled' in controls && controls.enabled === true
          ? (controls as { enabled: boolean })
          : undefined;
      if (heldControls) {
        heldControls.enabled = false;
      }
      return () => {
        if (heldControls) {
          heldControls.enabled = true;
        }
        graphics.send({ type: 'endViewerModelHoverSuppression', reason: 'sectionViewTransform', source: 'viewer' });
      };
    };

    /** Gives back what the held press took, landing or dropping its waiting step first. */
    const giveBack = (ending: 'flush' | 'cancel'): void => {
      const ended = held;
      if (ending === 'flush') {
        steps.flush();
      } else {
        steps.cancel();
      }
      if (!ended) {
        return;
      }
      held = undefined;
      ended.release();
      releasePointer(surface, ended.pointerId);
    };

    /** A drag parameter in a frame-free unit: metres for a plane, degrees for a revolution. */
    const toFrameFree = (cut: SectionCut, parameter: number): number =>
      isLengthParameter(cut) ? parameter * renderFrame.metersPerRenderUnit : parameter;

    const fromFrameFree = (cut: SectionCut, value: number): number =>
      isLengthParameter(cut) ? value / renderFrame.metersPerRenderUnit : value;

    const anchorOf = (drag: Drag): THREE.Vector3 =>
      new THREE.Vector3(...toRenderPoint({ renderFrame, point: drag.anchorMeters }));

    const startDrag = ({
      handle,
      cut,
      x,
      y,
    }: Readonly<{ handle: SectionHandle; cut: SectionCut; x: number; y: number }>): Drag => {
      const parameter = resolveSectionDragParameter({ ray: pointerRay(x, y), cut, anchor: handle.anchor, renderFrame });
      const { anchor } = handle;
      return {
        handle,
        cut,
        anchorMeters: fromRenderPoint({ renderFrame, point: [anchor.x, anchor.y, anchor.z] }),
        start: parameter === undefined ? undefined : toFrameFree(cut, parameter),
      };
    };

    const applyDrag = (drag: Drag, x: number, y: number): void => {
      const parameter = resolveSectionDragParameter({
        ray: pointerRay(x, y),
        cut: drag.cut,
        anchor: anchorOf(drag),
        renderFrame,
      });
      if (parameter === undefined) {
        return;
      }
      drag.start ??= toFrameFree(drag.cut, parameter);
      const { geometryCenter, geometryRadius } = graphicsContext;
      const patch = resolveSectionDragPatch({
        kind: drag.handle.target.kind,
        cut: drag.cut,
        startParameter: fromFrameFree(drag.cut, drag.start),
        parameter,
        metersPerRenderUnit: renderFrame.metersPerRenderUnit,
        bounds: { center: geometryCenter, radius: geometryRadius },
      });
      if (patch) {
        graphics.send({ type: 'updateSectionCut', payload: { id: drag.cut.id, patch } });
      }
    };

    /** From the view's target toward the camera, as the camera view's `direction`, from the Three camera itself. */
    const readViewDirection = (): SectionVector => {
      get().camera.getWorldDirection(viewDirection);
      return [-viewDirection.x, -viewDirection.y, -viewDirection.z];
    };

    /**
     * A click on a tile moves the selected plane cut to its plane, through the centre, or adds that plane. Either
     * way the plane is new to its cut, so it removes the side facing the camera.
     */
    const clickTile = (tile: SectionPlane): void => {
      if (!isPickerLive()) {
        return;
      }
      const { sectionCuts, selectedSectionCutId } = graphicsContext;
      const selected = sectionCuts.find((cut) => cut.id === selectedSectionCutId);
      const direction = readViewDirection();
      if (selected?.kind !== 'plane') {
        graphics.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: tile, viewDirection: direction } });
      } else if (selected.plane !== tile) {
        graphics.send({
          type: 'updateSectionCut',
          payload: { id: selected.id, patch: { plane: tile, isFlipped: resolveSectionPlaneFlip(tile, direction) } },
        });
      }
    };

    /** Brings the drawing up to the latest cuts, bounds and render frame, and tells the section input what it drew. */
    const sync = (): void => {
      if (!isActive()) {
        return;
      }
      const { sectionCuts, selectedSectionCutId, hoveredSectionCutId } = graphicsContext;
      if (
        drawn?.cuts === sectionCuts &&
        drawn.selectedId === selectedSectionCutId &&
        drawn.hoveredId === hoveredSectionCutId &&
        drawn.bounds === bounds &&
        drawn.renderFrame === renderFrame
      ) {
        return;
      }
      const isDrawingSame = drawn?.cuts === sectionCuts && drawn.selectedId === selectedSectionCutId;
      drawn = {
        cuts: sectionCuts,
        selectedId: selectedSectionCutId,
        hoveredId: hoveredSectionCutId,
        bounds,
        renderFrame,
      };
      handles.update({ cuts: sectionCuts, selectedId: selectedSectionCutId, bounds, renderFrame });
      if (!isDrawingSame) {
        report({
          type: 'cutsChanged',
          cuts: sectionCuts,
          selectedId: selectedSectionCutId,
          handles: handles.handles.map((handle) => handle.target),
          isPickerLive: isPickerLive(),
        });
      }
      paint();
    };

    /** Section turned off: drop the press and hover, and draw nothing until it comes back. */
    const deactivate = (): void => {
      hoverPicks.cancel();
      drawn = undefined;
      report({ type: 'sectionViewEnded' });
    };

    /** The canvas itself, not DOM laid over it: the event source when it takes the events, else the canvas. */
    const isOnCanvas = (event: Event): boolean => event.target === surface || event.target === canvas;

    const handlePointerLeave = (): void => {
      hoverPicks.cancel();
      if (!held) {
        reportHover({});
      }
    };

    const handlePointerDown = (event: PointerEvent): void => {
      isPressOwned = false;
      if (!isActive() || event.button !== 0 || held !== undefined || !isOnCanvas(event)) {
        return;
      }
      const { tile, handle } = pickAt(event.offsetX, event.offsetY);
      const cut = handle && graphicsContext.sectionCuts.find((candidate) => candidate.id === handle.target.cutId);
      if (!tile && !cut) {
        return;
      }
      // The press is the handles': camera controls, Measure and the model's pointer events never see it.
      event.stopImmediatePropagation();
      event.preventDefault();
      isPressOwned = true;
      hoverPicks.cancel();
      capturePointer(surface, event.pointerId);
      // Only the selected cut has drag handles, so a press on one leaves the selection; a press on an unselected
      // revolution's fan selects it and drags nothing.
      const isSelect = handle?.target.kind === 'select';
      if (isSelect && cut) {
        graphics.send({ type: 'selectSectionCut', payload: cut.id });
      }
      const drag =
        handle && cut && !isSelect ? startDrag({ handle, cut, x: event.offsetX, y: event.offsetY }) : undefined;
      held = {
        pointerId: event.pointerId,
        drag,
        release: drag === undefined && tile === undefined ? () => undefined : hold(),
      };
      report({
        type: 'pointerPressed',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        ...(tile === undefined ? {} : { tile }),
        ...(handle === undefined ? {} : { handle: handle.target }),
        ...(drag === undefined ? {} : { cut: drag.cut }),
      });
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (held?.pointerId === event.pointerId) {
        event.stopImmediatePropagation();
        report({
          type: 'pointerMoved',
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          offsetX: event.offsetX,
          offsetY: event.offsetY,
        });
        return;
      }
      if (!isOnCanvas(event)) {
        handlePointerLeave();
        return;
      }
      // Hover picks wait while a button is held: another tool owns that gesture.
      if (event.buttons === 0) {
        hoverPicks.schedule({ x: event.offsetX, y: event.offsetY });
      }
    };

    const handlePointerUp = (event: PointerEvent): void => {
      if (held?.pointerId !== event.pointerId) {
        return;
      }
      event.stopImmediatePropagation();
      report({
        type: 'pointerReleased',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      });
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      if (held?.pointerId === event.pointerId) {
        report({ type: 'pointerCancelled', pointerId: event.pointerId });
      }
    };

    // Measure follows `mousemove`, which a stopped `pointermove` does not stop.
    const handleMouseMove = (event: MouseEvent): void => {
      if (held) {
        event.stopImmediatePropagation();
      }
    };

    const handleClick = (event: MouseEvent): void => {
      if (isPressOwned) {
        event.stopImmediatePropagation();
      }
    };

    receive((message) => {
      switch (message.type) {
        case 'dragStep': {
          const drag = held?.drag;
          if (drag) {
            const { x, y } = message;
            steps.schedule(() => {
              applyDrag(drag, x, y);
            });
          }
          break;
        }
        case 'pressEnded': {
          giveBack(message.ending);
          if (isActive()) {
            paint();
          } else {
            setCursor();
          }
          if (message.clickedTile !== undefined) {
            clickTile(message.clickedTile);
          }
          break;
        }
        case 'hoverCutChanged': {
          // Linked with the cut's chip.
          graphics.send({ type: 'hoverSectionCut', payload: message.cutId });
          break;
        }
        case 'gestureChanged': {
          gesture = message.gesture;
          if (isActive()) {
            paint();
          } else {
            setCursor();
          }
          break;
        }
        case 'renderFrameChanged': {
          renderFrame = message.renderFrame;
          sync();
          break;
        }
      }
    });

    const { signal } = listeners;
    // Capture phase: every event lands on the surface or the canvas inside it, so these run before any bubble-phase
    // listener there, which is how the camera controls, R3F, Measure and kinematics all register.
    const options = { signal, capture: true };
    surface.addEventListener('pointerdown', handlePointerDown, options);
    surface.addEventListener('pointermove', handlePointerMove, options);
    surface.addEventListener('pointerup', handlePointerUp, options);
    surface.addEventListener('pointercancel', handlePointerCancel, options);
    surface.addEventListener('lostpointercapture', handlePointerCancel, options);
    surface.addEventListener('pointerleave', handlePointerLeave, { signal });
    surface.addEventListener('mousemove', handleMouseMove, options);
    surface.addEventListener('click', handleClick, options);
    surface.addEventListener('dblclick', handleClick, options);

    const graphicsSubscription = graphics.subscribe((snapshot) => {
      const wasActive = isActive();
      graphicsContext = snapshot.context;
      if (wasActive && !isActive()) {
        deactivate();
      } else {
        sync();
      }
    });
    const cameraSubscription = cameraRig.actorRef.subscribe((snapshot) => {
      const next = snapshot.context.view.bounds;
      if (!areBoundsEqual(next, bounds)) {
        bounds = next;
        sync();
      }
    });
    const releaseMatcap = subscribeToMatcapLoad(invalidate);
    sync();

    return () => {
      graphicsSubscription.unsubscribe();
      cameraSubscription.unsubscribe();
      releaseMatcap();
      listeners.abort();
      hoverPicks.cancel();
      giveBack('cancel');
      if (gesture.hovered) {
        graphics.send({ type: 'hoverSectionCut', payload: undefined });
      }
      gesture = {};
      setCursor();
    };
  });
