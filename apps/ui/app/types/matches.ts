import type { UIMatch } from 'react-router';
import { useMatches } from 'react-router';
import type { ReactNode } from 'react';

export type Handle = {
  breadcrumb?: (match: UIMatch) => ReactNode;
};

type TypedUiMatch = UIMatch & {
  handle: Handle;
};

export const useTypedMatches = () => {
  const matches = useMatches() as TypedUiMatch[];

  return matches;
};
