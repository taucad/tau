import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { tauEditorPanelDragMime, tauFileDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import type { ChatTextareaDragKind } from '#components/chat/chat-textarea-types.js';

/*
 * The main composer's drop target is the area around it, not only its box (Richard, 2026-11-17): the whole chat pane
 * in a project, the hero above the project grid on Home. That area marks itself with `data-chat-drop-zone`, so the
 * route's own bundle carries one attribute and no code; the composer, which owns the drop handlers, finds the nearest
 * marked ancestor once mounted and listens there.
 */

/**
 * What the drop handlers read of a drag: a React drag event on the composer, or a native one the chat pane or Home's
 * hero forwards (`useChatDropZone`).
 */
export type ChatDragEvent = {
  readonly dataTransfer: DataTransfer;
  readonly preventDefault: () => void;
};

/**
 * The kind of a drag, by the types it carries: a viewer tab, an editor tab or file-tree row, otherwise files.
 *
 * @param types - The drag's `dataTransfer.types`.
 * @returns The kind; anything not a Tau drag counts as files.
 */
export const chatDragKindOf = (types: readonly string[]): ChatTextareaDragKind => {
  if (types.includes(tauViewerPanelDragMime)) {
    return 'viewer';
  }
  if (types.includes(tauEditorPanelDragMime) || types.includes(tauFileDragMime)) {
    return 'reference';
  }
  return 'image';
};

/** The selector of the area a main composer takes drops for. */
const chatDropZoneSelector = '[data-chat-drop-zone]';
/** Every composer's shell (`data-chat-composer`): a drop on another composer in the area is that composer's. */
const chatComposerSelector = '[data-chat-composer]';

const zoneDragTypes: ReadonlySet<string> = new Set([
  'Files',
  tauViewerPanelDragMime,
  tauEditorPanelDragMime,
  tauFileDragMime,
]);

/**
 * The kind of a drag the enlarged area takes: files or a Tau tab or file row. Anything else, such as a text
 * selection dragged across the transcript, is left to the page.
 *
 * @param types - The drag's `dataTransfer.types`.
 * @returns The kind, or `undefined` for a drag the area leaves alone.
 */
export const chatDropZoneKindOf = (types: readonly string[]): ChatTextareaDragKind | undefined =>
  types.some((type) => zoneDragTypes.has(type)) ? chatDragKindOf(types) : undefined;

type ChatDropZoneOptions = {
  /** Only the main composer takes drops for its area; an edit box keeps its own target. */
  readonly isEnabled: boolean;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly containerReference: React.RefObject<HTMLElement | null>;
  readonly onDragOver: (event: ChatDragEvent) => void;
  readonly onDragLeave: () => void;
  readonly onDrop: (event: ChatDragEvent) => Promise<void>;
};

/**
 * Take drags for the area the composer sits in, and hand them to the composer's own handlers.
 *
 * A drag over the area that carries files or a Tau tab shows as the composer's (the handlers set its `dragKind`), and a
 * drop anywhere in it is the composer's drop, so dropping on the transcript attaches exactly what dropping on the
 * composer does. Another composer inside the area (an edit box) keeps the drags over it. Moving between elements inside
 * the area keeps the target; leaving the area releases it.
 *
 * @returns The area, or `undefined` when there is none and the composer is its own target.
 */
export const useChatDropZone = ({
  isEnabled,
  containerReference,
  onDragOver,
  onDragLeave,
  onDrop,
}: ChatDropZoneOptions): HTMLElement | undefined => {
  const [zone, setZone] = useState<HTMLElement | undefined>(undefined);
  const handlers = useRef({ onDragOver, onDragLeave, onDrop });
  useLayoutEffect(() => {
    handlers.current = { onDragOver, onDragLeave, onDrop };
  }, [onDragOver, onDragLeave, onDrop]);

  useLayoutEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the area is a DOM ancestor, known only once committed; a layout effect finds it before paint.
    setZone(
      isEnabled ? (containerReference.current?.closest<HTMLElement>(chatDropZoneSelector) ?? undefined) : undefined,
    );
  }, [isEnabled, containerReference]);

  useEffect(() => {
    if (zone === undefined) {
      return undefined;
    }
    const ownShell = containerReference.current?.closest(chatComposerSelector) ?? undefined;
    /** The drag's transfer when the area takes it: files or a Tau drag, not over another composer. */
    const takenTransfer = (event: DragEvent): DataTransfer | undefined => {
      const shell = event.target instanceof Element ? event.target.closest(chatComposerSelector) : null;
      const isOverOtherComposer = shell !== null && shell !== ownShell;
      const transfer = event.dataTransfer ?? undefined;
      return transfer === undefined || isOverOtherComposer || chatDropZoneKindOf(transfer.types) === undefined
        ? undefined
        : transfer;
    };
    const forwarded = (event: DragEvent, dataTransfer: DataTransfer): ChatDragEvent => ({
      dataTransfer,
      preventDefault() {
        event.preventDefault();
      },
    });
    const handleOver = (event: DragEvent): void => {
      const transfer = takenTransfer(event);
      if (transfer === undefined) {
        handlers.current.onDragLeave();
        return;
      }
      handlers.current.onDragOver(forwarded(event, transfer));
    };
    const handleLeave = (event: DragEvent): void => {
      if (event.relatedTarget instanceof Node && zone.contains(event.relatedTarget)) {
        return;
      }
      handlers.current.onDragLeave();
    };
    const handleDrop = (event: DragEvent): void => {
      const transfer = takenTransfer(event);
      if (transfer === undefined) {
        handlers.current.onDragLeave();
        return;
      }
      /* The area took it: the browser must not also open the file in the tab. */
      event.preventDefault();
      void handlers.current.onDrop(forwarded(event, transfer));
    };
    zone.addEventListener('dragenter', handleOver);
    zone.addEventListener('dragover', handleOver);
    zone.addEventListener('dragleave', handleLeave);
    zone.addEventListener('drop', handleDrop);
    return () => {
      zone.removeEventListener('dragenter', handleOver);
      zone.removeEventListener('dragover', handleOver);
      zone.removeEventListener('dragleave', handleLeave);
      zone.removeEventListener('drop', handleDrop);
    };
  }, [zone, containerReference]);

  return zone;
};

const dragOverlayCopy: Record<ChatTextareaDragKind, string> = {
  image: 'Add files',
  viewer: 'Add screenshot',
  reference: 'Add reference',
};

/**
 * What a drop target shows while a drag is over it: a stronger outline whose edges fade inward, and the kind's copy
 * centred in the area. No fill or blur, so what lies under the drag stays readable.
 */
export function ChatDropOverlay({
  kind,
  className,
}: {
  readonly kind: ChatTextareaDragKind;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-20 flex items-center justify-center',
        'border-2 border-primary inset-shadow-[0_0_2.5rem] inset-shadow-primary/30',
        className,
      )}
    >
      <p className='rounded-full bg-foreground px-3 py-1 text-sm font-medium text-background shadow-md'>
        {dragOverlayCopy[kind]}
      </p>
    </div>
  );
}
