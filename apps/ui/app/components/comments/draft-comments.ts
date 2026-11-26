import { emptyAnnotations } from '@taucad/chat/annotations';
import type {
  AnnotatedImage,
  AnnotationCamera,
  AnnotationComment,
  AnnotationVec3,
  AnnotationView,
  MessageAnnotations,
} from '@taucad/chat/annotations';
import { isSameCamera } from '#components/comments/image-projection.js';

/*
 * The draft's comments as pure steps over its annotations record. The draft machine stores the record
 * (`setDraftAnnotations`); these decide what the next record is.
 */

/** What the viewer showed when a pin was placed, without the camera. */
export type PinScene = Omit<AnnotationView, 'camera'>;

/** One pin being placed on the model. */
export type PinPlacement = Readonly<{
  point: AnnotationVec3;
  normal: AnnotationVec3;
  part?: { componentId: string; label: string };
  camera: AnnotationCamera;
  scene: PinScene;
  /** The size the pin's picture will be taken at, in pixels. */
  size: { width: number; height: number };
  /** The id a new picture takes, when the pin cannot share one. */
  newImageId: string;
}>;

/** The record after a pin was placed. */
export type PlacedPin = Readonly<{
  annotations: MessageAnnotations;
  number: number;
  /** The pin's picture. */
  imageId: string;
  /** Whether that picture is new and still has to be taken. */
  needsPicture: boolean;
}>;

/**
 * The number the next comment takes. A number is never given twice in a draft, even after its comment was removed
 * (charter I6).
 *
 * @param annotations - The draft's record.
 * @returns The next number.
 */
export const nextCommentNumber = (annotations: MessageAnnotations | undefined): number =>
  Math.max(annotations?.nextNumber ?? 1, 1 + Math.max(0, ...(annotations?.comments ?? []).map(({ number }) => number)));

const isSameScene = (a: AnnotationView, b: PinScene): boolean =>
  a.path === b.path &&
  a.kernelView === b.kernelView &&
  a.instance === b.instance &&
  a.revision === b.revision &&
  a.scene === b.scene;

/**
 * Places a pin: a new comment, on the picture another pin already has when both were placed from the same camera on
 * the same scene, else on a new picture.
 *
 * @param annotations - The draft's record.
 * @param placement - The surface, the camera and what the viewer showed.
 * @returns The next record, the comment's number and its picture.
 */
export function placePin(annotations: MessageAnnotations | undefined, placement: PinPlacement): PlacedPin {
  const current = annotations ?? emptyAnnotations;
  const number = nextCommentNumber(current);
  const shared = current.images.find(
    (image) =>
      image.forPin === true &&
      image.view !== undefined &&
      isSameScene(image.view, placement.scene) &&
      isSameCamera(image.view.camera, placement.camera),
  );
  const image: AnnotatedImage = shared ?? {
    id: placement.newImageId,
    width: placement.size.width,
    height: placement.size.height,
    view: { ...placement.scene, camera: placement.camera },
    forPin: true,
    marks: [],
  };
  const comment: AnnotationComment = {
    number,
    text: '',
    image: image.id,
    model: { point: placement.point, normal: placement.normal, ...(placement.part ? { part: placement.part } : {}) },
  };
  return {
    annotations: {
      ...current,
      comments: [...current.comments, comment],
      images: shared ? current.images : [...current.images, image],
      nextNumber: number + 1,
    },
    number,
    imageId: image.id,
    needsPicture: shared === undefined,
  };
}

/**
 * Sets a comment's words.
 *
 * @param annotations - The draft's record.
 * @param number - The comment.
 * @param text - Its words.
 * @returns The next record.
 */
export function setCommentText(annotations: MessageAnnotations, number: number, text: string): MessageAnnotations {
  return {
    ...annotations,
    comments: annotations.comments.map((comment) => (comment.number === number ? { ...comment, text } : comment)),
  };
}

/** A record without some comments, and the pictures that left with them. */
export type RemovedComments = Readonly<{
  annotations: MessageAnnotations;
  /** The attachment URLs of pin pictures no comment is pinned on any more: the draft drops them too. */
  orphanedAttachments: readonly string[];
}>;

/**
 * Removes comments. A picture taken only for pins goes with its last pin; an image the person attached stays.
 *
 * @param annotations - The record.
 * @param remove - Picks the comments to remove.
 * @returns The next record and the pictures to drop from the draft.
 */
export function removeComments(
  annotations: MessageAnnotations,
  remove: (comment: AnnotationComment) => boolean,
): RemovedComments {
  const comments = annotations.comments.filter((comment) => !remove(comment));
  const pinned = new Set(comments.map((comment) => comment.image));
  const isOrphan = (image: AnnotatedImage): boolean =>
    image.forPin === true && image.marks.length === 0 && !pinned.has(image.id);
  const orphans = annotations.images.filter((image) => isOrphan(image));
  return {
    annotations: { ...annotations, comments, images: annotations.images.filter((image) => !isOrphan(image)) },
    orphanedAttachments: orphans.flatMap((image) => (image.attachment === undefined ? [] : [image.attachment])),
  };
}

/**
 * The record a message is sent with: a comment without words says nothing, so it and a picture taken only for it stay
 * behind, and the draft-only counter is dropped.
 *
 * @param annotations - The draft's record.
 * @returns The record to send and the pictures to leave out of the message.
 */
export function sendableAnnotations(annotations: MessageAnnotations): RemovedComments {
  const { annotations: kept, orphanedAttachments } = removeComments(
    annotations,
    (comment) => comment.text.trim().length === 0,
  );
  const { nextNumber: _draftOnly, ...sent } = kept;
  return {
    annotations: {
      ...sent,
      comments: sent.comments.map((comment) => ({ ...comment, text: comment.text.trim() })),
      // A picture that never finished storing has no image part to stand on.
      images: sent.images.filter((image) => image.attachment !== undefined),
    },
    orphanedAttachments,
  };
}

/**
 * The part a comment is pinned on, when the model names it.
 *
 * @param comment - The comment.
 * @returns The part's label.
 */
export const partLabelOf = (comment: AnnotationComment): string | undefined => {
  const label = comment.model?.part?.label;
  return label === undefined || label === '' ? undefined : label;
};
