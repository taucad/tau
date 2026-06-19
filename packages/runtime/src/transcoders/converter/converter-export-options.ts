/**
 * Converter transcoder export options.
 *
 * Defines per-format Zod schemas for export options exposed to consumers (camelCase)
 * and Zod transforms that map them to Assimp ExportProperties keys (CONSTANT_CASE).
 *
 * Each entry has:
 * - `schema` — the base Zod schema (camelCase) used on `TranscoderEdge.optionsSchema`
 *   for manifest/UI generation via `toJSONSchema()`.
 * - `toAssimpProperties` — the same schema with a `.transform()` that renames keys
 *   to Assimp property strings. Used inside `transcode()` only.
 */

import { z } from 'zod';
import type { FileExtension } from '@taucad/types';

/**
 * Creates a Zod transform that renames camelCase schema keys to Assimp property keys.
 * The input schema validates and applies defaults; the transform produces a flat
 * `Record<string, boolean | number | string>` with Assimp-compatible keys.
 *
 * @param schema - base Zod object schema with camelCase keys
 * @param keyMap - mapping from camelCase keys to Assimp CONSTANT_CASE property names
 * @returns a Zod schema that validates input and transforms keys to Assimp format
 */
function withAssimpKeyMap<T extends z.ZodObject<z.ZodRawShape>>(schema: T, keyMap: Record<string, string>) {
  return schema.transform((data) => {
    const result: Record<string, boolean | number | string> = {};
    for (const [camelKey, assimpKey] of Object.entries(keyMap)) {
      const value = data[camelKey as keyof typeof data];
      if (value !== undefined) {
        result[assimpKey] = value as boolean | number | string;
      }
    }
    return result;
  });
}

// =============================================================================
// 3MF Export Options
// =============================================================================

const threeMfSchema = z.object({
  unit: z
    .enum(['micron', 'millimeter', 'centimeter', 'inch', 'foot', 'meter'])
    .default('millimeter')
    .describe('Unit of measurement for the 3MF model coordinates'),
  application: z.string().optional().describe('Creating application metadata (e.g. slicer name and version)'),
});

const threeMfKeyMap = {
  unit: '3MF_EXPORT_UNIT',
  application: '3MF_EXPORT_APPLICATION',
} as const;

// =============================================================================
// Exports
// =============================================================================

/**
 * Per-format export option schemas for the converter transcoder.
 * Only formats with Assimp ExportProperties support are included.
 */
export const converterExportOptions = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- format identifiers are file extension strings
  '3mf': {
    schema: threeMfSchema,
    toAssimpProperties: withAssimpKeyMap(threeMfSchema, threeMfKeyMap),
  },
} as const satisfies Partial<Record<FileExtension, { schema: z.ZodType; toAssimpProperties: z.ZodType }>>;

/**
 * Shared placeholder schema for transcoder edges that have no edge-specific options.
 * `z.input<typeof noEdgeOptions>` is `unknown`, so `MergeExportMap` collapses the
 * merged target type to just the kernel source-format options (`GlbOptions & unknown`
 * simplifies to `GlbOptions`). Zod 4's `z.object({})` is avoided because it resolves
 * to `Record<string, never>`, which makes `& KernelOptions` collapse to `never`.
 */
const noEdgeOptions = z.unknown();

/**
 * Per-target edge option schemas for the converter transcoder. Single source of truth
 * shared by:
 *
 * - {@link converterTranscoder} plugin factory ({@link converter.transcoder.ts}) — drives
 *   the compile-time `EdgeMap` phantom that flows into `MergeExportMap` and
 *   `RuntimeClient.export()` typing.
 * - The same `defineTranscoder` runtime `edges` tuple points each non-trivial
 *   edge's `optionsSchema` back to entries here.
 *
 * Targets without bespoke options reuse {@link noEdgeOptions} so transcoded exports
 * still inherit the kernel source-format options (e.g. GLB tessellation/coordinate-system)
 * via `MergeExportMap`.
 *
 * @public
 */
/* eslint-disable @typescript-eslint/naming-convention, id-denylist -- format identifiers are file extension strings */
export const converterEdgeSchemas = {
  '3mf': threeMfSchema,
  '3ds': noEdgeOptions,
  dae: noEdgeOptions,
  fbx: noEdgeOptions,
  gltf: noEdgeOptions,
  obj: noEdgeOptions,
  ply: noEdgeOptions,
  stl: noEdgeOptions,
  step: noEdgeOptions,
  usda: noEdgeOptions,
  usdz: noEdgeOptions,
  x: noEdgeOptions,
  x3d: noEdgeOptions,
} as const satisfies Partial<Record<FileExtension, z.ZodType>>;
/* eslint-enable @typescript-eslint/naming-convention, id-denylist -- restore default rules after the file-extension key block above */
