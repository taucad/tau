import { z } from 'zod';
import { projectPathSchema, workbenchIdSchema, workbenchLanesSchema, workbenchTabSchema } from '@taucad/workbench';
import { entryPatchSchema, viewPatchSchema, viewerGroupSchema, workbenchGroupSchema } from '#schemas/tools/arrange-workbench.parts.js';

/** @public */
export const fileDigestSchema = z.union([z.string().regex(/^sha256:[0-9a-f]{64}$/u), z.enum(['missing'])]);

/**
 * A lane the agent arranges: one group, or a split of groups and inner splits (two levels: no `$ref` in tool
 * schemas; the record itself may nest deeper). Discriminated on `kind`, so a wrong node reports its own field
 * rather than "invalid union"; the JSON Schema is the same `anyOf`.
 */
const laneInputOf = <Group extends z.ZodObject>(group: Group) => {
  const split = <Children extends z.ZodType>(children: Children) =>
    z.strictObject({
      kind: z.enum(['split']),
      size: z.number().positive().optional(),
      direction: z.enum(['row', 'column']),
      children: z.array(children).min(2).max(4),
    });
  const innerSplit = split(group);
  return z.discriminatedUnion('kind', [group, split(z.discriminatedUnion('kind', [group, innerSplit]))]);
};
/** @public */
export const viewerLaneInputSchema = laneInputOf(viewerGroupSchema);
/** @public */
export const workbenchLaneInputSchema = laneInputOf(workbenchGroupSchema);

/** A view patch with its id first, so the model reads the key before the fields. */
const viewInputSchema = z.strictObject({ id: workbenchIdSchema, ...viewPatchSchema.shape });

/**
 * The tool's input: one flat object (a top-level union reaches Anthropic as a tool with no parameters,
 * libs/chat/src/schemas/tools/parameter.tool.schema.ts:222-228). One rule at every level: a key you send replaces
 * that key; a key you omit keeps what is there. Lists (`measurements`, each `components` list, a lane tree) replace whole.
 *
 * @public
 */
export const arrangeWorkbenchInputSchema = z
  .strictObject({
    open: z
      .array(workbenchTabSchema)
      .max(8)
      .optional()
      .describe("Tabs to show. A tab not yet open joins its lane's first group (top-left); use `viewer`/`workbench` to place it elsewhere. Each becomes its group's active tab; an open file tab takes the presentation you send. Opening into a hidden lane shows the lane."),
    close: z
      .array(workbenchTabSchema)
      .max(8)
      .optional()
      .describe("Tabs to remove wherever they are. Files save as they are edited, so nothing is lost. Closing a view's tab deletes the view."),
    views: z
      .array(viewInputSchema)
      .max(8)
      .optional()
      .describe('Views to create or change, by id. A new id needs entryPath and is shown (first viewer group, active) unless `open` or `viewer` places it. Omitted fields keep their values.'),
    entries: z
      .array(entryPatchSchema)
      .max(8)
      .optional()
      .describe('Per-file settings shared by every view of that file: render timeout, hidden or isolated components, opacity.'),
    viewer: viewerLaneInputSchema
      .optional()
      .describe("Replaces the viewer lane's arrangement (view tabs). A view left out of the tree is closed. Group `size` is a weight among siblings; `active` is a tab index, default the last."),
    workbench: workbenchLaneInputSchema.optional().describe("Replaces the workbench lane's arrangement (pane and file tabs). Same group fields as `viewer`."),
    lanes: workbenchLanesSchema.partial().optional().describe('Show or hide the chat and workbench lanes. Cannot hide a lane this call opens into.'),
    basedOn: fileDigestSchema
      .optional()
      .describe('layout.json digest from the workbench snapshot or your last read; the call is refused with RECORD_CONFLICT if the person rearranged since. Views and entries are always written against the bytes just read.'),
  })
  .refine(
    (input) => Object.keys(input).some((key) => key !== 'basedOn'),
    'Send at least one of open, close, views, entries, viewer, workbench or lanes.',
  );

/** @public */
export type ArrangeWorkbenchInput = z.input<typeof arrangeWorkbenchInputSchema>;

/** @public */
export const arrangeWorkbenchOutputSchema = z.strictObject({
  status: z.enum(['written']),
  revisions: z
    .array(z.strictObject({ path: projectPathSchema, digest: fileDigestSchema, previousDigest: fileDigestSchema }))
    .min(1)
    .describe('Every record written or deleted (digest "missing"): views first, then entries.json, then layout.json.'),
  visible: z
    .array(workbenchTabSchema)
    .describe('The active tab of every group, in reading order: what a window will show once it adopts the write.'),
});

/** @public */
export type ArrangeWorkbenchOutput = z.output<typeof arrangeWorkbenchOutputSchema>;

/** Refusal codes (RPC `errorCode`). Two exist already; the record codes reuse the parameter record's words. @public */
export type ArrangeWorkbenchErrorCode = 'VALIDATION_ERROR' | 'FILE_NOT_FOUND' | 'RECORD_CONFLICT' | 'INVALID_RECORD';

/** Provider-facing description (≤150 words, host-neutral; context-engineering-policy:290). @public */
export const arrangeWorkbenchDescription = `Show the person views: open views from a named viewpoint or any direction, open files and panes, close tabs, set a view's camera, section cuts, display, grid unit and measurements, or a file's render timeout and hidden components.

Each key you send replaces that key; omitted keys stay. A lane (\`viewer\`, \`workbench\`) you send replaces that lane. New views are shown at once; \`open\` adds tabs to a lane's first group and activates them. Camera: a preset (isometric, front, back, right, left, top, bottom) or \`look\` with a direction from the model toward the camera; both frame the model. Lengths are metres.

Pass \`basedOn\` (the layout digest from the workbench snapshot) to refuse the write if the person rearranged since.

Returns the records written and the tabs a window will show; the person sees a card and can restore the previous arrangement. Read .tau/workbench/layout.json, views/<id>.json and entries.json with read_file.`;

/**
 * Why a window could not show a tab the record names (blueprint B7). One reason in this cut: `kernel` and `console`
 * render only in debug mode. `unknown-pane` returns when the enum widens (D11); mobile shows every tab one at a time
 * and refuses none; files save as they are edited, so no tab is ever dirty.
 */
/** @public */
export const refusalReasons = ['debug-only'] as const;
