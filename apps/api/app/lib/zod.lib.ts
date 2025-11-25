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
