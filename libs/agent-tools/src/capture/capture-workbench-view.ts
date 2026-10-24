/**
 * A named workbench view as one raster capture (live-render blueprint LRP-8b): the camera, field of view, section
 * cuts and display toggles `arrange_workbench` or the page wrote to `.tau/workbench/views/<id>.json`, in metres in
 * `tau:root`, as the viewer reads them.
 *
 * @module
 */

import type { CaptureWorkbenchView } from '@taucad/chat/rpc';

import { canonicalCaptureViews } from '#capture/capture-views.js';

type Vector = readonly [number, number, number];

/** A raster camera a workbench view resolves to: framed to the model's bounds, or placed exactly. @public */
export type WorkbenchCaptureCamera =
  | Readonly<{
      framing: 'bounds';
      direction: Vector;
      up: Vector;
      margin: number;
      projection: Readonly<{ kind: 'orthographic' }> | Readonly<{ kind: 'perspective'; verticalFieldOfView: number }>;
    }>
  | Readonly<{
      framing: 'fixed';
      position: Vector;
      target: Vector;
      up: Vector;
      projection:
        | Readonly<{ kind: 'orthographic'; verticalSpan: number; zoom: number }>
        | Readonly<{ kind: 'perspective'; verticalFieldOfView: number; zoom: number }>;
    }>;

/** One retained half-space: its normal points into the side the capture keeps. @public */
export type WorkbenchCapturePlane = Readonly<{ point: Vector; normal: Vector }>;

/** Camera direction of the isometric preset, from the subject toward the camera. */
const isometricDirection: Vector = [0.6123724357, -0.6123724357, 0.5];
const upAxes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const satisfies Record<string, Vector>;
const planeAxes = { xy: 2, xz: 1, yz: 0 } as const;
const axisNames = ['x', 'y', 'z'] as const;

const parallel = (left: Vector, right: Vector): boolean => {
  const cross = Math.hypot(
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  );
  return cross <= 1e-9 * Math.hypot(...left) * Math.hypot(...right);
};

/** The viewer's field of view as the raster's: 0 is orthographic, any other angle is clamped to [1, 179]. */
const fitProjection = (fieldOfView: number) =>
  fieldOfView === 0
    ? ({ kind: 'orthographic' } as const)
    : ({ kind: 'perspective', verticalFieldOfView: Math.min(179, Math.max(1, fieldOfView)) } as const);

type MutableVector = [number, number, number];

/** A capture camera with plain arrays, as an image job's option schema takes it. @public */
export type MaterializedCaptureCamera =
  | {
      framing: 'bounds' | 'fit';
      direction: MutableVector;
      up: MutableVector;
      margin: number;
      projection: { kind: 'orthographic' } | { kind: 'perspective'; verticalFieldOfView: number };
    }
  | {
      framing: 'fixed';
      position: MutableVector;
      target: MutableVector;
      up: MutableVector;
      projection:
        | { kind: 'orthographic'; verticalSpan: number; zoom: number }
        | { kind: 'perspective'; verticalFieldOfView: number; zoom: number };
    };

const copy = (vector: Vector): MutableVector => [vector[0], vector[1], vector[2]];

/**
 * Copy a capture camera (the canonical recipe's, or a workbench view's) into plain arrays for an image job.
 *
 * @param camera - The single-image camera `buildCaptureExportOptions` produced.
 * @returns The same camera with mutable tuples.
 * @public
 */
export const materializeCaptureCamera = (
  camera:
    | WorkbenchCaptureCamera
    | Readonly<{
        framing: 'bounds';
        direction: Vector;
        up: Vector;
        margin: number;
        projection: Readonly<{ kind: 'perspective'; verticalFieldOfView: number }>;
      }>,
): MaterializedCaptureCamera =>
  camera.framing === 'fixed'
    ? {
        framing: 'fixed',
        position: copy(camera.position),
        target: copy(camera.target),
        up: copy(camera.up),
        projection: { ...camera.projection },
      }
    : {
        framing: camera.framing,
        direction: copy(camera.direction),
        up: copy(camera.up),
        margin: camera.margin,
        projection: { ...camera.projection },
      };

/** One capture camera, or why the view cannot be captured. @public */
export type WorkbenchViewCamera =
  | Readonly<{ status: 'camera'; camera: WorkbenchCaptureCamera; label: string }>
  | Readonly<{ status: 'refused'; message: string }>;

