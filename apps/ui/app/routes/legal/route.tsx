import { Link, Outlet } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/legal'>Legal</Link>
      </Button>
    );
  },
  enableOverflowY: true,
  enablePageFooter: true,
};

export default function LegalLayout(): React.JSX.Element {
  return (
    <div className='mx-auto size-full max-w-4xl flex-1 px-12 pb-12'>
      <Outlet />
    </div>
  );
}
