import { Tau } from '@/lib/tau.js';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Tau className='text-fd-primary size-8' />,
    },
  };
}
