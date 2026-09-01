import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Links, Meta, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { throwRedirectIfSubdomain } from '#lib/react-router.lib.js';
import { PreventFlashOnWrongTheme, Theme, ThemeProvider, useTheme } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import type { ClientEnvironment } from '#environment.config.js';
import { ENV, getClientEnvironment } from '#environment.config.js';
import { buildClientEnvScript } from '#lib/client-env-script.js';
import { metaConfig } from '#constants/meta.constants.js';
import { Page } from '#components/layout/page.js';
import { readThemeCookie } from '#theme-cookie.js';
import { cn } from '@taucad/ui/utils/cn';
import { Toaster } from '#components/ui/sonner.js';
import { webManifestLinks } from '#lib/web-manifest.js';
import { ColorProvider, useColor } from '#hooks/use-color.js';
import { useFavicon } from '#hooks/use-favicon.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ErrorPage } from '#components/error-page.js';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import type { Handle } from '#types/matches.types.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import { ProjectManagerProvider } from '#hooks/use-project-manager.js';
import { HomeFileManagerProvider } from '#hooks/use-file-manager.js';
import { AnalyticsProvider } from '#hooks/use-analytics.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { GlobalChatFlushGuard } from '#components/global-chat-flush-guard.js';
import { SvgSpriteMount } from '#components/icons/svg-sprite-mount.js';
import { BuildSkewBanner } from '#components/build-skew-banner.js';
import { HeadlessImageProvider } from '#providers/headless-image-provider.js';
import { authClient } from '#lib/auth-client.js';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';
import { useTopupReturn } from '@taucad/billing/hooks/use-topup-return';

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

export const handle: Handle = {
  commandPalette(match) {
    return <RootCommandPaletteItems match={match} />;
  },
};

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- loaders require type inference
export async function loader({ request }: LoaderFunctionArgs) {
  // Redirect www to apex domain (e.g., www.example.new -> example.new)
  throwRedirectIfSubdomain(request, 'www');

  const theme = await readThemeCookie(request);
  const cookie = request.headers.get('Cookie') ?? '';

  return {
    theme,
    cookie,
    pathname: new URL(request.url).pathname,
    // Allowlisted subset only — this value is serialised into page source both
    // by the `window.ENV` script below and React Router's `<Scripts />` payload.
    env: await getClientEnvironment(),
  };
}

/**
 * Extracts a human-readable string from the `error.error.message` payload of a
 * `BetterFetchError` (e.g. `"You can't unlink your last account"`). Falls back
 * to the outer `Error.message` when the inner shape is missing.
 *
 * `BetterFetchError.error` is typed as `any` upstream, so we duck-type the
 * shape here to satisfy the linter without dragging in unsafe-argument noise.
 */
const extractAuthErrorMessage = (error: Error): string => {
  const fromBody = extractBetterFetchErrorBodyMessage(error);
  return fromBody ?? error.message;
};

const extractBetterFetchErrorBodyMessage = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = (error as { error?: unknown }).error;
  if (!candidate || typeof candidate !== 'object' || !('message' in candidate)) {
    return undefined;
  }
  const { message } = candidate as { message?: unknown };
  return typeof message === 'string' ? message : undefined;
};

