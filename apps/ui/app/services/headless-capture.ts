import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { canonicalCaptureViews, captureFilesToDataUrls as encodeCaptureDataUrls } from '@taucad/agent-tools/capture';
import type { ExportFile } from '@taucad/types';
import type { CameraState } from '@taucad/camera';
import { toNanorasterCamera } from '@taucad/image/camera';
import { normalizeImageLabel } from '@taucad/image/label';
import { selectCadFailureIssues } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { getGraphicsCameraState } from '#services/graphics-camera-registry.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import type { HeadlessImageService } from '#services/headless-image.service.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';
import {
  buildGltfComponentManifest,
  listReachableGltfPrimitiveReferences,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { filterVisibleGltfPrimitives } from '#components/geometry/graphics/metadata/gltf-component-visibility.js';
import { resolveSectionViewPlane } from '#components/geometry/graphics/section-view-plane.js';

/* The canonical views live with the agent capture recipe so a browser-placed
 * and a daemon-placed `screenshot` cannot drift. Re-exported rather than
 * `export … from` because this module also consumes them. */
// oxlint-disable-next-line no-barrel-files/no-barrel-files, unicorn-js/prefer-export-from -- relocation shim over a value this module itself uses.
export { canonicalCaptureViews };

export type HeadlessCaptureRecipe =
  | { readonly purpose: 'chat'; readonly mode: 'current' | 'orthographic' }
  | { readonly purpose: 'agent'; readonly mode: 'isometric' | 'orthographic'; readonly includeEdges: boolean }
  | { readonly purpose: 'utility'; readonly mode: 'current' };

type CaptureCadImagesOptions = {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
  readonly cameraState?: CameraState;
  readonly imageService: Pick<HeadlessImageService, 'export'>;
  readonly recipe: HeadlessCaptureRecipe;
};

type CaptureSettledCadImagesOptions = Omit<CaptureCadImagesOptions, 'cadRef' | 'graphicsRef'> & {
  readonly cadSnapshot: SnapshotFrom<typeof cadMachine>;
  readonly cameraState?: CameraState;
  readonly presentation?: CapturePresentationIntent;
};

export type CapturePresentationIntent = {
  readonly upDirection: 'x' | 'y' | 'z';
  readonly enableSurfaces: boolean;
  readonly enableLines: boolean;
  readonly hiddenComponentIds: readonly string[];
  readonly isolatedComponentIds: readonly string[];
  readonly section?: {
    readonly point: readonly [number, number, number];
    readonly normal: readonly [number, number, number];
    readonly clipSurfaces: boolean;
    readonly clipLines: boolean;
  };
};

const copyCameraState = (cameraState: CameraState | undefined): CameraState | undefined =>
  cameraState
    ? {
        ...cameraState,
        position: [...cameraState.position],
        target: [...cameraState.target],
        up: [...cameraState.up],
        projection: { ...cameraState.projection },
        clipping: { ...cameraState.clipping },
      }
    : undefined;

const snapshotPresentationIntent = (
  graphicsSnapshot: SnapshotFrom<typeof graphicsMachine> | undefined,
): CapturePresentationIntent | undefined => {
  if (!graphicsSnapshot) {
    return undefined;
  }
  const { context } = graphicsSnapshot;
  const modelContext = context.modelInteractionRef.getSnapshot().context;
  const unit = context.modelInteractionUnitId
    ? getModelInteractionUnitState(modelContext, context.modelInteractionUnitId)
    : undefined;
  const selectedPlane = context.availableSectionViews.find(({ id }) => id === context.selectedSectionViewId);
  const section =
    context.isSectionViewActive && selectedPlane
      ? {
          ...resolveSectionViewPlane({
            baseNormal: selectedPlane.normal,
            pivot: context.sectionViewPivot,
            rotation: context.sectionViewRotation,
            direction: context.sectionViewDirection,
          }),
          clipSurfaces: context.enableClippingMesh,
          clipLines: context.enableClippingLines,
        }
      : undefined;
  return {
    upDirection: context.upDirection,
    enableSurfaces: context.enableSurfaces,
    enableLines: context.enableLines,
    hiddenComponentIds: [...(unit?.hiddenComponentIds ?? [])],
    isolatedComponentIds: [...(unit?.isolatedComponentIds ?? [])],
    section,
  };
};

const recipeSize = (recipe: HeadlessCaptureRecipe, cameraState?: CameraState): readonly [number, number] => {
  if (recipe.purpose === 'agent' || recipe.mode === 'orthographic') {
    return [1600, 1600];
  }
  if (cameraState) {
    return cameraState.aspect >= 1
      ? [2400, Math.max(16, Math.round(2400 / cameraState.aspect))]
      : [Math.max(16, Math.round(2400 * cameraState.aspect)), 2400];
  }
  return [2400, 1350];
};

const captureBackground = '#242424';
const tauWorld = { up: '+z', forward: '-y', unit: 'meter' } as const;

const requireSettledGeometry = (snapshot: SnapshotFrom<typeof cadMachine>) => {
  const { context } = snapshot;
  const failedIssues = selectCadFailureIssues(snapshot);
  if (failedIssues) {
    throw new Error(failedIssues.map((issue) => issue.message).join('; '));
  }
  if (!context.geometry || !context.entryPath) {
    throw new Error('The selected CAD view has no settled geometry');
  }
  return { geometry: context.geometry, entryPath: context.entryPath };
};

const requireImages = (
  files: ExportFile[] | undefined,
  options: {
    readonly count: number;
    readonly mimeType: 'image/png' | 'image/webp';
  },
): ExportFile[] => {
  const startedAt = performance.now();
  try {
    if (!files || files.length !== options.count) {
      throw new Error(`Image capture expected ${options.count} artifact(s), received ${files?.length ?? 0}`);
    }
    for (const file of files) {
      if (file.mimeType !== options.mimeType || file.bytes.length === 0) {
        throw new Error(`Image capture expected non-empty ${options.mimeType} artifacts`);
      }
    }
    return files;
  } finally {
    recordHeadlessImageTiming('capture.validate', startedAt, { count: files?.length ?? 0 });
  }
};

/** Capture from an already-settled CAD snapshot through the shared image service. */
export const captureSettledCadImages = async (options: CaptureSettledCadImagesOptions): Promise<ExportFile[]> => {
  const { cadSnapshot, cameraState, imageService, presentation, recipe } = options;
  const { geometry, entryPath } = requireSettledGeometry(cadSnapshot);
  if (geometry.format === 'webrtc') {
    throw new Error('Live WebRTC geometry cannot be captured headlessly');
  }
  const [width, height] = recipeSize(recipe, geometry.format === 'svg' ? undefined : cameraState);
  const annotated = recipe.purpose !== 'utility';

  if (geometry.format === 'svg') {
    if (recipe.mode === 'orthographic') {
      throw new Error('Planar SVG drawings have one canonical view; use a single drawing capture');
    }
    const files = await imageService.export({
      kind: 'capture',
      identity: `capture:${entryPath}:${geometry.hash}:${recipe.purpose}:drawing`,
      sourceFormat: 'svg',
      sourcePath: entryPath,
      content: geometry.content,
      format: 'png',
      exportOptions: {
        width,
        height,
        margin: 0.1,
        background: captureBackground,
        ...(annotated ? { label: normalizeImageLabel(entryPath), axes: true, scaleBar: true } : {}),
        ...(annotated ? { lengthSymbol: cadSnapshot.context.units.length } : {}),
      },
    });
    return requireImages(files, { count: 1, mimeType: 'image/png' });
  }

  const includeEdges = recipe.purpose === 'agent' ? recipe.includeEdges : true;
  const format = recipe.purpose === 'utility' ? 'png' : 'webp';
  const visiblePrimitives =
    presentation && (presentation.hiddenComponentIds.length > 0 || presentation.isolatedComponentIds.length > 0)
      ? filterVisibleGltfPrimitives({
          primitives: listReachableGltfPrimitiveReferences(geometry.content),
          manifest: buildGltfComponentManifest(geometry.content, {
            sourceFile: entryPath,
            geometryHash: geometry.hash,
          }),
          hiddenComponentIds: presentation.hiddenComponentIds,
          isolatedComponentIds: presentation.isolatedComponentIds,
        })
      : undefined;
  const common = {
    width,
    height,
    lineWidth: 3,
    background: captureBackground,
    ...(presentation?.enableSurfaces === false ? { surfaces: false } : {}),
    ...(!includeEdges || presentation?.enableLines === false ? { lines: false } : {}),
    world: tauWorld,
    ...(visiblePrimitives ? { visiblePrimitives } : {}),
    ...(presentation?.section
      ? {
          sections: {
            planes: [
              {
                point: presentation.section.point,
                normal: presentation.section.normal,
              },
            ] as const,
            clipSurfaces: presentation.section.clipSurfaces,
            clipLines: presentation.section.clipLines,
          },
        }
      : {}),
    ...(annotated ? { axes: true, scaleBar: true } : {}),
  } as const;
  let exportOptions;
  if (recipe.mode === 'orthographic') {
    exportOptions = {
      ...common,
      mode: 'batch',
      views: canonicalCaptureViews.map((view) => ({
        id: view.id,
        label: annotated ? normalizeImageLabel(view.label) : view.label,
        camera: {
          framing: 'bounds',
          direction: view.direction,
          up: view.up,
          margin: 0.1,
          projection: { kind: 'orthographic' },
        },
      })),
      quality: 1,
    } as const;
  } else {
    const camera =
      recipe.mode === 'isometric'
        ? ({
            framing: 'bounds',
            direction: [0.6123724357, -0.6123724357, 0.5],
            up: [0, 0, 1],
            margin: 0.1,
            projection: { kind: 'perspective', verticalFieldOfView: 45 },
          } as const)
        : cameraState
          ? toNanorasterCamera({
              cameraState,
            })
          : undefined;
    if (!camera) {
      throw new Error('The selected viewer camera state is not ready');
    }
    exportOptions = {
      ...common,
      mode: 'single',
      camera,
      ...(annotated ? { label: normalizeImageLabel(recipe.purpose === 'agent' ? 'Isometric' : entryPath) } : {}),
      ...(format === 'webp' ? { quality: 1 } : {}),
    } as const;
  }

  const identity = `capture:${entryPath}:${geometry.hash}:${recipe.purpose}:${recipe.mode}`;
  const files = await imageService.export({
    kind: 'capture',
    identity,
    sourceFormat: 'glb',
    sourcePath: entryPath,
    geometryHash: geometry.hash,
    content: geometry.content,
    format,
    exportOptions,
  });
  return requireImages(files, {
    count: recipe.mode === 'orthographic' ? canonicalCaptureViews.length : 1,
    mimeType: format === 'webp' ? 'image/webp' : 'image/png',
  });
};

/** Capture current CAD intent, copying live camera state before awaiting render freshness. */
export const captureCadImages = async (options: CaptureCadImagesOptions): Promise<ExportFile[]> => {
  const graphicsSnapshot = options.graphicsRef?.getSnapshot();
  const cameraState =
    options.recipe.mode === 'current'
      ? copyCameraState(options.cameraState ?? getGraphicsCameraState(options.graphicsRef))
      : undefined;
  const presentation = snapshotPresentationIntent(graphicsSnapshot);
  const freshnessStartedAt = performance.now();
  const cadSnapshot = await awaitFreshRender(options.cadRef);
  recordHeadlessImageTiming('capture.freshness', freshnessStartedAt);
  return captureSettledCadImages({
    cadSnapshot,
    cameraState,
    presentation,
    imageService: options.imageService,
    recipe: options.recipe,
  });
};

/**
 * Encode validated image files for the existing chat draft pipeline.
 *
 * The encoding itself lives with the capture recipe in
 * `@taucad/agent-tools/capture`: `uint8array-extras` spreads 65 535 arguments
 * per chunk and overflows the stack on a capture-sized image
 * (`agent-host-transports-and-offline.md` § "Addendum: FIX-SCREENSHOT",
 * defect 3). This wrapper is the page's timed call site, nothing more.
 */
export const captureFilesToDataUrls = (files: readonly ExportFile[]): string[] => {
  const startedAt = performance.now();
  const dataUrls = encodeCaptureDataUrls(files);
  recordHeadlessImageTiming('capture.encode-data-url', startedAt, { count: files.length });
  return dataUrls;
};
