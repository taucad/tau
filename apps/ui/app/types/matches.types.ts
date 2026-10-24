import type { UIMatch } from 'react-router';
import type { ReactNode } from 'react';
import type { SetNonNullable } from 'type-fest';
import type { FeatureFlags } from '#flags/flag.constants.js';
import type { ResolvedAuth } from '#hooks/use-resolved-auth.js';

/**
 * Context passed to a function-form `enablePageWrapper` so a route can decide
 * its chrome from the resolved auth state and active feature flags.
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
   * The page's short title, shown in the phone top bar beside the sidebar trigger. The deepest
   * match that declares one names the page; the next title-bearing match above it, when it sits at
   * another path, becomes the back-to-parent crumb ("‹ Projects"). Use the words of the page's
   * own `PageHeader`: while the bar shows the title, that `PageHeader` hides visually below `md`
   * and stays the page's one `<h1>` (`PhoneTopBarContext`); the bar never renders a heading.
   */
  title?: string | ((match: UIMatch) => string | undefined);
  /**
   * The route's one header action, at the inline end of the shell header and of the phone top bar
   * (D11). Only the deepest match's actions render, and they must be a single control of at least
   * 40px: a page with more actions keeps them in its own content or behind one overflow menu. A page
   * whose primary action lives in its `PageHeader` hides that copy below `md` while the bar carries it
   * (`usePhoneTopBar().hasAction`), so a phone has one control for it (I4).
   */
  actions?: (match: UIMatch) => ReactNode;
  /**
   * Where `actions` render: `'all'` (default) in the shell header at every width, `'phone'` only in
   * the phone top bar, for a page whose `PageHeader` already holds that action from `md` up.
   */
  actionsScope?: 'all' | 'phone';
  /**
   * Command palette items for the current route. These are displayed in the command palette.
   */
  commandPalette?: (match: UIMatch) => ReactNode;
  /**
   * Providers composed around the route's own content only. The shell renders breadcrumbs,
   * actions and the command palette above them, so those nodes cannot read a route provider.
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
  /** Render the generic page header. Defaults to true. */
  enablePageHeader?: boolean;
  /**
   * Enable overflow-y on the page. Use this when you have scrollable content in the page.
   */
  enableOverflowY?: boolean;
};

export type TypedUiMatch = UIMatch & {
  handle?: Handle;
};

export type TypedUiMatchWithHandle = SetNonNullable<TypedUiMatch, 'handle'>;
