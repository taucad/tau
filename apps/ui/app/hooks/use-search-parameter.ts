import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { isFunction } from '#utils/function.utils.js';
import type { SearchParameterName } from '#constants/search-parameter.constants.js';
import type { SearchParameterCodec } from '#utils/search-parameter.codecs.js';

/** How a write to the parameter affects history. */
type SearchParameterOptions = {
  /**
   * `'replace'` (the default) for a filter or a dialog section — the kind of
   * state Back should skip. `'push'` only for a genuine destination.
   */
  readonly history?: 'replace' | 'push';
};

/** Writes a new value, or derives one from the value currently in the URL. */
type SearchParameterSetter<T> = (next: T | ((previous: T) => T)) => void;

/**
 * Search-parameter UI state, the URL counterpart of `useCookie`.
 *
 * A thin composition over React Router's `useSearchParams`, not a new state
 * library. Four contracts come with it:
 *
 * - Writes go through `setSearchParams`, never `history.*`, so React re-renders
 *   from the change and the value reads back through the router.
 * - Writes merge into the current parameters and only ever touch `name`.
 * - Writing the codec's fallback deletes the parameter, so a default view has a
 *   clean URL.
 * - Invalid input degrades to the codec's fallback and never throws.
 *
 * SSR needs no special handling: React Router supplies the URL on the server
 * and the client alike, so there is no server snapshot to get right. The one
 * caveat is prerendered paths (`/legal/*`, `/usage`), which have no query
 * string at build time and therefore render the fallback.
 *
 * Define the codec at module scope. The returned setter is memoised on it, so
 * an inline codec would hand every render a new setter identity.
 *
 * @param name - Parameter to own, from the closed `searchParameterName` union.
 * @param codec - Parse/serialize pair for this parameter's values.
 * @param options - History behaviour; defaults to replace.
 * @returns The current value and a setter accepting a value or an updater.
 */
export const useSearchParameter = <T>(
  name: SearchParameterName,
  codec: SearchParameterCodec<T>,
  options?: SearchParameterOptions,
): readonly [T, SearchParameterSetter<T>] => {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const replace = options?.history !== 'push';
  const update = useMemo(
    () =>
      (valueOrFunction: T | ((previous: T) => T)): void => {
        setSearchParameters(
          (previous) => {
            const value = isFunction(valueOrFunction)
              ? valueOrFunction(codec.parse(previous.get(name) ?? undefined))
              : valueOrFunction;
            const serialized = codec.serialize(value);
            const next = new URLSearchParams(previous);
            if (serialized === undefined) {
              next.delete(name);
            } else {
              next.set(name, serialized);
            }
            return next;
          },
          { replace },
        );
      },
    [codec, name, replace, setSearchParameters],
  );
  return [codec.parse(searchParameters.get(name) ?? undefined), update] as const;
};
