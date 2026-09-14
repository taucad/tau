import { z } from 'zod';
import { projectRelativePathSchema } from '#schemas/project-manifest.schema.js';

/** Canonical project-relative directory for per-geometry-unit parameter files. @public */
export const parametersDirectory = '.tau/parameters';

const parameterGroupNameSchema = z.string().min(1);

const identityTokenSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
const parameterClaimFieldSchema = z.enum(['unit', 'quantityKind', 'space', 'reference']);
const parameterClaimProvenanceSchema = z
  .object({
    origin: z.enum(['declared', 'project', 'inferred', 'derived']),
    producer: identityTokenSchema,
    sourceRevision: identityTokenSchema,
    profile: identityTokenSchema.optional(),
    rule: identityTokenSchema.optional(),
    evidence: identityTokenSchema.optional(),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (provenance.origin === 'inferred') {
      for (const field of ['profile', 'rule', 'evidence'] as const) {
        if (provenance[field] === undefined) {
          context.addIssue({ code: 'custom', path: [field], message: `Inferred provenance requires ${field}` });
        }
      }
    }
    if (provenance.origin === 'project' && provenance.evidence === undefined) {
      context.addIssue({ code: 'custom', path: ['evidence'], message: 'Project provenance requires evidence' });
    }
  });

const persistedParameterBindingSchema = z
  .object({
    parameter: z.object({ value: identityTokenSchema, stability: z.enum(['stable', 'revision-scoped']) }).strict(),
    schema: z.object({ resource: identityTokenSchema, pointer: z.string() }).strict(),
    unit: identityTokenSchema.optional(),
    quantityKind: identityTokenSchema.optional(),
    space: z.enum(['linear', 'difference', 'point']).optional(),
    reference: identityTokenSchema.optional(),
    provenance: z.partialRecord(parameterClaimFieldSchema, parameterClaimProvenanceSchema).optional(),
  })
  .strict()
  .superRefine((binding, context) => {
    for (const field of parameterClaimFieldSchema.options) {
      if (binding.provenance?.[field] !== undefined && binding[field] === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['provenance', field],
          message: `Provenance for ${field} requires the corresponding binding value`,
        });
      }
    }
  });

const parameterRecordIdentitySchema = z
  .object({
    sourceRevision: identityTokenSchema,
    manifestRevision: identityTokenSchema,
    valueRevision: identityTokenSchema,
    dependencyRevision: identityTokenSchema,
  })
  .strict();

const parameterOperationEvidenceSchema = z
  .object({
    requestId: identityTokenSchema,
    fingerprint: identityTokenSchema,
    outcome: z.literal('committed'),
    sourceRevision: identityTokenSchema,
    manifestRevision: identityTokenSchema,
    valueRevision: identityTokenSchema,
    dependencyRevision: identityTokenSchema,
  })
  .strict();

const parameterGroupSchema = z
  .object({
    values: z.record(z.string(), z.json()),
    bindings: z.record(z.string(), persistedParameterBindingSchema).optional(),
  })
  .strict();

/** Strict runtime schema for a persisted parameter sidecar entry. @public */
export const fileParameterEntrySchema = z
  .object({
    activeGroup: parameterGroupNameSchema,
    order: z.array(parameterGroupNameSchema).optional(),
    groups: z.record(parameterGroupNameSchema, parameterGroupSchema),
    identity: parameterRecordIdentitySchema.optional(),
    lastOperation: parameterOperationEvidenceSchema.optional(),
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

    if (entry.lastOperation !== undefined) {
      if (entry.identity === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['lastOperation'],
          message: 'Last-operation evidence requires the current record identity',
        });
        return;
      }
      for (const field of ['sourceRevision', 'manifestRevision', 'valueRevision', 'dependencyRevision'] as const) {
        if (entry.lastOperation[field] !== entry.identity[field]) {
          context.addIssue({
            code: 'custom',
            path: ['lastOperation', field],
            message: `Last-operation ${field} must match the current record identity`,
          });
        }
      }
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
