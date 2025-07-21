import type { UIMatch } from 'react-router';
import type { ReactNode } from 'react';
import type { SetNonNullable } from 'type-fest';

export type Handle = {
  breadcrumb?: (match: UIMatch) => ReactNode;
  actions?: (match: UIMatch) => ReactNode;
  commandPalette?: (match: UIMatch) => ReactNode;
  noPageWrapper?: boolean;
};

export type TypedUiMatch = UIMatch & {
  handle?: Handle;
};

export type TypedUiMatchWithHandle = SetNonNullable<TypedUiMatch, 'handle'>;
