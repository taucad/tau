import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { Links, LiveReload, Meta, Scripts, ScrollRestoration, useLoaderData } from '@remix-run/react';

import stylesUrl from './styles/global.css?url';

import { Page } from '@/components/page';
import { themeSessionResolver } from '@/sessions.server';
import { PreventFlashOnWrongTheme, ThemeProvider, useTheme } from 'remix-themes';
import { cn } from '@/utils/ui';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar';
import { extractCookie } from '@/utils/cookies';
import { markdownViewerLinks } from '@/components/markdown-viewer';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: stylesUrl }, ...markdownViewerLinks];

export const meta: MetaFunction = () => [
  {
    title: 'TauCAD',
  },
];

// Return the theme from the session storage using the loader
export async function loader({ request }: LoaderFunctionArgs) {
  const { getTheme } = await themeSessionResolver(request);
  const cookieHeader = request.headers.get('Cookie');
  const sidebarOpen = extractCookie(cookieHeader, SIDEBAR_COOKIE_NAME);

  return {
    theme: getTheme(),
    sidebarOpen: sidebarOpen === 'true',
  };
}

// Wrap your app with ThemeProvider.
// `specifiedTheme` is the stored theme in the session storage.
// `themeAction` is the action name that's used to change the theme in the session storage.
export default function AppWithProviders() {
  const data = useLoaderData<typeof loader>();
  return (
    <ThemeProvider specifiedTheme={data.theme} themeAction="/action/set-theme">
      <TooltipProvider delayDuration={0}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
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
        <LiveReload />
      </body>
    </html>
  );
}
