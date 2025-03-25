import { UIMatch, useMatches } from '@remix-run/react';

export type Handle = {
  breadcrumb?: (match: UIMatch) => React.ReactNode;
};

type TypedUIMatch = UIMatch & {
  handle: Handle;
};

export const useTypedMatches = () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `useMatches` does not support generic typing
  const matches = useMatches() as TypedUIMatch[];

  return matches;
};
