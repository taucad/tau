import { z } from 'zod';

/** Canonical JSON Schema URL embedded in every `.tau/workspace.json`. @public */
export const workspaceMarkerSchemaUrl = 'https://tau.new/schemas/tau-workspace-v1.json';

/** Workspace-root-relative path of the identity marker. @public */
export const workspaceMarkerPath = '.tau/workspace.json';

/** Runtime validator for stable Tau workspace identifiers. @public */
export const workspaceIdSchema = z.string().regex(/^wsp_[\dA-Za-z]{21}$/);

/**
 * Disk-side anchor for workspace identity. IndexedDB can be evicted wholesale;
 * this marker lets a re-picked folder resurrect its original `wsp_*` id so every
 * project binding stays valid.
 *
 * @public
 * @see `docs/research/offline-first-storage-durability-blueprint.md` R2
 */
export const workspaceMarkerSchema = z
  .object({
    $schema: z.literal(workspaceMarkerSchemaUrl).optional(),
    workspaceId: workspaceIdSchema,
    slug: z.string().min(1).max(200),
    createdAt: z.iso.datetime(),
  })
  .strict();

/** Validated workspace marker stored as `.tau/workspace.json`. @public */
export type WorkspaceMarker = z.infer<typeof workspaceMarkerSchema>;

/** Parse marker text, returning `undefined` for absent/corrupt/foreign content. @public */
export const parseWorkspaceMarker = (text: string): WorkspaceMarker | undefined => {
  try {
    const parsed = workspaceMarkerSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

/** Validate and deterministically encode a workspace marker. @public */
export const serializeWorkspaceMarker = (marker: WorkspaceMarker): string =>
  `${JSON.stringify(workspaceMarkerSchema.parse(marker), null, 2)}\n`;
