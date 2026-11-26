import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { Rendering } from '@taucad/runtime';
import { annotationLimits } from '@taucad/chat/annotations';
import type { AnnotationCamera, AnnotationComment, MessageAnnotations } from '@taucad/chat/annotations';
import { attachmentUrl } from '@taucad/chat-ui/utils/attachment.utils';
import { toast } from '@taucad/ui/components/sonner';
import { randomUuid } from '@taucad/utils/id';
import { lazyCode } from '@taucad/ui-core/lib/lazy-code';
import { CommentPinsProvider, useCommentPins } from '@taucad/viewer/cad/comment-pins';
import type { CommentPinsHost, CommentSurfacePick, ViewerCommentPin } from '@taucad/viewer/cad/comment-pins';
import { getGraphicsCameraState } from '@taucad/viewer/graphics/graphics-camera';
import { useOptionalGraphics, useOptionalGraphicsSelector } from '@taucad/viewer/hooks/use-graphics';
import { selectPresentedGeometryKey } from '@taucad/viewer/machines/graphics.machine';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import {
  isAnyPinOutOfFrame,
  movePin,
  outdatedComments,
  placePin,
  removeComments,
  setCommentText,
} from '#components/comments/draft-comments.js';
import type { PinPlacement } from '#components/comments/draft-comments.js';
import { useShownComments } from '#components/comments/shown-comments.js';
import { useFeatureState } from '#flags/use-feature.js';
import { useOptionalChatComposer } from '#hooks/active-chat-provider.js';
import { useCad } from '#hooks/use-cad.js';
import { useProject } from '#hooks/use-project.js';
import { useOptionalHeadlessImageService } from '#providers/headless-image-provider.js';
import {
  captureCadImages,
  captureFilesToDataUrls,
  pinPictureSize,
  presentedSceneHash,
} from '#services/headless-capture.js';
import { attachmentModelForExecution } from '#utils/chat.utils.js';

/*
 * Comment pins of one viewer. `ViewerComments` wraps the viewer's stage: it gives the viewer its pins and its Comment
 * tool from the new-message draft, and takes a pin's picture when the pin is placed. `ViewerCommentHeads`, inside the
 * stage, draws each pin's numbered head and the card its comment is written in.
 */

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

/** Which model a viewer shows: a pin belongs to the viewer that shows the model it was placed on. */
type ViewerScope = Readonly<{
  entryPath: string;
  kernelView: string | undefined;
  instance: string | undefined;
}>;

export type ViewerCommentsValue = Readonly<{
  /** The draft's comments pinned on this viewer's model. */
  comments: readonly AnnotationComment[];
  /** The comment whose card is open. */
  openNumber: number | undefined;
  open: (number: number) => void;
  /** Closes the open card; a comment left without words is removed with it. */
  close: () => void;
  setText: (number: number, text: string) => void;
  remove: (number: number) => void;
  /** Moves a draft pin to the surface picked under it (charter D14). */
  move: (number: number, pick: CommentSurfacePick) => void;
  /** The pin the next click on the model moves, after its card's Move. */
  movingNumber: number | undefined;
  startMove: (number: number) => void;
  /** The pins are a sent message's or an open edit's: shown here, changed elsewhere. */
  isReadOnly: boolean;
  /** Ends the look at a sent message's comments, when that is what the viewer shows. */
  hideShown: (() => void) | undefined;
  /** The comments whose model has changed since their picture was taken (charter I5). */
  outdated: ReadonlySet<number>;
}>;

/* The heads and cards, loaded when the viewer first has a comment: most viewers never do. */
const CommentHeads = lazyCode(async () => {
  const module = await import('#components/comments/comment-heads.js');
  return { default: module.CommentHeads };
});

const ViewerCommentsContext = createContext<ViewerCommentsValue | undefined>(undefined);

const pinId = String;

const noComments: readonly AnnotationComment[] = [];

const scopedComments = (
  annotations: MessageAnnotations | undefined,
  scope: ViewerScope,
): readonly AnnotationComment[] => {
  if (!annotations || annotations.comments.length === 0) {
    return noComments;
  }
  const shown = new Set(
    annotations.images
      .filter(
        ({ view }) =>
          view?.path === scope.entryPath && view.kernelView === scope.kernelView && view.instance === scope.instance,
      )
      .map(({ id }) => id),
  );
  return annotations.comments.filter(
    (comment) => comment.model !== undefined && comment.image !== undefined && shown.has(comment.image),
  );
};

