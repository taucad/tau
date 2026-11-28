import { annotationLimits, emptyAnnotations } from '@taucad/chat/annotations';
import type {
  AnnotatedImage,
  AnnotationComment,
  AnnotationMark,
  AnnotationVec2,
  MessageAnnotations,
} from '@taucad/chat/annotations';
import { nextCommentNumber } from '#components/comments/draft-comments.js';

/*
 * The 2D rules of mark up (charter W5, D23): drawing a mark, grabbing and moving one, and the record changes a mark up
 * session makes to the draft. Points are fractions of the image from its top left; distances the person feels (a
 * grab, a drag's start) are in image pixels, scaled from screen pixels by the caller.
 */

/** A drawing tool. */
export type MarkTool = AnnotationMark['kind'];

/** Which part of a mark a press took: all of it, or one end of an arrow or a line. */
export type MarkGrip = 'all' | 'from' | 'to';

/** The least travel, in image pixels, that adds a point to a pen stroke. */
const penStep = 3;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * A point kept on the image.
 *
 * @param point - Any point, in image fractions.
 * @returns The nearest point on the image.
 */
export const clampToImage = (point: AnnotationVec2): AnnotationVec2 => [clamp01(point[0]), clamp01(point[1])];

/**
 * A new mark as the press that starts it puts it down.
 *
 * @param tool - The drawing tool.
 * @param at - Where the press went down.
 * @returns The mark, as long as a point.
 */
export function startMark(tool: MarkTool, at: AnnotationVec2): AnnotationMark {
  if (tool === 'pen') {
    return { kind: 'pen', points: [at, at] };
  }
  if (tool === 'arrow' || tool === 'line') {
    return { kind: tool, from: { at }, to: { at } };
  }
  return { kind: tool, from: at, to: at };
}

/**
 * The mark being drawn, after the pointer moved on.
 *
 * @param mark - The mark so far.
 * @param at - Where the pointer is.
 * @param size - The image's size in pixels.
 * @returns The mark, reaching the pointer.
 */
export function extendMark(
  mark: AnnotationMark,
  at: AnnotationVec2,
  size: { width: number; height: number },
): AnnotationMark {
  if (mark.kind === 'pen') {
    const last = mark.points.at(-1)!;
    // A point closer than a pen width to the last adds nothing the eye can see.
    if (Math.hypot((at[0] - last[0]) * size.width, (at[1] - last[1]) * size.height) < penStep) {
      return mark;
    }
    const points = [...mark.points, at];
    // A long stroke is thinned, every other point, rather than cut short or refused.
    return {
      ...mark,
      points:
        points.length > annotationLimits.penPoints
          ? points.filter((_, index) => index % 2 === 0 || index === points.length - 1)
          : points,
    };
  }
  if (mark.kind === 'arrow' || mark.kind === 'line') {
    return { ...mark, to: { at } };
  }
  return { ...mark, to: at };
}

/**
 * How far a mark reaches, in image pixels: a mark shorter than a few pixels is a slip, not a mark.
 *
 * @param mark - The mark.
 * @param size - The image's size in pixels.
 * @returns Its reach.
 */
export function markSpan(mark: AnnotationMark, size: { width: number; height: number }): number {
  const distance = (a: AnnotationVec2, b: AnnotationVec2): number =>
    Math.hypot((b[0] - a[0]) * size.width, (b[1] - a[1]) * size.height);
  if (mark.kind === 'pen') {
    const first = mark.points[0]!;
    return Math.max(...mark.points.map((point) => distance(first, point)));
  }
  if (mark.kind === 'arrow' || mark.kind === 'line') {
    return distance(mark.from.at, mark.to.at);
  }
  return distance(mark.from, mark.to);
}

const shift = (point: AnnotationVec2, delta: AnnotationVec2): AnnotationVec2 =>
  clampToImage([point[0] + delta[0], point[1] + delta[1]]);

