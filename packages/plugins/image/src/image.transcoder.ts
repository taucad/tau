/**
 * Image Transcoder
 *
 * Wraps nanoraster's timed `renderImages` plan (Rust/wgpu wasm+napi core) as a
 * transcoder plugin: kernel GLB → factor-only PBR PNG/WebP/JPEG thumbnail via the
 * runtime route planner. The renderer module is loaded once during capability
 * initialization and retained in context; its free functions serialize onto one
 * lazily created renderer per process, so every render after the first reuses a
 * warm GPU device. Rendering never throws through the façade —
 * a malformed GLB, missing adapter, or lost device is contained by the façade
 * and returned as a structured issue, leaving the caller to keep the last
 * thumbnail.
 *
 * Blueprints:
 * - docs/research/headless-thumbnail-rendering-architecture-v4.md
 * - docs/research/render-capture-overlay-annotations.md
 */

import type * as Nanoraster from 'nanoraster';
import { createCameraView, frameCameraBounds, resolveCameraState } from '@taucad/camera';
import type { CameraBounds, CameraVector } from '@taucad/camera';
import { readGltfSceneBounds } from '@taucad/geometry-core';
import { defineTranscoder } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import { loadImageBackend } from '#image-backend.js';
import { imageEdgeSchemas } from '#image-export-options.js';
import { toNanorasterCamera } from '#nanoraster-camera.js';

/**
 * Static edges declared as a `readonly` tuple so each element keeps its literal
 * `to` type for {@link TranscodeInput} narrowing. Every edge carries an
 * `optionsSchema` from {@link imageEdgeSchemas}; a drift-guard test asserts the
 * tuple and that map stay in sync.
 */
const edges = [
  {
    from: 'glb',
    to: 'png',
    fidelity: 'mesh',
    optionsSchema: imageEdgeSchemas.png,
    content: ['includeEdges'],
  },
  {
    from: 'glb',
    to: 'webp',
    fidelity: 'mesh',
    optionsSchema: imageEdgeSchemas.webp,
    content: ['includeEdges'],
  },
  {
    from: 'glb',
    to: 'jpeg',
    fidelity: 'mesh',
    optionsSchema: imageEdgeSchemas.jpeg,
    content: ['includeEdges'],
  },
] as const;

const toExportFile = ({ name, bytes, mimeType }: Nanoraster.RenderedImageFile, outputName = name): ExportFile => ({
  name: outputName,
  bytes,
  mimeType,
});

const asRenderSections = (
  sections:
    | {
        readonly planes: readonly Nanoraster.RenderSectionPlane[];
        readonly clipSurfaces: boolean;
        readonly clipLines: boolean;
      }
    | undefined,
): Nanoraster.RenderSections | undefined =>
  sections ? { ...sections, planes: sections.planes as Nanoraster.RenderSections['planes'] } : undefined;

type BoundsCamera = Readonly<{
  framing: 'bounds';
  direction: CameraVector;
  up: CameraVector;
  margin: number;
  projection: Readonly<{ kind: 'orthographic' }> | Readonly<{ kind: 'perspective'; verticalFieldOfView: number }>;
}>;
type WorldAxis = `${'+' | '-'}${'x' | 'y' | 'z'}`;

const isBoundsCamera = (camera: { readonly framing: string }): camera is BoundsCamera => camera.framing === 'bounds';

const callerWorldConvention = (world: {
  readonly up: WorldAxis;
  readonly forward: WorldAxis;
  readonly unit: 'meter' | 'millimeter';
}) => ({
  up: world.up,
  forward: world.forward,
  metersPerUnit: world.unit === 'meter' ? 1 : 0.001,
});

const resolveBoundsCamera = ({
  camera,
  bounds,
  width,
  height,
}: {
  camera: BoundsCamera;
  bounds: CameraBounds;
  width: number;
  height: number;
}): Nanoraster.RenderCamera => {
  const diagonal = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const view = frameCameraBounds({
    view: createCameraView({
      frameId: 'image:caller-world',
      requestedVerticalFieldOfView:
        camera.projection.kind === 'perspective' ? camera.projection.verticalFieldOfView : 0,
      perspectiveZoom: 1,
      target: [
        (bounds.min[0] + bounds.max[0]) / 2,
        (bounds.min[1] + bounds.max[1]) / 2,
        (bounds.min[2] + bounds.max[2]) / 2,
      ],
      direction: camera.direction,
      up: camera.up,
      verticalSpan: diagonal > 0 ? diagonal : 1,
      viewport: { width, height, pixelRatio: 1 },
      bounds,
    }),
    bounds,
    margin: camera.margin,
  });
  return toNanorasterCamera({ cameraState: resolveCameraState({ view }) });
};

