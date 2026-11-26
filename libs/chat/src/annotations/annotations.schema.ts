// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';

/**
 * Limits of one message's annotations (comment pins and image mark up). Each is enforced where the draft gains the
 * pin or mark, with a visible refusal, so a stored draft is never over a limit.
 * @public
 */
export const annotationLimits = {
  /** Comments in one message: the cap `maxCadReferences` already sets for references. */
  comments: 32,
  /** Characters in one comment. */
  commentCharacters: 1000,
  /** Annotated images in one message. */
  images: 8,
  /** Drawn marks on one image. */
  marksPerImage: 64,
  /** Points of one pen stroke after simplification. */
  penPoints: 128,
  /** Pen points across one message. */
  penPointsPerMessage: 2000,
  /** Lifted marks the agent is told about. */
  agentMarks: 32,
  /** Bytes of the whole record, serialized. */
  bytes: 64 * 1024,
} as const;

const finite = z.number().finite();

/** A point or direction in `tau:root` (Z up). Points are metres, as the viewer stores them. */
const vec3Schema = z.tuple([finite, finite, finite]);

/** A place on an image: fractions of its width and height from the top left. */
const vec2Schema = z.tuple([finite, finite]);

const partSchema = z.object({
  componentId: z.string().min(1).max(256),
  label: z.string().max(256),
});

const anchorSchema = z.object({ point: vec3Schema, normal: vec3Schema.optional() });

/**
 * One numbered comment. With `model` it is a pin on the model, shown in the viewer and projected onto its image;
 * with only `at` it is a pin on a picture.
 * @public
 */
export const annotationCommentSchema = z.object({
  /** Stable and unique in the message, gaps allowed: the comment's identity. */
  number: z.number().int().min(1).max(9999),
  /** The person's words; never empty in a sent message. */
  text: z.string().max(annotationLimits.commentCharacters),
  /** The {@link annotatedImageSchema} id of its picture; absent only in a draft while the picture is pending. */
  image: z.string().min(1).max(64).optional(),
  model: anchorSchema
    .extend({
      part: partSchema.optional(),
      /** The anchor in the part's own frame, kept only for a file with a mechanism so the pin can ride its part. */
      local: anchorSchema.optional(),
    })
    .optional(),
  /** Where a picture pin sits; a model pin's place on its image is projected instead. */
  at: vec2Schema.optional(),
});

const markEndSchema = z.object({
  at: vec2Schema,
  /** The part the end touches, when the image is a view of the model. */
  part: partSchema.optional(),
  /** The surface point the end touches, `tau:root` metres. */
  point: vec3Schema.optional(),
});

/** One drawn mark. @public */
export const annotationMarkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pen'), points: z.array(vec2Schema).min(2).max(annotationLimits.penPoints) }),
  z.object({ kind: z.literal('arrow'), from: markEndSchema, to: markEndSchema }),
  z.object({ kind: z.literal('line'), from: markEndSchema, to: markEndSchema }),
  z.object({ kind: z.literal('rectangle'), from: vec2Schema, to: vec2Schema }),
  z.object({ kind: z.literal('ellipse'), from: vec2Schema, to: vec2Schema }),
]);

/** The camera a view was rendered with: `CameraState` of `@taucad/camera`, as JSON. @public */
export const annotationCameraSchema = z.object({
  frameId: z.string().max(128),
  position: vec3Schema,
  target: vec3Schema,
  up: vec3Schema,
  projection: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('perspective'), verticalFieldOfView: finite, zoom: finite }),
    z.object({ kind: z.literal('orthographic'), verticalSpan: finite, zoom: finite }),
  ]),
  clipping: z.object({ near: finite, far: finite }),
  aspect: finite.positive(),
});

/** What a picture of the model shows: its scene, its geometry and the camera that drew it. @public */
export const annotationViewSchema = z.object({
  /** The workspace file the picture shows. */
  path: z.string().min(1).max(1024),
  kernelView: z.string().max(256).optional(),
  /** An authored instance id; a local instance is stored as its title, since its id expires. */
  instance: z.string().max(256).optional(),
  /** The viewer's presented geometry key when the picture was taken. */
  revision: z.string().max(256),
  /** Opaque hash of what the viewer presented (display, hidden parts, pose, section): equal hashes share a picture. */
  scene: z.string().max(128),
  /** The section plane the picture was cut with, `tau:root` metres. */
  section: z.object({ normal: vec3Schema, offset: finite }).optional(),
  /** The picture shows a mechanism away from its rest pose. */
  posed: z.literal(true).optional(),
  camera: annotationCameraSchema,
});

/** The stored attachment an annotation keeps a hold on: the untouched original of a flattened image. */
const attachmentSourceSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/u),
  mediaType: z.string().min(1).max(128),
  filename: z.string().max(512).optional(),
  byteLength: z.number().int().nonnegative().optional(),
});

/** One image that carries a view, marks or pins. @public */
export const annotatedImageSchema = z.object({
  /** Draft-local identity; it exists before the attachment is stored. */
  id: z.string().min(1).max(64),
  /** The image part's URL once stored: the flattened image after send, the original while drafting. */
  attachment: z.string().max(2048).optional(),
  /** The untouched original, when `attachment` is a flattened copy. */
  source: attachmentSourceSchema.optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  view: annotationViewSchema.optional(),
  /** Frozen at send: the geometry had changed since the picture was taken. */
  outdated: z.literal(true).optional(),
  /** Taken for a pin, not by the person; cleared when they capture or draw on it. */
  forPin: z.literal(true).optional(),
  marks: z.array(annotationMarkSchema).max(annotationLimits.marksPerImage),
});

/**
 * Everything a user message carries beside its text and files: numbered comments and annotated images.
 * `images` holds an entry only for an image part that has a view, marks or pins.
 * @public
 */
export const messageAnnotationsSchema = z.object({
  version: z.literal(1),
  comments: z.array(annotationCommentSchema).max(annotationLimits.comments),
  images: z.array(annotatedImageSchema).max(annotationLimits.images),
  /** Draft only: the next number to give, so a number is never given twice. */
  nextNumber: z.number().int().min(1).optional(),
});

/** @public */
export type AnnotationVec3 = z.infer<typeof vec3Schema>;
/** @public */
export type AnnotationVec2 = z.infer<typeof vec2Schema>;
/** @public */
export type AnnotationPart = z.infer<typeof partSchema>;
/** @public */
export type AnnotationComment = z.infer<typeof annotationCommentSchema>;
/** @public */
export type AnnotationMarkEnd = z.infer<typeof markEndSchema>;
/** @public */
export type AnnotationMark = z.infer<typeof annotationMarkSchema>;
/** @public */
export type AnnotationCamera = z.infer<typeof annotationCameraSchema>;
/** @public */
export type AnnotationView = z.infer<typeof annotationViewSchema>;
/** @public */
export type AnnotatedImage = z.infer<typeof annotatedImageSchema>;
/** @public */
export type MessageAnnotations = z.infer<typeof messageAnnotationsSchema>;
