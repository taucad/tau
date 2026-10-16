import { useProjectAvailability } from '#hooks/use-project-availability.js';
import { ProjectSyncPlaceholder } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import { XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import { WorkbenchPanesHostProvider } from '@taucad/workbench-panes/host/workbench-host';
import type { WorkbenchPanesHost } from '@taucad/workbench-panes/host/workbench-host';
import { ModelPane } from '@taucad/workbench-panes/model/model-pane';
import type {
  ModelPanelLayout,
  ModelSource,
  ModelThumbnailRequest,
  ModelThumbnails,
} from '@taucad/workbench-panes/model/model-source';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import {
  ModelComponentActionContextContent,
  ModelComponentActionDropdown,
} from '#components/geometry/cad/model-component-action-menu.js';
import { useOpenPartGallery } from '#components/geometry/cad/part-gallery.js';
import { useOptionalHeadlessImageService } from '#providers/headless-image-provider.js';
import { useOptionalPartThumbnailService } from '#providers/part-thumbnail-provider.js';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import type { PartThumbnailRequest } from '#services/part-thumbnail.service.js';
import { canonicalPartPreviews, sourceGlbDigest } from '#services/part-thumbnail-visual.js';
import { useProject } from '#hooks/use-project.js';
import { usePaneviewPersistence } from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { ProjectWorkbenchPanesHost } from '#routes/w.$workspace.$project/workbench-panes-host.js';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';

const keyCombinationEditor = projectWorkspaceKeyCombinations.model;
const emptyPreviewSnapshot: ReadonlyMap<string, PartThumbnailState> = new Map();
const componentActions: NonNullable<ModelSource['componentActions']> = {
  Dropdown: ModelComponentActionDropdown,
  ContextContent: ModelComponentActionContextContent,
};
const projectlessHost: WorkbenchPanesHost = { useUnits: () => [], model: {} };

const useModelPanelLayout = (): ModelPanelLayout => usePaneviewPersistence('modelPaneview');

/**
 * Part thumbnails for one Model pane entry: the project's shared preview scheduler for the unit (or a local one
 * over the headless image service), fed the presented GLB and the selected and on-screen parts.
 */
function useExplorerPartThumbnails({
  entryPath,
  unitId,
  graphicsRef,
  manifest,
  selectedComponentIds,
  visibleComponentIds,
}: ModelThumbnailRequest): ModelThumbnails {
  const currentSelection = selectedComponentIds.at(-1);
  const imageService = useOptionalHeadlessImageService();
  const sharedThumbnails = useOptionalPartThumbnailService(unitId);
  const [localThumbnails, setLocalThumbnails] = useState<PartThumbnailService>();
  const thumbnails = sharedThumbnails ?? localThumbnails;
  const sourceDigests = useRef(new WeakMap<Uint8Array<ArrayBuffer>, Promise<string>>());
  const subscribePreviews = useCallback(
    (listener: () => void) => thumbnails?.subscribe(listener) ?? (() => undefined),
    [thumbnails],
  );
  const getPreviewSnapshot = useCallback(() => thumbnails?.snapshot() ?? emptyPreviewSnapshot, [thumbnails]);
  const previews = useSyncExternalStore(subscribePreviews, getPreviewSnapshot, getPreviewSnapshot);
  const artifact = useSelector(graphicsRef, (state) => state.context.artifact);
  const artifactKey = useSelector(graphicsRef, (state) => state.context.artifactKey);
  const presentedKey = useSelector(graphicsRef, (state) => state.context.gltfPresentation.presentedKey);
  const [previewRetry, setPreviewRetry] = useState<{ partId: string; requestId: number; sourceKey: string }>();
  const submittedRetryId = useRef(0);
  const retryPreview = useCallback(
    (id?: string) => {
      const partId = id ?? currentSelection;
      if (!partId || !presentedKey) {
        return;
      }
      setPreviewRetry((current) => ({ partId, requestId: (current?.requestId ?? 0) + 1, sourceKey: presentedKey }));
    },
    [currentSelection, presentedKey],
  );

  useEffect(() => {
    if (!imageService || sharedThumbnails) {
      return undefined;
    }
    const service = new PartThumbnailService(imageService);
    // oxlint-disable-next-line react/set-state-in-effect -- This effect owns the service's StrictMode replay lifecycle.
    setLocalThumbnails(service);
    return () => {
      service.dispose();
      setLocalThumbnails((current) => (current === service ? undefined : current));
    };
  }, [imageService, sharedThumbnails]);

  useEffect(() => () => thumbnails?.releaseOwner('explorer'), [thumbnails]);

  useEffect(() => {
    if (previewRetry && previewRetry.sourceKey !== presentedKey) {
      // Retire an unsubmitted retry when its presented-source lifetime ends.
      submittedRetryId.current = previewRetry.requestId;
    }
    if (!thumbnails) {
      return;
    }
    thumbnails.announcePresentedSource(presentedKey);
    if (artifact?.mimeType !== 'model/gltf-binary' || artifactKey !== presentedKey || !manifest) {
      thumbnails.releaseOwner('explorer');
      return;
    }
    const selected = selectedComponentIds.at(-1);
    const ids = [...new Set([selected, ...visibleComponentIds].filter((id): id is string => id !== undefined))];
    const parts: PartThumbnailRequest[] = ids.flatMap((id) => {
      const node = manifest.nodesById[id];
      return node?.kind === 'part' && node.primitiveRefs?.length ? [{ id, primitives: node.primitiveRefs }] : [];
    });
    let active = true;
    const { content } = artifact;
    const requestedParts = parts.slice(0, 128);
    const pendingRetry =
      previewRetry?.sourceKey === presentedKey && previewRetry.requestId !== submittedRetryId.current
        ? previewRetry
        : undefined;
    if (content.buffer.byteLength > 64 * 1024 * 1024) {
      thumbnails.failPreparationForOwner(
        'explorer',
        requestedParts,
        new RangeError('Part thumbnail source exceeds 64 MiB'),
      );
      return;
    }
    let sourceDigest = sourceDigests.current.get(content);
    if (!sourceDigest) {
      sourceDigest = sourceGlbDigest(content);
      sourceDigests.current.set(content, sourceDigest);
    }
    const prepare = async (): Promise<void> => {
      try {
        const [hash, prepared] = await Promise.all([
          sourceDigest,
          canonicalPartPreviews(
            content,
            requestedParts.map((part) => part.primitives),
          ),
        ]);
        if (active) {
          thumbnails.requestForOwner(
            'explorer',
            { sourcePath: entryPath, geometryHash: hash, content, renderContent: prepared.renderContent },
            requestedParts.map((part, index) => ({
              ...part,
              visualKey: prepared.previews[index]?.key ?? prepared.visualKey,
            })),
            pendingRetry ? { manualPartId: pendingRetry.partId } : undefined,
          );
          if (pendingRetry) {
            submittedRetryId.current = pendingRetry.requestId;
          }
        }
      } catch (error) {
        if (active) {
          if (sourceDigests.current.get(content) === sourceDigest) {
            sourceDigests.current.delete(content);
          }
          thumbnails.failPreparationForOwner('explorer', requestedParts, error);
        }
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [
    artifact,
    artifactKey,
    manifest,
    entryPath,
    presentedKey,
    previewRetry,
    selectedComponentIds,
    thumbnails,
    visibleComponentIds,
  ]);

  const failDecode = useCallback(
    (id: string, bytes: Uint8Array<ArrayBuffer>) => {
      thumbnails?.failDecode(id, bytes);
    },
    [thumbnails],
  );
  const markDecoded = useCallback(
    (id: string, bytes: Uint8Array<ArrayBuffer>) => {
      thumbnails?.markDecoded(id, bytes);
    },
    [thumbnails],
  );
  return useMemo(
    () => ({ previews, retry: retryPreview, failDecode, markDecoded }),
    [failDecode, markDecoded, previews, retryPreview],
  );
}

function ModelPanelBodyContent({ onRequestOpen }: { readonly onRequestOpen?: () => void }): React.JSX.Element {
  const project = useProject({ enableNoContext: true });
  const editorRef = project?.editorRef;
  const openPartGallery = useOpenPartGallery();
  const sources = useMemo(
    (): Pick<WorkbenchPanesHost, 'model'> => ({
      model: {
        usePanelLayout: useModelPanelLayout,
        useThumbnails: useExplorerPartThumbnails,
        openPartGallery,
        componentActions,
        reveal: editorRef && {
          subscribe(listener) {
            const subscription = editorRef.on('modelComponentRevealRequested', (event) => {
              listener({ entryPath: event.entryPath, unitId: event.unitId, componentId: event.componentId });
            });
            return () => {
              subscription.unsubscribe();
            };
          },
          request(target) {
            editorRef.send({ type: 'revealModelComponentInExplorer', ...target });
          },
        },
      },
    }),
    [editorRef, openPartGallery],
  );

  if (!project) {
    return (
      <WorkbenchPanesHostProvider value={projectlessHost}>
        <ModelPane onRequestOpen={onRequestOpen} />
      </WorkbenchPanesHostProvider>
    );
  }

  return (
    <ProjectWorkbenchPanesHost sources={sources}>
      <ModelPane onRequestOpen={onRequestOpen} />
    </ProjectWorkbenchPanesHost>
  );
}

export function ChatExplorerTree({
  className,
  isExpanded = true,
  setIsExpanded,
}: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const toggleEditor = (): void => {
    setIsExpanded?.((current) => !current);
  };
  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeybinding(keyCombinationEditor, toggleEditor);
  return (
    <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent className='text-sm'>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Model</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Model
                  <KeyShortcut variant='tooltip'>{formattedEditorKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='p-0'>
          <ModelPanelBody
            onRequestOpen={() => {
              setIsExpanded?.(true);
            }}
          />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}

export function ModelPanelBody(props: Parameters<typeof ModelPanelBodyContent>[0]): React.JSX.Element {
  const availability = useProjectAvailability();
  return availability === 'ready' ? (
    <ModelPanelBodyContent {...props} />
  ) : (
    <ProjectSyncPlaceholder state={availability} />
  );
}
