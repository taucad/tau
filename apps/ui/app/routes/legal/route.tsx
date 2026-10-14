import { Outlet } from 'react-router';
import { PageContent } from '#components/layout/page-content.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  enableOverflowY: true,
  enablePageFooter: true,
};

export default function LegalLayout(): React.JSX.Element {
  return (
    <PageContent className='flex-1'>
      <Outlet />
    </PageContent>
  );
}
