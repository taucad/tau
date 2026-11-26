import { emptyAnnotations } from '@taucad/chat/annotations';
import type {
  AnnotatedImage,
  AnnotationCamera,
  AnnotationComment,
  AnnotationVec3,
  AnnotationView,
  MessageAnnotations,
} from '@taucad/chat/annotations';
import { angleBetweenViews, isSameCamera, projectToImage } from '#components/comments/image-projection.js';

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
  /** The stored picture this pin's picture takes the place of, after a small orbit: the draft drops it. */
  retakenAttachment?: string;
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

/** The most a view may turn for its pins' picture to be taken again, in degrees (charter D4). */
const retakeAngle = 20;

/** Whether a pin is seen from a camera: inside the frame, on a surface that faces it. */
const isSeenFrom = (camera: AnnotationCamera, comment: AnnotationComment): boolean => {
  if (comment.model === undefined) {
    return false;
  }
  const { point, normal } = comment.model;
  const projected = projectToImage(camera, point);
  if (projected === undefined || projected.at.some((fraction) => fraction < 0 || fraction > 1)) {
    return false;
  }
  if (normal === undefined) {
    return true;
  }
  // A perspective camera sees the point from where it stands; an orthographic one sees every point along one direction.
  const seenFrom = camera.projection.kind === 'perspective' ? point : camera.target;
  const toward: AnnotationVec3 = [
    camera.position[0] - seenFrom[0],
    camera.position[1] - seenFrom[1],
    camera.position[2] - seenFrom[2],
  ];
  return normal[0] * toward[0] + normal[1] * toward[1] + normal[2] * toward[2] > 0;
};

/**
 * The picture a pin placed after a small orbit is taken with again: the newest picture taken only for pins on the
 * same scene, when the view has turned less than {@link retakeAngle} and every pin on it is still seen (charter D4).
 */
const retakenImage = (current: MessageAnnotations, placement: PinPlacement): AnnotatedImage | undefined => {
  const newest = current.images.findLast((image) => image.forPin === true);
  if (
    newest?.view === undefined ||
    newest.marks.length > 0 ||
    !isSameScene(newest.view, placement.scene) ||
    angleBetweenViews(newest.view.camera, placement.camera) >= retakeAngle
  ) {
    return undefined;
  }
  const pinned = current.comments.filter((comment) => comment.image === newest.id);
  return pinned.every((comment) => isSeenFrom(placement.camera, comment)) ? newest : undefined;
};

/**
 * Places a pin: a new comment, on the picture another pin already has when both were placed from the same camera on
 * the same scene. After a small orbit the newest pin picture is taken again from the new camera and keeps its pins;
 * otherwise the pin gets a new picture.
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
  const retaken = shared === undefined ? retakenImage(current, placement) : undefined;
  const image: AnnotatedImage = shared ?? {
    // A retaken picture is a new image, so a picture still on its way for the old one finds no image and is dropped.
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
  // A picture comment has no image id of its own to compare, so the retaken id is checked first.
  const retakenId = retaken?.id;
  const carried = current.comments.map((existing) =>
    retakenId !== undefined && existing.image === retakenId ? { ...existing, image: image.id } : existing,
  );
  const images = current.images.filter((existing) => existing.id !== retakenId);
  return {
    annotations: {
      ...current,
      comments: [...carried, comment],
      images: shared ? images : [...images, image],
      nextNumber: number + 1,
    },
    number,
    imageId: image.id,
    needsPicture: shared === undefined,
    ...(retaken?.attachment === undefined ? {} : { retakenAttachment: retaken.attachment }),
  };
}

/** The record after a pin was moved. */
export type MovedPin = Omit<PlacedPin, 'number'> &
  Readonly<{
    /** The pin pictures nothing is pinned on any more: the draft drops them. */
    orphanedAttachments: readonly string[];
  }>;

/**
 * Moves a draft pin to another surface point, keeping its number and words (charter D14). Its picture follows D4: the
 * same picture when the camera and scene have not changed since it was taken, otherwise the pin is placed again from
 * the current view, and a picture it leaves with nothing else on it goes.
 *
 * @param annotations - The draft's record.
 * @param number - The pin to move.
 * @param placement - The new surface, the camera and what the viewer showed.
 * @returns The next record and the pin's picture, or `undefined` when there is no such pin.
 */
export function movePin(
  annotations: MessageAnnotations,
  number: number,
  placement: PinPlacement,
): MovedPin | undefined {
  const moving = annotations.comments.find((comment) => comment.number === number);
  if (moving?.model === undefined) {
    return undefined;
  }
  const model = {
    point: placement.point,
    normal: placement.normal,
    ...(placement.part ? { part: placement.part } : {}),
  };
  const current = annotations.images.find((image) => image.id === moving.image);
  if (
    current?.view !== undefined &&
    isSameScene(current.view, placement.scene) &&
    isSameCamera(current.view.camera, placement.camera)
  ) {
    return {
      annotations: {
        ...annotations,
        comments: annotations.comments.map((comment) => (comment.number === number ? { ...comment, model } : comment)),
      },
      imageId: current.id,
      needsPicture: false,
      orphanedAttachments: [],
    };
  }
  const { annotations: without, orphanedAttachments } = removeComments(
    annotations,
    (comment) => comment.number === number,
  );
  const placed = placePin(without, placement);
  return {
    annotations: {
      ...placed.annotations,
      // The moved pin keeps its number and words, so the counter does not advance.
      comments: placed.annotations.comments
        .map((comment) => (comment.number === placed.number ? { ...comment, number, text: moving.text } : comment))
        .toSorted((a, b) => a.number - b.number),
      nextNumber: nextCommentNumber(annotations),
    },
    imageId: placed.imageId,
    needsPicture: placed.needsPicture,
    orphanedAttachments,
    ...(placed.retakenAttachment === undefined ? {} : { retakenAttachment: placed.retakenAttachment }),
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

/**
 * The comments whose model has changed since their picture was taken (charter I5): the picture's revision is not the
 * geometry on screen. Nothing is outdated before any geometry is presented.
 *
 * @param annotations - The message's annotations, for each picture's revision.
 * @param comments - The comments shown in this viewer.
 * @param geometryKey - The key of the geometry on screen, empty when there is none.
 * @returns The numbers of the outdated comments.
 */
export function outdatedComments(
  annotations: MessageAnnotations | undefined,
  comments: readonly AnnotationComment[],
  geometryKey: string,
): ReadonlySet<number> {
  if (geometryKey === '') {
    return new Set();
  }
  const revisions = new Map(annotations?.images.map((image) => [image.id, image.view?.revision]));
  return new Set(
    comments
      .filter((comment) => {
        const revision = comment.image === undefined ? undefined : revisions.get(comment.image);
        return revision !== undefined && revision !== geometryKey;
      })
      .map(({ number }) => number),
  );
}

/**
 * Whether any pinned comment is out of the camera's frame, behind it or beside it. A comment on a picture alone has no
 * model point and never asks for a fit.
 *
 * @param camera - The viewer's camera.
 * @param comments - The comments shown in this viewer.
 * @returns `true` when the model should be fitted to bring every pin into view.
 */
export const isAnyPinOutOfFrame = (camera: AnnotationCamera, comments: readonly AnnotationComment[]): boolean =>
  comments.some((comment) => {
    if (!comment.model) {
      return false;
    }
    const projected = projectToImage(camera, comment.model.point);
    return projected === undefined || projected.at.some((fraction) => fraction < 0 || fraction > 1);
  });
