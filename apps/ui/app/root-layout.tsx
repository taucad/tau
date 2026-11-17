import { ObservabilityHarnessHydrationProbe } from '#lib/observability-harness-hydration.js';
import { onDesktopMachineNavigation } from '@taucad/files-ui/filesystem/desktop-bridge';
import { installLoopbackHandOff } from '#lib/agent-host-placement.js';
import type { ComponentType, ReactNode } from 'react';
import {
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useMatches,
  useNavigate,
  useRouteLoaderData,
  useLocation,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { Fragment, useEffect } from 'react';
import { toast } from 'sonner';
import { ClientFactsHead, Theme, ThemeProvider, useTheme } from '#hooks/use-theme.js';
import { ENV } from '#environment.config.js';
import type { ClientEnvironment } from '#environment.config.js';
import { buildClientEnvScript } from '#lib/client-env-script.js';
import { buildFrameHintScript } from '#lib/frame-hint.js';
import { buildBootWatchdogScript, bootWatchdogStripHtml } from '#lib/boot-watchdog.js';
import { safeModeHref } from '#lib/boot-signals.js';
import { SafeModeNotice } from '#components/layout/safe-mode-bar.js';
import { documentScrollClass } from '#components/layout/document-scroll.js';
import { Page } from '#components/layout/page.js';
import { useDocumentFact } from '#lib/client-facts.js';
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
import { CloudRootBoundary, useCloudPaymentActionReturn } from '#cloud/root-billing.js';
import { isRemoteHostHarness } from '#utils/remote-host-harness.js';
import {
  selectRuntimeIdleFileManagers,
  selectRuntimeQueryClient,
  selectRuntimeSafeMode,
} from '#runtime/app-runtime.js';
import { useAppRuntime, useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { publishRoute } from '#lib/sentry-context.lib.js';

/**
 * The root loader's data. It carries nothing about the visitor: per-visitor view facts reach the page through the
 * client-facts record and its head script (`#lib/client-facts`), so the document is the same for everyone.
 */
export type RootLoaderData = {
  readonly env: ClientEnvironment;
  /** Queries the server already answered (the model catalog), hydrated into the root `QueryClient`. */
  readonly queries?: DehydratedState;
};

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
  /* D9 (A2): the runtime creates the browser `QueryClient`, above the billing fence, and the project library writes
   * into the same instance. Each server request's runtime has its own. */
  const queryClient = selectRuntimeQueryClient(useAppRuntime());

  /*
   * `QueryClientProvider` is outermost so `AuthConfigProvider`'s own
   * `DesktopAuthBridge` mount can reach the query cache: better-auth-ui's
   * `AuthProvider` does not supply a fallback client, so with the old order the
   * bridge's `invalidateQueries` half silently no-opped and an Electron-main
   * sign-in never refreshed `useSession`. Web behaviour is unchanged — the
   * relative order of the auth, billing, and analytics providers is the same.
   *
   * The server renders from the same loader data the client hydrates from, so
   * the model catalog is in the first paint (R3); hydration never replaces a
   * newer cached catalog. The person's model choice is read after hydration.
   */
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={data?.queries}>
        <CloudRootBoundary>
          <AnalyticsBoundary>
            <ThemeProvider>
              <ColorProvider>
                <AppViewerEnvironment>
                  <LayoutDocument env={data?.env ?? {}} documentChrome={documentChrome}>
                    <HarnessDocumentLoad />
                    {/* The error document's code block copies through a tooltip, so the tooltip host stays here. */}
                    <TooltipProvider>{children}</TooltipProvider>
                  </LayoutDocument>
                </AppViewerEnvironment>
              </ColorProvider>
            </ThemeProvider>
          </AnalyticsBoundary>
        </CloudRootBoundary>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}

function LayoutDocument({
  children,
  documentChrome,
  env,
}: {
  readonly children: ReactNode;
  readonly documentChrome: ReactNode | undefined;
  readonly env: Partial<ClientEnvironment>;
}): React.JSX.Element {
  /* The server renders no theme and no pointer preference: the client-facts head script applies the stored ones before
   * first paint, and the first client render reads the same record, so `<html>` hydrates as the script left it. */
  const location = useLocation();
  const { theme, ssrTheme: resolvedTheme } = useTheme();
  const color = useColor();
  const { setFaviconColor } = useFavicon();
  const usePointerCursors = useDocumentFact('pointerCursors') === true;
  const bootWatchdogScript = buildBootWatchdogScript();

  useEffect(() => {
    setFaviconColor(color.serialized.hex);
  }, [setFaviconColor, color]);

  /* RR7: the matched routes this page rendered, for the error `route` tags and the transaction names, through
   * React Router's public matches instead of its private router global. Route ids hold no space. */
  const routeIds = useMatches()
    .map((match) => match.id)
    .join(' ');
  useEffect(() => {
    publishRoute(routeIds.split(' '));
  }, [routeIds]);

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
      /* A15b: the pre-paint script sets the frame hint's variables in this style attribute before hydration; React's
       * per-property style updates leave them alone. */
      suppressHydrationWarning
    >
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <Meta />
        <ClientFactsHead />
        {/* A15b: the frame hint's variables and `--wait-offset` on <html> before first paint; before <Links />, so it never waits on a stylesheet. */}
        {/* oxlint-disable-next-line react/no-danger -- static inline script must run before first paint, as the client facts' does */}
        <script dangerouslySetInnerHTML={{ __html: buildFrameHintScript() }} suppressHydrationWarning />
        {bootWatchdogScript === undefined ? undefined : (
          /* D0 (B28): the web's boot watchdog, which works without the bundle; the desktop's lives in main. */
          /* oxlint-disable-next-line react/no-danger -- static inline script must run without the bundle */
          <script dangerouslySetInnerHTML={{ __html: bootWatchdogScript }} suppressHydrationWarning />
        )}
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
        {bootWatchdogScript === undefined ? undefined : (
          /* The watchdog's strip, hidden until its script shows it; React never changes it after the server render. */
          /* oxlint-disable-next-line react/no-danger -- static markup the inline watchdog reveals */
          <div dangerouslySetInnerHTML={{ __html: bootWatchdogStripHtml }} suppressHydrationWarning />
        )}
        {documentChrome}
        {children}
        <ScrollRestoration />
        <Scripts />
        <Toaster theme={theme} />
      </body>
    </html>
  );
}