/**
 * A mark moved by a drag (D23): all of it, or one end of an arrow or a line. An end that moves loses the part it
 * touched; S6 lifts it again on drop.
 *
 * @param mark - The mark.
 * @param grip - What the press took.
 * @param delta - How far the pointer travelled, in image fractions.
 * @returns The moved mark, kept on the image.
 */
export function shiftMark(mark: AnnotationMark, grip: MarkGrip, delta: AnnotationVec2): AnnotationMark {
  if (mark.kind === 'pen') {
    return { ...mark, points: mark.points.map((point) => shift(point, delta)) };
  }
  if (mark.kind === 'arrow' || mark.kind === 'line') {
    return {
      ...mark,
      from: grip === 'to' ? mark.from : { at: shift(mark.from.at, delta) },
      to: grip === 'from' ? mark.to : { at: shift(mark.to.at, delta) },
    };
  }
  return { ...mark, from: shift(mark.from, delta), to: shift(mark.to, delta) };
}

type Pixel = readonly [number, number];

const toSegment = (point: Pixel, a: Pixel, b: Pixel): number => {
  const length = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t =
    length === 0 ? 0 : clamp01(((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length);
  return Math.hypot(point[0] - (a[0] + t * (b[0] - a[0])), point[1] - (a[1] + t * (b[1] - a[1])));
};

/** Whether a point is within `slop` image pixels of a mark's ink. */
const isOnInk = (
  mark: AnnotationMark,
  point: Pixel,
  { px, slop }: { px: (at: AnnotationVec2) => Pixel; slop: number },
): boolean => {
  if (mark.kind === 'pen') {
    const points = mark.points.map(px);
    return points.some((current, index) => index > 0 && toSegment(point, points[index - 1]!, current) <= slop);
  }
  if (mark.kind === 'arrow' || mark.kind === 'line') {
    return toSegment(point, px(mark.from.at), px(mark.to.at)) <= slop;
  }
  const a = px(mark.from);
  const b = px(mark.to);
  if (mark.kind === 'rectangle') {
    const corners: Pixel[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
    return corners.some((corner, index) => toSegment(point, corner, corners[(index + 1) % 4]!) <= slop);
  }
  const rx = Math.abs(b[0] - a[0]) / 2;
  const ry = Math.abs(b[1] - a[1]) / 2;
  const radial = Math.hypot((point[0] - (a[0] + b[0]) / 2) / (rx || 1), (point[1] - (a[1] + b[1]) / 2) / (ry || 1));
  return Math.abs(radial - 1) * Math.min(rx, ry) <= slop;
};

/**
 * The topmost mark whose ink is within `slop` image pixels of a point, and what the press took (D23). Near an end of an
 * arrow or a line, that end alone.
 *
 * @param marks - The image's marks, oldest first.
 * @param at - The press, in image fractions.
 * @param reach - The image's size in pixels, and the grab distance in image pixels.
 * @returns The mark's index and grip, or `undefined` on clear image.
 */
export function grabMark(
  marks: readonly AnnotationMark[],
  at: AnnotationVec2,
  { size, slop }: { size: { width: number; height: number }; slop: number },
): { index: number; grip: MarkGrip } | undefined {
  const px = (value: AnnotationVec2): Pixel => [value[0] * size.width, value[1] * size.height];
  const point = px(at);
  for (let index = marks.length - 1; index >= 0; index--) {
    const mark = marks[index]!;
    if (mark.kind === 'arrow' || mark.kind === 'line') {
      const near = (end: AnnotationVec2): boolean => {
        const [x, y] = px(end);
        return Math.hypot(point[0] - x, point[1] - y) <= slop * 1.5;
      };
      if (near(mark.to.at)) {
        return { index, grip: 'to' };
      }
      if (near(mark.from.at)) {
        return { index, grip: 'from' };
      }
    }
    if (isOnInk(mark, point, { px, slop })) {
      return { index, grip: 'all' };
    }
  }
  return undefined;
}

/**
 * The record entry of the image a draft attachment is, if it has one.
 *
 * @param annotations - The draft's record.
 * @param url - The attachment's URL.
 * @returns The annotated image.
 */
export const annotatedImageOf = (
  annotations: MessageAnnotations | undefined,
  url: string,
): AnnotatedImage | undefined => annotations?.images.find((image) => image.attachment === url);

/**
 * The record with an image's marks set. An image with no entry gets one, named by its attachment.
 *
 * @param annotations - The draft's record.
 * @param image - The image, with its new marks; a new one has an id the caller chose.
 * @returns The next record.
 */
export function withImage(annotations: MessageAnnotations | undefined, image: AnnotatedImage): MessageAnnotations {
  const current = annotations ?? emptyAnnotations;
  const isKnown = current.images.some((existing) => existing.id === image.id);
  return {
    ...current,
    images: isKnown
      ? current.images.map((existing) => (existing.id === image.id ? image : existing))
      : [...current.images, image],
  };
}

/**
 * A comment pinned on a picture, not on the model: where it sits is a point of the image.
 *
 * @param annotations - The draft's record, which already has the image.
 * @param imageId - The image.
 * @param at - Where the pin sits.
 * @returns The next record and the new comment's number.
 */
export function addPictureComment(
  annotations: MessageAnnotations,
  imageId: string,
  at: AnnotationVec2,
): { annotations: MessageAnnotations; number: number } {
  const number = nextCommentNumber(annotations);
  const comment: AnnotationComment = { number, text: '', image: imageId, at: clampToImage(at) };
  return {
    annotations: { ...annotations, comments: [...annotations.comments, comment], nextNumber: number + 1 },
    number,
  };
}

/**
 * Moves a picture pin to another point of its image. A model pin is not moved in 2D: it stands on the model, and only
 * a lift (S6) can put it elsewhere.
 *
 * @param annotations - The draft's record.
 * @param number - The comment.
 * @param at - Its new place.
 * @returns The next record, or the same record when there is no such picture pin.
 */
export function movePictureComment(
  annotations: MessageAnnotations,
  number: number,
  at: AnnotationVec2,
): MessageAnnotations {
  return {
    ...annotations,
    comments: annotations.comments.map((comment) =>
      comment.number === number && comment.model === undefined ? { ...comment, at: clampToImage(at) } : comment,
    ),
  };
}

/** What a picture point lifts to on the model: the surface, and the part it is on. */
export type LiftedPoint = Readonly<{
  point: readonly [number, number, number];
  normal: readonly [number, number, number];
  componentId?: string;
  componentLabel?: string;
}>;

const partOf = (lifted: LiftedPoint): { componentId: string; label: string } | undefined =>
  lifted.componentId === undefined
    ? undefined
    : { componentId: lifted.componentId, label: lifted.componentLabel ?? '' };

/**
 * An arrow's or a line's ends, each lifted to the part it touches when a pane shows the picture's scene (D22). Other
 * marks are drawn shapes only, and an end over the background touches nothing.
 *
 * @param mark - The mark, just drawn or moved.
 * @param lift - Finds the surface under a picture point, or `undefined` when no pane can.
 * @returns The mark with its ends lifted afresh.
 */
export function liftMark(
  mark: AnnotationMark,
  lift: ((at: AnnotationVec2) => LiftedPoint | undefined) | undefined,
): AnnotationMark {
  if (mark.kind !== 'arrow' && mark.kind !== 'line') {
    return mark;
  }
  const end = (at: AnnotationVec2): (typeof mark)['from'] => {
    const lifted = lift?.(at);
    const part = lifted === undefined ? undefined : partOf(lifted);
    return {
      at,
      ...(lifted === undefined ? {} : { point: [...lifted.point] }),
      ...(part === undefined ? {} : { part }),
    };
  };
  return { ...mark, from: end(mark.from.at), to: end(mark.to.at) };
}

/**
 * A pin's anchor on the model, from a lifted picture point.
 *
 * @param lifted - The surface under the pin.
 * @returns The comment's `model`.
 */
export const modelAnchorOf = (lifted: LiftedPoint): NonNullable<AnnotationComment['model']> => {
  const part = partOf(lifted);
  return { point: [...lifted.point], normal: [...lifted.normal], ...(part === undefined ? {} : { part }) };
};
