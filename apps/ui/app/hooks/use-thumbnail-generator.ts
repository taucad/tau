import { useCallback, useEffect, useRef } from 'react';
import { useActorRef } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { thumbnailMachine } from '#machines/thumbnail.machine.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';

/** Project-relative path for the generated thumbnail. */
const thumbnailPath = 'thumbnail.webp';

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
export function useThumbnailGenerator(): { regenerate: () => void } {
  const { geometryUnits, mainEntryPath, projectId } = useProject();
  const { writeFile, runtimeFileSystem } = useFileManager();
  const imageService = useHeadlessImageService();

  const mainCadActor = geometryUnits.get(mainEntryPath);

  // Read the live collaborators through refs so the machine's injected effects
  // stay current without re-instantiating the actor when they change.
  const cadActorRef = useRef(mainCadActor);
  cadActorRef.current = mainCadActor;
  const writeFileRef = useRef(writeFile);
  writeFileRef.current = writeFile;
  const generationRef = useRef(0);
  const identityRef = useRef(`${projectId}:unsettled`);
  const thumbnailActor = useActorRef(thumbnailMachine, {
    input: {
      render: async (request) => {
        const snapshot = cadActorRef.current?.getSnapshot();
        if (!snapshot?.context.kernelClient) {
          throw new Error('adapter-unavailable: kernel client not ready');
        }
        if (!snapshot.context.entryPath) {
          throw new Error('source-unavailable: settled CAD entry path not ready');
        }
        const generation = generationRef.current;
        const identity = request.identity ?? identityRef.current;
        const renderedLocatorIdentity = locatorIdentity(await getProjectFileSystemConfig(projectId));
        const files = await imageService.export({
          kind: request.kind,
          identity,
          projectId,
          sourceFormat: 'gltf',
          fileSystem: runtimeFileSystem,
          format: 'webp',
          source: { path: snapshot.context.entryPath },
          parameters: snapshot.context.parameters,
          includeEdges: true,
          exportOptions: {
            mode: 'single',
            width: 768,
            height: 576,
            margin: 0.1,
            projection: 'perspective',
            phi: 60,
            theta: -45,
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
        return { bytes: file.bytes, identity, generation, locatorIdentity: renderedLocatorIdentity };
      },
      store: async (artifact) => {
        if (artifact.generation !== generationRef.current || artifact.identity !== identityRef.current) {
          return;
        }
        const currentLocatorIdentity = locatorIdentity(await getProjectFileSystemConfig(projectId));
        if (artifact.locatorIdentity !== currentLocatorIdentity) {
          return;
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
      },
    },
  });

  useEffect(() => {
    if (!mainCadActor) {
      return;
    }
    const subscription = mainCadActor.on('geometryEvaluated', (event) => {
      generationRef.current += 1;
      identityRef.current = `${projectId}:${mainEntryPath}:${event.geometry.hash}:webp:q0.9:768x576:m0.1:edges`;
      thumbnailActor.send({ type: 'settled', hash: identityRef.current });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [mainCadActor, mainEntryPath, projectId, thumbnailActor]);

  const regenerate = useCallback(() => {
    thumbnailActor.send({ type: 'regenerate' });
  }, [thumbnailActor]);

  return { regenerate };
}
