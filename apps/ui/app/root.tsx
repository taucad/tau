import type { LinksFunction, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from 'react-router';
import type { ReactNode } from 'react';
import { throwRedirectIfSubdomain } from '#lib/react-router.lib.js';
import { readThemeCookie } from '#theme-cookie.js';
import { getClientEnvironment } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { isOfflineShellPath } from '#lib/static-paths.js';
import { OfflineShell } from '#offline/offline-shell.js';
import { webManifestLinks } from '#lib/web-manifest.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import { BuildSkewBanner } from '#components/build-skew-banner.js';
import { CookieConsent } from '#components/cookie-consent.js';
import { WebAnalyticsProvider } from '#providers/web-analytics-provider.js';
import { readConsentStatusFromHeader } from '#lib/cookie-consent.lib.js';
import { ProductApp, RootErrorBoundary, RootLayout } from '#root-layout.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  commandPalette(match) {
    return <RootCommandPaletteItems match={match} />;
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
  return {
    consentStatus: readConsentStatusFromHeader(request.headers.get('Cookie') ?? undefined, globalPrivacyControl),
    globalPrivacyControl,
    env: await getClientEnvironment(),
    pathname: new URL(request.url).pathname,
    theme: await readThemeCookie(request),
  };
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ nextUrl, defaultShouldRevalidate }) =>
  isOfflineShellPath(nextUrl.pathname) ? false : defaultShouldRevalidate;

export function Layout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <RootLayout
      analyticsBoundary={WebAnalyticsProvider}
      documentChrome={
        <>
          <BuildSkewBanner />
          <OfflineShell />
          <CookieConsent />
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
