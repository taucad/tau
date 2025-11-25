import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Links, Meta, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router';
import { PreventFlashOnWrongTheme, Theme, ThemeProvider, useTheme } from 'remix-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Model } from '@taucad/types';
import { getEnvironment } from '#config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { Page } from '#components/layout/page.js';
import { themeSessionResolver } from '#sessions.server.js';
import { cn } from '#utils/ui.utils.js';
import { markdownViewerLinks } from '#components/markdown/markdown-viewer.js';
import { Toaster } from '#components/ui/sonner.js';
import { webManifestLinks } from '#routes/manifest[.webmanifest].js';
import { getModels } from '#hooks/use-models.js';
import { ColorProvider, useColor } from '#hooks/use-color.js';
import { useFavicon } from '#hooks/use-favicon.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { ErrorPage } from '#components/error-page.js';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import type { Handle } from '#types/matches.types.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import { BuildManagerProvider } from '#hooks/use-build-manager.js';
import { FileManagerProvider } from '#hooks/use-file-manager.js';

export const links: LinksFunction = () => [...globalStylesLinks, ...webManifestLinks, ...markdownViewerLinks];

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

export const handle: Handle = {
  commandPalette(match) {
    return <RootCommandPaletteItems match={match} />;
  },
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- loaders require type inference
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

export function Layout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const data = useRouteLoaderData<typeof loader>('root');
  const ssrTheme = data?.theme ?? Theme.LIGHT;
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

  return (
    <AuthConfigProvider>
      <QueryClientProvider client={queryClient}>
        <FileManagerProvider rootDirectory="/">
          <BuildManagerProvider>
            <ThemeProvider specifiedTheme={ssrTheme} themeAction="/action/set-theme">
              <ColorProvider>
                <TooltipProvider>
                  <LayoutDocument env={data?.env ?? {}} ssrTheme={ssrTheme}>
                    {children}
                  </LayoutDocument>
                </TooltipProvider>
              </ColorProvider>
            </ThemeProvider>
          </BuildManagerProvider>
        </FileManagerProvider>
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
  readonly env: Record<string, string>;
  readonly ssrTheme: Theme;
}): React.JSX.Element {
  const [theme] = useTheme();
  const color = useColor();
  const { setFaviconColor } = useFavicon();

  useEffect(() => {
    setFaviconColor(color.serialized.hex);
  }, [setFaviconColor, color]);

  return (
    <html lang="en" className={cn(theme, '[--spacing:0.275rem] md:[--spacing:0.25rem]')} style={color.rootStyles}>
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
