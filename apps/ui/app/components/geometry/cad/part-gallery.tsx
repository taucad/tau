import {
  createContext,
  Fragment,
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
import type { ActorRefFrom } from 'xstate';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Box,
  CircleAlert,
  Download,
  Ellipsis,
  EyeOff,
  FileBox,
  Focus,
  LoaderCircle,
  Target,
  X,
} from 'lucide-react';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { ActionButton } from '@taucad/ui/components/actions';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@taucad/ui/components/breadcrumb';
import { Button } from '@taucad/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@taucad/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { MaterialSwatch } from '@taucad/viewer/cad/material-swatch';
import { PartPreviewImage } from '@taucad/viewer/cad/part-preview-image';
import { PartPropertiesPanel } from '@taucad/viewer/cad/part-properties-panel';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { getModelInteractionUnitState } from '@taucad/viewer/machines/model-interaction.machine';
import type {
  ModelInteractionSource,
  modelInteractionMachine,
} from '@taucad/viewer/machines/model-interaction.machine';
import { useModelComponentActions } from '#components/geometry/cad/model-component-actions.js';
import type { ModelComponentActionTarget } from '@taucad/workbench-panes/component-menu/component-actions';
import { useOptionalPartThumbnailService } from '#providers/part-thumbnail-provider.js';
import type { PartThumbnailRequest } from '#services/part-thumbnail.service.js';
import { canonicalPartPreviews, sourceGlbDigest } from '#services/part-thumbnail-visual.js';

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
  const unit = useSelector(modelRef, (state) => getModelInteractionUnitState(state.context, unitId));
  const { manifest } = unit;
  const parts = useMemo(() => (manifest ? previewableParts(manifest) : []), [manifest]);
  const [componentId, setComponentId] = useState(request.componentId);
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

  const { previews, retry } = useGalleryPreviews({ graphicsRef, unitId, parts, index });

  if (!part || !manifest) {
    return undefined;
  }
  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          close();
        }
      }}
    >
      <PartSheet
        manifest={manifest}
        part={part}
        parts={parts}
        index={index}
        previews={previews}
        target={{
          manifest,
          node: part,
          graphicsRef,
          unitId,
          source,
          isIsolated: unit.isolatedComponentIds.includes(part.id),
        }}
        isHidden={unit.hiddenComponentIds.includes(part.id)}
        onShow={show}
        onMove={move}
        onRetry={retry}
        onClose={close}
      />
    </Dialog>
  );
}

/** The groups above a part, outermost first; the model root is the Explorer's file row, not a crumb. */
function ancestorsOf(manifest: GeometryComponentManifest, node: GeometryComponentNode): GeometryComponentNode[] {
  const ancestors: GeometryComponentNode[] = [];
  for (let id = node.parentId; id !== undefined && id !== manifest.rootId; id = manifest.nodesById[id]?.parentId) {
    const ancestor = manifest.nodesById[id];
    if (!ancestor) {
      break;
    }
    ancestors.unshift(ancestor);
  }
  return ancestors;
}

/** A header icon button whose tooltip names it and, when it has one, its key. */
function SheetIconButton({
  label,
  shortcut,
  children,
  ...properties
}: React.ComponentProps<typeof Button> & {
  readonly label: string;
  readonly shortcut?: string;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size='icon-sm' variant='ghost' aria-label={label} {...properties}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className='flex items-center gap-2'>
        {label}
        {shortcut ? <KeyShortcut>{shortcut}</KeyShortcut> : undefined}
      </TooltipContent>
    </Tooltip>
  );
}

// A faint dot grid, so a transparent render sits on a surface rather than floating over the page.
const stageClassName =
  'relative min-h-0 min-w-0 flex-1 bg-muted bg-[radial-gradient(var(--color-border)_0.5px,transparent_0.5px)] bg-size-[1rem_1rem]';

/**
 * One sheet below the titlebar: the part's place in the model and every control in the header,
 * the render on a stage over a strip of the model's parts, and the part's verbs and Properties
 * in a rail that moves under the stage in a narrow window.
 */
