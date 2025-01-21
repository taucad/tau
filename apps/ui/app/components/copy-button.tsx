import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import React from 'react';
import { cn } from '@/utils/ui';

export interface CopyButtonProperties extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * The text to copy.
   */
  text: string;
  /**
   * Whether to show the Copy text.
   */
  showText?: boolean;
}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProperties>(
  ({ text, className, showText = true, ...properties }, reference) => {
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
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
      }
    }, [copied]);

    return (
      <Button
        size={showText ? 'xs' : 'icon'}
        variant="ghost"
        className={cn('rounded-full', className)}
        onClick={handleCopy}
        ref={reference}
        {...properties}
      >
        {copied ? <Check /> : <Copy />} {showText && (copied ? 'Copied' : 'Copy')}
      </Button>
    );
  },
);

CopyButton.displayName = 'CopyButton';
