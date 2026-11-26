import { annotationLimits, messageAnnotationsSchema } from '#annotations/annotations.schema.js';
import type { AnnotatedImage, MessageAnnotations } from '#annotations/annotations.schema.js';

/** An empty record: what a draft starts from. @public */
export const emptyAnnotations: MessageAnnotations = { version: 1, comments: [], images: [] };

/**
 * The annotations a message's metadata carries.
 *
 * @param metadata - A message's metadata, of any provenance.
 * @returns The valid record, or `undefined` when there is none or it does not parse: a record this build cannot read
 * is dropped, never repaired.
 * @public
 */
export function annotationsOf(metadata: unknown): MessageAnnotations | undefined {
  if (typeof metadata !== 'object' || metadata === null || !('annotations' in metadata)) {
    return undefined;
  }
  const parsed = messageAnnotationsSchema.safeParse(metadata.annotations);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Whether a record says anything: a comment, a mark, or an image whose view is worth keeping.
 *
 * @param annotations - The record.
 * @returns `false` for a record a message does not need to carry.
 * @public
 */
export const hasAnnotations = (annotations: MessageAnnotations | undefined): annotations is MessageAnnotations =>
  annotations !== undefined && (annotations.comments.length > 0 || annotations.images.length > 0);

/**
 * Metadata with its annotations set or removed: the one way a message that is built or rebuilt carries them.
 *
 * @param metadata - The metadata being built.
 * @param annotations - The record; an empty or absent one removes the field.
 * @returns The metadata, with `annotations` present exactly when the record says something.
 * @public
 */
export function withAnnotations<Metadata extends object>(
  metadata: Metadata,
  annotations: MessageAnnotations | undefined,
): Metadata & { annotations?: MessageAnnotations } {
  const { annotations: _dropped, ...rest } = metadata as Metadata & { annotations?: unknown };
  return (hasAnnotations(annotations) ? { ...rest, annotations } : rest) as Metadata & {
    annotations?: MessageAnnotations;
  };
}

/** Which limit a record breaks. @public */
export type AnnotationLimit = keyof typeof annotationLimits;

const byteLength = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * The first limit a record breaks.
 *
 * @param annotations - The record a draft transition is about to store.
 * @returns The broken limit, or `undefined` when the record is within every limit.
 * @public
 */
export function brokenAnnotationLimit(annotations: MessageAnnotations): AnnotationLimit | undefined {
  if (annotations.comments.length > annotationLimits.comments) {
    return 'comments';
  }
  if (annotations.comments.some((comment) => comment.text.length > annotationLimits.commentCharacters)) {
    return 'commentCharacters';
  }
  if (annotations.images.length > annotationLimits.images) {
    return 'images';
  }
  if (annotations.images.some((image) => image.marks.length > annotationLimits.marksPerImage)) {
    return 'marksPerImage';
  }
  let penPoints = 0;
  for (const image of annotations.images) {
    for (const mark of image.marks) {
      if (mark.kind !== 'pen') {
        continue;
      }
      if (mark.points.length > annotationLimits.penPoints) {
        return 'penPoints';
      }
      penPoints += mark.points.length;
    }
  }
  if (penPoints > annotationLimits.penPointsPerMessage) {
    return 'penPointsPerMessage';
  }
  return byteLength(annotations) > annotationLimits.bytes ? 'bytes' : undefined;
}

/**
 * The annotated image of an image part.
 *
 * @param annotations - The message's record.
 * @param url - The image part's URL.
 * @returns Its entry, when the part is annotated.
 * @public
 */
export const annotatedImageOf = (
  annotations: MessageAnnotations | undefined,
  url: string,
): AnnotatedImage | undefined => annotations?.images.find((image) => image.attachment === url);
