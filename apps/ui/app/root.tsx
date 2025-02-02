import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { Links, Meta, Scripts, ScrollRestoration, useLoaderData } from '@remix-run/react';

import stylesUrl from './styles/global.css?url';

import { Page } from '@/components/page';
import { themeSessionResolver } from '@/sessions.server';
import { PreventFlashOnWrongTheme, ThemeProvider, useTheme } from 'remix-themes';
import { cn } from '@/utils/ui';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar';
import { extractCookie } from '@/utils/cookies';
import { markdownViewerLinks } from '@/components/markdown-viewer';
import { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ENV, metaConfig } from './config';
import { useOffline } from './hooks/use-offline';
import { ManifestLink } from '@remix-pwa/sw';
import { Toaster } from './components/ui/sonner';
import { webManifestLinks } from '@/routes/manifest[.webmanifest]';

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

// Return the theme from the session storage using the loader
export async function loader({ request }: LoaderFunctionArgs) {
  const { getTheme } = await themeSessionResolver(request);
  const cookieHeader = request.headers.get('Cookie');
  const sidebarOpen = extractCookie(cookieHeader, SIDEBAR_COOKIE_NAME);

  return {
    theme: getTheme(),
    sidebarOpen: sidebarOpen === 'true',
    env: ENV,
  };
}

// Wrap your app with ThemeProvider.
// `specifiedTheme` is the stored theme in the session storage.
// `themeAction` is the action name that's used to change the theme in the session storage.
export default function AppWithProviders() {
  const data = useLoaderData<typeof loader>();
  const [queryClient] = useState(() => new QueryClient());

  useOffline();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider specifiedTheme={data.theme} themeAction="/action/set-theme">
        <TooltipProvider delayDuration={0}>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function App() {
  const data = useLoaderData<typeof loader>();
  const [theme] = useTheme();

  return (
    <html lang="en" className={cn(theme)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <PreventFlashOnWrongTheme ssrTheme={Boolean(data.theme)} />
        <Links />
      </head>
      <body className="overflow-hidden">
        <Page />
        <ScrollRestoration />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}
