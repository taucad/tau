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

import stylesUrl from './styles/global.css?url';

import { Page } from '@/components/page';
import { themeSessionResolver } from '@/sessions.server';
import { PreventFlashOnWrongTheme, Theme, ThemeProvider, useTheme } from 'remix-themes';
import { cn } from '@/utils/ui';
import { TooltipProvider } from '@/components/ui/tooltip';
import { parseCookies } from '@/utils/cookies';
import { markdownViewerLinks } from '@/components/markdown-viewer';
import { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { ENV, metaConfig } from './config';
import { useServiceWorker } from '@/hooks/use-service-worker';
import { Toaster } from '@/components/ui/sonner';
import { webManifestLinks } from '@/routes/manifest[.webmanifest]';
import { getModels, Model } from '@/hooks/use-models';
import { buttonVariants } from './components/ui/button';

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
  { rel: 'icon', href: '/favicon.ico' },
  { rel: 'shortcut icon', href: '/favicon.ico' },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { getTheme } = await themeSessionResolver(request);
  const cookieHeader = request.headers.get('Cookie');
  const cookies = parseCookies(cookieHeader ?? '');

  let models: Model[] = [];
  try {
    models = await getModels();
  } catch (error) {
    models = [];
    console.error(error);
  }

  return {
    theme: getTheme(),
    cookies,
    env: ENV,
    models,
  };
}

// Wrap your app with ThemeProvider.
// `specifiedTheme` is the stored theme in the session storage.
// `themeAction` is the action name that's used to change the theme in the session storage.
export default function AppWithProviders({ error }: { error?: ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const [queryClient] = useState(() => new QueryClient());

  // Setup the service worker
  useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider specifiedTheme={data?.theme} themeAction="/action/set-theme">
        <TooltipProvider delayDuration={0}>
          <App error={error} ssrTheme={data?.theme} />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function App({ error, ssrTheme }: { error?: ReactNode; ssrTheme: Theme | null }) {
  const [theme] = useTheme();

  return (
    <html lang="en" className={cn(theme)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <PreventFlashOnWrongTheme ssrTheme={Boolean(ssrTheme)} />
        <Links />
      </head>
      <body>
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
      <div className="flex flex-col h-full w-full items-center justify-center gap-4">
        <h1 className="text-xl">
          {error.status} {error.statusText}
        </h1>
        <p>{error.data}</p>
        <p>
          Please try again later,{' '}
          <button
            onClick={goBack}
            className={cn(buttonVariants({ variant: 'link' }), 'p-0 h-auto text-base underline cursor-pointer')}
          >
            head back
          </button>
          {', '}
          or navigate to a different page.
        </p>
      </div>
    );
  } else if (error instanceof Error) {
    return (
      <div className="p-2 flex flex-col gap-4">
        <h1 className="text-xl">Error</h1>
        <p>{error.message}</p>
        <p>The stack trace is:</p>
        <pre>{error.stack}</pre>
      </div>
    );
  } else {
    return <h1>Unknown Error</h1>;
  }
}
