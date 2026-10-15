import type { MetaFunction } from 'react-router';
import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import type { Handle } from '#types/matches.types.js';

export const meta: MetaFunction = () => [{ title: 'Workflows · Tau' }];
export const handle: Handle = { enableOverflowY: true };

export default function Workflows(): React.JSX.Element {
  return (
    <PageContent className='space-y-6'>
      <PageHeader title='Workflows' />
      <p className='text-sm text-muted-foreground'>Workflows are coming soon.</p>
    </PageContent>
  );
}
