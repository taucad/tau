import { Copy, Check, X } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Button } from '@taucad/ui/components/button';
import { useTickAnimation } from '#hooks/use-tick-animation.js';

export type CopyButtonProperties = {
  /**
   * The function to get the text to copy.
   */
  readonly getText: () => Promise<string> | string;
  /**
   * The tooltip to display when the button is hovered.
   */
  readonly tooltip?: string;
  readonly tooltipContentProperties?: React.ComponentProps<typeof TooltipContent>;
  readonly readyToCopyText?: string;
  readonly copiedText?: string;
} & React.ComponentProps<typeof Button>;

/**
 * What happened, and what the person can do instead.
 *
 * A clipboard write is refused by the browser, not by us: a permission the
 * shell never granted, an insecure origin, a document that lost focus. None of
 * those are recoverable from here, and all of them leave the same way out —
 * select the text and copy it — so one sentence covers every rejection.
 */
const copyFailedLabel = 'Copy failed';
const copyFailedMessage = `${copyFailedLabel}. Select the text and copy it.`;

export function CopyButton({
  getText,
  size,
  tooltip = 'Copy',
  readyToCopyText = 'Copy',
  copiedText = 'Copied',
  tooltipContentProperties,
  ...properties
}: CopyButtonProperties): React.JSX.Element {
  /* One timer, two outcomes: the tick owns *how long* the button reports its
     last attempt, `outcome` owns *what* it reports, so a success and a failure
     can never be on screen together. */
  const { ticked, trigger } = useTickAnimation();
  const [outcome, setOutcome] = useState<'copied' | 'failed'>('copied');
  const copied = ticked && outcome === 'copied';
  const failed = ticked && outcome === 'failed';

  const handleCopy = useCallback(async () => {
    try {
      /* `navigator.clipboard` is absent on an insecure origin, so the member
         access throws there and lands in the same failure state as a refusal —
         no `isSecureContext` branch, and no silent `console.warn`. */
      await navigator.clipboard.writeText(await getText());
      setOutcome('copied');
    } catch {
      setOutcome('failed');
    }
    trigger();
  }, [getText, trigger]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size={size} variant='ghost' onClick={handleCopy} {...properties}>
            {size !== 'icon' && (
              <span data-slot='label'>{failed ? copyFailedLabel : copied ? copiedText : readyToCopyText}</span>
            )}
            {/* Colour lives on the glyph, never the prose, and a refused copy is
                a soft error: the feature ramp, not destructive red (DESIGN). */}
            {failed ? (
              <X className='size-3.5 text-feature' />
            ) : copied ? (
              <Check className='size-3.5 text-success' />
            ) : (
              <Copy className='size-3.5' />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent {...tooltipContentProperties}>{failed ? copyFailedMessage : tooltip}</TooltipContent>
      </Tooltip>
      {failed ? (
        /* Announced, not just drawn: an icon-only Copy button has no label slot
           to change, and the glyph swap alone reaches nobody using a reader.
           Mounted with its text, which is what makes an alert speak. */
        <span role='alert' className='sr-only'>
          {copyFailedMessage}
        </span>
      ) : undefined}
    </>
  );
}
