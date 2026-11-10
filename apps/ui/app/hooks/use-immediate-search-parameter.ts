import { useCallback, useState } from 'react';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import type { SearchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import type { SearchParameterCodec } from '@taucad/ui-core/utils/search-parameter.codecs';

/**
 * URL-backed view state that renders a write at once. A data router commits a
 * search change only after it revalidates the root loader, so an input bound to
 * the URL alone would lag, while Back and links still replace the value.
 */
export const useImmediateSearchParameter = <T>(
  name: SearchParameterName,
  codec: SearchParameterCodec<T>,
): readonly [T, (next: T) => void, (next: T) => void] => {
  const [committed, commit] = useSearchParameter(name, codec);
  const [value, setValue] = useState(committed);
  const [seen, setSeen] = useState(committed);
  if (!Object.is(committed, seen)) {
    setSeen(committed);
    setValue(committed);
  }

  const update = useCallback(
    (next: T) => {
      setValue(next);
      commit(next);
    },
    [commit],
  );
  return [value, update, setValue] as const;
};
