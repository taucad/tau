/**
 * The page's part previews (workbench parity PAR-7): the Model pane's row thumbnails and the part gallery, as the
 * Tau app draws them. The page renders no image itself; `tau mcp` renders the shown GLB's parts through
 * `app_part_thumbnails`, four at a time, and the page keeps each part's preview while the model stays shown.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { GeometryComponentNode } from '@taucad/types';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import type {
  ModelComponentHostActions,
  ModelComponentPreviewRequest,
} from '@taucad/workbench-panes/component-menu/component-actions';
import type { ModelThumbnailRequest, ModelThumbnails } from '@taucad/workbench-panes/model/model-source';
import { PartGallery } from '@taucad/workbench-panes/model/part-gallery';
import type { PartGalleryPreviewRequest, PartGalleryPreviews } from '@taucad/workbench-panes/model/part-gallery';
import { ToolCallError } from '#app/host-bridge.js';
import type { HostBridge } from '#app/host-bridge.js';
import { decodeBase64 } from '#app/model-loader.js';

/** The page-only tool `tau mcp` renders part thumbnails with. */
export const partThumbnailsToolName = 'app_part_thumbnails';

/** Parts one call renders at most (the server's cap). */
const batchLimit = 4;

/** Parts one surface asks for at most, as the Tau app bounds a request. */
const requestLimit = 128;

/** One previewable part: its component id and the glTF primitives that draw it. */
type PartRequest = Readonly<{ id: string; primitives: NonNullable<GeometryComponentNode['primitiveRefs']> }>;

/** The previews of one shown model, and how to ask for more. */
export type PartThumbnails = Readonly<{
  subscribe: (listener: () => void) => () => void;
  snapshot: () => ReadonlyMap<string, PartThumbnailState>;
  /** Render these parts, first first, unless they have a preview or are on their way. */
  request: (parts: readonly PartRequest[]) => void;
  /** Render one part again. */
  retry: (part: PartRequest) => void;
  /** A preview that did not decode as an image. */
  failDecode: (componentId: string) => void;
}>;

/** A part with geometry the server can draw. */
type PreviewableNode = GeometryComponentNode & Readonly<{ primitiveRefs: PartRequest['primitives'] }>;

const isPreviewable = (node: GeometryComponentNode | undefined): node is PreviewableNode =>
  node?.kind === 'part' && (node.primitiveRefs?.length ?? 0) > 0;

const partOf = (node: PreviewableNode): PartRequest => ({
  id: node.id,
  primitives: node.primitiveRefs,
});

const isThumbnailsResult = (
  value: unknown,
): value is Readonly<{ thumbnails: ReadonlyArray<Readonly<{ id: string; data: string }>> }> =>
  typeof value === 'object' && value !== null && 'thumbnails' in value && Array.isArray(value.thumbnails);

/**
 * Create the previews of one shown model.
 *
 * @param bridge - The page's host bridge.
 * @param modelId - The shown model the server renders from.
 * @returns The previews.
 */
