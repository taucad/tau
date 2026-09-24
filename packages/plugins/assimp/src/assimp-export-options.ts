import { z } from 'zod';
import { quantity, quantityKinds } from '@taucad/runtime/transcoder';
import { assimpCapabilities } from 'libassimp';
import type { ExportFormat, ExportOptionsFor, OptionDescriptor } from 'libassimp';

/** Registry options that are physical quantities rather than bare numbers, keyed by descriptor name. */
const quantityOptions: Readonly<Record<string, () => z.ZodNumber>> = {
  identityMatrixEpsilon: () => quantity({ unit: '1', quantityKind: quantityKinds.dimensionlessRatio, space: 'linear' }),
};

const schemaFromDescriptor = (name: string, descriptor: OptionDescriptor): z.ZodType => {
  let schema: z.ZodType;
  if (descriptor.values === undefined) {
    switch (descriptor.kind) {
      case 'boolean': {
        schema = z.boolean();
        break;
      }
      case 'integer':
      case 'number': {
        const base = quantityOptions[name]?.() ?? z.number();
        let numberSchema = descriptor.kind === 'integer' ? base.int() : base;
        if (descriptor.minimum !== undefined) {
          numberSchema = numberSchema.min(descriptor.minimum);
        }
        if (descriptor.maximum !== undefined) {
          numberSchema = numberSchema.max(descriptor.maximum);
        }
        schema = numberSchema;
        break;
      }
      case 'string': {
        schema = z.string();
        break;
      }
      case 'matrix': {
        schema = z.array(z.number()).length(16);
        break;
      }
    }
  } else {
    schema = z.literal(descriptor.values);
  }

  schema = schema.describe(descriptor.description);
  return descriptor.default === null ? schema.optional() : schema.default(descriptor.default);
};

type AssimpEdgeSchemas = {
  readonly [Format in ExportFormat]: z.ZodType<ExportOptionsFor<Format>, ExportOptionsFor<Format>>;
};

/** Strict per-target schemas generated from libassimp's public descriptors. @public */
export const assimpEdgeSchemas = Object.fromEntries(
  Object.entries(assimpCapabilities.export).map(([format, { exportOptions }]) => [
    format,
    z.strictObject(
      Object.fromEntries(
        (Object.entries(exportOptions) as Array<[string, OptionDescriptor]>).map(([name, descriptor]) => [
          name,
          schemaFromDescriptor(name, descriptor),
        ]),
      ),
    ),
  ]),
) as unknown as AssimpEdgeSchemas;
