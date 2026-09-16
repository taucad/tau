/**
 * Codecs for search-parameter UI state. Pure and React-free on purpose: the
 * parse/serialize half of {@link useSearchParameter} is where the defects live
 * (duplicated inline parsing, non-null assertions, drifted value lists), so it
 * is unit-testable without a router.
 *
 * Two rules hold for every codec:
 * - The fallback is the absent parameter. Serializing the fallback deletes the
 *   parameter rather than writing `?trash=0`, so "absent" has one meaning.
 * - Invalid input degrades to the fallback, never throws.
 */

import type { z } from 'zod';

/** Parse/serialize pair for one search parameter. */
export type SearchParameterCodec<T> = {
  /** Value when the parameter is absent or unreadable. */
  readonly fallback: T;
  /** Reads the raw parameter value; `undefined` is the absent parameter. */
  readonly parse: (raw: string | undefined) => T;
  /** Serializes a value; `undefined` means delete the parameter. */
  readonly serialize: (value: T) => string | undefined;
};

/**
 * Builds a codec from a partial parse — returning `undefined` for unreadable
 * input — and a format for the non-fallback case. Both rules above live here
 * so no individual codec has to remember them.
 */
const searchParameterCodec = <T>(
  fallback: T,
  read: (raw: string) => T | undefined,
  format: (value: T) => string,
): SearchParameterCodec<T> => ({
  fallback,
  parse: (raw) => (raw === undefined ? fallback : (read(raw) ?? fallback)),
  serialize: (value) => (value === fallback ? undefined : format(value)),
});

/** Free-text parameter, such as the focused chat's id. */
export const stringParameter = (fallback = ''): SearchParameterCodec<string> =>
  searchParameterCodec(
    fallback,
    (raw) => raw,
    (value) => value,
  );

/**
 * Boolean parameter written as `?trash=1`. Only the exact string `'1'` is true,
 * so `?trash=0`, `?trash=true` and `?trash` all read false, and writing false
 * deletes the parameter.
 */
export const flagParameter: SearchParameterCodec<boolean> = searchParameterCodec(
  false,
  (raw) => raw === '1',
  () => '1',
);

/**
 * Closed-vocabulary parameter validated by a Zod schema, e.g. the settings
 * section. A value outside the schema reads as `fallback` instead of throwing.
 */
export const enumParameter = <T extends string>(schema: z.ZodType<T>, fallback: T): SearchParameterCodec<T> =>
  searchParameterCodec(
    fallback,
    (raw) => {
      const parsed = schema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    },
    (value) => value,
  );
