import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';
import { parameterOverridesSchema } from '#schemas/tools/parameter.tool.schema.js';

/** The axis-aligned planes a screenshot section can cut along, named as `arrange_workbench` names them. @public */
export const screenshotSectionPlanes = ['xy', 'xz', 'yz'] as const;

const sectionPlane = z
  .enum(screenshotSectionPlanes)
  .describe('xy is a horizontal cut (normal Z); xz has normal Y; yz has normal X.');
const sectionOffset = z
  .number()
  .describe("The plane's position along its normal axis. Metres in tau:root: 0.006 is 6 mm.");
const sectionKeep = z
  .enum(['negative', 'positive'])
  .describe(
    'The side to retain along the normal axis: negative keeps coordinates at or below offset. Defaults to the side whose cut face looks at the single-mode camera.',
  );

/**
 * One axis-aligned section cut through a 3D view, in metres in `tau:root` (Z-up), the frame `arrange_workbench`
 * writes its cuts in. The renderer clips surfaces and lines and caps the cut. `offsetMm`, the millimetre spelling it
 * replaced, is still accepted and parsed into `offset` until 0.1.0-beta.8 removes it, so a parsed section always
 * carries metres, and its output JSON Schema (`io: 'output'`) is that parsed shape.
 * @public
 */
export const screenshotSectionSchema = z
  .object({
    plane: sectionPlane,
    offset: sectionOffset.optional(),
    /**
     * @deprecated Send `offset` in metres instead: `offsetMm: 6` is `offset: 0.006`, the millimetres divided by 1000.
     * Removed in 0.1.0-beta.8.
     */
    offsetMm: z
      .number()
      .optional()
      .describe('Deprecated, kept for one release: the same position in millimetres. Send offset instead.'),
    keep: sectionKeep.optional(),
  })
  .strict()
  // oxlint-disable-next-line typescript/no-deprecated -- The alias is read only here, to parse it into offset.
  .transform(({ offset, offsetMm, ...section }, context) => {
    if (offsetMm === undefined && offset !== undefined) {
      return { ...section, offset };
    }
    if (offset === undefined && offsetMm !== undefined) {
      /* Fifteen significant digits make 33.3 mm the number 0.0333, as an agent writing metres would send it. */
      return { ...section, offset: Number((offsetMm / 1000).toPrecision(15)) };
    }
    context.addIssue({
      code: 'custom',
      path: offset === undefined ? ['offset'] : ['offsetMm'],
      message:
        offset === undefined
          ? "Give offset, the plane's position along its normal axis in metres (0.006 is 6 mm)."
          : 'Give offset alone; offsetMm is its deprecated millimetre spelling.',
    });
    return z.NEVER;
  })
  /* The parsed shape, so the schema converts to JSON Schema in output mode too and a second parse is a no-op. */
  .pipe(z.object({ plane: sectionPlane, offset: sectionOffset, keep: sectionKeep.optional() }).strict());
/** A parsed section: its offset is always metres. @public */
export type ScreenshotSection = z.infer<typeof screenshotSectionSchema>;

/**
 * Input schema for screenshot tool.
 * @public
 */
export const screenshotInputSchema = z
  .object({
    mode: z
      .enum(['single', 'multi_angle'])
      .default('single')
      .describe('single (default): deterministic perspective isometric view. multi_angle: all 6 orthographic views'),
    targetFile: rootedFilePathSchema.describe(
      'Source file path of the geometry unit to screenshot (e.g. "main.ts", "lib/bracket.scad").',
    ),
    view: z.string().optional().describe('A view ID offered by evaluate_model; omit for the default view.'),
    instance: z.string().optional().describe('A sheet or drawing ID offered under that view; omit for the first.'),
    options: z
      .any()
      .describe('JSON object of options declared by the selected view.')
      .pipe(z.record(z.string(), z.json()))
      .optional(),
    section: screenshotSectionSchema.optional().describe('Cut a 3D view open along one axis plane.'),
    includeEdges: z
      .boolean()
      .optional()
      .describe('true draws edge lines over a 3D view, false leaves them out; a view without edge lines refuses true.'),
    parameters: parameterOverridesSchema.optional(),
  })
  .strict();
/** @public */
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

/** Canonical camera angles produced by screenshot capture of a 3D view. @public */
export const screenshotAngleSchema = z.enum(['isometric', 'front', 'back', 'right', 'left', 'top', 'bottom']);
/** @public */
export type ScreenshotAngle = z.infer<typeof screenshotAngleSchema>;

/**
 * Screenshot image entry.
 * @public
 */
export const screenshotImageSchema = z
  .object({
    view: z.string().describe('Kernel view ID captured.'),
    instance: z.string().optional().describe('Captured sheet or drawing ID.'),
    angle: screenshotAngleSchema.optional().describe('Camera angle for a 3D view only.'),
    dataUrl: z.string().describe('Base64 data URL of the captured image'),
  })
  .strict();

/** A persisted image returned to an external agent without inline image bytes. @public */
export const screenshotArtifactImageSchema = z
  .object({
    view: z.string().describe('Kernel view ID captured.'),
    instance: z.string().optional().describe('Captured sheet or drawing ID.'),
    angle: screenshotAngleSchema.optional().describe('Camera angle for a 3D view only.'),
    path: z
      .string()
      .regex(/^attachments\/[\da-f]{64}\.(?:png|webp)$/u)
      .describe('Chat attachment reference'),
    absolutePath: z.string().min(1).describe('Local image path readable by the agent image viewer'),
    mimeType: z.enum(['image/png', 'image/webp']),
    byteLength: z.number().int().positive(),
    sha256: z.string().regex(/^[\da-f]{64}$/u),
  })
  .strict();

/** A capture the agent host stored as a chat attachment; a model request restores its bytes. @public */
export const screenshotStoredImageSchema = screenshotArtifactImageSchema.omit({ absolutePath: true }).strict();

/** MCP screenshot result: full bytes live in the chat attachment, not the tool response. @public */
export const screenshotMcpOutputSchema = z
  .object({
    images: z.array(screenshotArtifactImageSchema).min(1),
    sourceRevision: sourceRevisionSchema.optional(),
    message: z.string().optional(),
  })
  .strict();

/**
 * Output schema for screenshot tool.
 * @public
 */
export const screenshotOutputSchema = z
  .object({
    images: z
      .array(z.union([screenshotImageSchema, screenshotArtifactImageSchema, screenshotStoredImageSchema]))
      .min(1)
      .describe('Array of captured screenshot images'),
    sourceRevision: sourceRevisionSchema
      .optional()
      .describe('Digests of the source the captured geometry was computed from (R4).'),
    message: z.string().optional().describe('What the images leave out of the viewer, such as a section cut.'),
  })
  .strict();
/** @public */
export type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>;
