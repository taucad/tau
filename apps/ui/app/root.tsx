import type { LinksFunction, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from 'react-router';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { throwRedirectIfSubdomain } from '#lib/react-router.lib.js';
import { getClientEnvironment } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { isOfflineShellPath } from '#lib/static-paths.js';
import { OfflineShell } from '#offline/offline-shell.js';
import { webManifestLinks } from '#lib/web-manifest.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import { CookieConsentBanner } from '#components/cookie-consent-banner.js';
import { WebAnalyticsProvider } from '#providers/web-analytics-provider.js';
import { ProductApp, RootErrorBoundary, RootLayout } from '#root-layout.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import type { Handle } from '#types/matches.types.js';
import { prefetchModelCatalog } from '#lib/model-catalog.server.js';
import { timeModelCatalogRead } from '#lib/server-timing.server.js';

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
export async function loader({ request, context }: LoaderFunctionArgs) {
  throwRedirectIfSubdomain(request, 'www');
  /* P2: nothing here reads the visitor. Theme, sidebar, project count, flags, preferences and consent are client facts
   * (`#lib/client-facts`), applied before first paint by the head script, so the document is the same for everyone. */
  /* R3: the model catalog is in the first paint. The offline shell is a neutral prerendered document. */
  /* LB0a: how the catalog cache was found and how long it was waited on go out in the document's `Server-Timing`. */
  const queries = isOfflineShellPath(new URL(request.url).pathname)
    ? undefined
    : timeModelCatalogRead(context, prefetchModelCatalog);
  return {
    env: await getClientEnvironment(),
    queries: await queries,
  };
}

/**
 * The root loader reads the server environment and the model catalog, neither of which a client navigation changes,
 * so a GET navigation that changes the pathname or the query string does not re-run it, and a click never waits for
 * the server before the URL changes (U23). The client's own catalog query keeps the catalog fresh, through its
 * `staleTime` and `refetchInterval`.
 *
 * The default is kept for submissions, an explicit revalidation of the same URL, and leaving the offline shell path
 * (its neutral prerendered document has no real root data). The offline shell path itself never revalidates the root.
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
  const isClientNavigation =
    formMethod === undefined &&
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
