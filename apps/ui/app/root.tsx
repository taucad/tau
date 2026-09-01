import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Links, Meta, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router';
import { PreventFlashOnWrongTheme, ThemeProvider } from 'remix-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { throwRedirectIfSubdomain } from '#lib/react-router.lib.js';
import { useTheme } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import { getEnvironment } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { Page } from '#components/layout/page.js';
import { themeSessionResolver } from '#sessions.server.js';
import { cn } from '#utils/ui.utils.js';
import { Toaster } from '#components/ui/sonner.js';
import { webManifestLinks } from '#routes/manifest[.webmanifest].js';
import { ColorProvider, useColor } from '#hooks/use-color.js';
import { useFavicon } from '#hooks/use-favicon.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { ErrorPage } from '#components/error-page.js';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import type { Handle } from '#types/matches.types.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import { ProjectManagerProvider } from '#hooks/use-project-manager.js';
import { FileManagerProvider } from '#hooks/use-file-manager.js';
import { AnalyticsProvider } from '#hooks/use-analytics.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { GlobalChatFlushGuard } from '#components/global-chat-flush-guard.js';
import { ProjectActivityTracker } from '#hooks/project-activity-tracker.js';
import { SvgSpriteMount } from '#components/icons/svg-sprite-mount.js';

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

  const { getTheme } = await themeSessionResolver(request);
  const cookie = request.headers.get('Cookie') ?? '';

  return {
    theme: getTheme(),
    cookie,
    env: await getEnvironment(),
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
  // Preserve null for system theme - remix-themes needs null to detect system preference
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

  return (
    <AuthConfigProvider>
      <QueryClientProvider client={queryClient}>
        <AnalyticsProvider>
          <FileManagerProvider rootDirectory='/' initialBackend='indexeddb'>
            <ProjectManagerProvider>
              <ThemeProvider specifiedTheme={ssrTheme} themeAction='/action/set-theme'>
                <ColorProvider>
                  <TooltipProvider>
                    <KeyboardProvider>
                      <UnloadProvider>
                        <ChatSessionStoreProvider>
                          <GlobalChatFlushGuard />
                          <ProjectActivityTracker />
                          <LayoutDocument env={data?.env ?? {}} ssrTheme={ssrTheme}>
                            {children}
                          </LayoutDocument>
                        </ChatSessionStoreProvider>
                      </UnloadProvider>
                    </KeyboardProvider>
                  </TooltipProvider>
                </ColorProvider>
              </ThemeProvider>
            </ProjectManagerProvider>
          </FileManagerProvider>
        </AnalyticsProvider>
      </QueryClientProvider>
    </AuthConfigProvider>
  );
}

function LayoutDocument({
  children,
  env,
  ssrTheme,
}: {
  readonly children: ReactNode;
  readonly env: Record<string, string | boolean | undefined>;
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
        // Leave this class last as the `PreventFlashOnWrongTheme` script will
        // append the theme last when needed to prevent light mode flash on dark systems.
        resolvedTheme,
      )}
      style={color.rootStyles}
    >
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <Meta />
        <PreventFlashOnWrongTheme ssrTheme={ssrTheme !== null} />
        <Links />
      </head>
      <body>
        <script
          // oxlint-disable-next-line react/no-danger -- safe for environment injection as recommended by Remix
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(env)}`,
          }}
        />
        <SvgSpriteMount />
        {children}
        <ScrollRestoration />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}

export default function App(): React.JSX.Element {
  return <Page />;
}

export function ErrorBoundary(): React.JSX.Element {
  return <Page error={<ErrorPage />} />;
}
