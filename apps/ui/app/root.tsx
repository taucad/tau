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
import { useServiceWorker } from './hooks/use-service-worker';
import { Toaster } from './components/ui/sonner';
import {
  CHAT_COOKIE_NAME,
  CHAT_RESIZE_COOKIE_NAME_HISTORY,
  CHAT_RESIZE_COOKIE_NAME_MAIN,
} from './components/chat-interface';
import { webManifestLinks } from '@/routes/manifest[.webmanifest]';
import { getModels, Model } from './hooks/use-models';

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

const safeParseResizeCookie = (cookie: string): [number, number] => {
  try {
    return JSON.parse(cookie);
  } catch {
    return [40, 60];
  }
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { getTheme } = await themeSessionResolver(request);
  const cookieHeader = request.headers.get('Cookie');
  const isSidebarOpen = extractCookie(cookieHeader, SIDEBAR_COOKIE_NAME, 'true');
  const isChatOpen = extractCookie(cookieHeader, CHAT_COOKIE_NAME, 'true');
  const chatResizeMain = safeParseResizeCookie(extractCookie(cookieHeader, CHAT_RESIZE_COOKIE_NAME_MAIN, '[30,70]'));
  const chatResizeHistory = safeParseResizeCookie(
    extractCookie(cookieHeader, CHAT_RESIZE_COOKIE_NAME_HISTORY, '[15,85]'),
  );

  let models: Model[] = [];
  try {
    models = await getModels();
  } catch (error) {
    models = [];
    console.error(error);
  }

  return {
    theme: getTheme(),
    sidebarOpen: isSidebarOpen === 'true',
    chatOpen: isChatOpen === 'true',
    resize: {
      chatMain: chatResizeMain,
      chatHistory: chatResizeHistory,
    },
    env: ENV,
    models,
  };
}

// Wrap your app with ThemeProvider.
// `specifiedTheme` is the stored theme in the session storage.
// `themeAction` is the action name that's used to change the theme in the session storage.
export default function AppWithProviders() {
  const data = useLoaderData<typeof loader>();
  const [queryClient] = useState(() => new QueryClient());

  // Setup the service worker
  useServiceWorker();

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
      <body>
        <Page />
        <ScrollRestoration />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}
