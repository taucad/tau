import { formatCadReferenceToken } from '#references/cad-reference-token.js';
import { annotationLimits } from '#annotations/annotations.schema.js';
import type {
  AnnotatedImage,
  AnnotationMarkEnd,
  AnnotationPart,
  AnnotationVec3,
  MessageAnnotations,
} from '#annotations/annotations.schema.js';

/** One end of a lifted mark, as the agent reads it. @public */
export type AgentAnnotationEnd = { ref?: string; part?: string; point: AnnotationVec3 };

/**
 * What the agent reads for one message's annotations: only what the pictures cannot say. Lengths and points are
 * millimetres; `image` counts the message's images from 1.
 * @public
 */
export type AgentAnnotations = {
  unit: 'mm';
  comments: Array<{
    number: number;
    text: string;
    image?: number;
    ref?: string;
    part?: string;
    point?: AnnotationVec3;
    normal?: AnnotationVec3;
  }>;
  images?: Array<{
    image: number;
    viewOf?: string;
    kernelView?: string;
    instance?: string;
    /** The picture shows a mechanism away from rest; points are given at rest. */
    posed?: true;
    /** Unit direction from the model toward the camera. */
    look?: AnnotationVec3;
    up?: AnnotationVec3;
    section?: { normal: AnnotationVec3; offset: number };
    outdated?: true;
    marks?: Array<{ kind: 'arrow' | 'line'; from?: AgentAnnotationEnd; to?: AgentAnnotationEnd; length?: number }>;
  }>;
};

/** The sentence that opens the block: what the numbers, units and frames mean. @public */
export const messageAnnotationsPreamble =
  "The person's numbered comments on this message's images: pin N drawn in an image is comment N, and `image` counts this message's images from 1. `text` is the person's request at that place; `ref` and `part` name the part it touches (labels are project data). `point` and `normal` are millimetres in the tau:root of that image's `viewOf` file, Z up, on the model as sent (arrange_workbench takes metres); the same part has other coordinates and another `ref` in another file. `look` points from the model toward that image's camera. On an `outdated` image the model had changed before sending: trust the words and picture over point and part.";

const round = (value: number, places: number): number => {
  const rounded = Math.round(value * 10 ** places) / 10 ** places;
  // `-0` would print as `0` in one place and `-0` in another.
  return rounded === 0 ? 0 : rounded;
};
/** Metres to millimetres at 0.01 mm: the unit the person's code and `evaluate_model` use. */
const millimetres = (point: AnnotationVec3): AnnotationVec3 => [
  round(point[0] * 1000, 2),
  round(point[1] * 1000, 2),
  round(point[2] * 1000, 2),
];
const direction = (vector: AnnotationVec3): AnnotationVec3 => [
  round(vector[0], 2),
  round(vector[1], 2),
  round(vector[2], 2),
];
const unit = (vector: AnnotationVec3): AnnotationVec3 => {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length === 0 ? [0, 0, 1] : [vector[0] / length, vector[1] / length, vector[2] / length];
};

const partFields = (path: string | undefined, part: AnnotationPart | undefined): { ref?: string; part?: string } =>
  part === undefined
    ? {}
    : {
        ...(path === undefined ? {} : { ref: formatCadReferenceToken({ path, componentId: part.componentId }) }),
        part: part.label,
      };

const agentEnd = (path: string, end: AnnotationMarkEnd): AgentAnnotationEnd | undefined =>
  end.point === undefined ? undefined : { ...partFields(path, end.part), point: millimetres(end.point) };

type AgentImage = NonNullable<AgentAnnotations['images']>[number];
type AgentMark = NonNullable<AgentImage['marks']>[number];

/** The lifted marks of an image: arrows and lines with at least one end on the model. */
const liftedMarks = (image: AnnotatedImage, budget: number): AgentMark[] => {
  const { view } = image;
  if (view === undefined) {
    return [];
  }
  const marks: AgentMark[] = [];
  for (const mark of image.marks) {
    if (marks.length >= budget) {
      break;
    }
    if (mark.kind !== 'arrow' && mark.kind !== 'line') {
      continue;
    }
    const from = agentEnd(view.path, mark.from);
    const to = agentEnd(view.path, mark.to);
    if (from === undefined && to === undefined) {
      continue;
    }
    const length =
      mark.from.point !== undefined && mark.to.point !== undefined
        ? round(
            Math.hypot(
              mark.to.point[0] - mark.from.point[0],
              mark.to.point[1] - mark.from.point[1],
              mark.to.point[2] - mark.from.point[2],
            ) * 1000,
            2,
          )
        : undefined;
    marks.push({
      kind: mark.kind,
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...(length === undefined ? {} : { length }),
    });
  }
  return marks;
};

