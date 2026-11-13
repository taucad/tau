import { ObservabilityHarnessHydrationProbe } from '#lib/observability-harness-hydration.js';
import { onDesktopMachineNavigation } from '#filesystem/desktop-bridge.js';
import { installLoopbackHandOff } from '#lib/agent-host-placement.js';
import type { ComponentType, ReactNode } from 'react';
import { Links, Meta, Scripts, ScrollRestoration, useNavigate, useRouteLoaderData, useLocation } from 'react-router';
import { HydrationBoundary, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { authQueryKeys } from '@better-auth-ui/core';
import { Fragment, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { PreventFlashOnWrongTheme, Theme, ThemeProvider, useTheme } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import type { ClientEnvironment } from '#environment.config.js';
import { buildClientEnvScript } from '#lib/client-env-script.js';
import { Page } from '#components/layout/page.js';
import { useCookie } from '#hooks/use-cookie.js';
import { ServerPreferencesProvider } from '#hooks/server-preferences.js';
import type { ServerPreferences } from '#hooks/server-preferences.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { cn } from '@taucad/ui/utils/cn';
import { Toaster } from '@taucad/ui/components/sonner';
import { ColorProvider, useColor } from '#hooks/use-color.js';
import { AppViewerEnvironment } from '#components/geometry/app-viewer-environment.js';
import { useFavicon } from '#hooks/use-favicon.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ErrorPage } from '#components/error-page.js';
import { ProjectManagerProvider } from '#hooks/use-project-manager.js';
import { RootFileManagerProvider } from '#hooks/use-file-manager.js';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { RevisionActorIdentity } from '#components/revision-actor-identity.js';
import { RuntimeTelemetryIdentity } from '#components/runtime-telemetry-identity.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { ProjectSessionsHost } from '#routes/w.$workspace.$project/project-route.js';
import { GlobalChatFlushGuard } from '#components/global-chat-flush-guard.js';
import { DocumentMemoryKillReporter } from '#components/memory-kill-reporter.js';
import { SvgSpriteMount } from '#components/icons/svg-sprite-mount.js';
import { HeadlessImageProvider } from '#providers/headless-image-provider.js';
import { authErrorMessage, betterFetchErrorBodyMessage } from '@taucad/ui-core/utils/auth-error.utils';
import { CloudRootBoundary, useCloudPaymentActionReturn } from '#cloud/root-billing.js';

export type RootLoaderData = {
  readonly env: ClientEnvironment;
  readonly pathname: string;
  readonly theme: ThemeWithSystem;
  /** The server-visible preferences the request's cookies carried; `useCookie`'s server snapshot. */
  readonly preferences?: ServerPreferences;
  /** Queries the server already answered (the model catalog), hydrated into the root `QueryClient`. */
  readonly queries?: DehydratedState;
};

const noPreferences: ServerPreferences = {};

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
                  <DocumentMemoryKillReporter />
                  <RevisionActorIdentity />
                  <RuntimeTelemetryIdentity />
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
      /* The runtime's `rootFiles`: the file manager for `/`, read in the first render and on the server (A1b). */
      <RootFileManagerProvider>{managedChildren}</RootFileManagerProvider>
    );

  /*
   * `QueryClientProvider` is outermost so `AuthConfigProvider`'s own
   * `DesktopAuthBridge` mount can reach the query cache: better-auth-ui's
   * `AuthProvider` does not supply a fallback client, so with the old order the
   * bridge's `invalidateQueries` half silently no-opped and an Electron-main
   * sign-in never refreshed `useSession`. Web behaviour is unchanged — the
   * relative order of the auth, billing, and analytics providers is the same.
   *
   * The server renders from the same loader data the client hydrates from, so
   * the model label and the mirrored preferences are final on first paint
   * (R3). Hydration never replaces a newer cached catalog.
   */
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={data?.queries}>
        <ServerPreferencesProvider value={data?.preferences ?? noPreferences}>
          <CloudRootBoundary>
            <AnalyticsBoundary>
              <ThemeProvider specifiedTheme={ssrTheme} themeAction='/action/set-theme'>
                <ColorProvider>
                  <AppViewerEnvironment>
                    <LayoutDocument env={data?.env ?? {}} ssrTheme={ssrTheme} documentChrome={documentChrome}>
                      {application}
                    </LayoutDocument>
                  </AppViewerEnvironment>
                </ColorProvider>
              </ThemeProvider>
            </AnalyticsBoundary>
          </CloudRootBoundary>
        </ServerPreferencesProvider>
      </HydrationBoundary>
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
  const location = useLocation();
  const { theme, ssrTheme: resolvedTheme } = useTheme();
  const color = useColor();
  const { setFaviconColor } = useFavicon();
  const [usePointerCursors] = useCookie(cookieName.pointerCursors, false);

  useEffect(() => {
    setFaviconColor(color.serialized.hex);
  }, [setFaviconColor, color]);

  return (
    <html
      lang='en'
      /* Browser page translation rewrites React-owned text nodes, and React's next
       * update then fails with `insertBefore`/`removeChild` NotFoundError. The UI
       * is English-only and re-renders continuously (chat stream, editor, viewer). */
      translate='no'
      className={cn(
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
        <ObservabilityHarnessHydrationProbe pathname={location.pathname} search={location.search} />
        <SvgSpriteMount />
        {documentChrome}
        {children}
        <ScrollRestoration />
        <Scripts />
        <Toaster theme={theme} />
      </body>
    </html>
  );
}

export function ProductApp(): React.JSX.Element {
  const navigate = useNavigate();
  useEffect(
    () =>
      onDesktopMachineNavigation((route) => {
        void navigate(route);
      }),
    [navigate],
  );
  /* A daemon `tau open --desktop` (or `--ui-origin`) handed this page joins Runs on (X54). */
  useEffect(
    () =>
      installLoopbackHandOff((outcome) => {
        if ('error' in outcome) {
          toast.error(outcome.error.message);
        } else {
          toast.success(`${outcome.target.label} is ready to run agents. Choose it under Runs on.`);
        }
      }),
    [],
  );
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
