import type { LinksFunction, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from 'react-router';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { throwRedirectIfSubdomain } from '#lib/react-router.lib.js';
import { readThemeCookie } from '#theme-cookie.js';
import { getClientEnvironment } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { isOfflineShellPath } from '#lib/static-paths.js';
import { remoteHostHarnessPath } from '#utils/remote-host-harness.js';
import { OfflineShell } from '#offline/offline-shell.js';
import { webManifestLinks } from '#lib/web-manifest.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import { CookieConsentBanner } from '#components/cookie-consent-banner.js';
import { WebAnalyticsProvider } from '#providers/web-analytics-provider.js';
import { readConsentStatusFromHeader } from '#lib/cookie-consent.lib.js';
import { readProjectListCountFromHeader } from '#lib/project-list-shape.lib.js';
import { readShellRequestHints } from '#lib/shell-request-hints.js';
import { readLayoutFlagsFromHeader } from '#flags/layout-flags.js';
import { ProductApp, RootErrorBoundary, RootLayout } from '#root-layout.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import type { Handle } from '#types/matches.types.js';
import { readServerPreferences } from '#hooks/use-cookie.js';
import { prefetchModelCatalog } from '#lib/model-catalog.server.js';

// Every route mounts the palette items, so the example catalog loads on its own
// chunk instead of joining each route's entry.
const ExampleCommandPaletteItems = lazy(async () => {
  const m = await import('#components/nav/example-command-items.js');
  return { default: m.ExampleCommandPaletteItems };
});

export const handle: Handle = {
  commandPalette(match) {
    return (
      <>
        <RootCommandPaletteItems match={match} />
        <Suspense fallback={null}>
          <ExampleCommandPaletteItems />
        </Suspense>
      </>
    );
  },
};

export const links: LinksFunction = () => [...globalStylesLinks, ...webManifestLinks];

export const meta: MetaFunction = () => [
  { title: metaConfig.name },
  { name: 'description', content: metaConfig.description },
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- browser meta tag
  { name: 'theme-color', content: '#ffffff' },
  { name: 'apple-mobile-web-app-title', content: metaConfig.name },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'mobile-web-app-capable', content: 'yes' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- loaders require type inference
export async function loader({ request }: LoaderFunctionArgs) {
  throwRedirectIfSubdomain(request, 'www');
  const globalPrivacyControl = request.headers.get('Sec-GPC') === '1';
  const { pathname } = new URL(request.url);
  /* R3: the model label is final on first paint. The offline shell is a neutral prerendered document. */
  const queries = isOfflineShellPath(pathname) ? undefined : prefetchModelCatalog();
  return {
    consentStatus: readConsentStatusFromHeader(request.headers.get('Cookie') ?? undefined, globalPrivacyControl),
    globalPrivacyControl,
    env: await getClientEnvironment(),
    pathname,
    // R5: the remembered project count, so the sidebar and library reserve their slots on the server.
    projectListCount: readProjectListCountFromHeader(request.headers.get('Cookie') ?? undefined),
    // H2: the settled layout-affecting flags, so the server renders, omits or holds a flagged row.
    layoutFlags: readLayoutFlagsFromHeader(request.headers.get('Cookie') ?? undefined),
    // R4/R7: sidebar state and request platform, so the shell's first paint is final.
    shellHints: readShellRequestHints(request),
    theme: await readThemeCookie(request),
    preferences: readServerPreferences(request.headers.get('Cookie') ?? undefined),
    queries: await queries,
  };
}

/**
 * The root loader reads request headers, cookies and the server environment, none of which a
 * client navigation changes, so a GET navigation that changes the pathname or the query string
 * does not re-run it, and a click never waits for the server before the URL changes (U23). The
 * `pathname` it returns is then the path the root data was last loaded for, not the current one.
 *
 * What that gives up: the `HydrationBoundary` over `queries` used to rehydrate the model
 * catalog from the server on every navigation. The client's own catalog query now refreshes it,
 * through its `staleTime` and `refetchInterval`. The cookie-backed values (consent, theme,
 * sidebar, preferences, project count) are read from loader data only as the server snapshot.
 *
 * The default is kept for submissions, an explicit revalidation of the same URL, leaving the
 * offline shell path (its neutral prerendered document has no real root data), and a navigation
 * into or out of the remote-host harness: the root layout's harness check reads `pathname` from
 * this loader's data, so revalidating there keeps that value correct whenever the check depends
 * on it. The offline shell path itself never revalidates the root.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => {
  if (isOfflineShellPath(nextUrl.pathname)) {
    return false;
  }
  const touchesHarness = currentUrl.pathname === remoteHostHarnessPath || nextUrl.pathname === remoteHostHarnessPath;
  const isClientNavigation =
    formMethod === undefined &&
    !touchesHarness &&
    !isOfflineShellPath(currentUrl.pathname) &&
    (currentUrl.pathname !== nextUrl.pathname || currentUrl.search !== nextUrl.search);
  return isClientNavigation ? false : defaultShouldRevalidate;
};

export function Layout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <RootLayout
      analyticsBoundary={WebAnalyticsProvider}
      documentChrome={
        <>
          <OfflineShell />
          <CookieConsentBanner />
        </>
      }
    >
      {children}
    </RootLayout>
  );
}

export default function App(): React.JSX.Element {
  return <ProductApp />;
}

export function ErrorBoundary(): React.JSX.Element {
  return <RootErrorBoundary />;
}