/** GLB-to-image transcoder with strict single and ordered batch modes. @public */
export const imageTranscoder = defineTranscoder({
  id: 'image',
  name: 'ImageTranscoder',
  // Bump whenever the renderer's output bytes change for identical input, or
  // persisted export caches keep serving images from the previous renderer.
  // 9.0.0 = caller-declared world coordinates over canonical glTF input.
  version: '9.0.0',
  edges,

  async initialize() {
    const renderer = await loadImageBackend();
    return { renderer, adapter: await renderer.describeAdapter() };
  },

  async transcode(
    input,
    runtime,
    context: { renderer: typeof Nanoraster; adapter: Nanoraster.AdapterInfo | undefined },
  ) {
    if (input.files.length !== 1) {
      return {
        success: false,
        issues: [
          {
            message: `Image transcoding expected exactly one GLB source artifact, received ${input.files.length}`,
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }

    const glb = input.files[0]!.bytes;
    let renderSpan: ReturnType<typeof runtime.tracer.startSpan> | undefined;
    try {
      const options = imageEdgeSchemas[input.to].parse(input.options);
      const { renderImages } = context.renderer;
      renderSpan = runtime.tracer.startSpan('image.render', {
        mode: options.mode,
        format: input.to,
        width: options.width,
        height: options.height,
        ...(context.adapter
          ? {
              adapterBackend: context.adapter.backend,
              adapterName: context.adapter.name,
              adapterDeviceType: context.adapter.deviceType,
            }
          : {}),
      });
      runtime.logger.log(`Rendering GLB → ${input.to}`);
      const cameras = options.mode === 'batch' ? options.views.map((view) => view.camera) : [options.camera];
      const boundsFitStartedAt = cameras.some((camera) => isBoundsCamera(camera)) ? performance.now() : undefined;
      const boundsParseStartedAt = boundsFitStartedAt === undefined ? undefined : performance.now();
      const cameraBounds =
        boundsFitStartedAt === undefined
          ? undefined
          : await readGltfSceneBounds({ bytes: glb, targetWorld: callerWorldConvention(options.world) });
      const boundsParseDuration =
        boundsParseStartedAt === undefined ? undefined : performance.now() - boundsParseStartedAt;
      const cameraSolveStartedAt = cameraBounds ? performance.now() : undefined;
      const resolveImageCamera = (
        camera: { readonly framing: string },
        width: number,
        height: number,
      ): Nanoraster.RenderCamera => {
        if (!isBoundsCamera(camera)) {
          return camera as Nanoraster.RenderCamera;
        }
        if (!cameraBounds) {
          throw new Error('Bounds camera resolution requires finite scene bounds.');
        }
        return resolveBoundsCamera({ camera, bounds: cameraBounds, width, height });
      };
      let images: ReadonlyArray<Nanoraster.RenderedImage<string, typeof input.to>> & {
        readonly timings: Nanoraster.RenderTimings;
      };
      let boundsFitDuration: number | undefined;
      let cameraSolveDuration: number | undefined;
      if (options.mode === 'batch') {
        const { mode: _, views, sections, ...renderOptions } = options;
        const resolvedViews = views.map((view) => ({
          ...view,
          camera: resolveImageCamera(view.camera, view.width ?? options.width, view.height ?? options.height),
        }));
        cameraSolveDuration = cameraSolveStartedAt === undefined ? undefined : performance.now() - cameraSolveStartedAt;
        boundsFitDuration = boundsFitStartedAt === undefined ? undefined : performance.now() - boundsFitStartedAt;
        images = await renderImages(glb, {
          format: input.to,
          ...renderOptions,
          sections: asRenderSections(sections),
          views: resolvedViews,
          timings: true,
        });
      } else {
        const { mode: _, camera, label, sections, ...renderOptions } = options;
        const resolvedCamera = resolveImageCamera(camera, options.width, options.height);
        cameraSolveDuration = cameraSolveStartedAt === undefined ? undefined : performance.now() - cameraSolveStartedAt;
        boundsFitDuration = boundsFitStartedAt === undefined ? undefined : performance.now() - boundsFitStartedAt;
        images = await renderImages(glb, {
          format: input.to,
          ...renderOptions,
          sections: asRenderSections(sections),
          views: [{ id: 'single', camera: resolvedCamera, label }],
          timings: true,
        });
      }
      const { timings } = images;
      const outputBytes = images.reduce((total, { file }) => total + file.bytes.byteLength, 0);
      /* oxlint-disable tau-lint/no-time-unit-suffix -- Public telemetry keys state the nanoraster native duration unit. */
      renderSpan.end({
        success: true,
        outputCount: images.length,
        outputBytes,
        ...(boundsFitDuration === undefined ? {} : { boundsFitMs: boundsFitDuration }),
        ...(boundsParseDuration === undefined ? {} : { boundsParseMs: boundsParseDuration }),
        ...(cameraSolveDuration === undefined ? {} : { cameraSolveMs: cameraSolveDuration }),
        parseMs: timings.parse,
        setupMs: timings.setup,
        capBuildMs: timings.capBuild,
        uploadMs: timings.upload,
        renderMs: timings.views.reduce((total, view) => total + view.render, 0),
        overlayMs: timings.views.reduce((total, view) => total + view.overlay, 0),
        encodeMs: timings.views.reduce((total, view) => total + view.encode, 0),
        peakReadbackBytes: timings.peakReadbackBytes,
        glbParses: timings.glbParses,
        adapterDeviceRequests: timings.adapterDeviceRequests,
        pipelineSets: timings.pipelineSets,
        presentationBuilds: timings.presentationBuilds,
        sceneUploads: timings.sceneUploads,
        targetAllocations: timings.targetAllocations,
      });
      /* oxlint-enable tau-lint/no-time-unit-suffix */
      const data = images.map(({ file }) => toExportFile(file));
      if (options.mode === 'single') {
        data[0] = toExportFile(images[0]!.file, `render.${input.to}`);
      }
      return { success: true, data, issues: [] };
    } catch (error) {
      const renderError = context.renderer.RenderError.from(error);
      renderSpan?.end({ success: false, errorCode: renderError.code });
      return {
        success: false,
        issues: [
          {
            message: renderError.message,
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            details: { type: 'render', code: renderError.code },
          },
        ],
      };
    }
  },

  async cleanup() {
    // Nothing to release here. nanoraster's free functions share one lazy
    // renderer per process, so the GPU device stays resident for the worker's
    // lifetime (warm after the first render) and is reclaimed when the worker
    // exits; oversized render targets are evicted by the library itself.
  },
});
