import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { useSelector } from '@xstate/react';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import { PartGallery } from '@taucad/workbench-panes/model/part-gallery';
import type { PartGalleryPreviewRequest, PartGalleryPreviews } from '@taucad/workbench-panes/model/part-gallery';
import type { ModelComponentPreviewRequest } from '@taucad/workbench-panes/component-menu/component-actions';
import { useModelComponentProjectActions } from '#components/geometry/cad/model-component-actions.js';
import { useOptionalPartThumbnailService } from '#providers/part-thumbnail-provider.js';
import type { PartThumbnailRequest } from '#services/part-thumbnail.service.js';
import { canonicalPartPreviews, sourceGlbDigest } from '#services/part-thumbnail-visual.js';

/** Which part to show first, and where focus returns when the gallery closes. */
export type PartGalleryRequest = ModelComponentPreviewRequest;

const PartGalleryContext = createContext<((request: PartGalleryRequest) => void) | undefined>(undefined);
const emptySnapshot: ReadonlyMap<string, PartThumbnailState> = new Map();

/** Open the part gallery; `undefined` outside a project workspace. */
export const useOpenPartGallery = (): ((request: PartGalleryRequest) => void) | undefined =>
  useContext(PartGalleryContext);

/**
 * One part gallery per project workspace, shared by the Explorer, Properties and every part menu: the shared
 * `PartGallery` with the project's part verbs and the project's part thumbnail service.
 */
export function PartGalleryProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [request, setRequest] = useState<PartGalleryRequest>();
  const close = useCallback(() => {
    setRequest(undefined);
  }, []);
  return (
    <PartGalleryContext.Provider value={setRequest}>
      {children}
      {request ? (
        <ProjectPartGallery key={`${request.unitId}:${request.componentId}`} request={request} onClose={close} />
      ) : undefined}
    </PartGalleryContext.Provider>
  );
}

/** The open gallery, with the project's part verbs. */
function ProjectPartGallery({
  request,
  onClose,
}: {
  readonly request: PartGalleryRequest;
  readonly onClose: () => void;
}): React.JSX.Element | undefined {
  const actions = useModelComponentProjectActions();
  return <PartGallery request={request} actions={actions} usePreviews={useGalleryPreviews} onClose={onClose} />;
}

/**
 * Request the shown part and its neighbours as the `gallery` owner, so arrows land on a ready image
 * whether or not the Explorer is mounted. Admission mirrors the Explorer's: the presented GLB, its
 * digest and canonical part visuals.
 */
function useGalleryPreviews({ graphicsRef, unitId, parts, index }: PartGalleryPreviewRequest): PartGalleryPreviews {
  const thumbnails = useOptionalPartThumbnailService(unitId);
  const subscribe = useCallback(
    (listener: () => void) => thumbnails?.subscribe(listener) ?? (() => undefined),
    [thumbnails],
  );
  const snapshot = useCallback(() => thumbnails?.snapshot() ?? emptySnapshot, [thumbnails]);
  const previews = useSyncExternalStore(subscribe, snapshot, snapshot);
  const artifact = useSelector(graphicsRef, (state) => state.context.artifact);
  const artifactKey = useSelector(graphicsRef, (state) => state.context.artifactKey);
  const presentedKey = useSelector(graphicsRef, (state) => state.context.gltfPresentation.presentedKey);
  const sourcePath = useSelector(graphicsRef, (state) => state.context.artifactSourceFile) ?? '';
  const submittedRetry = useRef(0);
  const digests = useRef(new WeakMap<Uint8Array<ArrayBuffer>, Promise<string>>());
  const [retryId, setRetryId] = useState<{ readonly partId: string; readonly attempt: number }>();
  const neighbours = useMemo(() => {
    if (index < 0 || parts.length === 0) {
      return [];
    }
    const offsets = [0, 1, -1, 2];
    return [...new Set(offsets.map((offset) => parts[(index + offset + parts.length) % parts.length]!))];
  }, [index, parts]);

  useEffect(() => () => thumbnails?.releaseOwner('gallery'), [thumbnails]);
  useEffect(() => {
    if (!thumbnails) {
      return undefined;
    }
    const requested: PartThumbnailRequest[] = neighbours.map((node) => ({
      id: node.id,
      primitives: node.primitiveRefs!,
    }));
    if (artifact?.mimeType !== 'model/gltf-binary' || artifactKey !== presentedKey || requested.length === 0) {
      thumbnails.releaseOwner('gallery');
      return undefined;
    }
    const { content } = artifact;
    if (content.buffer.byteLength > 64 * 1024 * 1024) {
      thumbnails.failPreparationForOwner('gallery', requested, new RangeError('Part thumbnail source exceeds 64 MiB'));
      return undefined;
    }
    let digest = digests.current.get(content);
    if (!digest) {
      digest = sourceGlbDigest(content);
      digests.current.set(content, digest);
    }
    const pendingRetry = retryId && retryId.attempt !== submittedRetry.current ? retryId : undefined;
    let isActive = true;
    const prepare = async (): Promise<void> => {
      try {
        const [hash, prepared] = await Promise.all([
          digest,
          canonicalPartPreviews(
            content,
            requested.map((part) => part.primitives),
          ),
        ]);
        if (isActive) {
          thumbnails.requestForOwner(
            'gallery',
            { sourcePath, geometryHash: hash, content, renderContent: prepared.renderContent },
            requested.map((part, position) => ({
              ...part,
              visualKey: prepared.previews[position]?.key ?? prepared.visualKey,
            })),
            pendingRetry ? { manualPartId: pendingRetry.partId } : undefined,
          );
          if (pendingRetry) {
            submittedRetry.current = pendingRetry.attempt;
          }
        }
      } catch (error) {
        if (isActive) {
          thumbnails.failPreparationForOwner('gallery', requested, error);
        }
      }
    };
    void prepare();
    return () => {
      isActive = false;
    };
  }, [artifact, artifactKey, neighbours, presentedKey, retryId, sourcePath, thumbnails]);

  const retry = useCallback((partId: string) => {
    setRetryId((current) => ({ partId, attempt: (current?.attempt ?? 0) + 1 }));
  }, []);
  return { previews, retry };
}
