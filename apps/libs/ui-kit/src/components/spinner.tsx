import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';

function Spinner({ className, ...props }: Omit<React.ComponentProps<'svg'>, 'children'>): React.JSX.Element {
  return <Loader role='status' aria-label='Loading' className={cn('size-4', className)} {...props} />;
}

export { Spinner };
