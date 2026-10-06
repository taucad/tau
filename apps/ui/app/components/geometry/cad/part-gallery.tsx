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
import { createPortal } from 'react-dom';
import { shallowEqual, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import {
  ImageCarouselDialog,
  imageCarouselControlClassName,
  imageCarouselOverlayControlProps,
} from '#components/ui/image-carousel-dialog.js';
import { PartPropertiesPanel } from '#components/geometry/cad/part-properties-panel.js';
import { disclosureMotion } from '#components/revisions/revision-actions.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useOptionalPartThumbnailService } from '#providers/part-thumbnail-provider.js';
import { useProject } from '#hooks/use-project.js';
import { selectCadDisplay, selectCadFailureIssues } from '#machines/cad.machine.js';
import { resolveSettledCadGeometry } from '#services/headless-capture.js';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import type { PartThumbnailRequest, PartThumbnailState } from '#services/part-thumbnail.service.js';
import { canonicalPartPreviews, sourceGlbDigest } from '#services/part-thumbnail-visual.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';
import { ENV } from '#environment.config.js';
import { hashString } from '@taucad/utils/hash';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionSource, modelInteractionMachine } from '#machines/model-interaction.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;

/** Which part to show first, and where focus returns when the gallery closes. */
export type PartGalleryRequest = Readonly<{
  graphicsRef: GraphicsActorRef;
  unitId: string;
  componentId: string;
  source: Extract<ModelInteractionSource, 'explorer' | 'viewer'>;
  origin?: HTMLElement;
}>;

const PartGalleryContext = createContext<((request: PartGalleryRequest) => void) | undefined>(undefined);
const emptySnapshot: ReadonlyMap<string, PartThumbnailState> = new Map();
// A transparent pixel holds the viewer open while the shown part's first render is in flight.
const pendingImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Whether a part has geometry the preview renderer can draw. */
export const isPreviewablePart = (node: GeometryComponentNode): boolean =>
  node.kind === 'part' && (node.primitiveRefs?.length ?? 0) > 0;

/** Previewable parts in the Explorer's preorder, hidden parts included. */
function previewableParts(manifest: GeometryComponentManifest): GeometryComponentNode[] {
  const parts: GeometryComponentNode[] = [];
  const pending = [...(manifest.nodesById[manifest.rootId]?.childIds ?? [])].reverse();
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    const node = manifest.nodesById[id];
    if (!node) {
      continue;
    }
    if (isPreviewablePart(node)) {
      parts.push(node);
    }
    pending.push(...[...node.childIds].reverse());
  }
  return parts;
}

/** Open the part gallery; `undefined` outside a project workspace. */
export const useOpenPartGallery = (): ((request: PartGalleryRequest) => void) | undefined =>
  useContext(PartGalleryContext);

/** One part gallery per project workspace, shared by the Explorer, Properties and every part menu. */
export function PartGalleryProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [request, setRequest] = useState<PartGalleryRequest>();
  const close = useCallback(() => {
    setRequest(undefined);
  }, []);
  return (
    <PartGalleryContext.Provider value={setRequest}>
      {children}
      {request ? (
        <PartGalleryModel key={`${request.unitId}:${request.componentId}`} request={request} onClose={close} />
      ) : undefined}
    </PartGalleryContext.Provider>
  );
}

function PartGalleryModel({
  request,
  onClose,
}: {
  readonly request: PartGalleryRequest;
  readonly onClose: () => void;
}): React.JSX.Element | undefined {
  const modelRef = useSelector(
    request.graphicsRef,
    (state) => state.context.modelInteractionRef as ModelInteractionRef | undefined,
  );
  return modelRef ? <PartGallery request={request} modelRef={modelRef} onClose={onClose} /> : undefined;
}

