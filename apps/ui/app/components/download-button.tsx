import { Download } from 'lucide-react';
import { Button, ButtonProperties } from '@/components/ui/button';
import React from 'react';

export interface DownloadButtonProperties extends ButtonProperties {
  /**
   * The text to copy.
   */
  text: string;
  /**
   * The title of the file to download.
   */
  title?: string;
}

export const DownloadButton = React.forwardRef<HTMLButtonElement, DownloadButtonProperties>(
  ({ text, size, title = 'download.txt', ...properties }, reference) => {
    const handleDownload = () => {
      // New download handler logic without creating an element
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      fetch(url)
        .then((response) => response.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            const base64data = reader.result;
            const a = document.createElement('a');
            a.href = base64data as string;
            a.download = title;
            a.click();
          });
          reader.readAsDataURL(blob);
        })
        .finally(() => {
          URL.revokeObjectURL(url);
        });
    };

    return (
      <Button size={size} variant="ghost" onClick={handleDownload} ref={reference} {...properties}>
        <span>{<Download />}</span>
        {size !== 'icon' && 'Download'}
      </Button>
    );
  },
);

DownloadButton.displayName = 'DownloadButton';
