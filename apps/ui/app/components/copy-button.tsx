import { Copy, Check } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { Button } from '@/components/ui/button.js';

export type CopyButtonProperties = {
  /**
   * The text to copy.
   */
  readonly text: string;
  /**
   * The tooltip to display when the button is hovered.
   */
  readonly tooltip?: string;
  readonly tooltipContentProperties?: React.ComponentProps<typeof TooltipContent>;
} & React.ComponentProps<typeof Button>;

export function CopyButton({
  text,
  size,
  tooltip = 'Copy',
  tooltipContentProperties,
  ...properties
}: CopyButtonProperties): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    if (globalThis.isSecureContext) {
      void navigator.clipboard.writeText(text || '');
    } else {
      console.warn('Clipboard operations are only allowed in secure contexts.');
    }
  };

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
          {size !== 'icon' && <span data-slot="label">{copied ? 'Copied' : 'Copy'}</span>}
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent {...tooltipContentProperties}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
