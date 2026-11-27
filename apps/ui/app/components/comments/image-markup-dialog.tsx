import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Circle,
  MessageSquarePlus,
  Minus,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { annotationLimits } from '@taucad/chat/annotations';
import type {
  AnnotatedImage,
  AnnotationComment,
  AnnotationMark,
  AnnotationVec2,
  MessageAnnotations,
} from '@taucad/chat/annotations';
import { useAttachmentSource } from '@taucad/chat-ui/hooks/use-attachment-source';
import type { AttachmentDirectories } from '@taucad/chat-ui/hooks/use-attachment-source';
import { Button } from '@taucad/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@taucad/ui/components/dialog';
import { Separator } from '@taucad/ui/components/separator';
import { toast } from '@taucad/ui/components/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';
import { randomUuid } from '@taucad/utils/id';
import { drawAnnotations, pinsOnImage } from '#components/comments/annotation-painter.js';
import { CommentCard } from '#components/comments/comment-card.js';
import { useKeyboardInset } from '#components/comments/comment-sheet.js';
import { removeComments, setCommentText } from '#components/comments/draft-comments.js';
import {
  addPictureComment,
  annotatedImageOf,
  extendMark,
  grabMark,
  liftMark,
  markSpan,
  modelAnchorOf,
  movePictureComment,
  shiftMark,
  startMark,
  withImage,
} from '#components/comments/markup-marks.js';
import type { MarkGrip, MarkTool } from '#components/comments/markup-marks.js';
import { useImageLift } from '#components/comments/image-lift.js';

/*
 * Mark up of one composer image (charter S5, W5): comment pins on the picture, pen, arrow, line, rectangle and
 * ellipse, in 2D. Marks are drawn by the same painter that flattens the image at send, so what is seen here is what
 * is sent. A press on existing ink moves it (D23). One undo history covers marks and pins.
 */

type Tool = 'comment' | MarkTool;

type ShapeTool = 'line' | 'rectangle' | 'ellipse';

const shapeTools: ReadonlyArray<{ tool: ShapeTool; label: string; key: string; icon: typeof Square }> = [
  { tool: 'line', label: 'Line', key: 'L', icon: Minus },
  { tool: 'rectangle', label: 'Rectangle', key: 'R', icon: Square },
  { tool: 'ellipse', label: 'Ellipse', key: 'E', icon: Circle },
];

const toolKeys: Readonly<Record<string, Tool>> = {
  c: 'comment',
  p: 'pen',
  a: 'arrow',
  l: 'line',
  r: 'rectangle',
  e: 'ellipse',
};

/** How far a press travels, in CSS pixels, before it draws or drags (D23). */
const travel = 4;

/** Mark up's zoom stays between the fitted image and four times it. */
const clampZoom = (zoom: number): number => Math.min(4, Math.max(1, zoom));

/** The grab distance, in CSS pixels, whatever the zoom (D23). */
const grabDistance = (pointerType: string): number => (pointerType === 'mouse' ? 8 : 16);

/** A mark shorter than this, in image pixels, is a slip. */
const leastSpan = 3;

const penPointsIn = (images: readonly AnnotatedImage[]): number =>
  images.reduce(
    (total, image) =>
      total + image.marks.reduce((sum, mark) => sum + (mark.kind === 'pen' ? mark.points.length : 0), 0),
    0,
  );

type Gesture =
  | { kind: 'draw'; pointerId: number; x: number; y: number; mark: AnnotationMark; hasTravelled: boolean }
  /** A shape started by a click: it follows the pointer until the next click (I7). */
  | { kind: 'anchored'; mark: AnnotationMark }
  | {
      kind: 'moveMark';
      pointerId: number;
      x: number;
      y: number;
      index: number;
      grip: MarkGrip;
      from: AnnotationVec2;
      moved: AnnotationMark | undefined;
    }
  | { kind: 'pin'; pointerId: number; x: number; y: number; at: AnnotationVec2 }
  | {
      kind: 'movePin';
      pointerId: number;
      x: number;
      y: number;
      number: number;
      base: MessageAnnotations;
      hasTravelled: boolean;
    };

