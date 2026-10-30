import { z } from 'zod';
import { assimpCapabilities } from 'libassimp/capabilities';
import type { DescribedOptionDescriptor } from 'libassimp/capabilities';
import type { ExportFormat, ExportOptionsFor } from 'libassimp';

type OptionName<Format extends ExportFormat> = Extract<keyof ExportOptionsFor<Format>, string>;

/**
 * The libassimp export options the Export form shows. Every other option is either set by tau
 * ({@link tauSetExportOptions}, {@link pointCloudExportOptions}) or left at libassimp's default: most are
 * engine settings (morph targets, skinning, writer memory limits) that CAD export dialogs never offer.
 */
const shownOptions: { readonly [Format in ExportFormat]: ReadonlyArray<OptionName<Format>> } = {
  '3mf': ['unit', 'requireManifold'],
  assjson: [],
  dae: [],
  fbx: ['binary'],
  glb: [],
  gltf: [],
  // eslint-disable-next-line id-denylist -- OBJ file format identifier
  obj: ['materials'],
  ply: ['binary'],
  step: [],
  stl: ['binary'],
  usda: [],
  usdc: [],
  usdz: [],
};

/** Form defaults that differ from libassimp's. Binary STL is about 5× smaller and what slicers expect. */
const formDefaults: { readonly [Format in ExportFormat]?: Partial<ExportOptionsFor<Format>> } = {
  stl: { binary: true },
};

/** Hidden options tau always sends, because the value is tau's to choose rather than the user's. */
export const tauSetExportOptions: { readonly [Format in ExportFormat]?: Partial<ExportOptionsFor<Format>> } = {
  '3mf': { application: 'Tau' },
};

/**
 * Sent when every mesh in the model is points only. With libassimp's default, such a model fails
 * validation; for a model with faces the flag must stay off, since STL then writes only vertices.
 */
export const pointCloudExportOptions = { pointClouds: true } as const;

/** Shown options are toggles and choices; a number or text option would need its own field design first. */
const schemaFromDescriptor = (name: string, descriptor: DescribedOptionDescriptor, formDefault: unknown): z.ZodType => {
  let schema: z.ZodType;
  if (descriptor.values !== undefined) {
    schema = z.literal(descriptor.values);
  } else if (descriptor.kind === 'boolean') {
    schema = z.boolean();
  } else {
    throw new Error(`The export option ${name} is a ${descriptor.kind}; only boolean and choice options can be shown.`);
  }
  schema = schema.describe(descriptor.description);
  const value = formDefault ?? descriptor.default;
  return value === null ? schema.optional() : schema.default(value);
};

type AssimpEdgeSchemas = {
  readonly [Format in ExportFormat]: z.ZodType<ExportOptionsFor<Format>, ExportOptionsFor<Format>>;
};

/** Strict per-target schemas for the export options tau shows, built from libassimp's public descriptors. @public */
export const assimpEdgeSchemas = Object.fromEntries(
  Object.entries(assimpCapabilities.export).map(([format, { exportOptions }]) => {
    const descriptors = exportOptions as Readonly<Record<string, DescribedOptionDescriptor>>;
    const defaults = (formDefaults[format as ExportFormat] ?? {}) as Readonly<Record<string, unknown>>;
    return [
      format,
      z.strictObject(
        Object.fromEntries(
          (shownOptions[format as ExportFormat] as readonly string[]).map((name) => {
            const descriptor = descriptors[name];
            if (descriptor === undefined) {
              throw new Error(`libassimp no longer offers the ${format} export option ${name}.`);
            }
            return [name, schemaFromDescriptor(name, descriptor, defaults[name])];
          }),
        ),
      ),
    ];
  }),
) as unknown as AssimpEdgeSchemas;
