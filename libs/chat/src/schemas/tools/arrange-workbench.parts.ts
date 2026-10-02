import { z } from 'zod';
import {
  cameraPresets,
  lengthUnits,
  projectPathSchema,
  viewTabSchema,
  workbenchLaneTabSchema,
  groupSchemaOf,
  vectorSchema,
} from '@taucad/workbench';

const vector = vectorSchema;
export const viewerGroupSchema = groupSchemaOf(viewTabSchema);
export const workbenchGroupSchema = groupSchemaOf(workbenchLaneTabSchema);
const sectionCutSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.enum(['plane']),
    plane: z.enum(['xy', 'xz', 'yz']),
    offset: z.number().describe("The plane's position along its axis. Metres in tau:root: 0.012 is 12 mm."),
    isFlipped: z.boolean(),
  }),
  z.strictObject({
    kind: z.enum(['revolution']),
    axis: z.enum(['x', 'y', 'z']),
    origin: vector.describe('Metres in tau:root.'),
    start: z.number().min(0).lt(360),
    sweep: z.number().min(5).max(355),
  }),
]);

/**
 * The tool's camera: a preset or a look, both framed by the page. Poses are what a window writes after framing;
 * the agent knows no model bounds, so a pose stays file-only.
 */
export const instructionCameraSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['preset']), preset: z.enum(cameraPresets) }),
  z.strictObject({
    kind: z.enum(['look']),
    direction: vector.describe(
      'From the model toward the camera, any length: [0,-1,0] is the front preset (seen from -Y), [-1,1,-1] looks from below, behind and the left.',
    ),
    up: vector
      .optional()
      .describe(
        "Defaults to the view's upDirection; when direction is parallel to it the page uses +Y, as the top and bottom presets do.",
      ),
  }),
]);

/** A pinned measurement as the tool takes it: the page computes `distance` and defaults `frameId` to `tau:root`. */
const measurementPatchSchema = z.strictObject({
  id: z.string().min(1).max(64),
  startPoint: vector.describe('Metres in tau:root.'),
  endPoint: vector.describe('Metres in tau:root.'),
  name: z.string().max(200).optional(),
});

/** Every field optional: a patch. The records guide's `viewFieldsSchema` is the complete form with defaults. */
export const viewPatchSchema = z.strictObject({
  entryPath: projectPathSchema.optional().describe('The model file this view renders. Required for a new view.'),
  name: z
    .string()
    .min(1)
    .max(40)
    .optional()
    .describe('Tab label beside the file name ("Front", "Joint"); defaults to the preset name or "Look".'),
  camera: instructionCameraSchema.optional(),
  fieldOfView: z.number().min(0).max(90).optional().describe('Degrees; 0 is orthographic; the slider spans 0–90.'),
  upDirection: z.enum(['x', 'y', 'z']).optional(),
  display: z
    .strictObject({
      surfaces: z.boolean(),
      lines: z.boolean(),
      gizmo: z.boolean(),
      grid: z.boolean(),
      axes: z.boolean(),
      matcap: z.boolean(),
      postProcessing: z.boolean(),
    })
    .partial()
    .optional(),
  grid: z.strictObject({ unit: z.enum(lengthUnits) }).optional(),
  section: z.strictObject({ active: z.boolean(), cuts: z.array(sectionCutSchema).max(4) }).optional(),
  measurements: z.array(measurementPatchSchema).max(64).optional().describe('Replaces the pinned list.'),
});

/** Per-entry settings (entries.json), shared by every view of the entry: `operationTimeout` 0–600 000 ms (0 disables) and component display. */
export const entryPatchSchema = z.strictObject({
  path: projectPathSchema,
  operationTimeout: z.number().int().min(0).max(600_000).optional().describe('Milliseconds; 0 disables the timeout.'),
  components: z
    .strictObject({
      hidden: z.array(z.string().min(1).max(256)).max(1024),
      isolated: z.array(z.string().min(1).max(256)).max(1024),
      /** A list, not a record: zod emits `propertyNames` for records, which providers refuse. */
      opacity: z.array(z.strictObject({ id: z.string().min(1).max(256), opacity: z.number().min(0).max(1) })).max(1024),
    })
    .partial()
    .optional()
    .describe('Component ids as the Model pane names them. Each list you send replaces that list.'),
});