function ToolButton({
  label,
  isActive,
  ...props
}: React.ComponentProps<typeof Button> & { readonly label: string; readonly isActive?: boolean }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='ghost' size='icon-sm' aria-label={label} aria-pressed={isActive} {...props} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The natural size of an image source, once it has loaded. */
function useNaturalSize(imageSource: string | undefined): { width: number; height: number } | undefined {
  const [size, setSize] = useState<{ imageSource: string; width: number; height: number }>();
  useEffect(() => {
    if (imageSource === undefined) {
      return undefined;
    }
    let isActive = true;
    const image = new Image();
    image.addEventListener('load', () => {
      if (isActive) {
        setSize({ imageSource, width: image.naturalWidth, height: image.naturalHeight });
      }
    });
    image.src = imageSource;
    return () => {
      isActive = false;
    };
  }, [imageSource]);
  return size?.imageSource === imageSource ? size : undefined;
}

/** The record a mark up session reads and changes: a draft's, or a test's. */
export type MarkupRecord = Readonly<{
  annotations: MessageAnnotations | undefined;
  setAnnotations: (annotations: MessageAnnotations | undefined) => void;
  /** Drops pictures nothing is pinned on any more, by attachment URL. */
  dropAttachments: (urls: readonly string[]) => void;
}>;

/** The direction each arrow key nudges a pin. */
const nudges: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

type ImageMarkupDialogProps = Readonly<{
  /** The image to mark up, or `undefined` while closed. */
  image: Readonly<{ url: string; mediaType: string }> | undefined;
  directory: AttachmentDirectories;
  record: MarkupRecord;
  /** The finishing button: "Done" for an image already in the draft, "Add to chat" for one just copied in. */
  finishLabel?: string;
  onClose: () => void;
}>;

/**
 * Mark up of an image: a dialog over the page while an image is chosen.
 *
 * @param props - The image, its record, and how to close.
 * @returns The dialog.
 */
export function ImageMarkupDialog({
  image,
  directory,
  record,
  finishLabel = 'Done',
  onClose,
}: ImageMarkupDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={image !== undefined}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      {image === undefined ? null : (
        <MarkupSurface
          key={image.url}
          url={image.url}
          mediaType={image.mediaType}
          directory={directory}
          record={record}
          finishLabel={finishLabel}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}

function MarkupSurface({
  url,
  mediaType,
  directory,
  record,
  finishLabel,
  onDone,
}: Readonly<{
  url: string;
  mediaType: string;
  directory: AttachmentDirectories;
  record: MarkupRecord;
  finishLabel: string;
  onDone: () => void;
}>): React.JSX.Element {
  const { annotations, setAnnotations: setRecord, dropAttachments } = record;

  const source = useAttachmentSource(directory, { url, mediaType });
  const imageSource = source.status === 'ready' ? source.src : undefined;
  const natural = useNaturalSize(imageSource);
  // oxlint-disable-next-line react/hook-use-state -- the id a first mark gives the image; chosen once.
  const [newImageId] = useState(randomUuid);
  const stored = annotatedImageOf(annotations, url);
  const image = useMemo<AnnotatedImage | undefined>(
    () =>
      stored ??
      (natural === undefined
        ? undefined
        : { id: newImageId, width: natural.width, height: natural.height, attachment: url, marks: [] }),
    [natural, newImageId, stored, url],
  );
  const comments = useMemo(() => annotations?.comments ?? [], [annotations]);
  // A pane showing this picture's scene finds the part under a point of it (D22); otherwise marks stay 2D.
  const lift = useImageLift(image?.view);

  /** The record with a pin at a picture point: on the model when the point lifts, otherwise on the picture. */
  const pinnedAt = useCallback(
    (base: MessageAnnotations, number: number, at: AnnotationVec2): MessageAnnotations | undefined => {
      const pin = base.comments.find((comment) => comment.number === number);
      if (!pin) {
        return undefined;
      }
      const lifted = lift?.(at);
      if (lifted) {
        const { at: _picturePlace, ...rest } = pin;
        return {
          ...base,
          comments: base.comments.map((comment) =>
            comment.number === number ? { ...rest, model: modelAnchorOf(lifted) } : comment,
          ),
        };
      }
      // A model pin stays on the model: over the background, or with no pane to lift it, it does not move (D14).
      return pin.model === undefined ? movePictureComment(base, number, at) : undefined;
    },
    [lift],
  );

  const [tool, setTool] = useState<Tool>('comment');
  const [shape, setShape] = useState<ShapeTool>('rectangle');
  const [zoom, setZoom] = useState(1);
  const [openNumber, setOpenNumber] = useState<number>();
  const [relocating, setRelocating] = useState<number>();
  const [gesture, setGestureState] = useState<Gesture>();
  const gestureRef = useRef<Gesture>(undefined);
  const setGesture = useCallback((next: Gesture | undefined): void => {
    gestureRef.current = next;
    setGestureState(next);
  }, []);
  const [past, setPast] = useState<ReadonlyArray<MessageAnnotations | undefined>>([]);
  const [future, setFuture] = useState<ReadonlyArray<MessageAnnotations | undefined>>([]);
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  /** One undo step: the record before it is kept. */
  const commit = useCallback(
    (next: MessageAnnotations, before: MessageAnnotations | undefined = annotations): void => {
      setPast((previous) => [...previous, before]);
      setFuture([]);
      setRecord(next);
    },
    [annotations, setRecord],
  );
  const undo = useCallback((): void => {
    if (past.length === 0) {
      return;
    }
    setPast(past.slice(0, -1));
    setFuture([annotations, ...future]);
    setRecord(past.at(-1));
  }, [annotations, future, past, setRecord]);
  const redo = useCallback((): void => {
    if (future.length === 0) {
      return;
    }
    setFuture(future.slice(1));
    setPast([...past, annotations]);
    setRecord(future[0]);
  }, [annotations, future, past, setRecord]);

  const setMarks = useCallback(
    (marks: readonly AnnotationMark[]): void => {
      if (!image) {
        return;
      }
      if (marks.length > annotationLimits.marksPerImage) {
        toast.error(`An image holds up to ${annotationLimits.marksPerImage} marks.`);
        return;
      }
      const next = withImage(annotations, { ...image, marks: [...marks] });
      if (penPointsIn(next.images) > annotationLimits.penPointsPerMessage) {
        toast.error('This message has as much pen drawing as it can hold.');
        return;
      }
      if (next.images.length > annotationLimits.images) {
        toast.error(`A message holds up to ${annotationLimits.images} marked up images.`);
        return;
      }
      commit(next);
    },
    [annotations, commit, image],
  );

  const placePin = useCallback(
    (at: AnnotationVec2): void => {
      if (!image) {
        return;
      }
      const base = withImage(annotations, image);
      if (relocating !== undefined) {
        const moved = pinnedAt(base, relocating, at);
        if (moved) {
          commit(moved);
          setRelocating(undefined);
        }
        return;
      }
      if (comments.length >= annotationLimits.comments) {
        toast.error(`A message holds up to ${annotationLimits.comments} comments.`);
        return;
      }
      if (base.images.length > annotationLimits.images) {
        toast.error(`A message holds up to ${annotationLimits.images} marked up images.`);
        return;
      }
      const added = addPictureComment(base, image.id, at);
      commit(pinnedAt(added.annotations, added.number, at) ?? added.annotations);
      setOpenNumber(added.number);
    },
    [annotations, commit, comments.length, image, pinnedAt, relocating],
  );

  const removeComment = useCallback(
    (number: number): void => {
      if (!annotations) {
        return;
      }
      const removed = removeComments(annotations, (comment) => comment.number === number);
      commit(removed.annotations);
      dropAttachments(removed.orphanedAttachments);
      setOpenNumber((current) => (current === number ? undefined : current));
    },
    [annotations, commit, dropAttachments],
  );

  const closeCard = useCallback((): void => {
    const comment = comments.find(({ number }) => number === openNumber);
    // A pin with no words says nothing: it goes when its card closes.
    if (comment?.text.trim() === '') {
      removeComment(comment.number);
    }
    setOpenNumber(undefined);
  }, [comments, openNumber, removeComment]);

  // What the canvas shows: the stored marks, with the one being moved or drawn in its live place.
  const shownMarks = useMemo(() => {
    const marks = [...(image?.marks ?? [])];
    if (gesture?.kind === 'moveMark' && gesture.moved) {
      marks[gesture.index] = gesture.moved;
    }
    if ((gesture?.kind === 'draw' && gesture.hasTravelled) || gesture?.kind === 'anchored') {
      marks.push(gesture.mark);
    }
    return marks;
  }, [gesture, image?.marks]);
  const pins = useMemo(() => (image ? pinsOnImage(image, comments) : []), [comments, image]);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !image) {
      return;
    }
    context.clearRect(0, 0, image.width, image.height);
    // Model pins stand on the image with a stem and foot; their heads are the buttons drawn over it.
    drawAnnotations(context, image, { marks: shownMarks, pins: pins.filter((pin) => pin.foot !== undefined) });
  }, [image, pins, shownMarks]);

  // Mark up owns its keys while open: tools, undo and redo, and Escape in order (I8).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.closest('textarea, input')) {
        return;
      }
      const isModified = event.metaKey || event.ctrlKey;
      if (isModified && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      const next = toolKeys[event.key.toLowerCase()];
      if (!isModified && !event.altKey && next !== undefined) {
        event.stopPropagation();
        setTool(next);
        if (next === 'line' || next === 'rectangle' || next === 'ellipse') {
          setShape(next);
        }
      }
    };
    globalThis.addEventListener('keydown', onKey, true);
    return () => {
      globalThis.removeEventListener('keydown', onKey, true);
    };
  }, [redo, undo]);

  /** The pointer as a point of the image. */
  const pointOf = (event: { clientX: number; clientY: number }): AnnotationVec2 => {
    const rect = surface.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ];
  };
  /** Image pixels per CSS pixel. */
  const scale = (): number => (image?.width ?? 1) / (surface.current?.getBoundingClientRect().width ?? 1);

  /*
   * Two fingers pan and zoom, and never draw: the second finger down drops whatever the first began. Pinch is the
   * only zoom on a phone, where the zoom buttons are hidden; ctrl-wheel (a trackpad pinch) zooms on a desktop.
   */
  const touches = useRef(new Map<number, AnnotationVec2>());
  const pinch = useRef<{ distance: number; zoom: number; mid: AnnotationVec2; scroll: AnnotationVec2 }>(undefined);
  const scroller = useRef<HTMLDivElement>(undefined);
  const attachScroller = useCallback((element: HTMLDivElement): (() => void) => {
    scroller.current = element;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
      setZoom((previous) => clampZoom(previous * Math.exp(-event.deltaY / 100)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      scroller.current = undefined;
    };
  }, []);
  const pinchFrame = (): { distance: number; mid: AnnotationVec2 } | undefined => {
    const [first, second] = [...touches.current.values()];
    return first && second
      ? {
          distance: Math.max(1, Math.hypot(first[0] - second[0], first[1] - second[1])),
          mid: [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2],
        }
      : undefined;
  };
  const startPinch = (event: React.PointerEvent<HTMLDivElement>): boolean => {
    if (event.pointerType !== 'touch') {
      return false;
    }
    touches.current.set(event.pointerId, [event.clientX, event.clientY]);
    const frame = pinchFrame();
    if (touches.current.size !== 2 || !frame) {
      return false;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    onPointerCancel();
    const view = scroller.current;
    pinch.current = { ...frame, zoom, scroll: [view?.scrollLeft ?? 0, view?.scrollTop ?? 0] };
    return true;
  };
  const movePinch = (event: React.PointerEvent<HTMLDivElement>): boolean => {
    if (!touches.current.has(event.pointerId)) {
      return false;
    }
    touches.current.set(event.pointerId, [event.clientX, event.clientY]);
    const start = pinch.current;
    const frame = pinchFrame();
    if (!start || !frame) {
      return false;
    }
    setZoom(clampZoom((start.zoom * frame.distance) / start.distance));
    const view = scroller.current;
    if (view) {
      view.scrollLeft = start.scroll[0] - (frame.mid[0] - start.mid[0]);
      view.scrollTop = start.scroll[1] - (frame.mid[1] - start.mid[1]);
    }
    return true;
  };
  const endPinch = (event: React.PointerEvent<HTMLDivElement>): boolean => {
    touches.current.delete(event.pointerId);
    if (pinch.current === undefined) {
      return false;
    }
    if (touches.current.size < 2) {
      pinch.current = undefined;
    }
    return true;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (startPinch(event)) {
      return;
    }
    if (!image || event.button !== 0 || !event.isPrimary) {
      return;
    }
    const at = pointOf(event);
    const { current } = gestureRef;
    if (current?.kind === 'anchored') {
      // The second click of a click-then-click shape puts its far end down.
      setGesture(undefined);
      const mark = extendMark(current.mark, at, image);
      if (markSpan(mark, image) >= leastSpan) {
        setMarks([...image.marks, liftMark(mark, lift)]);
      }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const base = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    // A press on existing ink moves it, whatever the tool (D23); a pin being placed again is placed, not grabbed.
    const grabbed =
      relocating === undefined
        ? grabMark(image.marks, at, { size: image, slop: grabDistance(event.pointerType) * scale() })
        : undefined;
    if (grabbed) {
      setGesture({ kind: 'moveMark', ...base, ...grabbed, from: at, moved: undefined });
      return;
    }
    if (relocating !== undefined || tool === 'comment') {
      setGesture({ kind: 'pin', ...base, at });
      return;
    }
    setGesture({ kind: 'draw', ...base, mark: startMark(tool, at), hasTravelled: false });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (movePinch(event)) {
      return;
    }
    const { current } = gestureRef;
    if (!image || !current) {
      return;
    }
    const at = pointOf(event);
    if (current.kind === 'anchored') {
      setGesture({ ...current, mark: extendMark(current.mark, at, image) });
      return;
    }
    if (current.kind === 'pin' || current.pointerId !== event.pointerId) {
      return;
    }
    const hasTravelled =
      ('hasTravelled' in current && current.hasTravelled) ||
      ('moved' in current && current.moved !== undefined) ||
      Math.hypot(event.clientX - current.x, event.clientY - current.y) > travel;
    if (!hasTravelled) {
      return;
    }
    if (current.kind === 'moveMark') {
      const mark = image.marks[current.index];
      if (mark) {
        const delta: AnnotationVec2 = [at[0] - current.from[0], at[1] - current.from[1]];
        setGesture({ ...current, moved: shiftMark(mark, current.grip, delta) });
      }
      return;
    }
    if (current.kind === 'movePin') {
      setGesture({ ...current, hasTravelled: true });
      const moved = pinnedAt(current.base, current.number, at);
      if (moved) {
        setRecord(moved);
      }
      return;
    }
    setGesture({ ...current, mark: extendMark(current.mark, at, image), hasTravelled: true });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (endPinch(event)) {
      return;
    }
    const { current } = gestureRef;
    if (!image || !current || current.kind === 'anchored' || current.pointerId !== event.pointerId) {
      return;
    }
    setGesture(undefined);
    if (current.kind === 'moveMark') {
      if (current.moved) {
        // A moved arrow or line finds its parts again where it now points (D23).
        const moved = liftMark(current.moved, lift);
        setMarks(image.marks.map((mark, index) => (index === current.index ? moved : mark)));
      } else if (tool === 'comment') {
        // A press on ink that did not travel is a click: with the comment tool it still drops a pin.
        placePin(current.from);
      }
      return;
    }
    if (current.kind === 'pin') {
      placePin(current.at);
      return;
    }
    if (current.kind === 'movePin') {
      if (current.hasTravelled) {
        setPast((previous) => [...previous, current.base]);
        setFuture([]);
      } else {
        setOpenNumber((open) => (open === current.number ? undefined : current.number));
      }
      return;
    }
    if (!current.hasTravelled && current.mark.kind !== 'pen') {
      // A click with a shape tool starts it; the next click ends it (I7).
      setGesture({ kind: 'anchored', mark: current.mark });
      return;
    }
    if (markSpan(current.mark, image) >= leastSpan) {
      setMarks([...image.marks, liftMark(current.mark, lift)]);
    }
  };

  const onPointerCancel = (event?: React.PointerEvent<HTMLDivElement>): void => {
    if (event) {
      endPinch(event);
    }
    const { current } = gestureRef;
    if (current?.kind === 'movePin' && current.hasTravelled) {
      setRecord(current.base);
    }
    setGesture(undefined);
  };

  const isPhone = useIsMobile();
  const keyboardInset = useKeyboardInset();
  const cardOf = (comment: AnnotationComment, isMovable: boolean): React.JSX.Element => (
    <CommentCard
      comment={comment}
      isOutdated={false}
      hasDoneButton={isPhone}
      onText={(text) => {
        if (annotations) {
          setRecord(setCommentText(annotations, comment.number, text));
        }
      }}
      onRemove={() => {
        removeComment(comment.number);
      }}
      onDone={closeCard}
      {...(isMovable
        ? {
            onMove() {
              setOpenNumber(undefined);
              setRelocating(comment.number);
            },
          }
        : {})}
    />
  );
  const phoneCard = isPhone ? comments.find((comment) => comment.number === openNumber) : undefined;

  const ActiveShape = shapeTools.find((entry) => entry.tool === shape)!;
  const relocatingLabel = relocating === undefined ? undefined : `Click the new place for comment ${relocating}.`;

  return (
    <DialogContent
      scroll='contained'
      className='flex h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-[calc(100vw-2rem)]'
      // A phone's keyboard covers the bottom of the screen: the docked card and the toolbar stay above it.
      style={keyboardInset > 0 ? { paddingBottom: Math.max(0, keyboardInset - 16) } : undefined}
      onEscapeKeyDown={(event) => {
        // Escape order (I8): a gesture, then a move, then the open card, then the dialog.
        if (gestureRef.current) {
          event.preventDefault();
          onPointerCancel();
        } else if (relocating !== undefined) {
          event.preventDefault();
          setRelocating(undefined);
        } else if (openNumber !== undefined) {
          event.preventDefault();
          closeCard();
        }
      }}
      onFocusOutside={(event) => {
        event.preventDefault();
      }}
    >
      <DialogTitle className='sr-only'>Mark up image</DialogTitle>
      <DialogDescription className='sr-only'>
        Pin comments on the image and draw on it. The marks are sent with your next message.
      </DialogDescription>
      <div ref={attachScroller} className='@container-[size] min-h-0 flex-1 overflow-auto'>
        <div className='flex min-h-full min-w-full items-center justify-center p-6'>
          {image && imageSource ? (
            <div
              className='relative shrink-0 rounded-md shadow-sm ring-1 ring-border'
              style={{
                width: `calc(min(100cqw - 3rem, (100cqh - 3rem) * ${image.width / image.height}) * ${zoom})`,
                aspectRatio: `${image.width} / ${image.height}`,
              }}
            >
              <img src={imageSource} alt='' draggable={false} className='block size-full rounded-md select-none' />
              <div
                ref={surface}
                role='img'
                aria-label={`Image with ${image.marks.length} ${image.marks.length === 1 ? 'mark' : 'marks'} and ${pins.length} ${pins.length === 1 ? 'comment' : 'comments'}`}
                data-tool={tool}
                className='absolute inset-0 touch-none'
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                <canvas
                  ref={canvas}
                  width={image.width}
                  height={image.height}
                  className='pointer-events-none size-full rounded-md'
                />
              </div>
              {tool === 'comment' ? (
                <button
                  type='button'
                  className='absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-background px-3 py-1 text-xs shadow-md not-focus-visible:sr-only focus-visible:focus-outline'
                  onClick={() => {
                    placePin([0.5, 0.5]);
                  }}
                >
                  Comment at the centre
                </button>
              ) : null}
              {pins.map((pin) => {
                const comment = comments.find((candidate) => candidate.number === pin.number);
                if (!comment) {
                  return null;
                }
                const isOpen = openNumber === pin.number;
                // A model pin moves on a picture only while a pane shows its scene (D14, D22).
                const isMovable = comment.model === undefined || lift !== undefined;
                return (
                  <div
                    key={pin.number}
                    className='absolute -translate-x-1/2 -translate-y-1/2'
                    style={{ left: `${pin.head[0] * 100}%`, top: `${pin.head[1] * 100}%`, zIndex: isOpen ? 20 : 10 }}
                  >
                    <button
                      type='button'
                      aria-label={`Comment ${pin.number}${comment.text ? `: ${comment.text}` : ''}`}
                      aria-expanded={isOpen}
                      className='relative flex size-6 touch-none items-center justify-center rounded-full border-2 border-white bg-markup-ink text-xs font-semibold text-white shadow-sm outline-none focus-visible:focus-outline pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5'
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (!isMovable || event.button !== 0 || !annotations) {
                          return;
                        }
                        surface.current?.setPointerCapture(event.pointerId);
                        setGesture({
                          kind: 'movePin',
                          pointerId: event.pointerId,
                          x: event.clientX,
                          y: event.clientY,
                          number: pin.number,
                          base: annotations,
                          hasTravelled: false,
                        });
                      }}
                      onClick={(event) => {
                        // A movable pin's press is handled by the surface it captured; another, or a key, opens here.
                        if (!isMovable || event.detail === 0) {
                          event.stopPropagation();
                          setOpenNumber(isOpen ? undefined : pin.number);
                        }
                      }}
                      onKeyDown={(event) => {
                        // Arrow keys nudge a pin, Shift for a larger step (I7: no drag needed).
                        const step = event.shiftKey ? 0.05 : 0.01;
                        const delta = nudges[event.key];
                        if (!delta || !isMovable || !annotations) {
                          return;
                        }
                        event.preventDefault();
                        const at: AnnotationVec2 = [
                          Math.min(1, Math.max(0, pin.head[0] + delta[0] * step)),
                          Math.min(1, Math.max(0, pin.head[1] + delta[1] * step)),
                        ];
                        const moved = pinnedAt(withImage(annotations, image), pin.number, at);
                        if (moved) {
                          commit(moved);
                        }
                      }}
                    >
                      {pin.number}
                    </button>
                    {isOpen && !isPhone ? (
                      <div
                        className={cn(
                          'absolute z-20 w-72 rounded-lg border bg-popover p-3 shadow-md',
                          pin.head[0] > 0.6 ? 'right-8' : 'left-8',
                          pin.head[1] > 0.6 ? 'bottom-0' : 'top-0',
                        )}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        {cardOf(comment, isMovable)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p role='status' className='text-sm text-muted-foreground'>
              {source.status === 'absent' ? 'This image is not on this device.' : 'Loading image…'}
            </p>
          )}
        </div>
      </div>
      {phoneCard === undefined ? null : (
        <div role='group' aria-label={`Comment ${phoneCard.number}`} className='border-t border-border bg-popover p-3'>
          {cardOf(phoneCard, phoneCard.model === undefined || lift !== undefined)}
        </div>
      )}
      {relocatingLabel === undefined ? null : (
        <div role='status' className='flex items-center justify-center gap-2 border-t px-3 py-1.5 text-xs'>
          {relocatingLabel}
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setRelocating(undefined);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      <div
        role='toolbar'
        aria-label='Mark up tools'
        className='flex flex-wrap items-center justify-center gap-1 border-t bg-sidebar p-1.5'
      >
        <ToolButton
          label='Comment (C)'
          isActive={tool === 'comment'}
          onClick={() => {
            setTool('comment');
          }}
        >
          <MessageSquarePlus />
        </ToolButton>
        <ToolButton
          label='Pen (P)'
          isActive={tool === 'pen'}
          onClick={() => {
            setTool('pen');
          }}
        >
          <Pencil />
        </ToolButton>
        <ToolButton
          label='Arrow (A)'
          isActive={tool === 'arrow'}
          onClick={() => {
            setTool('arrow');
          }}
        >
          <ArrowUpRight />
        </ToolButton>
        {shapeTools.map((entry) => (
          <ToolButton
            key={entry.tool}
            label={`${entry.label} (${entry.key})`}
            isActive={tool === entry.tool}
            className={cn(entry.tool !== ActiveShape.tool && 'max-sm:hidden')}
            onClick={() => {
              setShape(entry.tool);
              setTool(entry.tool);
            }}
          >
            <entry.icon />
          </ToolButton>
        ))}
        <Separator orientation='vertical' className='mx-1 data-[orientation=vertical]:h-4' />
        <ToolButton label='Undo' disabled={past.length === 0} onClick={undo}>
          <Undo2 />
        </ToolButton>
        <ToolButton label='Redo' disabled={future.length === 0} onClick={redo}>
          <Redo2 />
        </ToolButton>
        <ToolButton
          label='Clear marks'
          disabled={(image?.marks.length ?? 0) === 0}
          onClick={() => {
            setMarks([]);
          }}
        >
          <Trash2 />
        </ToolButton>
        <Separator orientation='vertical' className='mx-1 data-[orientation=vertical]:h-4 max-sm:hidden' />
        <ToolButton
          label='Zoom out'
          className='max-sm:hidden'
          disabled={zoom <= 1}
          onClick={() => {
            setZoom(clampZoom(zoom / 1.5));
          }}
        >
          <ZoomOut />
        </ToolButton>
        <ToolButton
          label='Zoom in'
          className='max-sm:hidden'
          disabled={zoom >= 4}
          onClick={() => {
            setZoom(clampZoom(zoom * 1.5));
          }}
        >
          <ZoomIn />
        </ToolButton>
        <Separator orientation='vertical' className='mx-1 data-[orientation=vertical]:h-4' />
        <Button variant='secondary' size='sm' onClick={onDone}>
          {finishLabel}
        </Button>
      </div>
    </DialogContent>
  );
}
