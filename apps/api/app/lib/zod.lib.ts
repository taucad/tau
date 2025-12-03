import { z } from 'zod';

/**
 * A Zod codec to decode and encode JSON. Passing a Zod schema to this function will return a Zod schema that can be used to parse and stringify JSON objects.
 *
 * @example
 * const schema = jsonCodec(z.object({
 *   name: z.string(),
 *   age: z.number(),
 * }));
 * const json = '{"name":"John","age":30}';
 * const result = schema.parse(json);
 * console.log(result);
 * // { name: 'John', age: 30 }
 *
 * @param schema A Zod schema to encode and decode JSON.
 * @returns A Zod codec that encodes and decodes JSON.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- inferred type
export const jsonCodec = <T extends z.core.$ZodType>(schema: T) =>
  z.codec(z.string(), schema, {
    decode(jsonString, ctx) {
      try {
        return JSON.parse(jsonString) as never;
      } catch (error: unknown) {
        ctx.issues.push({
          code: 'invalid_format',
          format: 'json',
          input: jsonString,
          message: (error as Error).message,
        });
        return z.NEVER;
      }
    },
    encode: (value) => JSON.stringify(value),
  });

// Hack for vite's HMR:
// without this monkey-patch, zod will throw an error whenever editing a schema file that uses
// `.register` as it would try to re-register the schema with the same ID again
// with this patch, re-registering will just replace the schema in the registry
// @see https://github.com/colinhacks/zod/issues/4145
if (import.meta.hot) {
  const originalAdd = z.globalRegistry.add;

  z.globalRegistry.add = (schema: Parameters<typeof originalAdd>[0], meta: Parameters<typeof originalAdd>[1]) => {
    if (!meta.id) {
      return originalAdd.call(z.globalRegistry, schema, meta);
    }

    const existingSchema = z.globalRegistry._idmap.get(meta.id);
    if (existingSchema) {
      z.globalRegistry.remove(existingSchema);
      z.globalRegistry._idmap.delete(meta.id);
    }

    return originalAdd.call(z.globalRegistry, schema, meta);
  };
}
