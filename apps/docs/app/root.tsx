import type { LinksFunction, MetaFunction } from 'react-router';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from 'react-router';
import { RootProvider } from 'fumadocs-ui/provider/react-router';
import type { ReactNode } from 'react';
import { getStaticSearchIndexUrl } from '#lib/fumadocs/static-search.server.js';
// oxlint-disable-next-line import-x/no-unassigned-import -- Vite extracts the global stylesheet into the static client build.
import '#styles/global.css';

export const links: LinksFunction = () => [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'preload', href: '/fonts/Geist-Variable.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  {
    rel: 'preload',
    href: '/fonts/GeistMono-Variable.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
];

const siteTitle = 'Tau Docs — Browser-native parametric CAD';
const siteDescription =
  'Documentation for Tau, the open-source parametric CAD platform, and its Apache-2.0 multi-kernel runtime packages.';

export const meta: MetaFunction = () => [
  { title: siteTitle },
  { name: 'description', content: siteDescription },
  { property: 'og:type', content: 'website' },
  { property: 'og:site_name', content: 'Tau Docs' },
  { property: 'og:title', content: siteTitle },
  { property: 'og:description', content: siteDescription },
  { property: 'og:url', content: 'https://docs.tau.new/' },
  { property: 'og:image', content: 'https://tau.new/android-chrome-512x512.png' },
  { name: 'twitter:card', content: 'summary' },
  { name: 'twitter:title', content: siteTitle },
  { name: 'twitter:description', content: siteDescription },
  { name: 'twitter:image', content: 'https://tau.new/android-chrome-512x512.png' },
];

export const loader = async (): Promise<{ searchIndexUrl: string }> => ({
  searchIndexUrl: await getStaticSearchIndexUrl(),
});

export function Layout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App(): React.JSX.Element {
  const { searchIndexUrl } = useLoaderData<typeof loader>();

  return (
    <RootProvider
      search={{ options: { type: 'static', api: searchIndexUrl } }}
      theme={{
        attribute: 'class',
        defaultTheme: 'system',
        enableSystem: true,
        disableTransitionOnChange: true,
        themes: ['light', 'dark', 'black', 'high-contrast'],
      }}
    >
      <Outlet />
    </RootProvider>
  );
}

export function ErrorBoundary(): React.JSX.Element {
  return (
    <main className='grid min-h-svh place-items-center bg-background px-6 text-foreground'>
      <div className='max-w-md space-y-4 text-center'>
        <p className='font-mono text-xs tracking-widest text-muted-foreground'>DOCUMENT NOT FOUND</p>
        <h1 className='text-4xl font-semibold tracking-tight'>This page is not in the documentation.</h1>
        <a
          className='inline-flex min-h-10 items-center text-sm font-medium text-fd-primary hover:underline'
          href='/runtime'
        >
          Open Runtime docs
        </a>
      </div>
    </main>
  );
}