/**
 * The product providers (R17, B28): every provider the product needs and the error document does not. They mount
 * inside the app component, never in `Layout`, so the root error boundary renders without them and a provider that
 * throws on every render is not run again by the error page.
 */
function ProductProviders({ children }: { readonly children: ReactNode }): React.ReactNode {
  return (
    <HeadlessImageProvider>
      <ProjectManagerProvider>
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
      </ProjectManagerProvider>
    </HeadlessImageProvider>
  );
}

export function ProductApp(): React.JSX.Element {
  const data = useRouteLoaderData<RootLoaderData>('root');
  const { pathname } = useLocation();
  const runtime = useOptionalAppRuntime();
  const isSafeMode = runtime !== undefined && selectRuntimeSafeMode(runtime);
  /* Desktop safe mode is main's, with its reason and the recovery window behind the bar (D0). Both are read in the
   * browser only, so the bar mounts after hydration. */
  const shell = (
    <>
      <ProductShell />
      <SafeModeNotice isRequested={isSafeMode} />
    </>
  );
  if (isRemoteHostHarness(data?.env.TAU_DEBUG, pathname)) {
    return shell;
  }
  /* The runtime's `rootFiles`: the file manager for `/`, read in the first render and on the server (A1b). */
  return (
    <RootFileManagerProvider>
      <ProductProviders>{shell}</ProductProviders>
    </RootFileManagerProvider>
  );
}

function ProductShell(): React.JSX.Element {
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
  const { pathname } = useLocation();
  /* D24, I19 (A11): the app shell, at one tree position on every route. The host renders it beside the live
   * projects, never inside one, so a project open, a move between projects or a Home visit never remounts it. */
  const page = <Page />;
  return isRemoteHostHarness(data?.env.TAU_DEBUG, pathname) ? page : <ProjectSessionsHost>{page}</ProjectSessionsHost>;
}

/**
 * Load the page as a document when a client navigation crosses into or out of the remote-host harness: the runtime's
 * file managers are idle for the harness's document only, and that is fixed when the runtime is created. It reads the
 * same debug flag and path the client entry did (never the loader data, which an error boundary or a root with no
 * loader lacks), so the reloaded document always agrees and never reloads again. Renders nothing, so the server render
 * and hydration are unchanged.
 */
function HarnessDocumentLoad(): React.ReactNode {
  const runtime = useOptionalAppRuntime();
  const { pathname } = useLocation();
  const isIdle = runtime === undefined ? undefined : selectRuntimeIdleFileManagers(runtime);
  useEffect(() => {
    if (isIdle !== undefined && isIdle !== isRemoteHostHarness(ENV.TAU_DEBUG, pathname)) {
      globalThis.location.reload();
    }
  }, [pathname, isIdle]);
  return undefined;
}

/**
 * The root error document (R17, B28): rendered inside `Layout`, which mounts no product provider, so it cannot re-run
 * the provider that failed. It scrolls on its own (D4) and links to safe mode (D0), a document load that starts with
 * Home only.
 */
export function RootErrorBoundary(): React.JSX.Element {
  const error = useRouteError();
  /* A refusal or a missing page is not a failed start; safe mode would not help with it. */
  const offersSafeMode = !isRouteErrorResponse(error) || error.status >= 500;
  return (
    <div data-slot='root-error-document' className={cn('flex flex-col', documentScrollClass)}>
      <ErrorPage />
      {offersSafeMode ? (
        <p className='px-4 pb-8 text-center text-sm text-muted-foreground'>
          Still not working?{' '}
          <a href={safeModeHref} className='text-foreground underline underline-offset-2'>
            Open in safe mode
          </a>
        </p>
      ) : undefined}
    </div>
  );
}
