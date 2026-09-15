import type { LinksFunction, MetaFunction } from 'react-router';
import type { ReactNode } from 'react';
import { metaConfig } from '#constants/meta.constants.js';
import { globalStylesLinks } from '#styles/global.styles.js';
import { ProductApp, RootErrorBoundary, RootLayout } from '#root-layout.js';
import { RootCommandPaletteItems } from '#root-command-items.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  commandPalette(match) {
    return <RootCommandPaletteItems match={match} />;
  },
};

export const links: LinksFunction = () => globalStylesLinks;

export const meta: MetaFunction = () => [
  { title: metaConfig.name },
  { name: 'description', content: metaConfig.description },
  { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

export function Layout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <RootLayout>{children}</RootLayout>;
}

export default function App(): React.JSX.Element {
  return <ProductApp />;
}

export function ErrorBoundary(): React.JSX.Element {
  return <RootErrorBoundary />;
}
