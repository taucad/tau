import { memo } from 'react';
import { Loader2, Scan } from 'lucide-react';
import type { Artifact, RuntimeDocument } from '@taucad/runtime';
import { Button } from '@taucad/ui/components/button';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { useAr } from '#components/cad/use-ar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

/** Shared AR glyph for the launch button and proposed grouped controls. */
export function ArIcon({ className }: { readonly className?: string }): React.JSX.Element {
  return <Scan aria-hidden className={className} />;
}

export const ArButton = memo(function ({
  artifact,
  runtimeDocument,
  className,
}: {
  readonly artifact: Artifact | undefined;
  readonly runtimeDocument?: RuntimeDocument;
  readonly className?: string;
}): React.ReactNode {
  const isMobile = useIsMobile();
  const { canActivateAr, isConverting, activateAr } = useAr(artifact, runtimeDocument);

  if (!isMobile || !canActivateAr) {
    return undefined;
  }

  return <ArControl isPreparing={isConverting} onActivate={activateAr} className={className} />;
});

/** AR presentation shared by the capability-gated host and the review canvas. */
export function ArControl({
  isPreparing = false,
  onActivate,
  className,
}: {
  readonly isPreparing?: boolean;
  readonly onActivate: () => void;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          className={className}
          aria-label={isPreparing ? 'Preparing view in your space' : 'View in your space'}
          aria-busy={isPreparing}
          disabled={isPreparing}
          onClick={onActivate}
        >
          {isPreparing ? <Loader2 className='size-4 spin-glyph' /> : <ArIcon className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>View in your space</TooltipContent>
    </Tooltip>
  );
}
