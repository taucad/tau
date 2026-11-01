import { memo, useEffect, useId, useRef } from 'react';
import { Loader2, Scan } from 'lucide-react';
import type { Artifact } from '@taucad/runtime';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { Popover, PopoverAnchor, PopoverContent } from '@taucad/ui/components/popover';
import { useAr } from '#components/cad/use-ar.js';
import type { ArFailure } from '#components/cad/use-ar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

/** Shared AR glyph for the launch button and proposed grouped controls: the scan frame with a small "AR" inside it. */
export function ArIcon({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <Scan aria-hidden className={className}>
      {/* Baseline at the frame's centre plus half the capitals' height (~0.73 em), so "AR" itself is centred; a
          `central` baseline centres the font's em box instead, which sits low and varies by font. */}
      <text
        x='12'
        y='15.1'
        textAnchor='middle'
        fontSize='8.5'
        fontWeight='700'
        letterSpacing='-0.2'
        fill='currentColor'
        stroke='none'
      >
        AR
      </text>
    </Scan>
  );
}

/**
 * The capability-gated AR control. It renders only when this device can open the current model in AR — Quick Look
 * on iPhone and iPad (including iPadOS's desktop user agent), or WebXR on supported Android — and nothing otherwise.
 * It does not check the layout: the viewer bar places it after Fit view on phones and after Fullscreen in the
 * desktop layout, so tablets get it too (D12) while desktop computers render nothing.
 */
export const ArButton = memo(function ({
  artifact,
  className,
}: {
  readonly artifact: Artifact | undefined;
  readonly className?: string;
}): React.ReactNode {
  const { canActivateAr, isPreparing, isPresenting, failure, activateAr, dismissFailure } = useAr(artifact);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasBusyRef = useRef(false);
  const isBusy = isPreparing || isPresenting;

  // Coming back from AR, or from a session that ended while it started, focus returns to the control that opened it
  // when the overlay took it away. A failure's popover manages focus itself.
  useEffect(() => {
    if (wasBusyRef.current && !isBusy && !failure) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        buttonRef.current?.focus();
      }
    }

    wasBusyRef.current = isBusy;
  }, [isBusy, failure]);

  if (!canActivateAr) {
    return undefined;
  }

  return (
    <ArControl
      ref={buttonRef}
      isPreparing={isBusy}
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
      className={cn('aria-disabled:opacity-50', className)}
      // One name for label, tooltip and accessible name (I6); preparing is told by aria-busy and the spinner.
      aria-label='View in your space'
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
            // This runs a task after the popover closes. A retry that failed at once has opened the next failure by
            // then, and taking focus from it would dismiss it, so return focus only when nothing holds it.
            const active = document.activeElement;
            if (!active || active === document.body) {
              localRef.current?.focus();
            }
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
