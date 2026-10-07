import { useCallback, useEffect, useRef } from 'react';
import { awaitGeometryPresentation } from '#components/geometry/graphics/three/utils/geometry-presentation-admission.js';
import { useActorRef } from '@xstate/react';
import { asKnownArtifact } from '@taucad/runtime';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { thumbnailMachine } from '#machines/thumbnail.machine.js';
import type { ThumbnailResult } from '#machines/thumbnail.machine.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { isEmptyGlb } from '#utils/inspect-glb.utils.js';

/** Project-relative path for the generated thumbnail. */
const thumbnailPath = 'thumbnail.webp';
// Twice the largest card slot so 2× displays and share previews stay sharp; edges are output pixels, so they scale with it.
const thumbnailWidth = 1536;
const thumbnailHeight = 1152;
const thumbnailLineWidth = 6;
const thumbnailQuality = 0.95;

const validateThumbnailWebp = async (bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    throw new Error('Thumbnail export returned bytes without a WebP signature');
  }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
  try {
    if (bitmap.width !== thumbnailWidth || bitmap.height !== thumbnailHeight) {
      throw new Error(
        `Thumbnail export expected ${thumbnailWidth}×${thumbnailHeight} pixels, received ${bitmap.width}×${bitmap.height}`,
      );
    }
  } finally {
    bitmap.close();
  }
};

const locatorIdentity = (config: ProjectFileSystemConfig | undefined): string =>
  config
    ? JSON.stringify([
        config.backend,
        config.providerBasePath,
        config.backend === 'webaccess' ? config.workspaceId : undefined,
      ])
    : 'unconfigured';

/**
 * Keep the project's `thumbnail.webp` fresh from the main file's geometry.
 *
 * Mounts the {@link thumbnailMachine} and subscribes to the main geometry
 * unit's `defaultRendered` events, debouncing + deduping regeneration off the
 * main thread. The shared headless image service owns the lazy runtime worker,
 * and the bytes are written to the project filesystem.
 *
 * @returns `regenerate` — force a thumbnail render now (manual command),
 *   bypassing the geometry-hash dedupe.
 */
