import type { UIMatch } from 'react-router';
import type { ReactNode } from 'react';

export type Handle = {
  breadcrumb?: (match: UIMatch) => ReactNode;
  actions?: (match: UIMatch) => ReactNode;
  commandPalette?: (match: UIMatch) => ReactNode;
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- keeping the convention from react-router
export type TypedUIMatch = UIMatch & {
  handle: Handle;
};
