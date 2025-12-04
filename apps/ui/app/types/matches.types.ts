import type { UIMatch } from 'react-router';
import type { ReactNode } from 'react';
import type { SetNonNullable } from 'type-fest';

export type Handle = {
  /**
   * Breadcrumb items for the current route. These are displayed in the breadcrumb trail.
   *
   * Use an array to display multiple breadcrumb items.
   * Each ReactNode in the array will be displayed as a separate breadcrumb item.
   */
  breadcrumb?: (match: UIMatch) => ReactNode | ReactNode[];
  /**
   * Actions for the current route. These are displayed in the top right corner of the page.
   */
  actions?: (match: UIMatch) => ReactNode;
  /**
   * Command palette items for the current route. These are displayed in the command palette.
   */
  commandPalette?: (match: UIMatch) => ReactNode;
  /**
   * Use this when you need to provide for the entire page,
   * such as providing for both the page content and breadcrumb items.
   * This ensures only a single provider is rendered per page.
   */
  providers?: (match: UIMatch) => React.JSXElementConstructor<React.PropsWithChildren>;
  /**
   * Use this when you want to render the page content directly without a sidebar and header.
   */
  noPageWrapper?: boolean;
  /**
   * Enable floating sidebar. You will become responsible for setting content boundaries using:
   * - var(--sidebar-width) (for the sidebar width)
   * - var(--sidebar-width-current) (for the current sidebar width)
   * - var(--header-height) (for the header height)
   */
  enableFloatingSidebar?: boolean;
  /**
   * Enable overflow-y on the page. Use this when you have scrollable content in the page.
   */
  enableOverflowY?: boolean;
  /**
   * Enable page footer.
   */
  enablePageFooter?: boolean;
};

export type TypedUiMatch = UIMatch & {
  handle?: Handle;
};

export type TypedUiMatchWithHandle = SetNonNullable<TypedUiMatch, 'handle'>;
