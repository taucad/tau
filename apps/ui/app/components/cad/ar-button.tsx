import { memo, useEffect, useId, useRef } from 'react';
import { Loader2, Scan } from 'lucide-react';
import type { Artifact, RuntimeDocument } from '@taucad/runtime';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverAnchor, PopoverContent } from '@taucad/ui/components/popover';
import { useAr } from '#components/cad/use-ar.js';
import type { ArFailure } from '#components/cad/use-ar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

/** Shared AR glyph for the launch button and proposed grouped controls. */
export function ArIcon({ className }: { readonly className?: string }): React.JSX.Element {
  return <Scan aria-hidden className={className} />;
}

/**
 * The capability-gated AR control. It renders only when this device can open the current model in AR — Quick Look
 * on iPhone and iPad (including iPadOS's desktop user agent), or WebXR on supported Android — whatever the layout,
 * so tablets in the desktop layout get it too (D12).
 */
export const ArButton = memo(function ({
  artifact,
  runtimeDocument,
  className,
}: {
  readonly artifact: Artifact | undefined;
  readonly runtimeDocument?: RuntimeDocument;
  readonly className?: string;
}): React.ReactNode {
  const { canActivateAr, isPreparing, isPresenting, failure, activateAr, dismissFailure } = useAr(
    artifact,
    runtimeDocument,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasPresentingRef = useRef(false);

  // Coming back from an in-page AR session, focus returns to the control that opened it.
  useEffect(() => {
    if (wasPresentingRef.current && !isPresenting) {
      buttonRef.current?.focus();
    }

    wasPresentingRef.current = isPresenting;
  }, [isPresenting]);

  if (!canActivateAr) {
    return undefined;
  }

  return (
    <ArControl
      ref={buttonRef}
      isPreparing={isPreparing || isPresenting}
      failure={failure}
      className={className}
      onActivate={() => {
        void activateAr();
      }}
      onDismiss={dismissFailure}
    />
  );
});

/** AR presentation shared by the capability-gated host and the review canvas. */
export function ArControl({
  ref,
  isPreparing = false,
  failure,
  onActivate,
  onDismiss,
  className,
}: {
  readonly ref?: React.Ref<HTMLButtonElement>;
  readonly isPreparing?: boolean;
  /** A failed launch, shown in a popover above the control with Try again and Dismiss. */
  readonly failure?: ArFailure;
  readonly onActivate: () => void;
  readonly onDismiss?: () => void;
  readonly className?: string;
}): React.JSX.Element {
  const titleId = useId();
  const detailId = useId();
  const localRef = useRef<HTMLButtonElement>(null);

  const button = (
    <Button
      ref={(node) => {
        localRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      variant='ghost'
      size='icon-sm'
      className={className}
      aria-label={isPreparing ? 'Preparing view in your space' : 'View in your space'}
      aria-busy={isPreparing}
      // Stays focusable while preparing, so focus is never dropped to the page during an export or session.
      aria-disabled={isPreparing}
      onClick={() => {
        if (!isPreparing) {
          onActivate();
        }
      }}
    >
      {isPreparing ? <Loader2 className='size-4 spin-glyph' /> : <ArIcon className='size-4' />}
    </Button>
  );

  return (
    <Popover
      open={failure !== undefined}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onDismiss?.();
        }
      }}
    >
      <Tooltip>
        <PopoverAnchor asChild>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
        </PopoverAnchor>
        <TooltipContent>View in your space</TooltipContent>
      </Tooltip>
      {failure ? (
        <PopoverContent
          role='alertdialog'
          aria-labelledby={titleId}
          aria-describedby={detailId}
          side='top'
          align='center'
          className='w-72 space-y-3'
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            localRef.current?.focus();
          }}
        >
          <div className='space-y-1'>
            <p id={titleId} className='text-sm font-medium'>
              {failure.title}
            </p>
            <p id={detailId} className='text-sm text-muted-foreground'>
              {failure.detail}
            </p>
          </div>
          <div className='flex justify-end gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                onDismiss?.();
              }}
            >
              Dismiss
            </Button>
            <Button
              size='sm'
              onClick={() => {
                localRef.current?.focus();
                onActivate();
              }}
            >
              Try again
            </Button>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
