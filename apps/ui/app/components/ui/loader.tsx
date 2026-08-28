import { cn } from '#utils/ui.utils.js';

type LoaderProps = {
  readonly className?: string;
};

export function Loader({ className }: LoaderProps): React.JSX.Element {
  return (
    <svg
      aria-hidden='true'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      className={cn('animate-spin', className)}
    >
      <circle cx='12' cy='12' r='9' stroke='currentColor' strokeWidth='2' className='opacity-20' />
      <path d='M21 12a9 9 0 1 1-6.219-8.56' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
    </svg>
  );
}
