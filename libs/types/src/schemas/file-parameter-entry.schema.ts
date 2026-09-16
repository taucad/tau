import { z } from 'zod';
import { projectRelativePathSchema } from '#schemas/project-manifest.schema.js';
import type { JSONValue } from '#types/json-value.types.js';

type JsonContainer = Record<PropertyKey, unknown> | unknown[];
type JsonVisit = Readonly<{ kind: 'enter'; value: unknown }> | Readonly<{ kind: 'leave'; value: JsonContainer }>;

const isJsonContainer = (value: unknown): value is JsonContainer => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isJsonObject = (value: unknown): value is Record<string, JSONValue> => {
  if (!isJsonContainer(value) || Array.isArray(value)) {
    return false;
  }
  const ancestors = new Set<JsonContainer>();
  const pending: JsonVisit[] = [{ kind: 'enter', value }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.kind === 'leave') {
      ancestors.delete(current.value);
      continue;
    }
    if (current.value === null || typeof current.value === 'string' || typeof current.value === 'boolean') {
      continue;
    }
    if (typeof current.value === 'number') {
      if (!Number.isFinite(current.value)) {
        return false;
      }
      continue;
    }
    if (!isJsonContainer(current.value)) {
      return false;
    }
    if (ancestors.has(current.value)) {
      return false;
    }
    ancestors.add(current.value);
    pending.push({ kind: 'leave', value: current.value });
    const keys = Reflect.ownKeys(current.value);
    if (
      Array.isArray(current.value) &&
      keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key)))
    ) {
      return false;
    }
    for (const key of keys) {
      if (key === 'length' && Array.isArray(current.value)) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (typeof key !== 'string' || descriptor?.enumerable !== true || !('value' in descriptor)) {
        return false;
      }
      const descriptorValue: unknown = descriptor.value;
      pending.push({ kind: 'enter', value: descriptorValue });
    }
    if (Array.isArray(current.value)) {
      for (let index = 0; index < current.value.length; index += 1) {
        if (!Object.hasOwn(current.value, index)) {
          return false;
        }
      }
    }
  }
  return true;
};

const jsonObjectSchema = z
  .custom<Record<string, JSONValue>>(isJsonObject, 'Expected a JSON object')
  .transform((value) => structuredClone(value));

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
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `Inferred provenance requires ${field}`,
          });
        }
      }
    }
    if (provenance.origin === 'project' && provenance.evidence === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Project provenance requires evidence',
      });
    }
  });

const sourceUnitContextSchema = z
  .object({
    producer: identityTokenSchema,
    sourceRevision: identityTokenSchema,
    capability: identityTokenSchema,
    producerUnit: identityTokenSchema,
  })
  .strict();

const persistedParameterBindingSchema = z
  .object({
    parameter: z
      .object({
        value: identityTokenSchema,
        stability: z.enum(['stable', 'revision-scoped']),
      })
      .strict(),
    schema: z.object({ resource: identityTokenSchema, pointer: z.string() }).strict(),
    unit: identityTokenSchema.optional(),
    quantityKind: identityTokenSchema.optional(),
    space: z.enum(['linear', 'difference', 'point']).optional(),
    reference: identityTokenSchema.optional(),
    representation: z.enum(['binary64', 'safe-integer', 'decimal']).optional(),
    constraints: z.record(z.string(), z.json()).optional(),
    sourceUnit: sourceUnitContextSchema.optional(),
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
    values: jsonObjectSchema,
    bindings: z.record(z.string(), persistedParameterBindingSchema).optional(),
  })
  .strict();

const parameterEntryShape = {
  activeGroup: parameterGroupNameSchema,
  order: z.array(parameterGroupNameSchema).optional(),
  groups: z.record(parameterGroupNameSchema, parameterGroupSchema),
  identity: parameterRecordIdentitySchema.optional(),
  lastOperation: parameterOperationEvidenceSchema.optional(),
} as const;

const refineParameterEntry = (
  entry: {
    activeGroup: string;
    order?: string[];
    groups: Record<string, z.infer<typeof parameterGroupSchema>>;
    identity?: z.infer<typeof parameterRecordIdentitySchema>;
    lastOperation?: z.infer<typeof parameterOperationEvidenceSchema>;
  },
  context: z.RefinementCtx,
): void => {
  if (Object.keys(entry.groups).length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['groups'],
      message: 'Expected at least one parameter group',
    });
  }

  if (!Object.hasOwn(entry.groups, entry.activeGroup)) {
    context.addIssue({
      code: 'custom',
      path: ['activeGroup'],
      message: 'Active parameter group does not exist',
    });
  }

  const orderedGroups = new Set<string>();
  for (const [index, groupName] of (entry.order ?? []).entries()) {
    if (orderedGroups.has(groupName)) {
      context.addIssue({
        code: 'custom',
        path: ['order', index],
        message: 'Parameter group order must be unique',
      });
    }
    if (!Object.hasOwn(entry.groups, groupName)) {
      context.addIssue({
        code: 'custom',
        path: ['order', index],
        message: 'Ordered parameter group does not exist',
      });
    }
    orderedGroups.add(groupName);
  }

  if (entry.lastOperation !== undefined && entry.identity === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['lastOperation'],
      message: 'Last-operation evidence requires the current record identity',
    });
  }
};

/** Immutable identifier for the first-class parameter record profile. @public */
export const fileParameterRecordProfile = 'tau-json-structure-units-03-v1';

/** Exact schema for pre-versioned parameter records. Migration code uses this before applying defaults. @public */
export const legacyFileParameterEntrySchema = z.object(parameterEntryShape).strict().superRefine(refineParameterEntry);

/** Exact schema for current versioned parameter records. @public */
export const currentFileParameterEntrySchema = z
  .object({
    recordVersion: z.literal(1),
    profile: z.literal(fileParameterRecordProfile),
    ...parameterEntryShape,
    migration: z
      .object({
        sourceDigest: identityTokenSchema,
        backupRevision: identityTokenSchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(refineParameterEntry);

/**
 * Compatibility parser for callers that only need a usable in-memory entry.
 * Exact storage classification must use the legacy/current schemas above.
 * @public
 */
export const fileParameterEntrySchema = z
  .object({
    recordVersion: z.literal(1).default(1),
    profile: z.literal(fileParameterRecordProfile).default(fileParameterRecordProfile),
    ...parameterEntryShape,
    migration: z
      .object({
        sourceDigest: identityTokenSchema,
        backupRevision: identityTokenSchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(refineParameterEntry);

/** Validated parameter configuration stored for one geometry entry. @public */
export type FileParameterEntry = z.input<typeof fileParameterEntrySchema>;

/** Validated current version of a parameter configuration. @public */
export type CurrentFileParameterEntry = z.output<typeof fileParameterEntrySchema>;

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
