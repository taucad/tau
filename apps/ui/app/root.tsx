import type { LinksFunction, MetaFunction, MiddlewareFunction, ShouldRevalidateFunction } from 'react-router';
import type { ReactNode } from 'react';
import { rootMiddleware } from '#lib/root-middleware.server.js';
import { staleBuildMiddleware } from '#lib/stale-build-navigation.js';
import { getClientEnvironment } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { isStaticShellPath } from '#lib/route-classes.js';
import { OfflineShell } from '#offline/offline-shell.js';
import { webManifestLinks } from '#lib/web-manifest.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import { CookieConsentBanner } from '#components/cookie-consent-banner.js';
import { WebAnalyticsProvider } from '#providers/web-analytics-provider.js';
import { ProductApp, RootErrorBoundary, RootLayout } from '#root-layout.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import { DeferredExampleCommandPaletteItems } from '#components/nav/deferred-example-command-items.js';
import type { Handle } from '#types/matches.types.js';
import { prefetchModelCatalog, prefetchShellModelCatalog } from '#lib/model-catalog.server.js';
import { readDeploymentSeed } from '#lib/deployment-seed.server.js';
import { isSafeModeRequested } from '#lib/boot-signals.js';
import { cloudSurfaces } from '#cloud/cloud-entries.js';
import { timeModelCatalogRead } from '#lib/server-timing.server.js';
import type { Route } from './+types/root.js';

export const handle: Handle = {
  commandPalette(match) {
    return (
      <>
        <RootCommandPaletteItems match={match} />
        <DeferredExampleCommandPaletteItems />
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

/** C1: the `www.` redirect, Server-Timing and the headers every response carries, documents, `.data` and resources. */
export const middleware: Array<MiddlewareFunction<Response>> = [rootMiddleware];

/**
 * RR9 (TAU-UI-S): once the server names another build, a client navigation to another page loads it as a document,
 * into the live build. The root route module is never split (`splitRouteModules` leaves the root whole), so this
 * loads with the root's own chunk, never as a chunk of its own outside the patched route-module loader.
 */
export const clientMiddleware: Route.ClientMiddlewareFunction[] = [staleBuildMiddleware];

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- loaders require type inference
export async function loader({ url, context }: Route.LoaderArgs) {
  /* B4: `url` is the page's URL; `request.url` is `/<path>.data?_routes=…` on a client navigation or revalidation. */
  /* P2: nothing here reads the visitor. Theme, sidebar, project count, flags, preferences and consent are client facts
   * (`#lib/client-facts`), applied before first paint by the head script, so the document is the same for everyone. */
  /* R3: the model catalog is in the first paint. A static shell (PL3) carries the build's catalog, stamped so its bytes
   * do not depend on the build's clock. */
  /* LB0a: how the catalog cache was found and how long it was waited on go out in the document's `Server-Timing`. */
  const isStaticShell = isStaticShellPath(url.pathname);
  const queries = timeModelCatalogRead(context, isStaticShell ? prefetchShellModelCatalog : prefetchModelCatalog);
  const env = await getClientEnvironment();
  /* W11: a server-rendered page starts from the server's own deployment answer, so funded Cloud UI is in the document.
   * A prerendered or static shell is the same for every deployment and carries none, nor does a safe-mode page (D10);
   * a failure, a timeout or no API origin is none, and the client resolves as before (I15). */
  const isPrerender = process.env['IS_RR_BUILD_REQUEST'] === 'yes';
  const [dehydrated, deployment] = await Promise.all([
    queries,
    isPrerender || isStaticShell || isSafeModeRequested(url.search) ? undefined : readDeploymentSeed(env.TAU_API_URL),
  ]);
  if (deployment?.state === 'funded') {
    /* The server renders funded Cloud UI from the loaded chunk; once per process, a failure renders the fallback. */
    await cloudSurfaces.preload();
  }
  return {
    env,
    queries: dehydrated,
    ...(deployment === undefined ? {} : { deployment }),
  };
}

/**
 * The root loader reads the server environment and the model catalog, neither of which a client navigation changes,
 * so a GET navigation that changes the pathname or the query string does not re-run it, and a click never waits for
 * the server before the URL changes (U23). The client's own catalog query keeps the catalog fresh, through its
 * `staleTime` and `refetchInterval`.
 *
 * The default is kept for submissions and an explicit revalidation of the same URL.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => {
  const isClientNavigation =
    formMethod === undefined && (currentUrl.pathname !== nextUrl.pathname || currentUrl.search !== nextUrl.search);
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
  /* The root error document brings its own scroller (D4.8); `RootErrorBoundary` owns it, for the desktop root too. */
  return <RootErrorBoundary />;
}
