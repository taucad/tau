import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export interface CopyButtonProperties extends React.ComponentProps<typeof Button> {
  /**
   * The text to copy.
   */
  text: string;
  /**
   * The tooltip to display when the button is hovered.
   */
  tooltip?: string;
}

export function CopyButton({ text, size, tooltip = 'Copy', ...properties }: CopyButtonProperties) {
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
        <Button size={size} variant="ghost" onClick={handleCopy} {...properties}>
          {size !== 'icon' && <span data-slot="label">{copied ? 'Copied' : 'Copy'}</span>}
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
