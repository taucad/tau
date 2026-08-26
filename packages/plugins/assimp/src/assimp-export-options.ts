import { z } from 'zod';
import { assimpCapabilities } from 'libassimp';
import type { ExportFormat, ExportOptionsFor, OptionDescriptor } from 'libassimp';

const schemaFromDescriptor = (descriptor: OptionDescriptor): z.ZodType => {
  let schema: z.ZodType;
  if (descriptor.values === undefined) {
    switch (descriptor.kind) {
      case 'boolean': {
        schema = z.boolean();
        break;
      }
      case 'integer':
      case 'number': {
        let numberSchema = descriptor.kind === 'integer' ? z.number().int() : z.number();
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
          schemaFromDescriptor(descriptor),
        ]),
      ),
    ),
  ]),
) as unknown as AssimpEdgeSchemas;