export function Layout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const data = useRouteLoaderData<typeof loader>('root');
  // Preserve null so the theme provider can resolve the system preference before hydration.
  const ssrTheme = data?.theme ?? null;
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { networkMode: 'offlineFirst' },
        mutations: { networkMode: 'offlineFirst' },
      },
    });

    // Surface unhandled better-auth-ui mutation/query errors as toasts. Inline
    // `onError` handlers on individual `useMutation` calls (e.g. sign-in) take
    // precedence and override this default, so we never double-toast.
    client.setMutationDefaults([], {
      onError: (error) => {
        toast.error(extractAuthErrorMessage(error));
      },
    });

    client.getQueryCache().config.onError = (error) => {
      const message = extractBetterFetchErrorBodyMessage(error);
      if (message !== undefined) {
        toast.error(message);
      }
    };

    return client;
  }, []);

  const managedChildren = (
    <HeadlessImageProvider>
      <ProjectManagerProvider>
        <TooltipProvider>
          <KeyboardProvider>
            <UnloadProvider>
              <ChatSessionStoreProvider>
                <GlobalChatFlushGuard />
                {children}
              </ChatSessionStoreProvider>
            </UnloadProvider>
          </KeyboardProvider>
        </TooltipProvider>
      </ProjectManagerProvider>
    </HeadlessImageProvider>
  );
  const application =
    data?.env.TAU_DEBUG && data.pathname === '/__e2e/remote-host' ? (
      children
    ) : (
      <HomeFileManagerProvider rootDirectory='/'>{managedChildren}</HomeFileManagerProvider>
    );

  /*
   * `QueryClientProvider` is outermost so `AuthConfigProvider`'s own
   * `DesktopAuthBridge` mount can reach the query cache: better-auth-ui's
   * `AuthProvider` does not supply a fallback client, so with the old order the
   * bridge's `invalidateQueries` half silently no-opped and an Electron-main
   * sign-in never refreshed `useSession`. Web behaviour is unchanged — the
   * relative order of the auth, billing, and analytics providers is the same.
   */
  return (
    <QueryClientProvider client={queryClient}>
      <AuthConfigProvider>
        <BillingSessionBridge>
          <AnalyticsProvider>
            <ThemeProvider specifiedTheme={ssrTheme} themeAction='/action/set-theme'>
              <ColorProvider>
                <LayoutDocument env={data?.env ?? {}} ssrTheme={ssrTheme}>
                  {application}
                </LayoutDocument>
              </ColorProvider>
            </ThemeProvider>
          </AnalyticsProvider>
        </BillingSessionBridge>
      </AuthConfigProvider>
    </QueryClientProvider>
  );
}

const BillingSessionBridge = ({ children }: { readonly children: ReactNode }): React.JSX.Element => {
  const { data: session } = authClient.useSession();
  return (
    <BillingSessionProvider value={{ apiBaseUrl: ENV.TAU_API_URL, userId: session?.user.id }}>
      {children}
    </BillingSessionProvider>
  );
};

function LayoutDocument({
  children,
  env,
  ssrTheme,
}: {
  readonly children: ReactNode;
  readonly env: Partial<ClientEnvironment>;
  readonly ssrTheme: ThemeWithSystem;
}): React.JSX.Element {
  // Use ssrTheme (the raw resolved theme) for the HTML className.
  // This is null during SSR when no theme preference is stored (system theme mode),
  // which allows PreventFlashOnWrongTheme's script to correctly detect and apply the
  // system preference before the page renders (prevents light mode flash on dark systems).
  const { ssrTheme: resolvedTheme } = useTheme();
  const color = useColor();
  const { setFaviconColor } = useFavicon();

  useEffect(() => {
    setFaviconColor(color.serialized.hex);
  }, [setFaviconColor, color]);

  return (
    <html
      lang='en'
      className={cn(
        '[--spacing:0.275rem] md:[--spacing:0.25rem]',
        (resolvedTheme === Theme.BLACK || resolvedTheme === Theme.HIGH_CONTRAST) && Theme.DARK,
        // Leave the specific product theme last so it overrides Dark's base palette.
        resolvedTheme,
      )}
      style={color.rootStyles}
    >
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <Meta />
        <PreventFlashOnWrongTheme hasSsrTheme={ssrTheme !== null} />
        <Links />
      </head>
      <body>
        <script
          // oxlint-disable-next-line react/no-danger -- safe for environment injection as recommended by Remix
          dangerouslySetInnerHTML={{
            __html: buildClientEnvScript(env),
          }}
        />
        <SvgSpriteMount />
        <BuildSkewBanner />
        {children}
        <ScrollRestoration />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}

export default function App(): React.JSX.Element {
  // Handles the hosted-Checkout `?topup=success` return on any route.
  useTopupReturn({ onPaymentReceived: () => toast('Payment received — your balance will update shortly.') });
  return <Page />;
}

export function ErrorBoundary(): React.JSX.Element {
  return <Page error={<ErrorPage />} />;
}
