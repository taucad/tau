/**
 * A bounded table of host-side handles, keyed by the scope that owns one.
 *
 * Moved out of `revision-effects.ts` unchanged (W10.1): it was module-level
 * there already and depends on nothing in `createRevisionActors`.
 */
import { RevisionPortError } from '#revision-port.js';

/**
 * How many handles one table keeps.
 *
 * ponytail: insertion-ordered eviction, not age. A cut or plan is keyed by its
 * checkout and a capture by its turn, so the table only grows when a turn dies
 * between `capture` and `merge`; nothing keeps that many turns in flight.
 */
const handleLimit = 64;

/* A bounded table of host-side handles the machines only carry as strings. */
export const createHandles = <T>(
  prefix: string,
): Readonly<{
  put: (scope: string, value: T) => string;
  take: (id: string) => T;
}> => {
  const values = new Map<string, Readonly<{ scope: string; value: T }>>();
  const byScope = new Map<string, string>();
  let counter = 0;
  /* Both tables drop together: the scope index is what would otherwise grow by
   * one dead entry per turn for the life of the process (a2 R9). */
  const forget = (id: string): Readonly<{ scope: string; value: T }> | undefined => {
    const held = values.get(id);
    values.delete(id);
    if (held !== undefined && byScope.get(held.scope) === id) {
      byScope.delete(held.scope);
    }
    return held;
  };
  return {
    /* One live handle per scope: a new cut for a checkout replaces the old one. */
    put: (scope, value) => {
      const previous = byScope.get(scope);
      if (previous !== undefined) {
        forget(previous);
      }
      counter += 1;
      const id = `${prefix}-${String(counter)}`;
      values.set(id, { scope, value });
      byScope.set(scope, id);
      for (const [oldest] of values) {
        if (values.size <= handleLimit) {
          break;
        }
        forget(oldest);
      }
      return id;
    },
    take: (id) => {
      const held = forget(id);
      if (held === undefined) {
        throw new RevisionPortError('ENGINE_FAILED', `The ${prefix} handle is no longer held.`);
      }
      return held.value;
    },
  };
};
