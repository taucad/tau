import type {
  AnnotatedImage,
  AnnotationComment,
  AnnotationMark,
  AnnotationVec2,
  AnnotationVec3,
} from '@taucad/chat/annotations';
import { projectToImage } from '#components/comments/image-projection.js';

/*
 * The one painter of mark-up: the flattened image the model reads and every preview a person sees draw through here,
 * so a pin's number, place and size are the same wherever it shows (charter I5).
 */

/**
 * The mark-up ink and its casing as a canvas needs them: the values of the `--markup-ink` token (charter D10). A
 * flattened image is read on any theme and by the model, so the painter keeps them fixed.
 */
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the canvas copy of the `--markup-ink` token.
export const markupInk = '#d6249f';
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the casing that keeps ink legible on any picture.
export const markupCasing = '#ffffff';

/** The stroke width of a mark on an image of this size, in image pixels. */
export const inkWidth = (width: number, height: number): number => Math.max(3, Math.max(width, height) * 0.004);
/** The radius of a pin's numbered head on an image of this size, in image pixels. */
export const pinRadius = (width: number, height: number): number => Math.max(11, Math.max(width, height) * 0.013);

/** A pin as drawn on an image, in fractions from its top left: the numbered head, and the foot it stands on. */
export type DrawnPin = { number: number; head: AnnotationVec2; foot?: AnnotationVec2 };

const add = (a: AnnotationVec3, b: AnnotationVec3): AnnotationVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: AnnotationVec3, factor: number): AnnotationVec3 => [a[0] * factor, a[1] * factor, a[2] * factor];

/**
 * The pins an image shows: each comment pinned on it, where the picture's own camera puts it.
 *
 * @param image - The annotated image.
 * @param comments - The message's comments.
 * @returns The image's pins, in comment order.
 */
export function pinsOnImage(image: AnnotatedImage, comments: readonly AnnotationComment[]): DrawnPin[] {
  const pins: DrawnPin[] = [];
  const stem = (pinRadius(image.width, image.height) * 2.4) / image.height;
  const aspect = image.width / image.height;
  for (const comment of comments) {
    if (comment.image !== image.id) {
      continue;
    }
    if (!comment.model || !image.view) {
      if (comment.at) {
        pins.push({ number: comment.number, head: comment.at });
      }
      continue;
    }
    const { camera } = image.view;
    const foot = projectToImage(camera, comment.model.point);
    if (!foot) {
      continue;
    }
    // The head: a fixed image distance from the foot, along the projected surface normal.
    const tip = projectToImage(
      camera,
      add(comment.model.point, scale(comment.model.normal ?? [0, 0, 1], foot.depth * 0.05)),
    );
    let direction: AnnotationVec2 = [0, -1];
    if (tip) {
      const dx = (tip.at[0] - foot.at[0]) * aspect;
      const dy = tip.at[1] - foot.at[1];
      const length = Math.hypot(dx, dy);
      if (length > 1e-4) {
        direction = [dx / length, dy / length];
      }
    }
    pins.push({
      number: comment.number,
      foot: foot.at,
      head: [foot.at[0] + (direction[0] * stem) / aspect, foot.at[1] + direction[1] * stem],
    });
  }
  return pins;
}

/** The two barbs of an arrow head at `to`. */
const arrowHead = (from: AnnotationVec2, to: AnnotationVec2, size: number): [AnnotationVec2, AnnotationVec2] => {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const barb = (offset: number): AnnotationVec2 => [
    to[0] - size * Math.cos(angle + offset),
    to[1] - size * Math.sin(angle + offset),
  ];
  return [barb(Math.PI / 7), barb(-Math.PI / 7)];
};

/** The part of a 2D canvas context the painter draws with: a page canvas and a worker canvas both have it. */
export type PainterContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'rect'
  | 'ellipse'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'fillText'
  | 'lineCap'
  | 'lineJoin'
  | 'lineWidth'
  | 'strokeStyle'
  | 'fillStyle'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>;

/**
 * Draws marks and pins over an image.
 *
 * @param context - A 2D context whose canvas is `size` pixels.
 * @param size - The canvas size in pixels.
 * @param drawn - The image's drawn marks and its pins ({@link pinsOnImage}).
 */
export function drawAnnotations(
  context: PainterContext,
  size: { width: number; height: number },
  drawn: { marks: readonly AnnotationMark[]; pins: readonly DrawnPin[] },
): void {
  const { width, height } = size;
  const { marks, pins } = drawn;
  const line = inkWidth(width, height);
  const px = (at: AnnotationVec2): AnnotationVec2 => [at[0] * width, at[1] * height];
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const stroke = (path: () => void): void => {
    for (const pass of ['casing', 'ink'] as const) {
      context.beginPath();
      path();
      context.lineWidth = pass === 'casing' ? line + Math.max(2, line * 0.7) : line;
      context.strokeStyle = pass === 'casing' ? markupCasing : markupInk;
      context.stroke();
    }
  };
  for (const mark of marks) {
    if (mark.kind === 'pen') {
      stroke(() => {
        for (const [index, point] of mark.points.entries()) {
          const [x, y] = px(point);
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
      });
    } else if (mark.kind === 'arrow' || mark.kind === 'line') {
      const from = px(mark.from.at);
      const to = px(mark.to.at);
      stroke(() => {
        context.moveTo(...from);
        context.lineTo(...to);
        if (mark.kind === 'arrow') {
          const [left, right] = arrowHead(from, to, line * 4.5);
          context.moveTo(...left);
          context.lineTo(...to);
          context.lineTo(...right);
        }
      });
    } else {
      const [x0, y0] = px(mark.from);
      const [x1, y1] = px(mark.to);
      stroke(() => {
        if (mark.kind === 'rectangle') {
          context.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        } else {
          context.ellipse(
            (x0 + x1) / 2,
            (y0 + y1) / 2,
            Math.abs(x1 - x0) / 2,
            Math.abs(y1 - y0) / 2,
            0,
            0,
            Math.PI * 2,
          );
        }
      });
    }
  }
  const radius = pinRadius(width, height);
  for (const pin of pins) {
    const head = px(pin.head);
    if (pin.foot) {
      const foot = px(pin.foot);
      for (const [color, lineWidth] of [
        [markupCasing, line * 0.5 + 3],
        [markupInk, line * 0.5],
      ] as const) {
        context.beginPath();
        context.moveTo(...foot);
        context.lineTo(...head);
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
      }
      context.beginPath();
      context.arc(foot[0], foot[1], radius * 0.32, 0, Math.PI * 2);
      context.fillStyle = markupInk;
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = markupCasing;
      context.stroke();
    }
    context.beginPath();
    context.arc(head[0], head[1], radius, 0, Math.PI * 2);
    context.fillStyle = markupInk;
    context.fill();
    context.lineWidth = Math.max(2, radius * 0.16);
    context.strokeStyle = markupCasing;
    context.stroke();
    context.fillStyle = markupCasing;
    context.font = `600 ${Math.round(radius * 1.15)}px "Geist Sans", system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(pin.number), head[0], head[1] + radius * 0.06);
  }
}
