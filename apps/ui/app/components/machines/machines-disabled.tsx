import { Link } from 'react-router';
import { machinesDisabledMessage } from '@taucad/types/constants';
import { Button } from '@taucad/ui/components/button';

/** Recovery for old machine links and restored Print panels in a disabled deployment. */
export function MachinesDisabled(): React.JSX.Element {
  return (
    <div className='flex flex-col items-start gap-3 p-4'>
      <p role='status'>{machinesDisabledMessage}</p>
      <Button asChild variant='outline'>
        <Link to='/projects'>Open projects</Link>
      </Button>
    </div>
  );
}