/**
 * The raster camera for a view: a preset or look is framed to the model's bounds from that side, as the page frames
 * it; a stored pose is placed exactly.
 *
 * @param view - The resolved view.
 * @returns The camera and a short label, or a refusal.
 * @public
 */
export const workbenchViewCamera = (view: CaptureWorkbenchView): WorkbenchViewCamera => {
  const { camera, fieldOfView } = view;
  const upAxis: Vector = upAxes[view.upDirection];
  const framed = (direction: Vector, up: Vector, label: string): WorkbenchViewCamera => ({
    status: 'camera',
    camera: {
      framing: 'bounds',
      direction,
      up: parallel(direction, up) ? [0, 1, 0] : up,
      margin: 0.1,
      projection: fitProjection(fieldOfView),
    },
    label,
  });
  if (camera.kind === 'preset') {
    const preset = canonicalCaptureViews.find(({ id }) => id === camera.preset);
    return preset === undefined
      ? framed(isometricDirection, upAxis, 'isometric preset')
      : framed(preset.direction, preset.up, `${preset.id} preset`);
  }
  if (camera.kind === 'look') {
    return framed(camera.direction, camera.up ?? upAxis, 'look');
  }
  if (camera.frameId !== 'tau:root') {
    return {
      status: 'refused',
      message: `View ${view.id} stores its camera in frame ${camera.frameId}; screenshot places cameras in tau:root only. Reframe the view with a preset or look in arrange_workbench.`,
    };
  }
  const length = Math.hypot(...camera.direction);
  if (length === 0 || parallel(camera.direction, camera.up)) {
    return { status: 'refused', message: `View ${view.id} stores a degenerate camera pose.` };
  }
  const projection =
    fieldOfView === 0
      ? ({ kind: 'orthographic', verticalSpan: camera.verticalSpan, zoom: 1 } as const)
      : ({
          kind: 'perspective',
          verticalFieldOfView: Math.min(179, Math.max(1, fieldOfView)),
          zoom: camera.perspectiveZoom,
        } as const);
  /* The distance at which the stored span fills the frame, as the viewer's camera domain places it. */
  const distance =
    projection.kind === 'perspective'
      ? (camera.verticalSpan * camera.perspectiveZoom) /
        (2 * Math.tan((projection.verticalFieldOfView * Math.PI) / 360))
      : camera.verticalSpan * 2;
  return {
    status: 'camera',
    camera: {
      framing: 'fixed',
      target: camera.target,
      position: [0, 1, 2].map(
        (axis) => camera.target[axis]! + (camera.direction[axis]! / length) * distance,
      ) as unknown as Vector,
      up: camera.up,
      projection,
    },
    label: 'saved pose',
  };
};

/** The view's active plane cuts as retained half-spaces, or why one cannot be drawn. @public */
export type WorkbenchViewSections =
  | Readonly<{
      status: 'sections';
      planes: readonly WorkbenchCapturePlane[];
      description: string | undefined;
    }>
  | Readonly<{ status: 'refused'; message: string }>;

/**
 * The view's section as the raster's planes. A plane cut removes its +axis side, or the −axis side when flipped, so
 * the retained normal points the other way; several cuts remove their union, which is the intersection of the
 * retained sides the raster keeps. A revolution cut has no half-space form and is refused.
 *
 * @param view - The resolved view.
 * @returns The planes (none when the section is off) and one sentence naming what was kept.
 * @public
 */
export const workbenchViewSections = (view: CaptureWorkbenchView): WorkbenchViewSections => {
  if (!view.section.active || view.section.cuts.length === 0) {
    return { status: 'sections', planes: [], description: undefined };
  }
  const planes: WorkbenchCapturePlane[] = [];
  const kept: string[] = [];
  for (const cut of view.section.cuts) {
    if (cut.kind !== 'plane') {
      return {
        status: 'refused',
        message: `View ${view.id} has a revolution cut, which screenshot cannot draw. Capture it with section { plane, offset } instead, or remove that cut in arrange_workbench.`,
      };
    }
    const axis = planeAxes[cut.plane];
    const point: [number, number, number] = [0, 0, 0];
    const normal: [number, number, number] = [0, 0, 0];
    point[axis] = cut.offset;
    normal[axis] = cut.isFlipped ? 1 : -1;
    planes.push({ point, normal });
    kept.push(`${axisNames[axis]} ${cut.isFlipped ? '≥' : '≤'} ${String(cut.offset)} m`);
  }
  return {
    status: 'sections',
    planes,
    description: `Section: kept ${kept.join(' and ')}; the cut faces are capped.`,
  };
};
