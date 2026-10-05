import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { asKnownArtifact } from '@taucad/runtime';
import type { Rendering } from '@taucad/runtime';
import { canonicalCaptureViews, captureFilesToDataUrls as encodeCaptureDataUrls } from '@taucad/agent-tools/capture';
import { sha256Bytes } from '@taucad/utils/hash';
import type { Geometry, ExportFile } from '@taucad/types';
import type { CameraState } from '@taucad/camera';
import { toNanorasterCamera } from '@taucad/image/camera';
import { normalizeImageLabel } from '@taucad/image/label';
import { selectCadFailureIssues, selectCadDisplay } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { getGraphicsCameraState } from '#services/graphics-camera-registry.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import { prepareCapturePresentation } from '#services/headless-capture-presentation.js';
import type { CaptureModelPresentation } from '#services/headless-capture-presentation.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import type { HeadlessImageJob, HeadlessImageService } from '#services/headless-image.service.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';
import {
  buildGltfComponentManifest,
  listReachableGltfPrimitiveReferences,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { filterVisibleGltfPrimitives } from '#components/geometry/graphics/metadata/gltf-component-visibility.js';
import { resolveSectionFaces, resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut, SectionVector } from '#components/geometry/graphics/section-cuts.js';

/* The canonical views live with the agent capture recipe so a browser-placed
 * and a daemon-placed `screenshot` cannot drift. Re-exported rather than
 * `export … from` because this module also consumes them. */
// oxlint-disable-next-line no-barrel-files/no-barrel-files, unicorn-js/prefer-export-from -- relocation shim over a value this module itself uses.
export { canonicalCaptureViews };

export type HeadlessCaptureRecipe =
  | { readonly purpose: 'chat'; readonly mode: 'current' | 'isometric' | 'orthographic' }
  | { readonly purpose: 'agent'; readonly mode: 'isometric' | 'orthographic'; readonly includeEdges: boolean }
  | { readonly purpose: 'utility'; readonly mode: 'current' };

type CaptureCadImagesOptions = {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
  readonly cameraState?: CameraState;
  readonly imageService: Pick<HeadlessImageService, 'export'>;
  readonly recipe: HeadlessCaptureRecipe;
  /** The active pane owns its view, options, instance and freshness. */
  readonly captureRendering?: () => Promise<Rendering>;
};

type CaptureSettledCadImagesOptions = Omit<CaptureCadImagesOptions, 'cadRef' | 'graphicsRef' | 'captureRendering'> & {
  readonly cadSnapshot: SnapshotFrom<typeof cadMachine>;
  readonly cameraState?: CameraState;
  readonly presentation?: CapturePresentationIntent;
  readonly rendering?: Rendering;
};

export type CapturePresentationIntent = {
  readonly upDirection: 'x' | 'y' | 'z';
  readonly enableSurfaces: boolean;
  readonly enableLines: boolean;
  readonly hiddenComponentIds: readonly string[];
  readonly isolatedComponentIds: readonly string[];
  readonly model?: CaptureModelPresentation;
  /** The cuts the viewer draws: its committed cut list while Section is on. */
  readonly sectionCuts?: readonly SectionCut[];
};

/** A capture's images, and the ids of the committed cuts they leave out. */
export type CadImageCapture = { readonly files: ExportFile[]; readonly omittedSectionCutIds: readonly string[] };

/** The line a capture's caller shows the person, or gives the agent, when the capture leaves cuts out. */
export const omittedSectionCutsNotice = 'Section cutaways narrower than 180° are not shown in captures.';

/** A cutaway narrower than 180° removes an intersection of half-spaces, which the image cannot draw. */
const isOmittedFromCapture = (cut: SectionCut): boolean => cut.kind === 'revolution' && cut.sweep < 180;

type RetainedHalfSpace = { point: [number, number, number]; normal: [number, number, number] };

// Adding zero turns a negative zero into zero.
const scaled = (vector: SectionVector, factor: number): [number, number, number] => [
  vector[0] * factor + 0,
  vector[1] * factor + 0,
  vector[2] * factor + 0,
];

/**
 * The image's section options for the cuts, as retained half-spaces in metres in the Tau root frame. The image keeps
 * only the points inside every one, so it removes a union of half-spaces: a plane removes its face's half-space, and a
 * cutaway of 180° or more the union of its two faces' half-spaces, each kept as its complement. A narrower cutaway
 * removes an intersection, which the image cannot draw, so it is left out with a diagnostic naming it. Four cuts need
 * at most eight half-spaces, the image's limit.
 */
const toSectionExportOptions = (
  cuts: readonly SectionCut[] = [],
): { readonly sections?: { planes: RetainedHalfSpace[]; clipSurfaces: boolean; clipLines: boolean } } => {
  const planes: RetainedHalfSpace[] = [];
  const omittedCutIds: string[] = [];
  for (const cut of cuts) {
    if (isOmittedFromCapture(cut)) {
      omittedCutIds.push(cut.id);
      continue;
    }
    for (const { plane } of resolveSectionFaces(resolveSectionPieces([cut]))) {
      planes.push({ point: scaled(plane.normal, plane.constant), normal: scaled(plane.normal, -1) });
    }
  }
  if (omittedCutIds.length > 0) {
    recordHeadlessImageTiming('capture.section-omitted', performance.now(), { cutIds: omittedCutIds });
  }
  // The viewer's cuts clip surfaces and lines alike.
  return planes.length > 0 ? { sections: { planes, clipSurfaces: true, clipLines: true } } : {};
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
  const kinematics = context.modelInteractionUnitId
    ? getKinematicsUnitState(context.kinematicsRef.getSnapshot().context, context.modelInteractionUnitId)
    : undefined;
  return {
    upDirection: context.upDirection,
    enableSurfaces: context.enableSurfaces,
    enableLines: context.enableLines,
    hiddenComponentIds: [...(unit?.hiddenComponentIds ?? [])],
    isolatedComponentIds: [...(unit?.isolatedComponentIds ?? [])],
    model: {
      mechanism: kinematics?.mechanism,
      pose: kinematics?.pose ? structuredClone(kinematics.pose) : undefined,
      opacityByComponentId: { ...unit?.opacityByComponentId },
    },
    sectionCuts: context.isSectionViewActive ? context.committedSectionCuts : [],
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
type GlbCaptureOptions = Extract<HeadlessImageJob, { sourceFormat: 'glb' }>['exportOptions'];
type SingleGlbCamera = Extract<GlbCaptureOptions, { mode?: 'single' }>['camera'];
const copyCameraVector = (vector: readonly [number, number, number]): [number, number, number] => [
  vector[0],
  vector[1],
  vector[2],
];

const requireSettledArtifact = (snapshot: SnapshotFrom<typeof cadMachine>, selectedRendering?: Rendering) => {
  const { context } = snapshot;
  if (!selectedRendering) {
    const failedIssues = selectCadFailureIssues(snapshot);
    if (failedIssues) {
      throw new Error(failedIssues.map((issue) => issue.message).join('; '));
    }
  }
  const rendering = selectedRendering ?? context.rendering;
  if (!rendering?.success || rendering.transient || !context.entryPath) {
    throw new Error('The selected CAD view has no committed rendering');
  }
  const artifact = asKnownArtifact(rendering.artifact);
  if (!artifact) {
    throw new Error(`Unsupported CAD artifact: ${rendering.artifact.mimeType}`);
  }
  return { artifact, hash: rendering.hash, entryPath: rendering.sourceRevision?.entry ?? context.entryPath };
};

/** Resolve display bytes only for an image request; assemblies remain definition-resident in the actor. */
export const resolveSettledCadGeometry = async (
  snapshot: SnapshotFrom<typeof cadMachine>,
): Promise<{
  geometry: Extract<Geometry, { format: 'gltf' | 'svg' }>;
  entryPath: string;
}> => {
  const { context } = snapshot;
  const failedIssues = selectCadFailureIssues(snapshot);
  if (failedIssues) {
    throw new Error(failedIssues.map((issue) => issue.message).join('; '));
  }
  const display = selectCadDisplay(snapshot);
  if (!display || !context.entryPath) {
    throw new Error('The selected CAD view has no settled geometry');
  }
  if (!('admitted' in display)) {
    const { artifact, hash, entryPath } = requireSettledArtifact(snapshot);
    return {
      geometry:
        artifact.mimeType === 'model/gltf-binary'
          ? { format: 'gltf', content: artifact.content, hash }
          : { format: 'svg', content: artifact.content, hash },
      entryPath,
    };
  }
  const result = await display.document.exportPublished({ format: 'glb', publishedAssembly: { root: display.root } });
  if (!result.success) {
    throw new Error(result.issues[0]?.message ?? 'Pinned assembly image projection failed');
  }
  const file = result.files[0];
  if (result.files.length !== 1 || file.mimeType !== 'model/gltf-binary' || file.bytes.length === 0) {
    throw new Error('Pinned assembly image projection expected one non-empty GLB');
  }
  return {
    geometry: { format: 'gltf', content: file.bytes, hash: await sha256Bytes(file.bytes) },
    entryPath: context.entryPath,
  };
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
  const display = selectCadDisplay(cadSnapshot);
  const assemblyDisplay = display && 'admitted' in display ? display : undefined;
  const resolved = assemblyDisplay ? await resolveSettledCadGeometry(cadSnapshot) : undefined;
  if (resolved && resolved.geometry.format !== 'gltf') {
    throw new Error('Pinned assembly image projection expected GLB');
  }
  const selectedArtifact: ReturnType<typeof requireSettledArtifact> =
    resolved?.geometry.format === 'gltf' && assemblyDisplay
      ? {
          artifact: { mimeType: 'model/gltf-binary', content: resolved.geometry.content },
          hash: assemblyDisplay.root.digest,
          entryPath: resolved.entryPath,
        }
      : requireSettledArtifact(cadSnapshot, options.rendering);
  const { artifact, hash, entryPath } = selectedArtifact;
  const [width, height] = recipeSize(recipe, artifact.mimeType === 'image/svg+xml' ? undefined : cameraState);
  const annotated = recipe.purpose !== 'utility';

  if (artifact.mimeType === 'image/svg+xml') {
    const files = await imageService.export({
      kind: 'capture',
      identity: `capture:${entryPath}:${hash}:${recipe.purpose}:drawing`,
      sourceFormat: 'svg',
      sourcePath: entryPath,
      content: artifact.content,
      format: 'png',
      exportOptions: {
        width,
        height,
        margin: 0.1,
        background: captureBackground,
        ...(annotated ? { label: normalizeImageLabel(entryPath), axes: true, scaleBar: true } : {}),
        ...(annotated ? { lengthSymbol: artifact.units?.length ?? 'mm' } : {}),
      },
    });
    return requireImages(files, { count: 1, mimeType: 'image/png' });
  }

  const includeEdges = recipe.purpose === 'agent' ? recipe.includeEdges : true;
  const format = recipe.purpose === 'utility' ? 'png' : 'webp';
  const visiblePrimitives =
    presentation && (presentation.hiddenComponentIds.length > 0 || presentation.isolatedComponentIds.length > 0)
      ? filterVisibleGltfPrimitives({
          primitives: listReachableGltfPrimitiveReferences(artifact.content),
          manifest: buildGltfComponentManifest(artifact.content, {
            sourceFile: entryPath,
            geometryHash: hash,
          }),
          hiddenComponentIds: presentation.hiddenComponentIds,
          isolatedComponentIds: presentation.isolatedComponentIds,
        })
      : undefined;
  const prepared =
    recipe.mode === 'current' && presentation?.model
      ? await prepareCapturePresentation(artifact.content, {
          ...presentation.model,
          sourceFile: entryPath,
          geometryHash: hash,
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
    ...(visiblePrimitives
      ? { visiblePrimitives: prepared?.remapPrimitives(visiblePrimitives) ?? visiblePrimitives }
      : {}),
    ...toSectionExportOptions(presentation?.sectionCuts),
    ...(annotated ? { axes: true, scaleBar: true } : {}),
  } as const;
  let exportOptions: GlbCaptureOptions;
  if (recipe.mode === 'orthographic') {
    exportOptions = {
      ...common,
      mode: 'batch',
      views: canonicalCaptureViews.map((view) => ({
        id: view.id,
        label: annotated ? normalizeImageLabel(view.label) : view.label,
        camera: {
          framing: 'bounds',
          direction: copyCameraVector(view.direction),
          up: copyCameraVector(view.up),
          margin: 0.1,
          projection: { kind: 'orthographic' },
        },
      })),
      quality: 1,
    } as const;
  } else {
    let camera: SingleGlbCamera | undefined;
    if (recipe.mode === 'isometric') {
      camera = {
        framing: 'bounds',
        direction: [0.6123724357, -0.6123724357, 0.5],
        up: [0, 0, 1],
        margin: 0.1,
        projection: { kind: 'perspective', verticalFieldOfView: 45 },
      };
    } else if (cameraState) {
      const fixed = toNanorasterCamera({ cameraState });
      if (fixed.framing !== 'fixed') {
        throw new Error('The selected viewer camera state is not fixed');
      }
      camera = {
        ...fixed,
        position: copyCameraVector(fixed.position),
        target: copyCameraVector(fixed.target),
        up: copyCameraVector(fixed.up),
      };
    }
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

  const geometryHash = prepared?.geometryHash ?? hash;
  const identity = `capture:${entryPath}:${geometryHash}:${recipe.purpose}:${recipe.mode}`;
  const job = {
    kind: 'capture',
    identity,
    sourceFormat: 'glb',
    sourcePath: entryPath,
    geometryHash,
    content: prepared?.content ?? artifact.content,
    exportOptions,
  } as const;
  const files = await imageService.export(format === 'webp' ? { ...job, format: 'webp' } : { ...job, format: 'png' });
  return requireImages(files, {
    count: recipe.mode === 'orthographic' ? canonicalCaptureViews.length : 1,
    mimeType: format === 'webp' ? 'image/webp' : 'image/png',
  });
};

/**
 * Capture current CAD intent, copying live camera state before awaiting render freshness. The capture also names the
 * committed cuts it leaves out, so its caller can say so.
 */
export const captureCadImages = async (options: CaptureCadImagesOptions): Promise<CadImageCapture> => {
  const graphicsSnapshot = options.graphicsRef?.getSnapshot();
  const capturedPresentedKey = graphicsSnapshot?.context.gltfPresentation.presentedKey;
  const poseContext =
    options.recipe.mode === 'current' ? graphicsSnapshot?.context.kinematicsRef.getSnapshot().context : undefined;
  const poseRevision = poseContext?.revision;
  const poseUnitId = graphicsSnapshot?.context.modelInteractionUnitId;
  if (
    poseContext &&
    poseUnitId &&
    !Object.values(getKinematicsUnitState(poseContext, poseUnitId).coordinates).every((value) => value === 0)
  ) {
    throw new Error('Current-view capture requires the as-built pose; reset motion before capturing');
  }
  const poseIsCurrent = (): boolean => {
    if (!poseContext) {
      return true;
    }
    const current = options.graphicsRef?.getSnapshot().context;
    return (
      current?.modelInteractionUnitId === poseUnitId &&
      current?.kinematicsRef === graphicsSnapshot?.context.kinematicsRef &&
      current?.kinematicsRef.getSnapshot().context.revision === poseRevision
    );
  };
  const cameraState =
    options.recipe.mode === 'current'
      ? copyCameraState(options.cameraState ?? getGraphicsCameraState(options.graphicsRef))
      : undefined;
  const presentation = snapshotPresentationIntent(graphicsSnapshot);
  const freshnessStartedAt = performance.now();
  const rendering = options.captureRendering ? await options.captureRendering() : undefined;
  const cadSnapshot = options.captureRendering ? options.cadRef.getSnapshot() : await awaitFreshRender(options.cadRef);
  recordHeadlessImageTiming('capture.freshness', freshnessStartedAt);
  const capturedDisplay = selectCadDisplay(cadSnapshot);
  if (!poseIsCurrent()) {
    throw new Error('The displayed pose changed during image capture');
  }
  const currentDisplayKey =
    options.recipe.mode === 'current' && !options.captureRendering && capturedDisplay
      ? 'admitted' in capturedDisplay
        ? capturedDisplay.root.digest
        : capturedDisplay.success && capturedDisplay.artifact.mimeType === 'model/gltf-binary'
          ? capturedDisplay.hash
          : undefined
      : undefined;
  if (
    currentDisplayKey !== undefined &&
    (capturedPresentedKey !== currentDisplayKey ||
      options.graphicsRef?.getSnapshot().context.gltfPresentation.presentedKey !== currentDisplayKey ||
      selectCadDisplay(options.cadRef.getSnapshot()) !== capturedDisplay)
  ) {
    throw new Error('The selected CAD display is still preparing its displayed scene');
  }
  const files = await captureSettledCadImages({
    cadSnapshot,
    cameraState,
    presentation,
    imageService: options.imageService,
    recipe: options.recipe,
    rendering,
  });
  if (!poseIsCurrent()) {
    throw new Error('The displayed pose changed during image capture');
  }
  if (
    capturedDisplay &&
    ('admitted' in capturedDisplay || currentDisplayKey !== undefined) &&
    (selectCadDisplay(options.cadRef.getSnapshot()) !== capturedDisplay ||
      (currentDisplayKey !== undefined &&
        options.graphicsRef?.getSnapshot().context.gltfPresentation.presentedKey !== currentDisplayKey))
  ) {
    throw new Error('The selected CAD display changed during image capture');
  }
  const omittedSectionCutIds = (presentation?.sectionCuts ?? [])
    .filter((cut) => isOmittedFromCapture(cut))
    .map(({ id }) => id);
  return { files, omittedSectionCutIds };
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
