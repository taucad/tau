/**
 * The canonical agent capture recipe: one set of views, one option builder.
 *
 * Both hosts render through the same raster backend, so the *only* thing that
 * may differ between a browser-placed and a daemon-placed `screenshot` is who
 * owns the pixels — never the camera, the framing or the annotation. Keeping
 * the recipe here is what makes that true by construction; it used to be three
 * literal copies drifting apart.
 *
 * @module
 */

import type { ScreenshotSection } from '@taucad/chat/schemas/tools/screenshot';
import { cameraPresetOrientations } from '@taucad/workbench';
import type { cameraPresets } from '@taucad/workbench';

type OrthographicPreset = Exclude<(typeof cameraPresets)[number], 'isometric'>;

const captureView = <Id extends OrthographicPreset>(id: Id, label: string) => {
  const { direction, up } = cameraPresetOrientations[id];
  return { id, label, direction, up: up ?? ([0, 0, 1] as const) } as const;
};

import type { WorkbenchCaptureCamera, WorkbenchCapturePlane } from '#capture/capture-workbench-view.js';

/**
 * The six canonical orthographic views a multi-angle capture returns, oriented by the workbench presets
 * (`cameraPresetOrientations`), so a capture and a view record's preset look from the same side.
 *
 * @public
 */
export const canonicalCaptureViews = [
  captureView('front', 'Front — View From −Y'),
  captureView('back', 'Back — View From +Y'),
  captureView('right', 'Right — View From +X'),
  captureView('left', 'Left — View From −X'),
  captureView('top', 'Top — View From +Z'),
  captureView('bottom', 'Bottom — View From −Z'),
] as const;

/** Inputs the agent `screenshot` tool varies. @public */
export type CaptureExportOptionsInput = {
  /** `screenshot`'s own mode discriminant. */
  readonly mode: 'single' | 'multi_angle';
  /** Draw edge lines. Defaults to true. */
  readonly includeEdges?: boolean | undefined;
  /** Square capture edge length in pixels. */
  readonly size: number;
  /** One axis-aligned cut, in metres in `tau:root` (Z-up), the capture's own world. */
  readonly section?: ScreenshotSection | undefined;
  /**
   * A saved workbench view, resolved by `workbenchViewCamera` and `workbenchViewSections`: one image from its camera,
   * with its cuts and display. `section` and `multi_angle` do not combine with it.
   */
  readonly workbench?:
    | Readonly<{
        camera: WorkbenchCaptureCamera;
        planes: readonly WorkbenchCapturePlane[];
        display: Readonly<{ surfaces: boolean; lines: boolean; gizmo: boolean }>;
      }>
    | undefined;
};

/** Camera direction of the single isometric capture, from the subject toward the camera. */
const isometricDirection = [0.6123724357, -0.6123724357, 0.5] as const;

const sectionAxes = { xy: 2, xz: 1, yz: 0 } as const;
const axisNames = ['x', 'y', 'z'] as const;

/**
 * The side a section keeps: the caller's, else the one whose cut face looks at the single-mode
 * camera, the rule the viewer's own section tool uses (`resolveSectionPlaneFlip`).
 *
 * @param section - The requested cut.
 * @returns The retained side along the plane's normal axis.
 * @public
 */
export const resolveCaptureSectionKeep = (section: ScreenshotSection): 'negative' | 'positive' =>
  section.keep ?? (isometricDirection[sectionAxes[section.plane]] > 0 ? 'negative' : 'positive');

/**
 * One sentence naming what a sectioned capture kept, for the screenshot result's `message`.
 *
 * @param section - The requested cut.
 * @returns For example `Section xy: kept z ≤ 0.006 m; the cut face is capped.`
 * @public
 */
export const describeCaptureSection = (section: ScreenshotSection): string =>
  `Section ${section.plane}: kept ${axisNames[sectionAxes[section.plane]]} ${
    resolveCaptureSectionKeep(section) === 'negative' ? '≤' : '≥'
  } ${section.offset} m; the cut face is capped.`;

/** The renderer's retained half-space for one cut, in the capture's metre world. */
const sectionPlanes = (section: ScreenshotSection) => {
  const axis = sectionAxes[section.plane];
  const sign = resolveCaptureSectionKeep(section) === 'negative' ? -1 : 1;
  const point: [number, number, number] = [0, 0, 0];
  const normal: [number, number, number] = [0, 0, 0];
  point[axis] = section.offset;
  normal[axis] = sign;
  return { planes: [{ point, normal }] as [{ point: typeof point; normal: typeof normal }] } as const;
};

const buildOptions = (options: CaptureExportOptionsInput) => {
  const { workbench } = options;
  if (workbench !== undefined) {
    const lines = options.includeEdges ?? workbench.display.lines;
    return {
      width: options.size,
      height: options.size,
      lineWidth: 3,
      background: '#242424',
      ...(workbench.display.surfaces ? {} : { surfaces: false }),
      ...(lines ? {} : { lines: false }),
      world: { up: '+z', forward: '-y', unit: 'meter' },
      axes: workbench.display.gizmo,
      scaleBar: true,
      ...(workbench.planes.length === 0
        ? {}
        : {
            sections: {
              planes: workbench.planes.map(({ point, normal }) => ({
                point: [point[0], point[1], point[2]] as [number, number, number],
                normal: [normal[0], normal[1], normal[2]] as [number, number, number],
              })),
            },
          }),
      mode: 'single',
      camera: workbench.camera,
      quality: 1,
    } as const;
  }
  const common = {
    width: options.size,
    height: options.size,
    lineWidth: 3,
    background: '#242424',
    ...((options.includeEdges ?? true) ? {} : { lines: false }),
    world: { up: '+z', forward: '-y', unit: 'meter' },
    axes: true,
    scaleBar: true,
    ...(options.section === undefined ? {} : { sections: sectionPlanes(options.section) }),
  } as const;
  return options.mode === 'multi_angle'
    ? ({
        ...common,
        mode: 'batch',
        views: canonicalCaptureViews.map((view) => ({
          id: view.id,
          label: view.label,
          camera: {
            framing: 'bounds',
            direction: view.direction,
            up: view.up,
            margin: 0.1,
            projection: { kind: 'orthographic' },
          },
        })),
        quality: 1,
      } as const)
    : ({
        ...common,
        mode: 'single',
        camera: {
          framing: 'bounds',
          direction: isometricDirection,
          up: [0, 0, 1],
          margin: 0.1,
          projection: { kind: 'perspective', verticalFieldOfView: 45 },
        },
        quality: 1,
      } as const);
};

/** Raster export options for one agent capture. @public */
export type CaptureExportOptions = ReturnType<typeof buildOptions>;

/**
 * Build the raster export options one agent capture needs.
 *
 * @param options - Capture mode, edge preference and pixel size.
 * @returns Export options for a `single` or `batch` raster export.
 * @public
 *
 * @example <caption>Six orthographic views at 1600²</caption>
 * ```typescript
 * import { buildCaptureExportOptions } from '@taucad/agent-tools/capture';
 *
 * const exportOptions = buildCaptureExportOptions({ mode: 'multi_angle', size: 1600 });
 * ```
 */
export const buildCaptureExportOptions = (options: CaptureExportOptionsInput): CaptureExportOptions =>
  buildOptions(options);
