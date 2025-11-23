import { Copy, Check } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';

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
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    setCopied(true);
    if (globalThis.isSecureContext) {
      void navigator.clipboard.writeText(await getText());
    } else {
      console.warn('Clipboard operations are only allowed in secure contexts.');
    }
  }, [getText]);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;

    if (copied) {
      timer = setTimeout(() => {
        setCopied(false);
        timer = undefined;
      }, 2000);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [copied]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size={size} variant="ghost" onClick={handleCopy} {...properties}>
          {size !== 'icon' && <span data-slot="label">{copied ? copiedText : readyToCopyText}</span>}
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent {...tooltipContentProperties}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