function PartSheet({
  manifest,
  part,
  parts,
  index,
  previews,
  target,
  isHidden,
  onShow,
  onMove,
  onRetry,
  onClose,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly part: GeometryComponentNode;
  readonly parts: readonly GeometryComponentNode[];
  readonly index: number;
  readonly previews: ReadonlyMap<string, PartThumbnailState>;
  readonly target: ModelComponentActionTarget;
  readonly isHidden: boolean;
  readonly onShow: (id: string) => void;
  readonly onMove: (offset: number) => void;
  readonly onRetry: (id: string) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const actions = useModelComponentActions(target);
  const preview = previews.get(part.id);
  const imageUrl = usePreviewUrl(preview?.bytes);
  const isRendering = !preview?.bytes && preview?.status !== 'failed';
  const isFailed = preview?.status === 'failed' && !preview.bytes;
  const hasSiblings = parts.length > 1;
  // Each verb acts on the viewer or the Explorer behind the sheet, so the sheet makes way for it.
  const andClose = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <DialogContent
      aria-describedby={undefined}
      // Focus the sheet, not its first control: a focused header button would open its tooltip unasked,
      // and that tooltip would take the first Escape.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement | undefined)?.focus();
      }}
      // The gallery returns focus to its opener itself.
      onCloseAutoFocus={(event) => {
        event.preventDefault();
      }}
      className={cn(
        // The sheet takes focus only to receive keys; it is a surface, not a control, so it shows no focus ring.
        '@container/sheet top-12 bottom-6 flex translate-y-0 flex-col gap-0 overflow-hidden p-0 outline-none sm:max-w-5xl',
        // The shared close control is replaced by the header's, beside the other controls.
        '*:data-[slot=dialog-close]:hidden',
      )}
    >
      <header className='flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5'>
        <DialogTitle className='sr-only'>{part.name}</DialogTitle>
        <Breadcrumb aria-label='Place in the model' className='min-w-0 flex-1'>
          <BreadcrumbList className='flex-nowrap'>
            {ancestorsOf(manifest, part).map((ancestor) => (
              <Fragment key={ancestor.id}>
                <BreadcrumbItem className='min-w-0 @max-[40rem]/sheet:hidden'>
                  <BreadcrumbLink asChild>
                    <button
                      type='button'
                      className='truncate rounded-sm focus-visible:focus-outline'
                      onClick={andClose(() => {
                        actions.revealComponent(ancestor.id);
                      })}
                    >
                      {ancestor.name}
                    </button>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className='@max-[40rem]/sheet:hidden' />
              </Fragment>
            ))}
            <BreadcrumbItem className='min-w-0'>
              <BreadcrumbPage className='truncate font-medium'>{part.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className='ml-auto flex items-center gap-0.5'>
          {hasSiblings ? (
            <>
              <span role='status' aria-label='Shown part' className='mr-1.5 text-xs text-muted-foreground tabular-nums'>
                <span className='sr-only'>{part.name}, </span>
                Part {index + 1} of {parts.length}
              </span>
              <SheetIconButton
                label='Previous part'
                shortcut='←'
                onClick={() => {
                  onMove(-1);
                }}
              >
                <ArrowLeft />
              </SheetIconButton>
              <SheetIconButton
                label='Next part'
                shortcut='→'
                onClick={() => {
                  onMove(1);
                }}
              >
                <ArrowRight />
              </SheetIconButton>
            </>
          ) : undefined}
          {imageUrl ? (
            <SheetIconButton asChild label={`Download ${part.name}`}>
              <a download={`${part.name}.webp`} href={imageUrl}>
                <Download />
              </a>
            </SheetIconButton>
          ) : undefined}
          <SheetIconButton label='Close preview' shortcut='Esc' onClick={onClose}>
            <X />
          </SheetIconButton>
        </div>
      </header>
      <div className='flex min-h-0 flex-1 @max-[40rem]/sheet:flex-col'>
        <div className={stageClassName}>
          <div className={cn('absolute inset-6 flex items-center justify-center', hasSiblings && 'bottom-24')}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`Rendered ${part.name}`}
                className={cn('max-h-full max-w-full object-contain', isHidden && 'opacity-45')}
              />
            ) : isFailed ? (
              <Box aria-hidden='true' className='size-12 text-muted-foreground' />
            ) : (
              <Skeleton aria-hidden='true' className='aspect-4/3 h-3/5 max-w-full rounded-md bg-border/50' />
            )}
          </div>
          <StageStatus
            isRendering={isRendering}
            isFailed={isFailed}
            isHidden={isHidden}
            onRetry={() => {
              onRetry(part.id);
            }}
            onShow={actions.showComponent}
          />

          {hasSiblings ? <PartStrip parts={parts} index={index} previews={previews} onShow={onShow} /> : undefined}
        </div>
        <aside
          aria-label='Part properties'
          className='flex w-80 shrink-0 flex-col border-l @max-[40rem]/sheet:max-h-[45%] @max-[40rem]/sheet:w-full @max-[40rem]/sheet:border-t @max-[40rem]/sheet:border-l-0'
        >
          <div className='@container/actions flex flex-wrap gap-2 border-b p-3'>
            <ActionButton verb='Reveal in Explorer' icon={FileBox} onClick={andClose(actions.revealInExplorer)} />
            <ActionButton verb='Focus on part' icon={Focus} onClick={andClose(actions.focusComponent)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ActionButton verb='More' icon={Ellipsis} aria-label={`More actions for ${part.name}`} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onSelect={andClose(actions.toggleIsolation)}>
                  <Target aria-hidden='true' />
                  {target.isIsolated ? 'Remove isolation' : 'Isolate'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={andClose(actions.addToChat)}>
                  <AtSign aria-hidden='true' />
                  Add to chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className='min-h-0 flex-1 overflow-auto'>
            <PartPropertiesPanel node={part} entryPath={manifest.sourceFile} isIdentityHidden />
          </div>
        </aside>
      </div>
    </DialogContent>
  );
}