export function useThumbnailGenerator(): { regenerate: () => Promise<ThumbnailResult> } {
  const { geometryUnits, mainEntryPath, projectId } = useProject();
  const { writeFile, deleteFile } = useFileManager();
  const imageService = useHeadlessImageService();

  const mainCadActor = geometryUnits.get(mainEntryPath);

  // Read the live collaborators through refs so the machine's injected effects
  // stay current without re-instantiating the actor when they change.
  const cadActorRef = useRef(mainCadActor);
  const writeFileRef = useRef(writeFile);
  const deleteFileRef = useRef(deleteFile);

  useEffect(() => {
    cadActorRef.current = mainCadActor;
    writeFileRef.current = writeFile;
    deleteFileRef.current = deleteFile;
  }, [mainCadActor, writeFile, deleteFile]);
  const generationRef = useRef(0);
  const identityRef = useRef(`${projectId}:unsettled`);
  const manualResultResolversRef = useRef<Array<(result: ThumbnailResult) => void>>([]);
  const thumbnailActor = useActorRef(thumbnailMachine, {
    input: {
      render: async (request) => {
        const snapshot = cadActorRef.current?.getSnapshot();
        const rendering = snapshot?.context.rendering;
        const artifact = rendering?.success ? asKnownArtifact(rendering.artifact) : undefined;
        const identity = request.identity ?? identityRef.current;
        if (
          !snapshot?.context.entryPath ||
          !rendering?.success ||
          rendering.transient ||
          !artifact ||
          (snapshot.context.evaluation?.success === true && snapshot.context.evaluation.views.length === 0) ||
          (artifact.mimeType === 'model/gltf-binary' && isEmptyGlb(artifact.content))
        ) {
          throw new Error('source-unavailable: committed rendering not ready');
        }
        const generation = generationRef.current;
        if (request.kind === 'automatic-thumbnail' && artifact.mimeType === 'model/gltf-binary') {
          await awaitGeometryPresentation(artifact.content, request.signal);
          if (generation !== generationRef.current) {
            throw new DOMException('Thumbnail source was superseded.', 'AbortError');
          }
        }
        const renderedLocatorIdentity = locatorIdentity(await getProjectFileSystemConfig(projectId));
        const files = await imageService.export(
          artifact.mimeType === 'image/svg+xml'
            ? {
                kind: request.kind,
                identity,
                projectId,
                signal: request.signal,
                sourceFormat: 'svg',
                sourcePath: snapshot.context.entryPath,
                content: artifact.content,
                format: 'webp',
                exportOptions: { width: thumbnailWidth, height: thumbnailHeight, quality: thumbnailQuality },
              }
            : {
                kind: request.kind,
                identity,
                projectId,
                signal: request.signal,
                sourceFormat: 'glb',
                sourcePath: snapshot.context.entryPath,
                geometryHash: rendering.hash,
                content: artifact.content,
                format: 'webp',
                exportOptions: {
                  mode: 'single',
                  width: thumbnailWidth,
                  height: thumbnailHeight,
                  lineWidth: thumbnailLineWidth,
                  camera: {
                    framing: 'bounds',
                    direction: [0.6123724357, -0.6123724357, 0.5],
                    up: [0, 0, 1],
                    margin: 0.1,
                    projection: { kind: 'perspective', verticalFieldOfView: 45 },
                  },
                  quality: thumbnailQuality,
                  ao: {},
                },
              },
        );
        if (!files) {
          throw new Error('thumbnail request was coalesced or suppressed after an unchanged failure');
        }
        const file = files[0];
        if (files.length !== 1 || file?.mimeType !== 'image/webp' || file.bytes.length === 0) {
          throw new Error(
            `Thumbnail export expected exactly one non-empty image/webp artifact, received ${files.length}: ${files.map((candidate) => `${candidate.mimeType} ${candidate.bytes.length}B`).join(', ')}`,
          );
        }
        await validateThumbnailWebp(file.bytes);
        return { bytes: file.bytes, identity, generation, locatorIdentity: renderedLocatorIdentity };
      },
      store: async (artifact) => {
        if (artifact.generation !== generationRef.current || artifact.identity !== identityRef.current) {
          return { status: 'skipped', reason: 'superseded' };
        }
        const currentLocatorIdentity = locatorIdentity(await getProjectFileSystemConfig(projectId));
        if (artifact.generation !== generationRef.current || artifact.identity !== identityRef.current) {
          return { status: 'skipped', reason: 'superseded' };
        }
        if (artifact.locatorIdentity !== currentLocatorIdentity) {
          return { status: 'skipped', reason: 'locator-changed' };
        }
        try {
          await writeFileRef.current(thumbnailPath, artifact.bytes, { source: 'machine' });
        } catch (error) {
          console.warn('Thumbnail write failed', {
            projectId,
            identity: artifact.identity,
            path: thumbnailPath,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        return { status: 'stored' };
      },
      onManualResult: (result) => {
        manualResultResolversRef.current.shift()?.(result);
      },
    },
  });

  useEffect(
    () => () => {
      generationRef.current += 1;
      identityRef.current = `${projectId}:disposed`;
      const error = new DOMException('Thumbnail generator was disposed.', 'AbortError');
      for (const resolve of manualResultResolversRef.current.splice(0)) {
        resolve({ status: 'failed', kind: 'manual-thumbnail', error });
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!mainCadActor) {
      return;
    }
    let clearedEvaluationId: string | undefined;
    const clearThumbnail = (evaluationId: string): void => {
      if (clearedEvaluationId === evaluationId) {
        return;
      }
      clearedEvaluationId = evaluationId;
      generationRef.current += 1;
      identityRef.current = `${projectId}:${mainEntryPath}:${evaluationId}:empty`;
      const remove = async (): Promise<void> => {
        try {
          await deleteFileRef.current(thumbnailPath, { source: 'machine' });
        } catch (error) {
          console.warn('Thumbnail clear failed', error);
        }
      };
      // async-iife: bootstrap -- the actor event cannot await filesystem deletion; errors are reported here.
      void remove();
    };
    const subscription = mainCadActor.on('defaultRendered', (event) => {
      if (!event.rendering.success || event.rendering.transient) {
        return;
      }
      const artifact = asKnownArtifact(event.rendering.artifact);
      if (artifact?.mimeType === 'model/gltf-binary' && isEmptyGlb(artifact.content)) {
        clearThumbnail(event.rendering.evaluationId);
        return;
      }
      const identity = `${projectId}:${mainEntryPath}:${event.rendering.hash}:webp:q${thumbnailQuality}:${thumbnailWidth}x${thumbnailHeight}:m0.1:lw${thumbnailLineWidth}:camera-bounds-v1:edges:studio-v5`;
      if (identityRef.current !== identity) {
        generationRef.current += 1;
        identityRef.current = identity;
      }

      thumbnailActor.send({ type: 'settled', hash: identityRef.current });
    });
    const initialSnapshot = mainCadActor.getSnapshot();
    let requestId = initialSnapshot.context.openAttempt;
    let rendering = initialSnapshot.matches('rendering');
    const requests = mainCadActor.subscribe((snapshot) => {
      const nextRendering = snapshot.matches('rendering');
      if (snapshot.context.openAttempt !== requestId || (nextRendering && !rendering)) {
        requestId = snapshot.context.openAttempt;
        generationRef.current += 1;
        thumbnailActor.send({ type: 'renderRequested' });
      }
      rendering = nextRendering;
      const { evaluation } = snapshot.context;
      if (evaluation?.success && evaluation.views.length === 0) {
        clearThumbnail(evaluation.id);
      }
    });
    return () => {
      subscription.unsubscribe();
      requests.unsubscribe();
    };
  }, [mainCadActor, mainEntryPath, projectId, thumbnailActor]);

  const regenerate = useCallback(async (): Promise<ThumbnailResult> => {
    const result = await new Promise<ThumbnailResult>((resolve) => {
      manualResultResolversRef.current.push(resolve);
      thumbnailActor.send({ type: 'regenerate' });
    });
    return result;
  }, [thumbnailActor]);

  return { regenerate };
}
