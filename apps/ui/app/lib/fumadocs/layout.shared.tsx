import { Tau } from '#components/icons/tau.js';
import type { DocsLayoutProps } from 'fumadocs-ui/layouts/docs';

export function baseOptions(): Omit<DocsLayoutProps, 'tree'> {
  return {
    nav: {
      enabled: false,
      title: <Tau className='text-fd-primary size-8' />,
    },
    sidebar: {
      // comp
    }
  };
}
