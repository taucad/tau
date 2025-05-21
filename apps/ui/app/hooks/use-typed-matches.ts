import { useMatches } from 'react-router';
import { useMemo } from 'react';
import type { Handle, TypedUIMatch } from '~/types/matches.js';

/**
 * Use typed matches to get the breadcrumb and action items for the current route
 *
 * @param selector - A function that selects the desired properties from the matches
 * @returns The memoized selected properties
 */
export function useTypedMatches<Selected>(
  selector: (handles: Record<keyof Handle, TypedUIMatch[]>) => Selected,
): Selected {
  const matches = useMatches() as TypedUIMatch[];

  // Create a map of handle properties to matches with those properties
  const handleMap = useMemo(() => {
    const result: Record<keyof Handle, TypedUIMatch[]> = {
      breadcrumb: [],
      actions: [],
    };

    // Get all possible handle properties from all matches
    const handleKeys = new Set<keyof Handle>();
    for (const match of matches) {
      if (match.handle) {
        for (const key of Object.keys(match.handle)) {
          handleKeys.add(key as keyof Handle);
        }
      }
    }

    // Populate the result with matches for each handle property
    for (const key of handleKeys) {
      result[key] = matches.filter((match) => Boolean(match.handle?.[key]));
    }

    return result;
  }, [matches]);

  // Apply the selector to the handle map
  return useMemo(() => selector(handleMap), [handleMap, selector]);
}
