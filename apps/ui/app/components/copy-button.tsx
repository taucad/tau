import { Copy, Check } from 'lucide-react';
import React, { useCallback } from 'react';
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

export function CopyButton({
  getText,
  size,
  tooltip = 'Copy',
  readyToCopyText = 'Copy',
  copiedText = 'Copied',
  tooltipContentProperties,
  ...properties
}: CopyButtonProperties): React.JSX.Element {
  const { ticked: copied, trigger } = useTickAnimation();

  const handleCopy = useCallback(async () => {
    trigger();
    if (globalThis.isSecureContext) {
      void navigator.clipboard.writeText(await getText());
    } else {
      console.warn('Clipboard operations are only allowed in secure contexts.');
    }
  }, [getText, trigger]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size={size} variant='ghost' onClick={handleCopy} {...properties}>
          {size !== 'icon' && <span data-slot='label'>{copied ? copiedText : readyToCopyText}</span>}
          {copied ? <Check className='size-3.5 text-success' /> : <Copy className='size-3.5' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent {...tooltipContentProperties}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