/** The camera as the annotations record keeps it: plain JSON. */
const cameraRecord = (pick: CommentSurfacePick): AnnotationCamera => structuredClone(pick.camera) as AnnotationCamera;

/** A surface pick as a pin's placement: where, what the viewer showed, and the picture it would take. */
const placementOf = (pick: CommentSurfacePick, graphicsRef: GraphicsActorRef, scope: ViewerScope): PinPlacement => {
  const [width, height] = pinPictureSize(pick.camera.aspect);
  return {
    point: [...pick.point],
    normal: [...pick.normal],
    ...(pick.componentId === undefined
      ? {}
      : { part: { componentId: pick.componentId, label: pick.componentLabel ?? '' } }),
    camera: cameraRecord(pick),
    scene: {
      path: scope.entryPath,
      ...(scope.kernelView === undefined ? {} : { kernelView: scope.kernelView }),
      ...(scope.instance === undefined ? {} : { instance: scope.instance }),
      revision: pick.geometryKey,
      scene: presentedSceneHash(graphicsRef),
    },
    size: { width, height },
    newImageId: randomUuid(),
  };
};

type ViewerCommentsProps = ViewerScope &
  Readonly<{
    /** Comment pins are offered here: the editor's own viewer, not a shared one. */
    isOffered: boolean;
    /** The pane's own rendering, as the capture control takes it. */
    captureRendering?: () => Promise<Rendering>;
    children: React.ReactNode;
  }>;

/**
 * Gives the viewer under it the draft's comment pins and the Comment tool, when the feature is on and a composer is
 * there to hold them. It stays mounted either way, so the viewer never remounts when the feature arrives.
 *
 * @param props - What the viewer shows, and the viewer.
 * @returns The viewer, with its comments.
 */
