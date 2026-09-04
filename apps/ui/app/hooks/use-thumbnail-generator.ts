import { useCallback, useEffect, useRef } from 'react';
import { useActorRef } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { thumbnailMachine } from '#machines/thumbnail.machine.js';
import type { ThumbnailResult } from '#machines/thumbnail.machine.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';

/** Project-relative path for the generated thumbnail. */
const thumbnailPath = 'thumbnail.webp';
const thumbnailLineWidth = 3;

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
    if (bitmap.width !== 768 || bitmap.height !== 576) {
      throw new Error(`Thumbnail export expected 768×576 pixels, received ${bitmap.width}×${bitmap.height}`);
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
 * unit's `geometryEvaluated` events, debouncing + deduping regeneration off the
 * main thread. The shared headless image service owns the lazy runtime worker,
 * and the bytes are written to the project filesystem.
 *
 * @returns `regenerate` — force a thumbnail render now (manual command),
 *   bypassing the geometry-hash dedupe.
 */
export function useThumbnailGenerator(): { regenerate: () => Promise<ThumbnailResult> } {
  const { geometryUnits, mainEntryPath, projectId } = useProject();
  const { writeFile } = useFileManager();
  const imageService = useHeadlessImageService();

  const mainCadActor = geometryUnits.get(mainEntryPath);

  // Read the live collaborators through refs so the machine's injected effects
  // stay current without re-instantiating the actor when they change.
  const cadActorRef = useRef(mainCadActor);
  const writeFileRef = useRef(writeFile);

  useEffect(() => {
    cadActorRef.current = mainCadActor;
    writeFileRef.current = writeFile;
  }, [mainCadActor, writeFile]);
  const generationRef = useRef(0);
  const identityRef = useRef(`${projectId}:unsettled`);
  const manualResultResolversRef = useRef<Array<(result: ThumbnailResult) => void>>([]);
  const thumbnailActor = useActorRef(thumbnailMachine, {
    input: {
      render: async (request) => {
        const snapshot = cadActorRef.current?.getSnapshot();
        const geometry = snapshot?.context.geometry;
        const identity = request.identity ?? identityRef.current;
        if (snapshot?.context.entryPath && geometry?.format === 'svg' && request.kind === 'automatic-thumbnail') {
          return { status: 'skipped', identity, reason: 'svg-source' };
        }
        if (!snapshot?.context.entryPath || geometry?.format !== 'gltf') {
          throw new Error('source-unavailable: settled canonical GLB not ready');
        }
        const generation = generationRef.current;
        const renderedLocatorIdentity = locatorIdentity(await getProjectFileSystemConfig(projectId));
        const files = await imageService.export({
          kind: request.kind,
          identity,
          projectId,
          sourceFormat: 'glb',
          sourcePath: snapshot.context.entryPath,
          geometryHash: geometry.hash,
          content: geometry.content,
          format: 'webp',
          exportOptions: {
            mode: 'single',
            width: 768,
            height: 576,
            lineWidth: thumbnailLineWidth,
            camera: {
              framing: 'bounds',
              direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
              up: [0, 0, 1],
              margin: 0.1,
              projection: { kind: 'perspective', verticalFieldOfView: 45 },
            },
            quality: 0.9,
          },
        });
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

  useEffect(() => {
    if (!mainCadActor) {
      return;
    }
    const subscription = mainCadActor.on('geometryEvaluated', (event) => {
      generationRef.current += 1;
      identityRef.current = `${projectId}:${mainEntryPath}:${event.geometry.hash}:webp:q0.9:768x576:m0.1:lw${thumbnailLineWidth}:camera-bounds-v1:edges`;
      thumbnailActor.send({ type: 'settled', hash: identityRef.current });
    });
    return () => {
      subscription.unsubscribe();
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
