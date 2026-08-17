import { z } from 'zod';
import { projectRelativePathSchema } from '#schemas/project-manifest.schema.js';

/** Canonical project-relative directory for per-geometry-unit parameter files. @public */
export const parametersDirectory = '.tau/parameters';

const parameterGroupNameSchema = z.string().min(1);

const parameterGroupSchema = z
  .object({
    values: z.record(z.string(), z.json()),
  })
  .strict();

/** Strict runtime schema for a persisted parameter sidecar entry. @public */
export const fileParameterEntrySchema = z
  .object({
    activeGroup: parameterGroupNameSchema,
    order: z.array(parameterGroupNameSchema).optional(),
    groups: z.record(parameterGroupNameSchema, parameterGroupSchema),
  })
  .strict()
  .superRefine((entry, context) => {
    if (Object.keys(entry.groups).length === 0) {
      context.addIssue({ code: 'custom', path: ['groups'], message: 'Expected at least one parameter group' });
    }

    if (!Object.hasOwn(entry.groups, entry.activeGroup)) {
      context.addIssue({ code: 'custom', path: ['activeGroup'], message: 'Active parameter group does not exist' });
    }

    const orderedGroups = new Set<string>();
    for (const [index, groupName] of (entry.order ?? []).entries()) {
      if (orderedGroups.has(groupName)) {
        context.addIssue({ code: 'custom', path: ['order', index], message: 'Parameter group order must be unique' });
      }
      if (!Object.hasOwn(entry.groups, groupName)) {
        context.addIssue({ code: 'custom', path: ['order', index], message: 'Ordered parameter group does not exist' });
      }
      orderedGroups.add(groupName);
    }
  });

/** Validated parameter configuration stored for one geometry entry. @public */
export type FileParameterEntry = z.infer<typeof fileParameterEntrySchema>;

/** One named collection of JSON-compatible parameter overrides. @public */
export type ParameterGroup = FileParameterEntry['groups'][string];

/**
 * Return the canonical project-relative sidecar path for a geometry entry.
 *
 * @param entryPath - Normalized project-relative geometry entry path.
 * @returns The canonical parameter sidecar path.
 * @public
 */
export const parameterEntryPath = (entryPath: string): string =>
  `${parametersDirectory}/${projectRelativePathSchema.parse(entryPath)}.json`;

/**
 * Return the active parameter values, or an empty record when no entry exists.
 *
 * @param entry - Validated parameter entry when one is available.
 * @returns The active group's JSON-compatible parameter values.
 * @public
 */
export const getActiveGroupValues = (entry: FileParameterEntry | undefined): ParameterGroup['values'] => {
  if (!entry) {
    return {};
  }
  return entry.groups[entry.activeGroup]!.values;
};
