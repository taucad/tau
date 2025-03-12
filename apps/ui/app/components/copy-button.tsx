import { Copy, Check } from 'lucide-react';
import { Button, ButtonProperties } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export interface CopyButtonProperties extends ButtonProperties {
  /**
   * The text to copy.
   */
  text: string;
  /**
   * The tooltip to display when the button is hovered.
   */
  tooltip?: string;
}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProperties>(
  ({ text, size, tooltip = 'Copy', ...properties }, reference) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      setCopied(true);
      if (globalThis.isSecureContext) {
        navigator.clipboard.writeText(text || '');
      } else {
        console.warn('Clipboard operations are only allowed in secure contexts.');
      }
    };

    useEffect(() => {
      if (copied) {
        const timer = setTimeout(() => {
          setCopied(false);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }, [copied]);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size={size} variant="ghost" onClick={handleCopy} ref={reference} {...properties}>
            {size !== 'icon' && <span data-slot="label">{copied ? 'Copied' : 'Copy'}</span>}
            {copied ? <Check /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);

CopyButton.displayName = 'CopyButton';
