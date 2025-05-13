import type { UIMatch } from 'react-router';
import { useMatches } from 'react-router';
import type { ReactNode } from 'react';

export type Handle = {
  breadcrumb?: (match: UIMatch) => ReactNode;
  actions?: (match: UIMatch) => ReactNode;
};

type TypedUiMatch = UIMatch & {
  handle: Handle;
};

export const useTypedMatches = (): TypedUiMatch[] => {
  const matches = useMatches() as TypedUiMatch[];

  return matches;
};
