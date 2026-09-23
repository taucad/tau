import type { ComponentType, ReactNode } from 'react';
import { Links, Meta, Scripts, ScrollRestoration, useMatch, useRouteLoaderData } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authQueryKeys } from '@better-auth-ui/core';
import { Fragment, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { PreventFlashOnWrongTheme, Theme, ThemeProvider, useTheme } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import type { ClientEnvironment } from '#environment.config.js';
import { buildClientEnvScript } from '#lib/client-env-script.js';
import { Page } from '#components/layout/page.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { cn } from '@taucad/ui/utils/cn';
import { Toaster } from '#components/ui/sonner.js';
import { ColorProvider, useColor } from '#hooks/use-color.js';
import { useFavicon } from '#hooks/use-favicon.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ErrorPage } from '#components/error-page.js';
import { ProjectManagerProvider } from '#hooks/use-project-manager.js';
import { HomeFileManagerProvider } from '#hooks/use-file-manager.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { RevisionActorIdentity } from '#components/revision-actor-identity.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { ProjectSessionsHost, projectRoutePath } from '#routes/w.$workspace.$project/project-route.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';
import { GlobalChatFlushGuard } from '#components/global-chat-flush-guard.js';
import { SvgSpriteMount } from '#components/icons/svg-sprite-mount.js';
import { HeadlessImageProvider } from '#providers/headless-image-provider.js';
import { authErrorMessage, betterFetchErrorBodyMessage } from '#utils/auth-error.utils.js';
import { CloudRootBoundary, useCloudPaymentActionReturn } from '#cloud/root-billing.js';

export type RootLoaderData = {
  readonly env: ClientEnvironment;
  readonly pathname: string;
  readonly theme: ThemeWithSystem;
};

export const handleQueryError = (error: unknown, metadata: Readonly<Record<string, unknown>> | undefined): void => {
  if (metadata?.['handlesErrorLocally'] === true) {
    return;
  }
  const message = betterFetchErrorBodyMessage(error);
  if (message !== undefined) {
    toast.error(message);
  }
};

const shouldRetrySessionQuery = (failureCount: number, error: unknown): boolean => {
  const status =
    error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
  return failureCount < 2 && (status === undefined || status < 400 || status >= 500);
};

/**
 * Applies the one shared session query's freshness and failure policy.
 *
 * @param client - The app's root query client.
 */
export function configureSessionQueryDefaults(client: QueryClient): void {
  client.setQueryDefaults(authQueryKeys.session, {
    retry: shouldRetrySessionQuery,
    retryOnMount: false,
    staleTime: 30_000,
  });
}

export function RootLayout({
  analyticsBoundary: AnalyticsBoundary = Fragment,
  children,
  documentChrome,
}: {
  readonly analyticsBoundary?: ComponentType<{ readonly children: ReactNode }>;
  readonly children: ReactNode;
  readonly documentChrome?: ReactNode;
}): React.JSX.Element {
  const data = useRouteLoaderData<RootLoaderData>('root');
  // Preserve null so the theme provider can resolve the system preference before hydration.
  const ssrTheme = data?.theme ?? null;
  const isProjectRoute = useMatch({ path: projectRoutePath, end: true }) !== null;
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
        toast.error(authErrorMessage(error));
      },
    });

    client.getQueryCache().config.onError = (error, query) => {
      handleQueryError(error, query.meta);
    };

    configureSessionQueryDefaults(client);

    return client;
  }, []);

  const managedChildren = (
    <HeadlessImageProvider>
      <ProjectManagerProvider>
        <TooltipProvider>
          <KeyboardProvider>
            <UnloadProvider>
              <ChatSessionStoreProvider>
                {/* A35: liveness is owned by the registry, not by a route. */}
                <SessionsProvider>
                  <GlobalChatFlushGuard />
                  <RevisionActorIdentity />
                  {children}
                </SessionsProvider>
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
      <HomeFileManagerProvider
        rootDirectory='/'
        /* This mount gates every route, so on a project URL its wait is part of opening that project. */
        placeholder={isProjectRoute ? <WorkspaceSkeleton withShellFrame /> : undefined}
      >
        {managedChildren}
      </HomeFileManagerProvider>
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
      <CloudRootBoundary>
        <AnalyticsBoundary>
          <ThemeProvider specifiedTheme={ssrTheme} themeAction='/action/set-theme'>
            <ColorProvider>
              <LayoutDocument env={data?.env ?? {}} ssrTheme={ssrTheme} documentChrome={documentChrome}>
                {application}
              </LayoutDocument>
            </ColorProvider>
          </ThemeProvider>
        </AnalyticsBoundary>
      </CloudRootBoundary>
    </QueryClientProvider>
  );
}

function LayoutDocument({
  children,
  documentChrome,
  env,
  ssrTheme,
}: {
  readonly children: ReactNode;
  readonly documentChrome: ReactNode | undefined;
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
  const [usePointerCursors] = useCookie(cookieName.pointerCursors, false);

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
      data-pointer-cursors={usePointerCursors ? 'true' : undefined}
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
        {documentChrome}
        {children}
        <ScrollRestoration />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}

export function ProductApp(): React.JSX.Element {
  useCloudPaymentActionReturn();
  const data = useRouteLoaderData<RootLoaderData>('root');
  const page = <Page />;
  return data?.env.TAU_DEBUG && data.pathname === '/__e2e/remote-host' ? (
    page
  ) : (
    <ProjectSessionsHost>{page}</ProjectSessionsHost>
  );
}

export function RootErrorBoundary(): React.JSX.Element {
  return <ErrorPage />;
}
