import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';

import { TauAttributionFooter } from '@/components/tau-attribution-footer';
import { source } from '@/lib/source';

const Layout = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <DocsLayout
    nav={{ title: '@@CREATE_REPO_npm-name@@' }}
    sidebar={{ footer: <TauAttributionFooter /> }}
    tree={source.pageTree}
  >
    {children}
  </DocsLayout>
);

export default Layout;