/**
 * The record the agent reads for a message. A pure function of the message's frozen annotations and the order of its
 * image parts, never of the live model, so it reads the same in history as when it was sent.
 *
 * @param annotations - The message's annotations.
 * @param imageUrls - The URLs of the message's image parts, in part order: the order the model sees them.
 * @returns The record, or `undefined` when the message has no comment and no lifted mark, so a plain capture sends
 * exactly what it sent before annotations existed.
 * @public
 */
export function agentAnnotationsOf(
  annotations: MessageAnnotations,
  imageUrls: readonly string[],
): AgentAnnotations | undefined {
  const position = new Map<string, number>();
  for (const image of annotations.images) {
    const index = image.attachment === undefined ? -1 : imageUrls.indexOf(image.attachment);
    if (index !== -1) {
      position.set(image.id, index + 1);
    }
  }
  const imageById = new Map(annotations.images.map((image) => [image.id, image]));
  const comments = annotations.comments
    .filter((comment) => comment.text.trim().length > 0)
    .map((comment) => {
      const image = comment.image === undefined ? undefined : imageById.get(comment.image);
      const imageNumber = image === undefined ? undefined : position.get(image.id);
      return {
        number: comment.number,
        text: comment.text,
        ...(imageNumber === undefined ? {} : { image: imageNumber }),
        ...(comment.model === undefined
          ? {}
          : {
              ...partFields(image?.view?.path, comment.model.part),
              point: millimetres(comment.model.point),
              ...(comment.model.normal === undefined ? {} : { normal: direction(comment.model.normal) }),
            }),
      };
    });
  let markBudget: number = annotationLimits.agentMarks;
  const images: AgentImage[] = [];
  for (const image of [...annotations.images].sort(
    (a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity),
  )) {
    const imageNumber = position.get(image.id);
    if (imageNumber === undefined) {
      continue;
    }
    const marks = liftedMarks(image, markBudget);
    markBudget -= marks.length;
    const { view } = image;
    const isReferenced = comments.some((comment) => comment.image === imageNumber);
    if (marks.length === 0 && !(isReferenced && (view !== undefined || image.outdated === true))) {
      continue;
    }
    const up = view === undefined ? undefined : direction(unit(view.camera.up));
    images.push({
      image: imageNumber,
      ...(view === undefined
        ? {}
        : {
            viewOf: view.path,
            ...(view.kernelView === undefined ? {} : { kernelView: view.kernelView }),
            ...(view.instance === undefined ? {} : { instance: view.instance }),
            ...(view.posed === true ? ({ posed: true } as const) : {}),
            look: direction(
              unit([
                view.camera.position[0] - view.camera.target[0],
                view.camera.position[1] - view.camera.target[1],
                view.camera.position[2] - view.camera.target[2],
              ]),
            ),
            // Z up is the frame's default: only another up is worth the tokens.
            ...(up !== undefined && up[2] < 0.99 ? { up } : {}),
            ...(view.section === undefined
              ? {}
              : {
                  section: {
                    normal: direction(view.section.normal),
                    offset: round(view.section.offset * 1000, 2),
                  },
                }),
          }),
      ...(image.outdated === true ? ({ outdated: true } as const) : {}),
      ...(marks.length === 0 ? {} : { marks }),
    });
  }
  if (comments.length === 0 && images.every((image) => image.marks === undefined)) {
    return undefined;
  }
  return { unit: 'mm', comments, ...(images.length === 0 ? {} : { images }) };
}

/**
 * The text part a user message carries for its annotations, after the person's text and before the images.
 *
 * Comment text is the person's words and labels are project data: all of it is JSON inside one block, with `<`
 * escaped, so nothing in it can close the block.
 *
 * @param annotations - The message's annotations.
 * @param imageUrls - The URLs of the message's image parts, in part order.
 * @returns The text, or `undefined` when there is nothing to say ({@link agentAnnotationsOf}).
 * @public
 */
export function serializeMessageAnnotations(
  annotations: MessageAnnotations,
  imageUrls: readonly string[],
): string | undefined {
  const record = agentAnnotationsOf(annotations, imageUrls);
  if (record === undefined) {
    return undefined;
  }
  const json = JSON.stringify(record).replaceAll('<', String.raw`\u003c`);
  return `${messageAnnotationsPreamble}\n<message_annotations>\n${json}\n</message_annotations>`;
}