export function createPartThumbnails(bridge: HostBridge, modelId: string): PartThumbnails {
  let states: ReadonlyMap<string, PartThumbnailState> = new Map();
  const listeners = new Set<() => void>();
  const queue: PartRequest[] = [];
  let isRunning = false;
  /* An older `tau` serves no thumbnail tool: every part then reads as unavailable, and nothing is asked again. */
  let isUnavailable = false;

  const set = (changes: ReadonlyArray<readonly [string, PartThumbnailState]>): void => {
    const next = new Map(states);
    for (const [id, state] of changes) {
      next.set(id, state);
    }
    states = next;
    for (const listener of listeners) {
      listener();
    }
  };
  const failed = (id: string, error: unknown): readonly [string, PartThumbnailState] => {
    const { bytes } = states.get(id) ?? {};
    return [id, { status: 'failed', ...(bytes === undefined ? {} : { bytes }), error }];
  };

  const run = async (): Promise<void> => {
    isRunning = true;
    try {
      while (queue.length > 0) {
        const batch = queue.splice(0, batchLimit);
        try {
          // oxlint-disable-next-line no-await-in-loop -- one batch at a time, as the server renders one at a time.
          const result = await bridge.callTool(partThumbnailsToolName, {
            modelId,
            parts: batch.map(({ id, primitives }) => ({ id, primitives })),
          });
          const rendered = new Map(
            (isThumbnailsResult(result) ? result.thumbnails : []).map(({ id, data }) => [id, data]),
          );
          set(
            batch.map(({ id }) => {
              const data = rendered.get(id);
              return data === undefined
                ? failed(id, new Error(`No preview was rendered for ${id}.`))
                : [id, { status: 'ready', bytes: decodeBase64(data) }];
            }),
          );
        } catch (error) {
          if (error instanceof ToolCallError && error.code === 'UNKNOWN_TOOL') {
            isUnavailable = true;
            set([...batch, ...queue.splice(0)].map(({ id }) => failed(id, error)));
            return;
          }
          set(batch.map(({ id }) => failed(id, error)));
        }
      }
    } finally {
      isRunning = false;
    }
  };
  const enqueue = (parts: readonly PartRequest[], isRetry: boolean): void => {
    const fresh = parts.filter(
      ({ id }) => isRetry || (states.get(id) === undefined && !queue.some((queued) => queued.id === id)),
    );
    if (fresh.length === 0) {
      return;
    }
    if (isUnavailable) {
      set(fresh.map(({ id }) => failed(id, new Error('This tau serves no part thumbnails.'))));
      return;
    }
    const ids = new Set(fresh.map(({ id }) => id));
    /* The newest request goes first: it is what is on screen now. */
    queue.splice(0, queue.length, ...fresh, ...queue.filter(({ id }) => !ids.has(id)));
    set(
      fresh.map(({ id }) => [
        id,
        { status: 'pending', ...(states.get(id)?.bytes === undefined ? {} : { bytes: states.get(id)!.bytes }) },
      ]),
    );
    if (!isRunning) {
      // async-iife: bootstrap — the queue drains in the background; each batch lands in the snapshot.
      void run();
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => states,
    request(parts) {
      enqueue(parts.slice(0, requestLimit), false);
    },
    retry(part) {
      enqueue([part], true);
    },
    failDecode(componentId) {
      set([failed(componentId, new Error('The preview did not decode.'))]);
    },
  };
}

const emptyPreviews: ReadonlyMap<string, PartThumbnailState> = new Map();
const unsubscribed = (): (() => void) => () => undefined;
const noPreviews = (): ReadonlyMap<string, PartThumbnailState> => emptyPreviews;

/**
 * The previews' current snapshot, following changes.
 *
 * @param thumbnails - The shown model's previews, or none before a model is shown.
 * @returns Preview state by component id.
 */
function usePreviewSnapshot(thumbnails: PartThumbnails | undefined): ReadonlyMap<string, PartThumbnailState> {
  return useSyncExternalStore(thumbnails?.subscribe ?? unsubscribed, thumbnails?.snapshot ?? noPreviews);
}

/**
 * The Model pane's `useThumbnails` over the shown model's previews: the selected part, then the rows on screen.
 *
 * @param thumbnails - The shown model's previews.
 * @param request - What the pane shows of one entry.
 * @returns The rows' previews and their controls.
 */
function useModelPartThumbnails(
  thumbnails: PartThumbnails | undefined,
  { manifest, selectedComponentIds, visibleComponentIds }: ModelThumbnailRequest,
): ModelThumbnails {
  const previews = usePreviewSnapshot(thumbnails);
  const selected = selectedComponentIds.at(-1);
  const wanted = useMemo(() => {
    if (manifest === undefined) {
      return [];
    }
    const ids = [...new Set([selected, ...visibleComponentIds].filter((id): id is string => id !== undefined))];
    return ids
      .map((id) => manifest.nodesById[id])
      .filter((node) => isPreviewable(node))
      .map((node) => partOf(node));
  }, [manifest, selected, visibleComponentIds]);
  useEffect(() => {
    thumbnails?.request(wanted);
  }, [thumbnails, wanted]);
  const retry = useCallback(
    (componentId?: string) => {
      const node = manifest?.nodesById[componentId ?? selected ?? ''];
      if (isPreviewable(node)) {
        thumbnails?.retry(partOf(node));
      }
    },
    [manifest, selected, thumbnails],
  );
  const failDecode = useCallback(
    (componentId: string) => {
      thumbnails?.failDecode(componentId);
    },
    [thumbnails],
  );
  return useMemo(() => ({ previews, retry, failDecode, markDecoded: () => undefined }), [failDecode, previews, retry]);
}

/**
 * The part gallery's previews over the shown model's: the shown part and its neighbours, so the arrows land on a
 * ready image, as the Tau app asks for them.
 *
 * @param thumbnails - The shown model's previews.
 * @param request - The gallery's parts and the shown one's position.
 * @returns The previews and how to render one again.
 */
function useGalleryPartThumbnails(
  thumbnails: PartThumbnails | undefined,
  { parts, index }: PartGalleryPreviewRequest,
): PartGalleryPreviews {
  const previews = usePreviewSnapshot(thumbnails);
  const wanted = useMemo(() => {
    if (index < 0 || parts.length === 0) {
      return [];
    }
    const nodes = [0, 1, -1, 2].map((offset) => parts[(index + offset + parts.length) % parts.length]);
    return [...new Set(nodes)].filter((node) => isPreviewable(node)).map((node) => partOf(node));
  }, [index, parts]);
  useEffect(() => {
    thumbnails?.request(wanted);
  }, [thumbnails, wanted]);
  const retry = useCallback(
    (componentId: string) => {
      const node = parts.find((part) => part.id === componentId);
      if (isPreviewable(node)) {
        thumbnails?.retry(partOf(node));
      }
    },
    [parts, thumbnails],
  );
  return { previews, retry };
}

/**
 * The gallery's preview hook over one model's previews.
 *
 * @param thumbnails - The shown model's previews.
 * @returns The hook the shared gallery calls.
 */
const galleryPreviewsOf = (thumbnails: PartThumbnails | undefined) =>
  function usePagePartGalleryPreviews(request: PartGalleryPreviewRequest): PartGalleryPreviews {
    return useGalleryPartThumbnails(thumbnails, request);
  };

/**
 * The Model pane's thumbnail hook over one model's previews.
 *
 * @param thumbnails - The shown model's previews.
 * @returns The hook `ModelSource.useThumbnails` takes.
 */
export const modelThumbnailsOf = (thumbnails: PartThumbnails | undefined) =>
  function usePageModelThumbnails(request: ModelThumbnailRequest): ModelThumbnails {
    return useModelPartThumbnails(thumbnails, request);
  };

type PagePartGalleryProps = Readonly<{
  thumbnails: PartThumbnails | undefined;
  request: ModelComponentPreviewRequest;
  actions: ModelComponentHostActions;
  onClose: () => void;
}>;

/**
 * The shared part gallery with the page's verbs and the shown model's previews.
 *
 * @param props - The previews, the part it opens on, the page's part verbs and what closing does.
 * @returns The gallery.
 */
export function PagePartGallery({
  thumbnails,
  request,
  actions,
  onClose,
}: PagePartGalleryProps): React.JSX.Element | undefined {
  /* One hook for the gallery's lifetime: the previews it reads are fixed while it is open. */
  const usePreviews = useMemo(() => galleryPreviewsOf(thumbnails), [thumbnails]);
  return <PartGallery request={request} actions={actions} usePreviews={usePreviews} onClose={onClose} />;
}

/**
 * The page's part previews for the shown model, and its one part gallery: what the Model pane, the part menus and the
 * gallery share. A newly shown model starts empty previews; an SVG has none.
 *
 * @param bridge - The page's host bridge.
 * @param model - The shown model's id and type, or `undefined` before one is shown.
 * @returns The previews, the open gallery's request, and how to open and close it.
 */
export function usePartPreviews(
  bridge: HostBridge,
  model: Readonly<{ id: string; mimeType: string }> | undefined,
): Readonly<{
  thumbnails: PartThumbnails | undefined;
  galleryRequest: ModelComponentPreviewRequest | undefined;
  openPartGallery: (request: ModelComponentPreviewRequest) => void;
  closePartGallery: () => void;
}> {
  const modelId = model?.mimeType === 'model/gltf-binary' ? model.id : undefined;
  const thumbnails = useMemo(
    () => (modelId === undefined ? undefined : createPartThumbnails(bridge, modelId)),
    [bridge, modelId],
  );
  const [galleryRequest, setGalleryRequest] = useState<ModelComponentPreviewRequest | undefined>(undefined);
  const closePartGallery = useCallback(() => {
    setGalleryRequest(undefined);
  }, []);
  return { thumbnails, galleryRequest, openPartGallery: setGalleryRequest, closePartGallery };
}
