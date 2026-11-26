import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { Rendering } from '@taucad/runtime';
import { annotationLimits } from '@taucad/chat/annotations';
import type { AnnotationCamera, AnnotationComment, MessageAnnotations } from '@taucad/chat/annotations';
import { attachmentUrl } from '@taucad/chat-ui/utils/attachment.utils';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverAnchor, PopoverContent } from '@taucad/ui/components/popover';
import { toast } from '@taucad/ui/components/sonner';
import { randomUuid } from '@taucad/utils/id';
import { CommentPinsProvider, useCommentPins } from '@taucad/viewer/cad/comment-pins';
import type { CommentPinsHost, CommentSurfacePick, ViewerCommentPin } from '@taucad/viewer/cad/comment-pins';
import { useOptionalGraphics } from '@taucad/viewer/hooks/use-graphics';
import { partLabelOf, placePin, removeComments, setCommentText } from '#components/comments/draft-comments.js';
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

/** Which model a viewer shows: a pin belongs to the viewer that shows the model it was placed on. */
type ViewerScope = Readonly<{
  entryPath: string;
  kernelView: string | undefined;
  instance: string | undefined;
}>;

type ViewerCommentsValue = Readonly<{
  /** The draft's comments pinned on this viewer's model. */
  comments: readonly AnnotationComment[];
  /** The comment whose card is open. */
  openNumber: number | undefined;
  open: (number: number) => void;
  /** Closes the open card; a comment left without words is removed with it. */
  close: () => void;
  setText: (number: number, text: string) => void;
  remove: (number: number) => void;
}>;

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
  const annotations = useSelector(draftRef, (state) => state?.context.draftAnnotations);
  const attachments = useSelector(draftRef, (state) => state?.context.draftAttachments);
  const graphicsRef = useOptionalGraphics();
  const cadRef = useCad();
  const { projectRef } = useProject();
  const imageService = useOptionalHeadlessImageService();
  const [openNumber, setOpenNumber] = useState<number>();
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

  const handlePlace = useCallback(
    (pick: CommentSurfacePick): void => {
      if (!draftRef || !graphicsRef) {
        return;
      }
      if ((annotations?.comments.length ?? 0) >= annotationLimits.comments) {
        toast.error(`A message holds up to ${annotationLimits.comments} comments.`);
        return;
      }
      const [width, height] = pinPictureSize(pick.camera.aspect);
      const placed = placePin(annotations, {
        point: [...pick.point],
        normal: [...pick.normal],
        ...(pick.componentId === undefined
          ? {}
          : {
              part: {
                componentId: pick.componentId,
                label: pick.componentLabel ?? '',
              },
            }),
        camera: cameraRecord(pick),
        scene: {
          path: entryPath,
          ...(kernelView === undefined ? {} : { kernelView }),
          ...(instance === undefined ? {} : { instance }),
          revision: pick.geometryKey,
          scene: presentedSceneHash(graphicsRef),
        },
        size: { width, height },
        newImageId: randomUuid(),
      });
      if (placed.annotations.images.length > annotationLimits.images) {
        toast.error(`A message holds up to ${annotationLimits.images} commented pictures. Pin from an earlier view.`);
        return;
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
    [annotations, draftRef, entryPath, graphicsRef, instance, kernelView, takePicture],
  );

  const remove = useCallback(
    (number: number): void => {
      if (!draftRef || !annotations) {
        return;
      }
      const removed = removeComments(annotations, (comment) => comment.number === number);
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
    [annotations, attachments, draftRef],
  );

  const close = useCallback((): void => {
    const comment = comments.find(({ number }) => number === openNumber);
    if (comment?.text.trim() === '') {
      remove(comment.number);
    }
    setOpenNumber(undefined);
  }, [comments, openNumber, remove]);

  const setText = useCallback(
    (number: number, text: string): void => {
      if (draftRef && annotations) {
        draftRef.send({
          type: 'setDraftAnnotations',
          annotations: setCommentText(annotations, number, text),
        });
      }
    },
    [annotations, draftRef],
  );

  const host = useMemo<CommentPinsHost | undefined>(
    () => (isEnabled ? { pins, onPlace: handlePlace } : undefined),
    [handlePlace, isEnabled, pins],
  );
  const value = useMemo<ViewerCommentsValue | undefined>(
    () => (isEnabled ? { comments, openNumber, open: setOpenNumber, close, setText, remove } : undefined),
    [close, comments, isEnabled, openNumber, remove, setText],
  );

  return (
    <ViewerCommentsContext.Provider value={value}>
      <CommentPinsProvider host={host}>{children}</CommentPinsProvider>
    </ViewerCommentsContext.Provider>
  );
}

const headClass =
  'pointer-events-auto absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border-2 border-white bg-markup-ink text-xs font-semibold text-white shadow-sm outline-none focus-visible:focus-outline data-[occluded=true]:opacity-40';

function CommentCard({
  comment,
  onText,
  onRemove,
  onDone,
}: {
  readonly comment: AnnotationComment;
  readonly onText: (text: string) => void;
  readonly onRemove: () => void;
  readonly onDone: () => void;
}): React.JSX.Element {
  return (
    <div className='flex flex-col gap-2' data-comment-ui=''>
      <div className='flex items-center gap-2'>
        <span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-markup-ink text-xs font-semibold text-white'>
          {comment.number}
        </span>
        <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>
          {partLabelOf(comment) ?? 'Comment'}
        </span>
        <Button variant='ghost' size='sm' onClick={onRemove}>
          Remove
        </Button>
      </div>
      <textarea
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the card opens from the person's own click, to be typed in.
        autoFocus
        rows={3}
        maxLength={annotationLimits.commentCharacters}
        value={comment.text}
        aria-label={`Comment ${comment.number}`}
        placeholder='What should change here?'
        className='w-full resize-none rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:focus-outline'
        onChange={(event) => {
          onText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onDone();
          }
        }}
      />
      <p className='text-xs text-muted-foreground'>Sent with your next message. Enter to finish.</p>
    </div>
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
  const { comments, openNumber, open, close, setText, remove } = value;
  return (
    <div className='pointer-events-none absolute inset-0 z-10' data-comment-ui=''>
      {comments.map((comment) => {
        const id = pinId(comment.number);
        const isOpen = comment.number === openNumber;
        const head = (
          <button
            ref={(element) => {
              pins.heads.register(id, element ?? undefined);
            }}
            type='button'
            data-comment-ui=''
            aria-label={`Comment ${comment.number}${comment.text ? `: ${comment.text}` : ''}`}
            aria-expanded={isOpen}
            className={headClass}
            style={{ visibility: 'hidden' }}
            onClick={() => {
              if (isOpen) {
                close();
              } else {
                open(comment.number);
              }
            }}
          >
            {comment.number}
          </button>
        );
        return (
          <Popover
            key={id}
            open={isOpen}
            onOpenChange={(next) => {
              if (!next && isOpen) {
                close();
              }
            }}
          >
            <PopoverAnchor asChild>{head}</PopoverAnchor>
            <PopoverContent side='right' align='start' className='w-72 p-3' updatePositionStrategy='always'>
              <CommentCard
                comment={comment}
                onText={(text) => {
                  setText(comment.number, text);
                }}
                onRemove={() => {
                  remove(comment.number);
                }}
                onDone={close}
              />
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