/** What the stage cannot show yet, or why the part looks faded, with the action that resolves it. */
function StageStatus({
  isRendering,
  isFailed,
  isHidden,
  onRetry,
  onShow,
}: {
  readonly isRendering: boolean;
  readonly isFailed: boolean;
  readonly isHidden: boolean;
  readonly onRetry: () => void;
  readonly onShow: () => void;
}): React.JSX.Element | undefined {
  if (!isRendering && !isFailed && !isHidden) {
    return undefined;
  }
  return (
    <div className='absolute top-3 left-3 flex flex-wrap items-center gap-2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-xs'>
      {isRendering ? (
        <span role='status' aria-busy='true' className='flex items-center gap-1.5'>
          <LoaderCircle aria-hidden='true' className='size-3.5 motion-safe:animate-spin' />
          Rendering preview
        </span>
      ) : undefined}
      {isFailed ? (
        <>
          <span role='alert' className='flex items-center gap-1.5'>
            <CircleAlert aria-hidden='true' className='size-3.5' />
            Preview unavailable
          </span>
          <Button size='xs' variant='outline' onClick={onRetry}>
            Retry
          </Button>
        </>
      ) : undefined}
      {isHidden ? (
        <>
          <span role='status' className='flex items-center gap-1.5'>
            <EyeOff aria-hidden='true' className='size-3.5' />
            Hidden in the viewer
          </span>
          <Button size='xs' variant='outline' onClick={onShow}>
            Show
          </Button>
        </>
      ) : undefined}
    </div>
  );
}

/**
 * The model's previewable parts along the stage's foot, the shown one marked and kept in view. A part not
 * yet rendered shows its material, as its Explorer row does.
 * ponytail: renders every part's tile; virtualize when models with thousands of parts reach the gallery.
 */
function PartStrip({
  parts,
  index,
  previews,
  onShow,
}: {
  readonly parts: readonly GeometryComponentNode[];
  readonly index: number;
  readonly previews: ReadonlyMap<string, PartThumbnailState>;
  readonly onShow: (id: string) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);
  return (
    <ul
      ref={listRef}
      aria-label='Parts in this model'
      className='absolute inset-x-0 bottom-0 flex gap-1.5 overflow-x-auto border-t bg-background/90 p-2'
    >
      {parts.map((node, position) => {
        const isShown = position === index;
        const bytes = previews.get(node.id)?.bytes;
        const materials = node.appearance?.materials ?? [];
        return (
          <li key={node.id} className='shrink-0'>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  aria-label={node.name}
                  aria-current={isShown || undefined}
                  className={cn(
                    'flex size-14 items-center justify-center overflow-hidden rounded-xs bg-muted ring-1 ring-border focus-visible:focus-outline',
                    isShown && 'ring-2 ring-primary',
                  )}
                  onClick={() => {
                    onShow(node.id);
                  }}
                >
                  {bytes ? (
                    <PartPreviewImage bytes={bytes} className='size-full object-contain p-1' />
                  ) : materials.length > 0 ? (
                    <MaterialSwatch materials={materials} />
                  ) : (
                    <Box aria-hidden='true' className='size-4' />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{node.name}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
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
  unitId,
  parts,
  index,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly unitId: string;
  readonly parts: readonly GeometryComponentNode[];
  readonly index: number;
}): { readonly previews: ReadonlyMap<string, PartThumbnailState>; readonly retry: (id: string) => void } {
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
