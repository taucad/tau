import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useNavigate,
  useLoaderData,
} from '@remix-run/react';
import type { Theme } from 'remix-themes';
import { PreventFlashOnWrongTheme, ThemeProvider, useTheme } from 'remix-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import stylesUrl from './styles/global.css?url';
import { getEnvironment, metaConfig } from './config.js';
import { buttonVariants } from './components/ui/button.js';
import { Page } from '@/components/page.js';
import { themeSessionResolver } from '@/sessions.server.js';
import { cn } from '@/utils/ui.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';
import { markdownViewerLinks } from '@/components/markdown-viewer.js';
import { useServiceWorker } from '@/hooks/use-service-worker.js';
import { Toaster } from '@/components/ui/sonner.js';
import { webManifestLinks } from '@/routes/manifest[.webmanifest].js';
import type { Model } from '@/hooks/use-models.js';
import { getModels } from '@/hooks/use-models.js';
import { ColorProvider, useColor } from '@/hooks/use-color.js';
import { useFavicon } from '@/hooks/use-favicon.js';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesUrl },
  ...webManifestLinks,
  ...markdownViewerLinks,
];

export const meta: MetaFunction = () => [
  { title: metaConfig.name },
  { name: 'description', content: metaConfig.description },
  { name: 'theme-color', content: '#ffffff' },
  { name: 'apple-mobile-web-app-title', content: metaConfig.name },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'mobile-web-app-capable', content: 'yes' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { getTheme } = await themeSessionResolver(request);
  const cookie = request.headers.get('Cookie') ?? '';

  let models: Model[] = [];
  try {
    models = await getModels();
  } catch (error) {
    models = [];
    console.error(error);
  }

  return {
    theme: getTheme(),
    cookie,
    env: await getEnvironment(),
    models,
  };
}

// Wrap your app with ThemeProvider.
// `specifiedTheme` is the stored theme in the session storage.
// `themeAction` is the action name that's used to change the theme in the session storage.
export default function AppWithProviders({ error }: { readonly error?: ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { networkMode: 'offlineFirst' },
          mutations: { networkMode: 'offlineFirst' },
        },
      }),
    [],
  );

  // Setup the service worker
  useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider specifiedTheme={data?.theme} themeAction="/action/set-theme">
        <ColorProvider>
          <TooltipProvider delayDuration={0}>
            <App error={error} ssrTheme={data?.theme} env={data?.env} />
          </TooltipProvider>
        </ColorProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function App({
  error,
  ssrTheme,
  env,
}: {
  readonly error?: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is used for system theme
  readonly ssrTheme: Theme | null;
  readonly env: Record<string, string>;
}) {
  const [theme] = useTheme();
  const color = useColor();
  const { setFaviconColor } = useFavicon();

  useEffect(() => {
    setFaviconColor(color.serialized.hex);
  }, [setFaviconColor, color]);

  return (
    <html lang="en" className={cn(theme)} style={color.rootStyles}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <PreventFlashOnWrongTheme ssrTheme={Boolean(ssrTheme)} />
        <Links />
      </head>
      <body>
        <script
          // eslint-disable-next-line react/no-danger -- safe for environment injection as recommended by Remix
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(env)}`,
          }}
        />
        <Page error={error} />
        <ScrollRestoration />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  return <AppWithProviders error={<AppError />} />;
}

export function AppError() {
  const error = useRouteError();
  const navigate = useNavigate();

  const goBack = () => {
    navigate(-1);
  };

  if (isRouteErrorResponse(error)) {
    console.error('Route error', error);
    return (
      <div className="flex size-full flex-col items-center justify-center gap-4">
        <h1 className="text-xl">
          {error.status} {error.statusText}
        </h1>
        <p>{error.data}</p>
        <p>
          Please try again later,{' '}
          <button
            type="button"
            className={cn(buttonVariants({ variant: 'link' }), 'h-auto cursor-pointer p-0 text-base underline')}
            onClick={goBack}
          >
            head back
          </button>
          {', '}
          or navigate to a different page.
        </p>
      </div>
    );
  }

  if (error instanceof Error) {
    return (
      <div className="flex flex-col gap-4 p-2">
        <h1 className="text-xl">Error</h1>
        <p>{error.message}</p>
        <p>The stack trace is:</p>
        <pre>{error.stack}</pre>
      </div>
    );
  }

  return <h1>Unknown Error</h1>;
}