function PartGallery({
  request,
  modelRef,
  onClose,
}: {
  readonly request: PartGalleryRequest;
  readonly modelRef: ModelInteractionRef;
  readonly onClose: () => void;
}): React.JSX.Element | undefined {
  const { graphicsRef, unitId, source } = request;
  const manifest = useSelector(modelRef, (state) => getModelInteractionUnitState(state.context, unitId).manifest);
  const parts = useMemo(() => (manifest ? previewableParts(manifest) : []), [manifest]);
  const [componentId, setComponentId] = useState(request.componentId);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const index = parts.findIndex((part) => part.id === componentId);
  const part = parts[index];

  const close = useCallback(() => {
    onClose();
    const { origin } = request;
    requestAnimationFrame(() => {
      if (origin?.isConnected) {
        origin.focus();
      }
    });
  }, [onClose, request]);
  const show = useCallback(
    (id: string) => {
      setComponentId(id);
      graphicsRef.send({ type: 'selectModelComponent', unitId, componentId: id, source });
    },
    [graphicsRef, source, unitId],
  );
  const move = useCallback(
    (offset: number) => {
      if (index !== -1 && parts.length > 1) {
        show(parts[(index + offset + parts.length) % parts.length]!.id);
      }
    },
    [index, parts, show],
  );

  useEffect(() => {
    graphicsRef.send({ type: 'selectModelComponent', unitId, componentId: request.componentId, source });
  }, [graphicsRef, request.componentId, source, unitId]);
  useEffect(() => {
    // The part left the model: nothing to show.
    if (manifest && !part) {
      close();
    }
  }, [close, manifest, part]);

  const keybindingOptions = { scope: 'global', ignoreInputs: true, repeat: true } as const;
  useKeybinding(
    { key: 'ArrowLeft' },
    () => {
      move(-1);
    },
    keybindingOptions,
  );
  useKeybinding(
    { key: 'ArrowRight' },
    () => {
      move(1);
    },
    keybindingOptions,
  );

  const { previews, retry, isUnavailable } = useGalleryPreviews({
    graphicsRef,
    modelRef,
    unitId,
    manifest,
    parts,
    index,
  });
  const preview = part ? previews.get(part.id) : undefined;
  const imageUrl = usePreviewUrl(preview?.bytes);

  if (!part || !manifest) {
    return undefined;
  }
  const isRendering = !isUnavailable && !preview?.bytes && preview?.status !== 'failed';
  return (
    <>
      <ImageCarouselDialog
        items={[
          {
            id: part.id,
            src: imageUrl ?? pendingImage,
            mediaType: 'image/webp',
            alt: imageUrl ? `Rendered ${part.name}` : '',
            ...(imageUrl ? { downloadName: `${part.name}.webp` } : {}),
          },
        ]}
        directory={undefined}
        initialIndex={0}
        isOpen
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            close();
          }
        }}
      />
      {createPortal(
        <>
          <div
            {...imageCarouselOverlayControlProps}
            className='fixed top-4 left-4 z-102 w-72 max-w-[calc(100vw-7.5rem)] overflow-hidden rounded-md bg-background text-foreground shadow-md'
          >
            <Collapsible open={isPropertiesOpen} onOpenChange={setIsPropertiesOpen}>
              <CollapsibleTrigger
                aria-label={`${isPropertiesOpen ? 'Collapse' : 'Expand'} Properties`}
                className='flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm font-medium focus-visible:focus-outline'
              >
                <ChevronDown
                  aria-hidden='true'
                  className={cn(
                    'size-3.5 shrink-0 text-muted-foreground transition-transform',
                    !isPropertiesOpen && '-rotate-90',
                  )}
                />
                <span className='min-w-0 flex-1 truncate'>{part.name}</span>
                <span className='shrink-0 text-xs font-normal text-muted-foreground'>Properties</span>
              </CollapsibleTrigger>
              <CollapsibleContent className={cn(disclosureMotion, 'border-t')}>
                {/* Ends above the side arrows; the header already names the part. */}
                <div className='max-h-[calc(50dvh-5rem)] overflow-auto'>
                  <PartPropertiesPanel node={part} entryPath={manifest.sourceFile} isIdentityHidden />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          {parts.length > 1 ? (
            <div {...imageCarouselOverlayControlProps} className='contents'>
              <Button
                size='icon-lg'
                variant='outline'
                aria-label='Previous part'
                className={cn(imageCarouselControlClassName, 'fixed top-1/2 left-4 z-102 -translate-y-1/2')}
                onClick={() => {
                  move(-1);
                }}
              >
                <ArrowLeft />
              </Button>
              <Button
                size='icon-lg'
                variant='outline'
                aria-label='Next part'
                className={cn(imageCarouselControlClassName, 'fixed top-1/2 right-4 z-102 -translate-y-1/2')}
                onClick={() => {
                  move(1);
                }}
              >
                <ArrowRight />
              </Button>
            </div>
          ) : undefined}
          <div
            {...imageCarouselOverlayControlProps}
            className='fixed bottom-4 left-1/2 z-102 flex h-10 -translate-x-1/2 items-center gap-3 rounded-full bg-background/90 px-4 text-sm font-medium text-foreground shadow-md'
          >
            <span role='status' aria-label='Shown part'>
              <span className='sr-only'>{part.name}, </span>
              {index + 1} / {parts.length}
            </span>
            {isRendering ? (
              <span role='status' aria-busy='true' className='text-xs font-normal text-muted-foreground'>
                Rendering preview
              </span>
            ) : undefined}
            {isUnavailable || (preview?.status === 'failed' && !preview.bytes) ? (
              <>
                <span role='alert' className='text-xs font-normal text-muted-foreground'>
                  Preview unavailable
                </span>
                {isUnavailable ? undefined : (
                  <Button
                    size='xs'
                    variant='outline'
                    onClick={() => {
                      retry(part.id);
                    }}
                  >
                    Retry
                  </Button>
                )}
              </>
            ) : undefined}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Own one object URL for the shown preview's bytes. */
function usePreviewUrl(bytes: Uint8Array<ArrayBuffer> | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!bytes) {
      // oxlint-disable-next-line react/set-state-in-effect -- Object URL lifecycle is owned by this effect.
      setUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [bytes]);
  return url;
}

/**
 * Request the shown part and its neighbours as the `gallery` owner, so arrows land on a ready image
 * whether or not the Explorer is mounted. Admission mirrors the Explorer's: the presented GLB, its
 * digest and canonical part visuals.
 */
function useGalleryPreviews({
  graphicsRef,
  modelRef,
  unitId,
  manifest,
  parts,
  index,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly modelRef: ModelInteractionRef;
  readonly unitId: string;
  readonly manifest: GeometryComponentManifest | undefined;
  readonly parts: readonly GeometryComponentNode[];
  readonly index: number;
}): {
  readonly previews: ReadonlyMap<string, PartThumbnailState>;
  readonly retry: (id: string) => void;
  readonly isUnavailable: boolean;
} {
  const thumbnails = useOptionalPartThumbnailService(unitId);
  const subscribe = useCallback(
    (listener: () => void) => thumbnails?.subscribe(listener) ?? (() => undefined),
    [thumbnails],
  );
  const snapshot = useCallback(() => thumbnails?.snapshot() ?? emptySnapshot, [thumbnails]);
  const previews = useSyncExternalStore(subscribe, snapshot, snapshot);
  const artifact = useSelector(graphicsRef, (state) => state.context.artifact);
  const artifactKey = useSelector(graphicsRef, (state) => state.context.artifactKey);
  const presentation = useSelector(graphicsRef, (state) => state.context.gltfPresentation);
  const { presentedKey } = presentation;
  const artifactSourcePath = useSelector(graphicsRef, (state) => state.context.artifactSourceFile);
  const sourcePath = manifest?.sourceFile ?? '';
  const project = useProject({ enableNoContext: true });
  const cadRef = project?.geometryUnits.get(sourcePath);
  const cadSnapshot = useSelector(
    cadRef,
    (snapshot) => snapshot,
    (previous, next) => {
      if (previous === next) {
        return true;
      }
      if (!previous || !next) {
        return false;
      }
      // Export telemetry changes the snapshot without retiring its held preparation authority.
      return (
        previous.status === next.status &&
        previous.value === next.value &&
        previous.error === next.error &&
        previous.output === next.output &&
        selectCadDisplay(previous) === selectCadDisplay(next) &&
        selectCadFailureIssues(previous) === selectCadFailureIssues(next) &&
        shallowEqual(
          { ...previous.context, telemetryEntries: undefined },
          { ...next.context, telemetryEntries: undefined },
        )
      );
    },
  );
  const display = cadSnapshot ? selectCadDisplay(cadSnapshot) : undefined;
  const assemblyDisplay = display && 'admitted' in display ? display : undefined;
  const submittedRetry = useRef(0);
  const digests = useRef(new WeakMap<Uint8Array<ArrayBuffer>, Promise<string>>());
  const [retryId, setRetryId] = useState<{
    readonly partId: string;
    readonly attempt: number;
    readonly sourceKey: string;
  }>();
  const neighbours = useMemo(() => {
    if (index < 0 || parts.length === 0) {
      return [];
    }
    const offsets = [0, 1, -1, 2];
    return [...new Set(offsets.map((offset) => parts[(index + offset + parts.length) % parts.length]!))];
  }, [index, parts]);

  const isCurrent = useCallback(
    (allowPreparing = false): boolean => {
      const current = cadRef?.getSnapshot();
      const graphics = graphicsRef.getSnapshot().context;
      const currentManifest = getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).manifest;
      if (!current || !display || !sourcePath) {
        return false;
      }
      const ownsCurrent =
        project?.geometryUnits.get(sourcePath) === cadRef &&
        current.status === 'active' &&
        current.matches('idle') &&
        !current.context.parkWhenIdle &&
        current.context.entryPath === sourcePath &&
        current.context.latestRenderingOutcome === 'success' &&
        current.context.lastRequestedRenderId > 0 &&
        current.context.lastRequestedRenderId === current.context.lastSettledRenderId &&
        selectCadDisplay(current) === display &&
        graphics.modelInteractionRef === modelRef &&
        currentManifest === manifest &&
        deriveModelInteractionUnitId({ sourceFile: sourcePath }) === unitId &&
        graphics.modelInteractionUnitId === unitId &&
        (graphics.gltfPresentation.phase === 'presented' ||
          (allowPreparing &&
            (graphics.gltfPresentation.phase === 'preparing' ||
              graphics.gltfPresentation.phase === 'awaiting-analysis') &&
            graphics.gltfPresentation.requestedKey === presentedKey)) &&
        graphics.gltfPresentation.presentedKey === presentedKey;
      if (!ownsCurrent) {
        return false;
      }
      return assemblyDisplay
        ? assemblyDisplay.root.digest === presentedKey &&
            assemblyDisplay.document.root.path === assemblyDisplay.root.path &&
            assemblyDisplay.document.root.digest === assemblyDisplay.root.digest &&
            assemblyDisplay.document.root.byteLength === assemblyDisplay.root.byteLength &&
            assemblyDisplay.document.admitted === assemblyDisplay.admitted
        : 'success' in display &&
            display.success &&
            !display.transient &&
            artifact?.mimeType === 'model/gltf-binary' &&
            artifactKey === presentedKey &&
            artifactSourcePath === sourcePath &&
            graphics.artifact === artifact &&
            graphics.artifactKey === artifactKey;
    },
    [
      artifact,
      artifactKey,
      artifactSourcePath,
      assemblyDisplay,
      cadRef,
      display,
      graphicsRef,
      manifest,
      modelRef,
      presentedKey,
      project,
      sourcePath,
      unitId,
    ],
  );
  const currentGraphics = graphicsRef.getSnapshot().context;
  const isPreparing = Boolean(
    thumbnails &&
    cadSnapshot &&
    sourcePath &&
    project?.geometryUnits.get(sourcePath) === cadRef &&
    cadSnapshot.status === 'active' &&
    !cadSnapshot.context.parkWhenIdle &&
    cadSnapshot.context.entryPath === sourcePath &&
    cadSnapshot.context.latestRenderingOutcome !== 'failure' &&
    deriveModelInteractionUnitId({ sourceFile: sourcePath }) === unitId &&
    currentGraphics.modelInteractionRef === modelRef &&
    currentGraphics.modelInteractionUnitId === unitId &&
    getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).manifest === manifest &&
    (cadSnapshot.matches('buffering') ||
      cadSnapshot.matches('connecting') ||
      cadSnapshot.matches('rendering') ||
      (cadSnapshot.matches('idle') &&
        display &&
        cadSnapshot.context.lastRequestedRenderId > 0 &&
        cadSnapshot.context.lastRequestedRenderId === cadSnapshot.context.lastSettledRenderId &&
        currentGraphics.gltfPresentation.requestedKey === (assemblyDisplay?.root.digest ?? artifactKey) &&
        (currentGraphics.gltfPresentation.phase === 'preparing' ||
          currentGraphics.gltfPresentation.phase === 'awaiting-analysis'))),
  );
  const isUnavailable = !thumbnails || (!isCurrent() && !isPreparing);

  useEffect(() => () => thumbnails?.releaseOwner('gallery'), [thumbnails]);
  useEffect(() => {
    if (retryId && retryId.sourceKey !== presentedKey) {
      submittedRetry.current = retryId.attempt;
    }
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Workers and SSR have no page environment; gate diagnostic acquisition before reading it.
    const isDebugEnabled = (): boolean => Boolean(globalThis.window) && ENV.TAU_DEBUG;
    const requestProjectId = isDebugEnabled() ? project?.projectId : undefined;
    const observe = (stage: string, detail: Readonly<Record<string, unknown>> = {}): void => {
      if (!isDebugEnabled()) {
        return;
      }
      const current = cadRef?.getSnapshot();
      const graphics = graphicsRef.getSnapshot().context;
      const currentManifest = getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).manifest;
      recordHeadlessImageTiming('thumbnail.gallery.prepare', performance.now(), {
        stage,
        projectId: requestProjectId,
        unitId,
        sourcePath,
        root: assemblyDisplay ? { ...assemblyDisplay.root } : undefined,
        presentedKeyHash: hashString(presentedKey ?? ''),
        currentPresentedKeyHash: hashString(graphics.gltfPresentation.presentedKey ?? ''),
        currentRequestedKeyHash: hashString(graphics.gltfPresentation.requestedKey ?? ''),
        requestedIds: neighbours.map(({ id }) => id),
        cadExists: current !== undefined,
        projectOwnsCad: project?.geometryUnits.get(sourcePath) === cadRef,
        cadActive: current?.status === 'active',
        cadIdle: current?.matches('idle') ?? false,
        parked: current?.context.parkWhenIdle,
        entryMatches: current?.context.entryPath === sourcePath,
        outcome: current?.context.latestRenderingOutcome,
        requestedRenderId: current?.context.lastRequestedRenderId,
        settledRenderId: current?.context.lastSettledRenderId,
        displayMatches: current ? selectCadDisplay(current) === display : false,
        modelOwnerMatches: graphics.modelInteractionRef === modelRef,
        manifestMatches: currentManifest === manifest,
        unitMatches: graphics.modelInteractionUnitId === unitId,
        derivedUnitMatches: deriveModelInteractionUnitId({ sourceFile: sourcePath }) === unitId,
        presentationPhase: graphics.gltfPresentation.phase,
        presentedRevision: graphics.gltfPresentation.presentedRevision,
        requestedRevision: graphics.gltfPresentation.requestedRevision,
        presentedKeyMatches: graphics.gltfPresentation.presentedKey === presentedKey,
        admittedReaderMatches: assemblyDisplay
          ? assemblyDisplay.document.admitted === assemblyDisplay.admitted
          : undefined,
        admittedRootMatches: assemblyDisplay
          ? assemblyDisplay.document.root.path === assemblyDisplay.root.path &&
            assemblyDisplay.document.root.digest === assemblyDisplay.root.digest &&
            assemblyDisplay.document.root.byteLength === assemblyDisplay.root.byteLength
          : undefined,
        current: isCurrent(),
        ...detail,
      });
    };
    observe('entry', { thumbnailsAvailable: thumbnails !== undefined });
    if (!thumbnails) {
      return undefined;
    }
    thumbnails.announcePresentedSource(presentedKey);
    let requested: PartThumbnailRequest[] = neighbours.map((node) => ({
      id: node.id,
      primitives: node.primitiveRefs!,
    }));
    let active = true;
    const isActive = (): boolean => active;
    if (!isCurrent() || requested.length === 0) {
      observe('entry-denied');
      if (requested.length === 0 || !isCurrent(true)) {
        thumbnails.releaseOwner('gallery');
      }
      return undefined;
    }
    const pendingRetry =
      retryId !== undefined && retryId.sourceKey === presentedKey && retryId.attempt !== submittedRetry.current
        ? retryId
        : undefined;
    let content: Uint8Array<ArrayBuffer> | undefined;
    let digest: Promise<string> | undefined;
    let preparationStage = 'projection';
    const prepare = async (): Promise<void> => {
      try {
        const projection = assemblyDisplay && cadSnapshot ? await resolveSettledCadGeometry(cadSnapshot) : undefined;
        observe('projection-completed', { active: isActive(), projectionAvailable: projection !== undefined });
        const source =
          projection?.geometry ??
          (artifact?.mimeType === 'model/gltf-binary' ? { format: 'gltf', content: artifact.content } : undefined);
        if (!isActive() || !isCurrent() || source?.format !== 'gltf') {
          observe('projection-denied', { active: isActive(), gltfSource: source?.format === 'gltf' });
          return;
        }
        content = source.content;
        if (content.buffer.byteLength > 64 * 1024 * 1024) {
          throw new RangeError('Part thumbnail source exceeds 64 MiB');
        }
        preparationStage = 'canonical-selection';
        if (assemblyDisplay) {
          const projected = buildGltfComponentManifest(content);
          if (isDebugEnabled()) {
            observe('canonical-selection', {
              canonicalMatchCount: requested.filter(
                ({ id }) => (projected.nodesById[id]?.primitiveRefs?.length ?? 0) > 0,
              ).length,
              requestedCount: requested.length,
            });
          }
          requested = requested.map((part) => {
            const primitives = projected.nodesById[part.id]?.primitiveRefs;
            if (!primitives?.length) {
              throw new Error('Pinned part preview lost its canonical component selection');
            }
            // Use addresses from the actual whole-assembly projection, never a definition-local address.
            return { ...part, primitives };
          });
        }
        digest = digests.current.get(content);
        if (!digest) {
          digest = sourceGlbDigest(content);
          digests.current.set(content, digest);
        }
        preparationStage = 'visual-preparation';
        const [hash, prepared] = await Promise.all([
          digest,
          canonicalPartPreviews(
            content,
            requested.map((part) => part.primitives),
          ),
        ]);
        if (isDebugEnabled()) {
          observe('visual-preparation-completed', {
            active: isActive(),
            geometryHash: hash,
            visualKeyHash: hashString(prepared.visualKey),
            preparedCount: prepared.previews.length,
            requested: requested.map(({ id }, position) => {
              const key = prepared.previews[position]?.key;
              return { id, visualKeyHash: key ? hashString(key) : undefined };
            }),
          });
        }
        if (isActive() && isCurrent()) {
          observe('request');
          thumbnails.requestForOwner('gallery', {
            source: {
              sourcePath,
              geometryHash: hash,
              visualKey: prepared.visualKey,
              content,
              renderContent: prepared.renderContent,
            },
            parts: requested.map((part, position) => ({
              ...part,
              visualKey: prepared.previews[position]?.key,
            })),
            options: pendingRetry ? { manualPartId: pendingRetry.partId } : undefined,
          });
          if (pendingRetry) {
            submittedRetry.current = pendingRetry.attempt;
          }
        } else {
          observe('visual-preparation-denied', { active: isActive() });
        }
      } catch (error) {
        observe('preparation-failed', {
          active: isActive(),
          preparationStage,
          errorCategory:
            error instanceof RangeError
              ? 'range'
              : error instanceof TypeError
                ? 'type'
                : error instanceof Error
                  ? 'error'
                  : 'unknown',
        });
        if (isActive() && isCurrent()) {
          if (content && digests.current.get(content) === digest) {
            digests.current.delete(content);
          }
          thumbnails.failPreparationForOwner('gallery', requested, error);
        }
      }
    };
    void prepare();
    return () => {
      active = false;
      observe('cleanup', { active });
    };
  }, [
    artifact,
    assemblyDisplay,
    cadRef,
    cadSnapshot,
    display,
    graphicsRef,
    manifest,
    modelRef,
    isCurrent,
    neighbours,
    presentedKey,
    project,
    retryId,
    sourcePath,
    thumbnails,
    unitId,
  ]);

  const retry = useCallback(
    (partId: string) => {
      if (isCurrent() && presentedKey) {
        setRetryId((current) => ({ partId, attempt: (current?.attempt ?? 0) + 1, sourceKey: presentedKey }));
      }
    },
    [isCurrent, presentedKey],
  );
  return { previews, retry, isUnavailable };
}
