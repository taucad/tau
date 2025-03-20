import { UIMatch, useMatches } from '@remix-run/react';

export type Handle = {
  breadcrumb?: (match: UIMatch) => React.ReactNode;
};

type TypedUIMatch = UIMatch & {
  handle: Handle;
};

export const useTypedMatches = () => {
  // Permissible as `useMatches` does not support generic typing
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const matches = useMatches() as TypedUIMatch[];

  return matches;
};
