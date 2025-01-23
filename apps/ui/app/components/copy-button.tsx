import { Copy, Check } from 'lucide-react';
import { Button, ButtonProperties } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import React from 'react';

export interface CopyButtonProperties extends ButtonProperties {
  /**
   * The text to copy.
   */
  text: string;
}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProperties>(
  ({ text, size, ...properties }, reference) => {
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
      <Button size={size} variant="ghost" onClick={handleCopy} ref={reference} {...properties}>
        <span>{copied ? <Check /> : <Copy />}</span>
        {size !== 'icon' && (copied ? 'Copied' : 'Copy')}
      </Button>
    );
  },
);

CopyButton.displayName = 'CopyButton';
