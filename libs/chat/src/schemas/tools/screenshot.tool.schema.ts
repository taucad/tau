import { z } from 'zod';
import { workbenchIdSchema } from '@taucad/workbench';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';
import { parameterOverridesSchema } from '#schemas/tools/parameter.tool.schema.js';
import { capturePoseSchema } from '#schemas/tools/pose-model.tool.schema.js';

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
 * writes its cuts in. The renderer clips surfaces and lines and caps the cut. `offsetMm`, the deprecated millimetre
 * spelling, was removed in 0.1.0-beta.9 and is refused.
 * @public
 */
export const screenshotSectionSchema = z
  .object({ plane: sectionPlane, offset: sectionOffset, keep: sectionKeep.optional() })
  .strict();
/** A section: its offset is metres. @public */
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
    targetFile: rootedFilePathSchema
      .optional()
      .describe(
        'Source file path of the geometry unit to screenshot (e.g. "main.ts", "lib/bracket.scad"). Required unless workbenchView names a view.',
      ),
    workbenchView: workbenchIdSchema
      .optional()
      .describe(
        'A view id arrange_workbench wrote (.tau/workbench/views/<id>.json): capture its file, kernel view, camera, field of view, section cuts and display, as the viewer shows them.',
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
    pose: capturePoseSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.workbenchView === undefined) {
      if (input.targetFile === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['targetFile'],
          message: 'Give targetFile, or workbenchView to capture a view arrange_workbench saved.',
        });
      }
      return;
    }
    const conflicting = (['view', 'instance', 'options', 'section'] as const).filter((key) => input[key] !== undefined);
    for (const key of conflicting) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: `workbenchView carries its own ${key === 'section' ? 'section cuts' : 'kernel view, instance and options'}; omit ${key}, or capture without workbenchView.`,
      });
    }
    if (input.mode === 'multi_angle') {
      context.addIssue({
        code: 'custom',
        path: ['mode'],
        message:
          "workbenchView captures the view's own camera; omit mode, or capture multi_angle without workbenchView.",
      });
    }
  });
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
    projectRoot: z.string().min(1).optional(),
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
    projectRoot: z.string().min(1).optional().describe('Absolute project root targetFile resolved against.'),
  })
  .strict();
/** @public */
export type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>;
