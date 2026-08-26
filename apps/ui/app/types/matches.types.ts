import type { UIMatch } from 'react-router';
import type { ReactNode } from 'react';
import type { SetNonNullable } from 'type-fest';
import type { FeatureFlags } from '#flags/flag.constants.js';
import type { ResolvedAuth } from '#hooks/use-resolved-auth.js';

/**
 * Context passed to a function-form `enablePageWrapper` so a route can decide
 * its chrome from the resolved auth state and active feature flags. Flags are
 * included so a route can keep its legacy (unflagged) chrome behaviour — e.g.
 * the home route only drops the app shell for anonymous viewers once the
 * marketing landing flag is on.
 */
export type PageChromeContext = {
  readonly authState: ResolvedAuth;
  readonly flags: FeatureFlags;
};

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
   * Enable the page wrapper (sidebar and header). Defaults to true.
   * Set to false when you want to render the page content directly without a sidebar and header.
   *
   * Pass a function to decide per viewer: it receives the resolved auth state
   * and returns whether to render the wrapper. Used by the home route to show
   * the app shell unless the viewer is confirmed anonymous. The function is
   * resolved client-side (see `useResolvedAuth`); SSR and unresolved session
   * checks are indeterminate so the CDN-cached HTML stays viewer-neutral.
   */
  enablePageWrapper?: boolean | ((context: PageChromeContext) => boolean);
  /**
   * Enable floating sidebar mode where the sidebar overlays content.
   *
   * Use this for routes with full-screen viewers (CAD, canvas) that should
   * extend edge-to-edge under the sidebar.
   *
   * For elements that should respect the sidebar, use utilities from
   * `#components/layout/sidebar-offset.js`:
   *
   * **Component:**
   * - `<SidebarOffset via="padding">` - padding offset
   * - `<SidebarOffset via="margin">` - margin offset
   * - `<SidebarOffset via="left">` - left positioning for fixed/absolute
   * - Add `asChild` prop to avoid extra DOM nodes
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
