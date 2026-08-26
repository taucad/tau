import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import type { ExportFile } from '@taucad/types';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import type { CameraState } from '@taucad/camera';
import { convertLength } from '@taucad/units/converter';
import { toNanorasterCamera } from '@taucad/image/camera';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { getGraphicsCameraState } from '#services/graphics-camera-registry.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import type { HeadlessImageService } from '#services/headless-image.service.js';
import {
  buildGltfComponentManifest,
  listReachableGltfPrimitiveReferences,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { filterVisibleGltfPrimitives } from '#components/geometry/graphics/metadata/gltf-component-visibility.js';
import { resolveSectionViewPlane } from '#components/geometry/graphics/section-view-plane.js';

export const canonicalCaptureViews = [
  { id: 'front', label: 'Front — View From −Y', direction: [0, -1, 0], up: [0, 0, 1] },
  { id: 'back', label: 'Back — View From +Y', direction: [0, 1, 0], up: [0, 0, 1] },
  { id: 'right', label: 'Right — View From +X', direction: [1, 0, 0], up: [0, 0, 1] },
  { id: 'left', label: 'Left — View From −X', direction: [-1, 0, 0], up: [0, 0, 1] },
  { id: 'top', label: 'Top — View From +Z', direction: [0, 0, 1], up: [0, 1, 0] },
  { id: 'bottom', label: 'Bottom — View From −Z', direction: [0, 0, -1], up: [0, 1, 0] },
] as const;

export type HeadlessCaptureRecipe =
  | { readonly purpose: 'chat'; readonly mode: 'current' | 'orthographic' }
  | { readonly purpose: 'agent'; readonly mode: 'isometric' | 'orthographic'; readonly includeEdges: boolean }
  | { readonly purpose: 'utility'; readonly mode: 'current' };

type CaptureCadImagesOptions = {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
  readonly cameraState?: CameraState;
  readonly imageService: Pick<HeadlessImageService, 'export'>;
  readonly fileSystem: RuntimeFileSystem;
  readonly recipe: HeadlessCaptureRecipe;
};

type CaptureSettledCadImagesOptions = Omit<CaptureCadImagesOptions, 'cadRef' | 'graphicsRef'> & {
  readonly cadSnapshot: SnapshotFrom<typeof cadMachine>;
  readonly cameraState?: CameraState;
  readonly presentation?: CapturePresentationIntent;
};

export type CapturePresentationIntent = {
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

const requireSettledGeometry = (snapshot: SnapshotFrom<typeof cadMachine>) => {
  const { context } = snapshot;
  if (context.latestGeometryOutcome === 'failure') {
    const issues = context.entryPath ? context.kernelIssues.get(context.entryPath) : undefined;
    throw new Error(
      issues && issues.length > 0 ? issues.map((issue) => issue.message).join('; ') : 'The selected CAD render failed',
    );
  }
  if (!context.geometry || !context.entryPath) {
    throw new Error('The selected CAD view has no settled geometry');
  }
  return { geometry: context.geometry, entryPath: context.entryPath };
};

const pngDimensions = (bytes: Uint8Array<ArrayBuffer>): readonly [number, number] | undefined => {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

const webpDimensions = (bytes: Uint8Array<ArrayBuffer>): readonly [number, number] | undefined => {
  if (
    bytes.length < 31 ||
    new TextDecoder().decode(bytes.subarray(0, 4)) !== 'RIFF' ||
    new TextDecoder().decode(bytes.subarray(8, 12)) !== 'WEBP'
  ) {
    return undefined;
  }
  const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (chunk === 'VP8X') {
    return [1 + (view.getUint32(24, true) % 16_777_216), 1 + (view.getUint32(27, true) % 16_777_216)];
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const packed = view.getUint32(21, true);
    return [1 + (packed % 16_384), 1 + (Math.floor(packed / 16_384) % 16_384)];
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return [view.getUint16(26, true) % 16_384, view.getUint16(28, true) % 16_384];
  }
  return undefined;
};

const requireImages = (
  files: ExportFile[] | undefined,
  options: {
    readonly count: number;
    readonly mimeType: 'image/png' | 'image/webp';
    readonly size: readonly [number, number];
  },
): ExportFile[] => {
  if (!files || files.length !== options.count) {
    throw new Error(`Image capture expected ${options.count} artifact(s), received ${files?.length ?? 0}`);
  }
  for (const file of files) {
    const dimensions = options.mimeType === 'image/png' ? pngDimensions(file.bytes) : webpDimensions(file.bytes);
    if (
      file.mimeType !== options.mimeType ||
      file.bytes.length === 0 ||
      dimensions?.[0] !== options.size[0] ||
      dimensions[1] !== options.size[1]
    ) {
      throw new Error(
        `Image capture expected non-empty ${options.mimeType} ${options.size[0]}×${options.size[1]} artifacts`,
      );
    }
  }
  return files;
};

/** Capture from an already-settled CAD snapshot through the shared image service. */
export const captureSettledCadImages = async (options: CaptureSettledCadImagesOptions): Promise<ExportFile[]> => {
  const { cadSnapshot, cameraState, fileSystem, imageService, presentation, recipe } = options;
  const { geometry, entryPath } = requireSettledGeometry(cadSnapshot);
  if (geometry.format === 'webrtc') {
    throw new Error('Live WebRTC geometry cannot be captured headlessly');
  }
  const [width, height] = recipeSize(recipe, geometry.format === 'svg' ? undefined : cameraState);
  const annotated = recipe.purpose !== 'utility';
  const imageLabel = annotated ? await import('@taucad/image/label') : undefined;
  const normalizeImageLabel = imageLabel?.normalizeImageLabel ?? ((value: string): string => value);

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
    return requireImages(files, { count: 1, mimeType: 'image/png', size: [width, height] });
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
  const lengthScale = convertLength(1, cadSnapshot.context.units.length, 'm');
  const common = {
    width,
    height,
    lineWidth: 3,
    background: captureBackground,
    ...(presentation?.enableSurfaces === false ? { surfaces: false } : {}),
    ...(presentation?.enableLines === false ? { lines: false } : {}),
    ...(visiblePrimitives ? { visiblePrimitives } : {}),
    ...(presentation?.section
      ? {
          sections: {
            planes: [
              {
                point: presentation.section.point.map((coordinate) => coordinate * lengthScale) as [
                  number,
                  number,
                  number,
                ],
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
        label: normalizeImageLabel(view.label),
        camera: {
          framing: 'fit',
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
            framing: 'fit',
            direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
            up: [0, 0, 1],
            margin: 0.1,
            projection: { kind: 'perspective', verticalFieldOfView: 45 },
          } as const)
        : cameraState
          ? toNanorasterCamera({
              cameraState,
              lengthScale,
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
    sourceFormat: 'gltf',
    fileSystem,
    format,
    source: { path: entryPath },
    parameters: cadSnapshot.context.parameters,
    includeEdges,
    exportOptions,
  });
  return requireImages(files, {
    count: recipe.mode === 'orthographic' ? canonicalCaptureViews.length : 1,
    mimeType: format === 'webp' ? 'image/webp' : 'image/png',
    size: [width, height],
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
  const cadSnapshot = await awaitFreshRender(options.cadRef);
  return captureSettledCadImages({
    cadSnapshot,
    cameraState,
    presentation,
    imageService: options.imageService,
    fileSystem: options.fileSystem,
    recipe: options.recipe,
  });
};

/** Encode validated image files for the existing chat draft pipeline. */
export const captureFilesToDataUrls = (files: readonly ExportFile[]): string[] =>
  files.map((file) => `data:${file.mimeType};base64,${uint8ArrayToBase64(file.bytes)}`);
