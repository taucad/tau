import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import type { Geometry } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { useAr } from '#components/cad/use-ar.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { cn } from '#utils/ui.utils.js';

function ArIcon({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={2}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
    >
      {/* Viewfinder corners */}
      <path d='M3 7V5a2 2 0 0 1 2-2h2' />
      <path d='M17 3h2a2 2 0 0 1 2 2v2' />
      <path d='M21 17v2a2 2 0 0 1-2 2h-2' />
      <path d='M7 21H5a2 2 0 0 1-2-2v-2' />
      {/* 3D cube */}
      <path d='m12 7 4 2.5v5L12 17l-4-2.5v-5Z' />
      <path d='m12 7 0 5' />
      <path d='m12 12 4 2.5' />
      <path d='m12 12-4 2.5' />
    </svg>
  );
}

export const ArButton = memo(function ({
  geometries,
  kernelClient,
  className,
}: {
  readonly geometries: readonly Geometry[];
  readonly kernelClient?: AppRuntimeClient;
  readonly className?: string;
}): React.ReactNode {
  const isMobile = useIsMobile();
  const { canActivateAr, isConverting, activateAr } = useAr(geometries, kernelClient);

  if (!isMobile || !canActivateAr) {
    return undefined;
  }

  return (
    <Button
      variant='overlay'
      size='icon'
      className={cn('size-10 rounded-xl shadow-md', className)}
      disabled={isConverting}
      onClick={activateAr}
    >
      {isConverting ? <Loader2 className='size-5 animate-spin' /> : <ArIcon className='size-5' />}
    </Button>
  );
});