export function ViewerComments({
  entryPath,
  kernelView,
  instance,
  isOffered,
  captureRendering,
  children,
}: ViewerCommentsProps): React.JSX.Element {
  const isFlagOn = useFeatureState('commentPins') === 'on';
  const composer = useOptionalChatComposer();
  const draftRef = composer?.draftActorRef;
  /*
   * One set of numbers at a time (charter D18). An open edit's pins come first, then a sent message's the person asked
   * to see, then the new message's own. Only the last can be changed from the viewer.
   */
  const isEditing = useSelector(draftRef, (state) => state?.context.activeEditMessageId !== undefined);
  const draft = useSelector(draftRef, (state) => state?.context.draftAnnotations);
  const edited = useSelector(draftRef, (state) => state?.context.editDraftAnnotations);
  const shownComments = useShownComments();
  const shown = isEditing ? undefined : shownComments?.shown;
  const hideShown = shownComments?.hide;
  const annotations = isEditing ? edited : (shown?.annotations ?? draft);
  const isReadOnly = isEditing || shown !== undefined;
  const attachments = useSelector(draftRef, (state) => state?.context.draftAttachments);
  const graphicsRef = useOptionalGraphics();
  const cadRef = useCad();
  const { projectRef } = useProject();
  const imageService = useOptionalHeadlessImageService();
  const [openNumber, setOpenNumber] = useState<number>();
  const [movingNumber, setMovingNumber] = useState<number>();
  const model = composer ? attachmentModelForExecution(composer.execution.execution, composer.model.model) : undefined;
  const isEnabled =
    isOffered &&
    isFlagOn &&
    draftRef !== undefined &&
    graphicsRef !== undefined &&
    cadRef !== undefined &&
    imageService !== undefined &&
    entryPath !== '';

  const scope = useMemo(() => ({ entryPath, kernelView, instance }), [entryPath, instance, kernelView]);
  const comments = useMemo(() => scopedComments(annotations, scope), [annotations, scope]);
  const geometryKey = useOptionalGraphicsSelector(selectPresentedGeometryKey, '');
  const outdated = useMemo(
    () => outdatedComments(annotations, comments, geometryKey),
    [annotations, comments, geometryKey],
  );

  /*
   * Showing a sent message's comments never turns the camera. Only when one of its pins is out of the frame is the
   * model fitted, which keeps the direction the person is looking from. It runs in the person's click on Show.
   */
  const reveal = useCallback(
    (next: MessageAnnotations): void => {
      const camera = graphicsRef && !isEditing ? getGraphicsCameraState(graphicsRef) : undefined;
      if (
        graphicsRef &&
        camera &&
        isAnyPinOutOfFrame(structuredClone(camera) as AnnotationCamera, scopedComments(next, scope))
      ) {
        graphicsRef.send({ type: 'fitView' });
      }
    },
    [graphicsRef, isEditing, scope],
  );
  const addViewer = shownComments?.addViewer;
  useEffect(() => addViewer?.(reveal), [addViewer, reveal]);
  const pins = useMemo<readonly ViewerCommentPin[]>(
    () =>
      comments.flatMap((comment) =>
        comment.model
          ? [
              {
                id: pinId(comment.number),
                number: comment.number,
                point: comment.model.point,
                normal: comment.model.normal ?? [0, 0, 1],
              },
            ]
          : [],
      ),
    [comments],
  );

  const takePicture = useCallback(
    async (imageId: string, pick: CommentSurfacePick): Promise<void> => {
      if (!cadRef || !graphicsRef || !imageService || !draftRef || !model) {
        return;
      }
      const claimId = randomUuid();
      projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath });
      try {
        const { files } = await captureCadImages({
          cadRef,
          graphicsRef,
          imageService,
          recipe: { purpose: 'pin', mode: 'current' },
          cameraState: pick.camera,
          captureRendering,
        });
        draftRef.send({
          type: 'addDraftAttachment',
          dataUrl: captureFilesToDataUrls(files)[0]!,
          preserveOriginal: true,
          model,
          annotationImageId: imageId,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't take the comment's picture");
      } finally {
        projectRef.send({ type: 'releaseGeometryUnit', claimId });
      }
    },
    [cadRef, captureRendering, draftRef, entryPath, graphicsRef, imageService, model, projectRef],
  );

  /** Drops the draft's tiles for pictures the record no longer has, the highest index first so none shifts. */
  const dropTiles = useCallback(
    (urls: readonly string[]): void => {
      const indices = urls
        .map((url) => (attachments ?? []).findIndex((attachment) => attachmentUrl(attachment) === url))
        .filter((index) => index !== -1)
        .toSorted((a, b) => b - a);
      for (const index of indices) {
        draftRef?.send({ type: 'removeDraftAttachment', index });
      }
    },
    [attachments, draftRef],
  );

  const move = useCallback(
    (number: number, pick: CommentSurfacePick): void => {
      if (!draftRef || !graphicsRef || !draft || isReadOnly) {
        return;
      }
      const moved = movePin(draft, number, placementOf(pick, graphicsRef, scope));
      if (!moved) {
        return;
      }
      if (moved.annotations.images.length > annotationLimits.images) {
        toast.error(`A message holds up to ${annotationLimits.images} commented pictures. Move from an earlier view.`);
        return;
      }
      // Tiles go first: removing a tile drops its image, and the record set next has none of the dropped ones.
      dropTiles([
        ...moved.orphanedAttachments,
        ...(moved.retakenAttachment === undefined ? [] : [moved.retakenAttachment]),
      ]);
      draftRef.send({ type: 'setDraftAnnotations', annotations: moved.annotations });
      if (moved.needsPicture) {
        void takePicture(moved.imageId, pick);
      }
    },
    [draft, draftRef, dropTiles, graphicsRef, isReadOnly, scope, takePicture],
  );

  const startMove = useCallback(
    (number: number): void => {
      if (!graphicsRef || isReadOnly) {
        return;
      }
      setOpenNumber(undefined);
      setMovingNumber(number);
      // The next click on the model is the pin's new place, so the Comment tool takes it.
      graphicsRef.send({ type: 'setCommentActive', payload: true });
    },
    [graphicsRef, isReadOnly],
  );

  const handlePlace = useCallback(
    (pick: CommentSurfacePick): void => {
      // An edit's pins are shown, not changed, from the viewer: the edit closes when the person turns to it.
      if (!draftRef || !graphicsRef || isEditing) {
        return;
      }
      // Pinning again ends the look at an earlier message's comments: the new pin joins the new message.
      hideShown?.();
      if ((draft?.comments.length ?? 0) >= annotationLimits.comments) {
        toast.error(`A message holds up to ${annotationLimits.comments} comments.`);
        return;
      }
      if (movingNumber !== undefined) {
        setMovingNumber(undefined);
        move(movingNumber, pick);
        return;
      }
      const placed = placePin(draft, placementOf(pick, graphicsRef, scope));
      if (placed.annotations.images.length > annotationLimits.images) {
        toast.error(`A message holds up to ${annotationLimits.images} commented pictures. Pin from an earlier view.`);
        return;
      }
      // A retaken picture's old tile goes first: removing a tile drops its image, and the record set next has none.
      const retakenIndex =
        placed.retakenAttachment === undefined
          ? -1
          : (attachments ?? []).findIndex((attachment) => attachmentUrl(attachment) === placed.retakenAttachment);
      if (retakenIndex !== -1) {
        draftRef.send({ type: 'removeDraftAttachment', index: retakenIndex });
      }
      draftRef.send({
        type: 'setDraftAnnotations',
        annotations: placed.annotations,
      });
      setOpenNumber(placed.number);
      if (placed.needsPicture) {
        void takePicture(placed.imageId, pick);
      }
    },
    [attachments, draft, draftRef, graphicsRef, hideShown, isEditing, move, movingNumber, scope, takePicture],
  );

  const remove = useCallback(
    (number: number): void => {
      if (!draftRef || !draft || isReadOnly) {
        return;
      }
      const removed = removeComments(draft, (comment) => comment.number === number);
      draftRef.send({
        type: 'setDraftAnnotations',
        annotations: removed.annotations,
      });
      // A picture taken only for this pin leaves the draft with it. One removal moves no other picture's index.
      for (const url of removed.orphanedAttachments) {
        const index = (attachments ?? []).findIndex((attachment) => attachmentUrl(attachment) === url);
        if (index !== -1) {
          draftRef.send({ type: 'removeDraftAttachment', index });
        }
      }
      setOpenNumber((current) => (current === number ? undefined : current));
    },
    [attachments, draft, draftRef, isReadOnly],
  );

  const close = useCallback((): void => {
    const comment = comments.find(({ number }) => number === openNumber);
    if (!isReadOnly && comment?.text.trim() === '') {
      remove(comment.number);
    }
    setOpenNumber(undefined);
  }, [comments, isReadOnly, openNumber, remove]);

  const setText = useCallback(
    (number: number, text: string): void => {
      if (draftRef && draft && !isReadOnly) {
        draftRef.send({
          type: 'setDraftAnnotations',
          annotations: setCommentText(draft, number, text),
        });
      }
    },
    [draft, draftRef, isReadOnly],
  );

  // A move started from a card ends at the next click: on nothing, or Escape, the pin stays where it was.
  useEffect(() => {
    if (movingNumber === undefined) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMovingNumber(undefined);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, [movingNumber]);
  const cancelMove = useCallback((): void => {
    setMovingNumber(undefined);
  }, []);

  const host = useMemo<CommentPinsHost | undefined>(
    () => (isEnabled ? { pins, onPlace: handlePlace, onMiss: cancelMove } : undefined),
    [cancelMove, handlePlace, isEnabled, pins],
  );
  const value = useMemo<ViewerCommentsValue | undefined>(
    () =>
      isEnabled
        ? {
            comments,
            openNumber,
            open: setOpenNumber,
            close,
            setText,
            remove,
            move,
            movingNumber,
            startMove,
            isReadOnly,
            hideShown: shown === undefined ? undefined : hideShown,
            outdated,
          }
        : undefined,
    [
      close,
      comments,
      hideShown,
      isEnabled,
      isReadOnly,
      move,
      movingNumber,
      openNumber,
      outdated,
      remove,
      setText,
      shown,
      startMove,
    ],
  );

  return (
    <ViewerCommentsContext.Provider value={value}>
      <CommentPinsProvider host={host}>{children}</CommentPinsProvider>
    </ViewerCommentsContext.Provider>
  );
}

/**
 * The numbered heads of the viewer's pins and the open comment's card. It goes inside the viewer's stage, over the
 * canvas; the scene moves each head as the camera moves.
 *
 * @returns The heads, or nothing when the viewer has no comments.
 */
export function ViewerCommentHeads(): React.JSX.Element | undefined {
  const value = useContext(ViewerCommentsContext);
  const pins = useCommentPins();
  if (!value || !pins || value.comments.length === 0) {
    return undefined;
  }
  return (
    <Suspense fallback={null}>
      <CommentHeads value={value} heads={pins.heads} />
    </Suspense>
  );
}
