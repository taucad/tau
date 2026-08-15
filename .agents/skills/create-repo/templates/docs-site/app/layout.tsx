import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';

import './global.css';

export const metadata: Metadata = {
  description: '@@CREATE_REPO_description@@',
  metadataBase: new URL('https://@@CREATE_REPO_docs-domain@@'),
  title: { default: '@@CREATE_REPO_npm-name@@', template: `%s — @@CREATE_REPO_npm-name@@` },
};

const Layout = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <html lang='en' suppressHydrationWarning>
    <body className='flex min-h-screen flex-col'>
      <RootProvider>{children}</RootProvider>
    </body>
  </html>
);

export default Layout;
