import type { UIMatch } from '@remix-run/react';
import { useMatches } from '@remix-run/react';
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
